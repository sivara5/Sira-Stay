import fs from 'node:fs';
import path from 'node:path';

import multer from 'multer';

import { config } from './config.js';
import { HttpError } from './util.js';

export const upload = multer({
  dest: path.join(config.dataDir, 'tmp'),
  limits: { fileSize: 10 * 1024 * 1024, files: 22, fields: 40 },
});

/** Detects the real file type from magic bytes — never trust the client-supplied mimetype. */
export function sniff(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { ext: 'jpg', kind: 'image' };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', kind: 'image' };
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', kind: 'image' };
  if (head.toString('ascii', 4, 8) === 'ftyp' && /hei[cfsx]|mif1|msf1/.test(head.toString('ascii', 8, 12))) return { ext: 'heic', kind: 'image' };
  if (head.toString('ascii', 0, 5) === '%PDF-') return { ext: 'pdf', kind: 'pdf' };
  return null;
}

export function removeUploads(req) {
  const files = req.file ? [req.file] : Object.values(req.files ?? {}).flat();
  for (const f of files) fs.rm(f.path, { force: true }, () => {});
}

/** Wraps a handler so temp uploads are always cleaned up when validation fails. */
export const withUploadCleanup = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    removeUploads(req);
    throw err;
  }
};

export function moveUpload(file, destDir, baseName, allowedKinds) {
  const type = sniff(file.path);
  if (!type || !allowedKinds.includes(type.kind)) {
    throw new HttpError(400, 'INVALID_FILE', `${file.originalname || 'File'} is not a supported image or PDF.`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${baseName}.${type.ext}`);
  fs.renameSync(file.path, dest);
  return dest;
}
