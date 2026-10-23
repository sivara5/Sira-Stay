import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PickedImage } from './pick-image';

/** Longest side of uploaded listing photos: plenty for the 1440px gallery, and quick on slow networks. */
export const UPLOAD_MAX_PX = 2048;
const JPEG_QUALITY = 0.85;

export type UploadFile = { uri: string; name: string; type: 'image/jpeg' };

/** A picked photo this phone couldn't read; `index` is its position in the upload. */
export class PhotoPrepError extends Error {
  constructor(
    public index: number,
    cause: unknown,
  ) {
    super(`Photo ${index + 1} could not be prepared for upload`, { cause });
  }
}

/**
 * Re-encodes one listing photo as a JPEG before upload. iPhone HEIC photos become JPEG (the server reads
 * only JPEG, PNG and WebP), large photos are scaled down, and the new file carries no EXIF — so the GPS
 * position of the house never leaves the phone.
 */
export async function toUploadJpeg(photo: PickedImage, name: string): Promise<UploadFile> {
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    if (Math.max(photo.width, photo.height) > UPLOAD_MAX_PX) {
      context.resize(photo.width >= photo.height ? { width: UPLOAD_MAX_PX } : { height: UPLOAD_MAX_PX });
    }
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      return { uri: saved.uri, name: `${name}.jpg`, type: 'image/jpeg' };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** Every photo as a JPEG ready for upload, in order. One at a time to keep memory low on small phones. */
export async function prepareUploadPhotos(photos: PickedImage[]): Promise<UploadFile[]> {
  const files: UploadFile[] = [];
  for (const [index, photo] of photos.entries()) {
    try {
      files.push(await toUploadJpeg(photo, `photo-${index + 1}`));
    } catch (err) {
      throw new PhotoPrepError(index, err);
    }
  }
  return files;
}
