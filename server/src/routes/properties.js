import fs from 'node:fs';
import path from 'node:path';

import { Router } from 'express';

import { requireOwner, requireRegistered } from '../auth.js';
import { config } from '../config.js';
import { all, one, run, tx } from '../db.js';
import { canonicalDistrict, districtSpellings } from '../districts.js';
import { PHOTO_COLUMNS, deletePhotoFiles, photoView, queueVariants, stripPhotoMetadata } from '../images.js';
import { APPROX_RADIUS_M, fuzzLocation, isInIndia } from '../geo.js';
import { canReview, parseReview, saveReview } from '../reviews.js';
import { assertNoLocationLeaks } from '../public-text.js';
import {
  CATEGORIES,
  exactLocation,
  expireStaleHolds,
  exteriorPhotos,
  getPropertyOr404,
  hasContactAccess,
  ownerContact,
  refundPayment,
  toCard,
  toDetail,
} from '../services.js';
import { moveUpload, upload, withUploadCleanup } from '../uploads.js';
import { HttpError, encryptJson, isDateString, newId, nowIso, requireInt, requireString, sha256 } from '../util.js';

export const propertiesRouter = Router();

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 20;
const MIN_PHOTO_BYTES = 20 * 1024; // smaller files are almost always thumbnails or unusably blurry
const FURNISHING = ['unfurnished', 'semi_furnished', 'furnished'];
const DOC_TYPES = ['sale_deed', 'property_tax', 'eb_bill', 'rental_agreement', 'other'];
const AMENITIES = ['wifi', 'ac', 'parking', 'power_backup', 'water_24x7', 'washing_machine', 'kitchen', 'food', 'cctv', 'lift'];

function parseList(value, field) {
  try {
    const list = JSON.parse(value || '[]');
    if (Array.isArray(list)) return list;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'VALIDATION', `${field} is malformed.`, { field });
}

const placeholders = (list) => list.map(() => '?').join(', ');

/** Rejects tiny/blurry files and duplicates (within the upload and against `existingHashes`). */
function checkPhotos(photos, existingHashes = new Set()) {
  const hashes = new Set(existingHashes);
  photos.forEach((photo, index) => {
    if (photo.size < MIN_PHOTO_BYTES) {
      throw new HttpError(400, 'PHOTO_LOW_QUALITY', `Photo ${index + 1} is too small or blurry. Use a clear, full-size photo.`, {
        field: 'photos',
        index,
      });
    }
    const hash = sha256(fs.readFileSync(photo.path));
    if (hashes.has(hash)) {
      throw new HttpError(400, 'PHOTO_DUPLICATE', `Photo ${index + 1} is a duplicate. Each photo must show a different view.`, {
        field: 'photos',
        index,
      });
    }
    hashes.add(hash);
    photo.sha256 = hash;
  });
}

/**
 * Photos are public, so their metadata goes before they're stored: phone photos can carry the house's
 * GPS position. Photos that can't be read are rejected rather than published unchecked.
 */
async function stripMetadata(photos) {
  for (const [index, photo] of photos.entries()) {
    if (!(await stripPhotoMetadata(photo.path))) {
      throw new HttpError(400, 'PHOTO_UNREADABLE', `Photo ${index + 1} could not be read. Use a JPEG or PNG photo.`, {
        field: 'photos',
        index,
      });
    }
  }
}

/** Moves checked uploads into the property's public photo folder. New photos are indoor only. */
function storePhotoFiles(propertyId, photos, startPosition) {
  const photoDir = path.join(config.uploadDir, 'photos', propertyId);
  return photos.map((photo, i) => {
    const name = `${String(startPosition + i + 1).padStart(2, '0')}-${photo.sha256.slice(0, 10)}`;
    const dest = moveUpload(photo, photoDir, name, ['image']);
    return { url: `/uploads/photos/${propertyId}/${path.basename(dest)}`, kind: 'interior', sha256: photo.sha256 };
  });
}

/** Inserts photo rows and returns their ids (smaller versions are made afterwards in the background). */
function insertPhotos(propertyId, stored, startPosition = 0) {
  return stored.map((p, i) => {
    const id = newId();
    run(
      'INSERT INTO photos (id, property_id, url, kind, sha256, position) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      propertyId,
      p.url,
      p.kind,
      p.sha256,
      startPosition + i,
    );
    return id;
  });
}

