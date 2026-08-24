import { useState } from 'react';
import { orderBy } from 'firebase/firestore';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PageTitle } from '../../components/app/PageTitle';
import { Card } from '../../components/ui/Card';
import { Button, FileButton } from '../../components/ui/Button';
import { LiveInput } from '../../components/ui/Field';
import { EmptyState, Notice, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { db, storage } from '../../lib/firebase-crm';
import { deleteGalleryItem } from '../../lib/callables';
import { formatBytes, prepareImage, titleFromFilename } from '../../lib/images';
import type { GalleryItem } from '../../types/domain';

interface UploadProgress {
  name: string;
  status: 'preparing' | 'uploading' | 'done' | 'error';
  message?: string;
  saved?: string;
}

/**
 * Gallery manager.
 *
 * Photos go browser → Storage → Firestore directly rather than through a
 * function: image bytes have no business round-tripping through a Cloud
 * Function, and the admin claim already authorises both writes. Deletion is the
 * exception — that runs server-side so the document and its files go together
 * (see functions/src/gallery/functions.ts).
 */
export function GalleryManagerPage() {
  const { data: items, loading } = useCollection<GalleryItem>(
    'galleryItems',
    [orderBy('order', 'asc')],
    'gallery-manager',
  );

  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function uploadOne(file: File, itemId: string, kind: 'after' | 'before') {
    const prepared = await prepareImage(file);
    const path = `public/gallery/${itemId}/${kind}-${Date.now()}.jpg`;
    const fileRef = storageRef(storage, path);

    await uploadBytes(fileRef, prepared.blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(fileRef);

    return { path, url, prepared };
  }

  /** Adds new gallery entries, one per selected file. */
  async function handleAdd(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    const selected = Array.from(files);
    setUploads(selected.map((file) => ({ name: file.name, status: 'preparing' })));

    // New photos go to the end of the running order.
    let nextOrder = items.reduce((max, item) => Math.max(max, item.order), -1) + 1;

    for (const [index, file] of selected.entries()) {
      const update = (patch: Partial<UploadProgress>) =>
        setUploads((current) =>
          current.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
        );

      try {
        const itemRef = doc(collection(db, 'galleryItems'));
        update({ status: 'uploading' });

        const { path, url, prepared } = await uploadOne(file, itemRef.id, 'after');
        const now = new Date().toISOString();

        const item: Omit<GalleryItem, 'id'> = {
          title: titleFromFilename(file.name),
          location: '',
          alt: '',
          afterPath: path,
          afterUrl: url,
          beforePath: null,
          beforeUrl: null,
          width: prepared.width,
          height: prepared.height,
          order: nextOrder,
          // Starts hidden: a photo with no title or alt text is not ready to be
          // on the site. Chris fills those in, then publishes.
          published: false,
          createdAt: now,
          updatedAt: now,
        };

        await setDoc(itemRef, item);
        nextOrder += 1;

        update({
          status: 'done',
          saved: `${formatBytes(prepared.originalBytes)} → ${formatBytes(prepared.blob.size)}`,
        });
      } catch (cause: unknown) {
        update({
          status: 'error',
          message: cause instanceof Error ? cause.message : 'Upload failed.',
        });
      }
    }

    // Clear the finished ones after a beat, keep failures on screen.
    setTimeout(() => setUploads((current) => current.filter((entry) => entry.status === 'error')), 2500);
  }

  /** Attaches a "before" shot to an existing item, turning it into a slider. */
  async function handleAttachBefore(itemId: string, files: FileList | null) {
    if (!files?.length) return;

    setBusy(`before-${itemId}`);
    setError(null);

    try {
      const { path, url } = await uploadOne(files[0], itemId, 'before');
      await setDoc(
        doc(db, 'galleryItems', itemId),
        { beforePath: path, beforeUrl: url, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not add the before photo.');
    } finally {
      setBusy(null);
    }
  }

  async function patchItem(itemId: string, patch: Partial<GalleryItem>) {
    await setDoc(
      doc(db, 'galleryItems', itemId),
      { ...patch, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  /** Swaps this item's order with its neighbour, in one batch. */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    setBusy(`move-${items[index].id}`);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      batch.set(doc(db, 'galleryItems', items[index].id), { order: items[target].order, updatedAt: now }, { merge: true });
      batch.set(doc(db, 'galleryItems', items[target].id), { order: items[index].order, updatedAt: now }, { merge: true });
      await batch.commit();
    } finally {
      setBusy(null);
    }
  }

  async function removeBefore(itemId: string) {
    setBusy(`rmbefore-${itemId}`);
    try {
      // The Storage object is left in place: it is a few hundred KB, and the
      // alternative is a client-side delete that can half-fail. A full delete
      // of the item cleans up everything server-side.
      await setDoc(
        doc(db, 'galleryItems', itemId),
        { beforePath: null, beforeUrl: null, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: GalleryItem) {
    if (!window.confirm(`Delete "${item.title}"? The photo is removed for good.`)) return;

    setBusy(`delete-${item.id}`);
    setError(null);
    try {
      await deleteGalleryItem({ itemId: item.id });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not delete that photo.');
    } finally {
      setBusy(null);
    }
  }

  const publishedCount = items.filter((item) => item.published).length;
  const incomplete = (item: GalleryItem) => !item.title.trim() || !item.alt.trim();

  return (
    <>
      <PageTitle
        title="Gallery"
        subtitle={`${publishedCount} of ${items.length} showing on the website`}
        action={
          <FileButton variant="primary" size="md" multiple onFiles={(files) => void handleAdd(files)}>
            Add photos
          </FileButton>
        }
      />

      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {uploads.length > 0 && (
        <Card className="mb-5">
          <ul className="divide-y divide-noir-700">
            {uploads.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-bone truncate">{entry.name}</span>
                <span
                  className={`text-xs shrink-0 ${
                    entry.status === 'error' ? 'text-[#e08a97]' : 'text-smoke'
                  }`}
                >
                  {entry.status === 'preparing' && 'Compressing…'}
                  {entry.status === 'uploading' && 'Uploading…'}
                  {entry.status === 'done' && `Added · ${entry.saved}`}
                  {entry.status === 'error' && entry.message}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="No photos yet"
            message="Add a few job photos and they'll show on the website's Work page. Pictures straight off your phone are fine — they get resized automatically."
            action={
              <FileButton variant="primary" size="md" multiple onFiles={(files) => void handleAdd(files)}>
                Add photos
              </FileButton>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <Card className="overflow-hidden h-full flex flex-col" accent={item.published}>
                <div className="relative aspect-4/3 bg-noir-900">
                  <img
                    src={item.afterUrl}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                  {item.beforeUrl && (
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-noir-900/85 text-city-500 text-[0.6rem] font-display uppercase tracking-[0.12em] rounded-[2px]">
                      Before / after
                    </span>
                  )}
                  {!item.published && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-noir-900/85 text-smoke text-[0.6rem] font-display uppercase tracking-[0.12em] rounded-[2px]">
                      Hidden
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <LiveInput
                    label="Title"
                    value={item.title}
                    placeholder="Ceiling re-skim"
                    onCommit={(title) => void patchItem(item.id, { title })}
                  />
                  <LiveInput
                    label="Where"
                    value={item.location}
                    placeholder="Chorlton, Manchester"
                    onCommit={(location) => void patchItem(item.id, { location })}
                  />
                  <LiveInput
                    label="Photo description"
                    value={item.alt}
                    placeholder="Freshly skimmed ceiling, ready for paint"
                    hint="Read aloud to visitors using a screen reader, and shown if the image fails to load."
                    onCommit={(alt) => void patchItem(item.id, { alt })}
                  />

                  <div className="flex-1" />

                  {incomplete(item) && item.published && (
                    <Notice tone="error">Add a title and photo description.</Notice>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-noir-700">
                    <Button
                      size="sm"
                      variant={item.published ? 'secondary' : 'primary'}
                      disabled={!item.published && incomplete(item)}
                      onClick={() => void patchItem(item.id, { published: !item.published })}
                    >
                      {item.published ? 'Hide' : 'Publish'}
                    </Button>

                    {item.beforeUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `rmbefore-${item.id}`}
                        onClick={() => void removeBefore(item.id)}
                      >
                        Remove before
                      </Button>
                    ) : (
                      <FileButton
                        variant="ghost"
                        disabled={busy === `before-${item.id}`}
                        onFiles={(files) => void handleAttachBefore(item.id, files)}
                      >
                        {busy === `before-${item.id}` ? 'Uploading…' : '+ Before photo'}
                      </FileButton>
                    )}

                    <div className="ml-auto flex gap-1">
                      <button
                        type="button"
                        onClick={() => void move(index, -1)}
                        disabled={index === 0 || busy !== null}
                        aria-label={`Move ${item.title || 'photo'} earlier`}
                        className="px-2 py-1.5 text-smoke hover:text-bone disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(index, 1)}
                        disabled={index === items.length - 1 || busy !== null}
                        aria-label={`Move ${item.title || 'photo'} later`}
                        className="px-2 py-1.5 text-smoke hover:text-bone disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item)}
                        disabled={busy !== null}
                        aria-label={`Delete ${item.title || 'photo'}`}
                        className="px-2 py-1.5 text-smoke hover:text-maroon-400 disabled:opacity-25 cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
