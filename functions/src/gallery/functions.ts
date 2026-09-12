import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { REGION } from '../lib/config';
import { COLLECTIONS, db, storage } from '../lib/firebase';
import { assertAdmin } from '../lib/auth';
import { assertAppCheck } from '../lib/appCheck';
import { parseOrThrow } from '../lib/validation';
import type { GalleryItem } from '../domain';

/**
 * Public: the photos for the marketing gallery.
 *
 * Served through a callable rather than read from Firestore in the browser so
 * the public bundle never has to load the Firestore SDK — the same reason
 * the public site cannot read Firestore. Returns published items only, in display order.
 */
export const getGallery = onCall({ region: REGION, cors: true }, async (request) => {
  assertAppCheck(request);

  const snap = await db
    .collection(COLLECTIONS.galleryItems)
    .where('published', '==', true)
    .orderBy('order', 'asc')
    .get();

  const items = snap.docs.map((doc) => {
    const item = doc.data() as GalleryItem;
    // Only the fields the page renders. Storage paths stay server-side; they
    // are an implementation detail, not something the public needs.
    return {
      id: doc.id,
      title: item.title,
      location: item.location,
      alt: item.alt,
      afterUrl: item.afterUrl,
      beforeUrl: item.beforeUrl ?? null,
      width: item.width,
      height: item.height,
    };
  });

  return { items };
});

/**
 * Admin: delete a gallery item and the files behind it.
 *
 * Done server-side so the Firestore document and both Storage objects go in one
 * operation. Deleting from the browser would leave orphaned files in the bucket
 * every time a delete half-failed, and nothing would ever clean them up.
 */
export const deleteGalleryItem = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const { itemId } = parseOrThrow(z.object({ itemId: z.string().min(1) }), request.data);

  const ref = db.collection(COLLECTIONS.galleryItems).doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That photo no longer exists.');

  const item = snap.data() as GalleryItem;
  const bucket = storage.bucket();

  const paths = [item.afterPath, item.beforePath].filter(
    (path): path is string => typeof path === 'string' && path.length > 0,
  );

  await Promise.all(
    paths.map(async (path) => {
      try {
        await bucket.file(path).delete();
      } catch (error) {
        // A missing object is not a failure — the end state we want is "gone".
        // Anything else is worth knowing about, but must not block the delete:
        // leaving the document behind would be worse than an orphaned file.
        const code = (error as { code?: number }).code;
        if (code !== 404) console.error(`Could not delete ${path}`, error);
      }
    }),
  );

  await ref.delete();

  return { itemId, filesDeleted: paths.length };
});
