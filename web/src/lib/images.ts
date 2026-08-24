/**
 * Client-side image preparation for gallery uploads.
 *
 * Chris uploads from his phone, on site, often on mobile data. A raw iPhone
 * photo is 5–12MB and 4000px wide — uploading that would be slow for him and
 * brutal for every visitor who later loads the gallery. Resizing and
 * re-encoding in the browser turns it into roughly 200–400KB before a single
 * byte goes over the network.
 */

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Bytes saved, for the "compressed from 8.2MB" line in the UI. */
  originalBytes: number;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Longest edge after resizing. Plenty for a full-width gallery tile on 2x. */
const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.82;

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image.`);
  }

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation tag, otherwise photos taken in
    // portrait arrive on their side. Safari also decodes HEIC here, which is
    // what turns an iPhone photo into something every browser can display.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      `Could not read "${file.name}". If it came off an iPhone, either upload it from the phone itself or save it as a JPEG first.`,
    );
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not process that image.');

  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );

  if (!blob) throw new Error(`Could not process "${file.name}".`);

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is still too large after compressing.`);
  }

  return { blob, width, height, originalBytes: file.size };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Turns "IMG_4821.HEIC" into "Img 4821" as a starting title. */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Untitled';
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}
