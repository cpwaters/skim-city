import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase-crm';
import { prepareImage } from './images';

/**
 * Photos taken against a job.
 *
 * These are the record of what a room looked like when it was priced, so they
 * live under `jobs/` in Storage, which is admin-only — unlike the gallery,
 * which is world-readable. A photo of someone's damp bedroom is not marketing
 * material unless Chris deliberately publishes it from the gallery manager.
 */

export interface PhotoDraft {
  id: string;
  /** Already resized and re-encoded by prepareImage. */
  blob: Blob;
  /** Object URL for the thumbnail. Revoke it when the draft is dropped. */
  previewUrl: string;
  originalBytes: number;
}

export const MAX_JOB_PHOTOS = 12;

export async function draftFromFile(file: File): Promise<PhotoDraft> {
  const prepared = await prepareImage(file);
  return {
    id: crypto.randomUUID(),
    blob: prepared.blob,
    previewUrl: URL.createObjectURL(prepared.blob),
    originalBytes: prepared.originalBytes,
  };
}

export function releaseDraft(draft: PhotoDraft): void {
  URL.revokeObjectURL(draft.previewUrl);
}

/**
 * Uploads drafts under `jobs/{jobId}/` and returns their download URLs.
 *
 * Sequential rather than parallel on purpose: this runs at the customer's
 * house, often on one bar of signal, where six concurrent uploads stall and
 * time out together. One at a time is slower at full strength and far more
 * likely to finish at all on a bad connection.
 */
export async function uploadPhotoDrafts(jobId: string, drafts: PhotoDraft[]): Promise<string[]> {
  const urls: string[] = [];

  for (const draft of drafts) {
    const fileRef = storageRef(storage, `jobs/${jobId}/${draft.id}.jpg`);
    await uploadBytes(fileRef, draft.blob, { contentType: 'image/jpeg' });
    urls.push(await getDownloadURL(fileRef));
  }

  return urls;
}
