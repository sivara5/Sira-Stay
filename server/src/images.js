import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';

import { config } from './config.js';
import { all, one, run } from './db.js';

// One image at a time, no pixel cache: this keeps memory low on small servers/laptops.
sharp.concurrency(1);
sharp.cache(false);

const CARD_WIDTH = 720;
const LARGE_WIDTH = 1440;

const localPath = (url) => (url.startsWith('/uploads/') ? path.join(config.uploadDir, url.slice('/uploads/'.length)) : null);
const toUrl = (file) => `/uploads/${path.relative(config.uploadDir, file).split(path.sep).join('/')}`;

/** Card (~720px) and gallery (~1440px) JPEGs plus a thumbhash preview for an uploaded photo. */
async function makeVariants(url) {
  const file = localPath(url);
  if (!file || !fs.existsSync(file)) return null;
  const { dir, name } = path.parse(file);
  const open = () => sharp(file, { failOn: 'error' }).rotate();
  const cardFile = path.join(dir, `${name}-card.jpg`);
  const largeFile = path.join(dir, `${name}-large.jpg`);
  await open().resize({ width: CARD_WIDTH, withoutEnlargement: true }).jpeg({ quality: 72, progressive: true, mozjpeg: true }).toFile(cardFile);
  await open().resize({ width: LARGE_WIDTH, withoutEnlargement: true }).jpeg({ quality: 78, progressive: true, mozjpeg: true }).toFile(largeFile);
  const { data, info } = await open().resize(100, 100, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    cardUrl: toUrl(cardFile),
    largeUrl: toUrl(largeFile),
    thumbhash: Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64'),
  };
}

// ---------------------------------------------------------------- background queue

const queue = [];
let draining = false;

async function processPhoto(id) {
  const photo = one('SELECT id, url, card_url FROM photos WHERE id = ?', id);
  if (!photo || photo.card_url !== null) return;
  let variants = null;
  try {
    variants = await makeVariants(photo.url);
  } catch (err) {
    // Unreadable/unsupported image: keep serving the original; don't retry forever.
    console.warn(`[images] could not make smaller versions of ${photo.url}: ${err.message}`);
  }
  if (variants) {
    run('UPDATE photos SET card_url = ?, large_url = ?, thumbhash = ? WHERE id = ?', variants.cardUrl, variants.largeUrl, variants.thumbhash, photo.id);
  } else {
    run("UPDATE photos SET card_url = '' WHERE id = ?", photo.id);
  }
}

async function drain() {
  draining = true;
  while (queue.length) {
    const id = queue.shift();
    try {
      await processPhoto(id);
    } catch (err) {
      // Never let a background job take the server down; the photo just keeps its original.
      console.error(`[images] background job failed for photo ${id}`, err);
    }
  }
  draining = false;
}

/** Makes smaller versions after an upload without slowing the owner's request down. */
export function queueVariants(photoIds) {
  queue.push(...photoIds);
  if (!draining) drain().catch((err) => console.error('[images] queue stopped', err));
}

/** One-time conversion of uploaded photos that don't have smaller versions yet. */
export function backfillVariants() {
  const ids = all("SELECT id FROM photos WHERE card_url IS NULL AND url LIKE '/uploads/%'").map((r) => r.id);
  if (ids.length) {
    console.log(`[images] making smaller versions of ${ids.length} existing photo(s) in the background`);
    queueVariants(ids);
  }
}

/** Removes a photo's files (original + smaller versions). */
export function deletePhotoFiles(photo) {
  for (const url of [photo.url, photo.card_url, photo.large_url]) {
    const file = url && localPath(url);
    if (file) fs.rm(file, { force: true }, () => {});
  }
}

// ---------------------------------------------------------------- what the app gets

const isUnsplash = (url) => url.startsWith('https://images.unsplash.com/');

function resized(url, width, quality) {
  const u = new URL(url);
  u.searchParams.set('w', String(width));
  u.searchParams.set('q', String(quality));
  return u.toString();
}

/**
 * Sizes for one photo: `card` for lists, `large` for the gallery, `thumbhash` or a `tiny` image
 * as the blurred preview. Falls back to the original when no smaller version exists.
 */
export function photoView(p) {
  if (!p) return null;
  const external = isUnsplash(p.url);
  return {
    id: p.id,
    url: p.url,
    kind: p.kind,
    card: p.card_url || (external ? resized(p.url, CARD_WIDTH, 70) : p.url),
    large: p.large_url || (external ? resized(p.url, LARGE_WIDTH, 75) : p.url),
    thumbhash: p.thumbhash || null,
    tiny: !p.thumbhash && external ? resized(p.url, 24, 40) : null,
  };
}

export const PHOTO_COLUMNS = 'id, url, kind, card_url, large_url, thumbhash';
