import { getPhoto } from './db';

const urls = new Map<string, string>();

/** A display URL for a stored photo, cached for the session. */
export async function photoUrl(id: string): Promise<string | undefined> {
  const cached = urls.get(id);
  if (cached) return cached;
  const blob = await getPhoto(id);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export function forgetPhotoUrls() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks a camera photo to at most `maxSide` pixels on its longer side.
 * A 12 MP photo becomes about 150 KB, which keeps the phone's storage and the
 * backups small.
 */
export async function resizePhoto(file: Blob, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t process photos.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob =
    (await toBlob(canvas, 'image/webp', 0.82)) ?? (await toBlob(canvas, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Couldn’t read that photo.');
  return blob;
}
