import type { PickedImage } from './pick-image';

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 20;
/** Photos smaller than this on their longest side are rejected as unclear. */
export const MIN_PHOTO_PX = 800;

export type PhotoKind = 'interior' | 'exterior';

/** Identifies the same picked image across picks (gallery asset id, or size + dimensions). */
export const photoKey = (p: PickedImage) => p.assetId || `${p.fileSize ?? 0}:${p.width}x${p.height}`;

/**
 * Drops low-resolution images and anything already picked (`seenKeys`), up to `room` new photos.
 * Returns what was kept and how many were skipped for each reason.
 */
export function filterPicked(picked: PickedImage[], seenKeys: Set<string>, room: number) {
  const seen = new Set(seenKeys);
  const accepted: PickedImage[] = [];
  let duplicates = 0;
  let lowRes = 0;
  for (const img of picked) {
    if (Math.max(img.width, img.height) < MIN_PHOTO_PX) {
      lowRes++;
    } else if (seen.has(photoKey(img))) {
      duplicates++;
    } else if (accepted.length < room) {
      seen.add(photoKey(img));
      accepted.push(img);
    }
  }
  return { accepted, duplicates, lowRes };
}
