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

export interface CropRect {
  /** Source pixels, after the photo's own rotation is applied. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Cuts a rectangle out of a photo and shrinks it to at most `maxSide` pixels. */
export async function cropPhoto(file: Blob, rect: CropRect, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const x = Math.max(0, Math.min(rect.x, bitmap.width - 1));
  const y = Math.max(0, Math.min(rect.y, bitmap.height - 1));
  const width = Math.max(1, Math.min(rect.width, bitmap.width - x));
  const height = Math.max(1, Math.min(rect.height, bitmap.height - y));
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t process photos.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob =
    (await toBlob(canvas, 'image/webp', 0.82)) ?? (await toBlob(canvas, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Couldn’t crop that photo.');
  return blob;
}

/**
 * An image copied to the clipboard, as with Chrome's "Copy image" on a long
 * press. Throws with a message for the user when there is none or Chrome says no.
 */
export async function readClipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) throw new Error('This browser can’t paste images.');
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError')
      throw new Error('Chrome didn’t allow Sanso to read the clipboard.');
    throw new Error('Couldn’t read the clipboard.');
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return item.getType(type);
  }
  throw new Error('There’s no image on the clipboard. Long-press a picture and tap Copy image.');
}

/** Where the service worker keeps an image shared to Sanso (see public/share-target.js). */
const shareCache = 'sanso-share';
const sharedImageKey = () => new URL(`${import.meta.env.BASE_URL}shared-image`, location.href).href;

/** Takes the image waiting from Chrome's Share menu, if there is one. */
export async function takeSharedImage(): Promise<Blob | undefined> {
  if (!('caches' in self)) return undefined;
  const cache = await caches.open(shareCache);
  const response = await cache.match(sharedImageKey());
  if (!response) return undefined;
  const blob = await response.blob();
  await cache.delete(sharedImageKey());
  return blob.size ? blob : undefined;
}