propertiesRouter.get('/', (req, res) => {
  expireStaleHolds();
  const { category, district, q, sort = 'recent' } = req.query;
  if (category && !CATEGORIES.includes(category)) throw new HttpError(400, 'VALIDATION', 'Unknown category.');

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const origin = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined ? { lat, lng } : undefined;

  const where = ["status = 'active'"];
  const params = [];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (typeof district === 'string' && district.trim()) {
    const spellings = districtSpellings(district);
    where.push(`lower(district) IN (${placeholders(spellings)})`);
    params.push(...spellings);
  }
  // Free-text search: district/city, area/locality, landmark or title. District aliases count too ("Trichy").
  if (typeof q === 'string' && q.trim()) {
    const text = q.trim().slice(0, 60);
    const like = `%${text}%`;
    const spellings = canonicalDistrict(text) ? districtSpellings(text) : [];
    const districtClause = spellings.length ? ` OR lower(district) IN (${placeholders(spellings)})` : '';
    where.push(`(title LIKE ? OR area LIKE ? OR district LIKE ? OR landmark LIKE ?${districtClause})`);
    params.push(like, like, like, like, ...spellings);
  }
  const order = { rent_asc: 'rent ASC', rent_desc: 'rent DESC' }[sort] ?? 'created_at DESC';
  const rows = all(`SELECT * FROM properties WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`, ...params);

  let cards = rows.map((p) => toCard(p, { user: req.user, origin }));
  if (sort === 'distance' && origin) cards = cards.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({ properties: cards });
});

propertiesRouter.get('/:id', (req, res) => {
  expireStaleHolds();
  res.json({ property: toDetail(getPropertyOr404(req.params.id), req.user) });
});

/**
 * The only listing endpoint that reveals the exact address, map pin, owner phone and exterior photos.
 * Requires a successful payment by this user for this listing (₹29 unlock, District Pass credit or
 * paid booking); see hasContactAccess. Owners can see their own.
 */
propertiesRouter.get('/:id/unlocked', requireRegistered, (req, res) => {
  const property = getPropertyOr404(req.params.id);
  if (!hasContactAccess(req.user, property)) throw new HttpError(403, 'LOCKED', 'Unlock owner contact first.');
  const { address, lat, lng } = exactLocation(property);
  res.set('Cache-Control', 'private, no-store');
  res.json({
    location: { address, lat, lng },
    owner: ownerContact(property.owner_id),
    exteriorPhotos: exteriorPhotos(property.id),
  });
});

/** Owners who switched from Tenant verify their identity when they start listing. */
function requireOwnerKyc(req, _res, next) {
  if (req.user.kyc_status === 'none') {
    throw new HttpError(403, 'KYC_REQUIRED', 'Verify your identity (KYC) before listing a property.');
  }
  next();
}

