import path from 'node:path';

import { config } from './config.js';
import { all, one, run } from './db.js';
import { HttpError, hmac, nowIso, safeEqual } from './util.js';

const DOCUMENT_LINK_MINUTES = 15;

/** The three checks in a listing's "Verified" section. */
export function verificationChecks(property) {
  const owner = one('SELECT kyc_status FROM users WHERE id = ?', property.owner_id);
  return {
    ownerKyc: owner?.kyc_status === 'verified',
    adminVerified: Boolean(property.admin_verified_at),
    documentChecked: Boolean(property.doc_checked_at),
  };
}

const documentSignature = (propertyId, expires) => hmac(`property-document:${propertyId}:${expires}`);

/**
 * Ownership documents are private (never served publicly). Admins open them through a signed link
 * that works for 15 minutes, so the phone's browser can show images and PDFs without a login header.
 */
function documentLink(property) {
  if (!property.doc_file) return null;
  const expires = Date.now() + DOCUMENT_LINK_MINUTES * 60_000;
  return `/admin/properties/${property.id}/document?expires=${expires}&sig=${documentSignature(property.id, expires)}`;
}

/** Checks a signed document link and returns the file to send. */
export function documentFileFromLink(propertyId, expires, sig) {
  const exp = Number(expires);
  if (!Number.isInteger(exp) || exp < Date.now() || !safeEqual(documentSignature(propertyId, exp), String(sig ?? ''))) {
    throw new HttpError(403, 'LINK_EXPIRED', 'This document link has expired. Open it again from the admin screen.');
  }
  const property = one('SELECT doc_file FROM properties WHERE id = ?', propertyId);
  if (!property?.doc_file) throw new HttpError(404, 'NOT_FOUND', 'No document was uploaded for this listing.');
  return path.join(config.privateDir, 'documents', path.basename(property.doc_file));
}

/** Active listings still missing an admin check, oldest first. */
export function listingsToVerify() {
  return all(
    `SELECT p.*, u.name AS owner_name, u.email AS owner_email, u.kyc_status AS owner_kyc
       FROM properties p JOIN users u ON u.id = p.owner_id
      WHERE p.status = 'active' AND (p.admin_verified_at IS NULL OR p.doc_checked_at IS NULL)
      ORDER BY p.created_at LIMIT 50`,
  ).map((p) => ({
    id: p.id,
    title: p.title,
    area: p.area,
    district: p.district,
    owner: { name: p.owner_name, email: p.owner_email, kycStatus: p.owner_kyc },
    docType: p.doc_type,
    documentUrl: documentLink(p),
    adminVerified: Boolean(p.admin_verified_at),
    documentChecked: Boolean(p.doc_checked_at),
    createdAt: p.created_at,
  }));
}

export function markAdminVerified(property, admin) {
  run('UPDATE properties SET admin_verified_at = ?, admin_verified_by = ? WHERE id = ? AND admin_verified_at IS NULL', nowIso(), admin.email, property.id);
}

export function markDocumentChecked(property, admin) {
  if (!property.doc_file) throw new HttpError(409, 'NO_DOCUMENT', 'No document was uploaded for this listing.');
  run('UPDATE properties SET doc_checked_at = ?, doc_checked_by = ? WHERE id = ? AND doc_checked_at IS NULL', nowIso(), admin.email, property.id);
}