propertiesRouter.post(
  '/',
  requireOwner,
  requireOwnerKyc,
  upload.fields([
    { name: 'photos', maxCount: MAX_PHOTOS },
    { name: 'document', maxCount: 1 },
  ]),
  withUploadCleanup(async (req, res) => {
    const b = req.body ?? {};
    if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'VALIDATION', 'Choose a category.', { field: 'category' });
    const title = requireString(b.title, 'Title', { min: 5, max: 80 });
    const description = requireString(b.description ?? '', 'Description', { min: 0, max: 2000 });
    const rent = requireInt(b.rent, 'Monthly rent', { min: 500, max: 1_000_000 });
    const deposit = requireInt(b.deposit || 0, 'Deposit', { min: 0, max: 10_000_000 });
    const bookingAmount = requireInt(b.bookingAmount, 'Booking amount', { min: 100, max: 500_000 });
    const furnishing = FURNISHING.includes(b.furnishing) ? b.furnishing : 'unfurnished';
    const amenities = parseList(b.amenities, 'amenities').filter((a) => AMENITIES.includes(a));
    const availableFrom = isDateString(b.availableFrom) ? b.availableFrom : null;

    // Location — all four fields are required; the exact pin is encrypted and never shown publicly.
    const address = requireString(b.address, 'Property address', { min: 5, max: 300 });
    const district = requireString(b.district, 'District / City', { min: 2, max: 80 });
    const area = requireString(b.area, 'Area / Locality', { min: 2, max: 80 });
    const landmark = requireString(b.landmark, 'Nearby landmark', { min: 2, max: 120 });
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInIndia(lat, lng)) {
      throw new HttpError(400, 'LOCATION_REQUIRED', 'Drop a pin on the map to mark the property location.', { field: 'location' });
    }
    assertNoLocationLeaks({ title, description, district, area, landmark });

    // Photos — minimum 3, maximum 20, clear, no duplicates, indoor only (outside views give the house away).
    const photos = req.files?.photos ?? [];
    if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) {
      throw new HttpError(400, 'PHOTO_COUNT', `Upload minimum ${MIN_PHOTOS} and maximum ${MAX_PHOTOS} photos.`, { field: 'photos' });
    }
    checkPhotos(photos);

    // Ownership document — requested only now, when listing.
    const docType = b.docType;
    const document = req.files?.document?.[0];
    if (!DOC_TYPES.includes(docType) || !document) {
      throw new HttpError(400, 'DOCUMENT_REQUIRED', 'Upload a property document (e.g. tax receipt or EB bill).', { field: 'document' });
    }
    await stripMetadata(photos);

    const id = newId();
    // Exact address and pin are stored encrypted; the public point is a random spot within 400 m of the house.
    const approx = fuzzLocation(lat, lng);
    const docPath = moveUpload(document, path.join(config.privateDir, 'documents'), `${id}-${docType}`, ['image', 'pdf']);
    const stored = storePhotoFiles(id, photos, 0);

    const photoIds = tx(() => {
      run(
        `INSERT INTO properties (id, owner_id, category, title, description, rent, deposit, booking_amount, furnishing,
           amenities, district, area, landmark, location_enc, approx_lat, approx_lng, approx_radius_m, doc_type, doc_file,
           verification, available_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        req.user.id,
        b.category,
        title,
        description,
        rent,
        deposit,
        bookingAmount,
        furnishing,
        JSON.stringify(amenities),
        district,
        area,
        landmark,
        encryptJson({ address, lat, lng }),
        approx.lat,
        approx.lng,
        APPROX_RADIUS_M,
        docType,
        path.basename(docPath),
        req.user.kyc_status === 'verified' ? 'verified' : 'pending',
        availableFrom,
        nowIso(),
      );
      return insertPhotos(id, stored);
    });
    queueVariants(photoIds);
    res.status(201).json({ property: toDetail(getPropertyOr404(id), req.user) });
  }),
);

// ---------------------------------------------------------------- owner photo management

function ownProperty(req) {
  const property = getPropertyOr404(req.params.id);
  if (property.owner_id !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You can only manage your own listings.');
  return property;
}

const listPhotos = (propertyId) =>
  all(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE property_id = ? ORDER BY position`, propertyId).map(photoView);

/** Adds photos to an existing listing (up to 20 in total), linked to that property. */
propertiesRouter.post(
  '/:id/photos',
  requireOwner,
  upload.array('photos', MAX_PHOTOS),
  withUploadCleanup(async (req, res) => {
    const property = ownProperty(req);
    const photos = req.files ?? [];
    const existing = all('SELECT sha256, position FROM photos WHERE property_id = ?', property.id);
    if (photos.length === 0) throw new HttpError(400, 'PHOTO_COUNT', 'Choose at least one photo to add.', { field: 'photos' });
    if (existing.length + photos.length > MAX_PHOTOS) {
      throw new HttpError(
        400,
        'PHOTO_COUNT',
        `A property can have at most ${MAX_PHOTOS} photos. You can add ${MAX_PHOTOS - existing.length} more.`,
        { field: 'photos' },
      );
    }
    checkPhotos(photos, new Set(existing.map((p) => p.sha256).filter(Boolean)));
    await stripMetadata(photos);

    const start = existing.reduce((max, p) => Math.max(max, p.position + 1), 0);
    const stored = storePhotoFiles(property.id, photos, start);
    queueVariants(tx(() => insertPhotos(property.id, stored, start)));
    res.status(201).json({ photos: listPhotos(property.id) });
  }),
);

/** Removes a photo. Exterior photos can always go; at least 3 indoor photos (the public ones) must stay. */
propertiesRouter.delete('/:id/photos/:photoId', requireOwner, (req, res) => {
  const property = ownProperty(req);
  const photos = all(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE property_id = ? ORDER BY position`, property.id);
  const target = photos.find((p) => p.id === req.params.photoId);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Photo not found.');
  const remaining = photos.filter((p) => p.id !== target.id);
  if (target.kind === 'interior' && remaining.filter((p) => p.kind === 'interior').length < MIN_PHOTOS) {
    throw new HttpError(400, 'PHOTO_COUNT', `Keep at least ${MIN_PHOTOS} indoor photos on a listing.`, { field: 'photos' });
  }
  tx(() => {
    run('DELETE FROM photos WHERE id = ?', target.id);
    remaining.forEach((p, position) => run('UPDATE photos SET position = ? WHERE id = ?', position, p.id));
  });
  deletePhotoFiles(target);
  res.json({ photos: listPhotos(property.id) });
});

/** Makes a photo the main (cover) photo shown on property cards. */
propertiesRouter.post('/:id/photos/:photoId/main', requireOwner, (req, res) => {
  const property = ownProperty(req);
  const photos = listPhotos(property.id);
  const target = photos.find((p) => p.id === req.params.photoId);
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Photo not found.');
  const ordered = [target, ...photos.filter((p) => p.id !== target.id)];
  tx(() => ordered.forEach((p, position) => run('UPDATE photos SET position = ? WHERE id = ?', position, p.id)));
  res.json({ photos: listPhotos(property.id) });
});

// ---------------------------------------------------------------- reviews

/** Tenants who unlocked the owner's contact (or booked) rate the property 1–5★; writing again updates it. */
propertiesRouter.post('/:id/reviews', requireRegistered, (req, res) => {
  const property = getPropertyOr404(req.params.id);
  const review = parseReview(req.body);
  if (!canReview(req.user, property)) {
    throw new HttpError(403, 'REVIEW_NOT_ALLOWED', 'Only tenants who unlocked the owner’s contact can review this property.');
  }
  saveReview({ userId: req.user.id, propertyId: property.id, ...review });
  res.json({ property: toDetail(property, req.user) });
});

// ---------------------------------------------------------------- favorites

propertiesRouter.put('/:id/favorite', requireRegistered, (req, res) => {
  const property = getPropertyOr404(req.params.id);
  run('INSERT OR IGNORE INTO favorites (user_id, property_id, created_at) VALUES (?, ?, ?)', req.user.id, property.id, nowIso());
  res.json({ favorite: true });
});

propertiesRouter.delete('/:id/favorite', requireRegistered, (req, res) => {
  run('DELETE FROM favorites WHERE user_id = ? AND property_id = ?', req.user.id, req.params.id);
  res.json({ favorite: false });
});

export const myFavoritesRouter = Router();

myFavoritesRouter.get('/', requireRegistered, (req, res) => {
  expireStaleHolds();
  const rows = all(
    'SELECT p.* FROM favorites f JOIN properties p ON p.id = f.property_id WHERE f.user_id = ? ORDER BY f.created_at DESC',
    req.user.id,
  );
  res.json({ properties: rows.map((p) => toCard(p, { user: req.user })) });
});

/** Owner withdraws a listing: future bookings are refunded automatically; ₹9 unlocks become refundable. */
propertiesRouter.post('/:id/withdraw', requireOwner, async (req, res) => {
  const property = getPropertyOr404(req.params.id);
  if (property.owner_id !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You can only withdraw your own listings.');
  run("UPDATE properties SET status = 'withdrawn' WHERE id = ?", property.id);

  const bookingPayments = all(
    `SELECT p.id FROM payments p JOIN bookings b ON b.payment_id = p.id
      WHERE b.property_id = ? AND b.status = 'CONFIRMED' AND p.status = 'paid'`,
    property.id,
  );
  for (const p of bookingPayments) await refundPayment(p.id, 'withdrawn', 'Owner withdrew the listing');
  res.json({ property: toDetail(getPropertyOr404(property.id), req.user) });
});

/**
 * Logged after a tenant tries to call/WhatsApp the owner. A missed call leaves a note in the
 * in-app conversation so the owner sees it and the tenant can follow up by message.
 */
propertiesRouter.post('/:id/contact-attempt', requireRegistered, (req, res) => {
  const property = getPropertyOr404(req.params.id);
  if (!hasContactAccess(req.user, property) || property.owner_id === req.user.id) {
    throw new HttpError(403, 'LOCKED', 'Unlock owner contact first.');
  }
  if (req.body?.answered === false) {
    run(
      `INSERT INTO messages (id, property_id, tenant_id, sender_id, kind, body, created_at, read_by_tenant)
       VALUES (?, ?, ?, NULL, 'missed_call', ?, ?, 1)`,
      newId(),
      property.id,
      req.user.id,
      'Tenant tried to call you but could not reach you. Please reply here or call back.',
      nowIso(),
    );
  }
  const owner = one('SELECT available FROM users WHERE id = ?', property.owner_id);
  res.json({ ok: true, ownerAvailable: Boolean(owner.available) });
});

export const myPropertiesRouter = Router();

myPropertiesRouter.get('/', requireOwner, (req, res) => {
  expireStaleHolds();
  const rows = all('SELECT * FROM properties WHERE owner_id = ? ORDER BY created_at DESC', req.user.id);
  res.json({
    properties: rows.map((p) => ({
      ...toCard(p, { user: req.user }),
      verification: p.verification,
      unlockCount: one('SELECT COUNT(*) AS n FROM unlocks WHERE property_id = ?', p.id).n,
      bookings: all(
        `SELECT b.id, b.move_in_date AS moveInDate, b.end_date AS endDate, b.amount, b.status,
                u.name AS tenantName, u.email AS tenantEmail, u.phone AS tenantPhone
           FROM bookings b JOIN users u ON u.id = b.user_id
          WHERE b.property_id = ? AND b.status IN ('CONFIRMED', 'CANCELLED')
          ORDER BY b.move_in_date DESC`,
        p.id,
      ),
    })),
  });
});
