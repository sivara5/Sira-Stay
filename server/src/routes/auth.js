import path from 'node:path';

import { Router } from 'express';

import { markOnboarded, registrationStep, requireAuth, requireRegistered, toMe } from '../auth.js';
import { config } from '../config.js';
import { one, run } from '../db.js';
import { verifyGoogleIdToken } from '../google.js';
import { issueOtp, verifyOtp } from '../otp.js';
import { moveUpload, upload, withUploadCleanup } from '../uploads.js';
import {
  HttpError,
  encryptJson,
  newId,
  newToken,
  normalizeEmail,
  normalizeIndianPhone,
  nowIso,
  requireString,
  sha256,
} from '../util.js';

export const authRouter = Router();

const reload = (id) => toMe(one('SELECT * FROM users WHERE id = ?', id));

function emailFrom(body) {
  const email = normalizeEmail(body?.email);
  if (!email) throw new HttpError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  return email;
}

function phoneFrom(body) {
  const phone = normalizeIndianPhone(body?.phone);
  if (!phone) throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number.');
  return phone;
}

// Step 1 — email verification (also how returning users sign in)
authRouter.post('/email/start', async (req, res) => {
  const { devCode } = await issueOtp('email', emailFrom(req.body));
  res.json({ ok: true, devCode });
});

/** New accounts start in the app's current language; returning accounts keep theirs. */
function createUser(email, body, extra = {}) {
  const language = body?.language === 'ta' ? 'ta' : 'en';
  run(
    'INSERT INTO users (id, email, language, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    newId(),
    email,
    language,
    extra.name ?? null,
    extra.googleSub ?? null,
    nowIso(),
  );
  return one('SELECT * FROM users WHERE email = ?', email);
}

function startSession(res, user) {
  const token = newToken();
  run('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)', sha256(token), user.id, nowIso());
  res.json({ token, user: toMe(user) });
}

authRouter.post('/email/verify', (req, res) => {
  const email = emailFrom(req.body);
  verifyOtp('email', email, req.body?.code);
  startSession(res, one('SELECT * FROM users WHERE email = ?', email) ?? createUser(email, req.body));
});

/**
 * "Continue with Google": the app sends Google's ID token. Google has verified the email, so it signs in
 * the account with that email (linking it to Google) or creates one; registration then continues as usual.
 */
authRouter.post('/google', async (req, res) => {
  const google = await verifyGoogleIdToken(req.body?.idToken);
  let user = one('SELECT * FROM users WHERE google_sub = ?', google.sub) ?? one('SELECT * FROM users WHERE email = ?', google.email);
  if (user) {
    if (!user.google_sub) run('UPDATE users SET google_sub = ? WHERE id = ?', google.sub, user.id);
    if (!user.name && google.name) run('UPDATE users SET name = ? WHERE id = ?', google.name, user.id);
    user = one('SELECT * FROM users WHERE id = ?', user.id);
  } else {
    user = createUser(google.email, req.body, { name: google.name, googleSub: google.sub });
  }
  startSession(res, user);
});

// Step 2 — "Are you a Tenant or a House Owner?"
authRouter.post('/role', requireAuth, (req, res) => {
  const role = req.body?.role;
  if (!['tenant', 'owner'].includes(role)) throw new HttpError(400, 'VALIDATION', 'Choose Tenant or House Owner.');
  if (registrationStep(req.user) === 'done' && req.user.role !== role) {
    throw new HttpError(409, 'ROLE_LOCKED', 'Your account type is already set.');
  }
  run('UPDATE users SET role = ? WHERE id = ?', role, req.user.id);
  markOnboarded(req.user.id);
  res.json({ user: reload(req.user.id) });
});

// Step 3 — phone OTP
authRouter.post('/phone/start', requireAuth, async (req, res) => {
  const phone = phoneFrom(req.body);
  if (one('SELECT id FROM users WHERE phone = ? AND id <> ?', phone, req.user.id)) {
    throw new HttpError(409, 'PHONE_TAKEN', 'This mobile number is already linked to another account.');
  }
  const { devCode } = await issueOtp('phone', phone);
  res.json({ ok: true, phone, devCode });
});

authRouter.post('/phone/verify', requireAuth, (req, res) => {
  const phone = phoneFrom(req.body);
  verifyOtp('phone', phone, req.body?.code);
  try {
    run(
      'UPDATE users SET phone = ?, phone_verified = 1, whatsapp = COALESCE(whatsapp, ?) WHERE id = ?',
      phone,
      phone,
      req.user.id,
    );
  } catch {
    throw new HttpError(409, 'PHONE_TAKEN', 'This mobile number is already linked to another account.');
  }
  markOnboarded(req.user.id);
  res.json({ user: reload(req.user.id) });
});

// Owners only — registration + KYC
const ID_RULES = {
  aadhaar: /^\d{12}$/,
  pan: /^[A-Z]{5}\d{4}[A-Z]$/,
  voter_id: /^[A-Z]{3}\d{7}$/,
  driving_licence: /^[A-Z0-9]{10,20}$/,
};

authRouter.post(
  '/kyc',
  requireAuth,
  upload.single('idPhoto'),
  withUploadCleanup((req, res) => {
    if (req.user.role !== 'owner') throw new HttpError(403, 'OWNER_ONLY', 'KYC is only needed for house owners.');
    if (!req.user.phone_verified) throw new HttpError(400, 'PHONE_REQUIRED', 'Verify your mobile number first.');

    const name = requireString(req.body?.name, 'Full name', { min: 2, max: 80 });
    // Shown to tenants who unlock this owner's contact.
    const contactPhone = normalizeIndianPhone(req.body?.contactPhone);
    if (!contactPhone) throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid 10-digit mobile number.', { field: 'contactPhone' });
    const whatsapp = normalizeIndianPhone(req.body?.whatsapp);
    if (!whatsapp) throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid 10-digit WhatsApp number.', { field: 'whatsapp' });
    const idType = req.body?.idType;
    const idNumber = String(req.body?.idNumber ?? '').replace(/[\s-]/g, '').toUpperCase();
    if (!ID_RULES[idType]) throw new HttpError(400, 'VALIDATION', 'Choose a valid ID type.', { field: 'idType' });
    if (!ID_RULES[idType].test(idNumber)) {
      throw new HttpError(400, 'INVALID_ID_NUMBER', 'The ID number format is not valid.', { field: 'idNumber' });
    }
    if (!req.file) throw new HttpError(400, 'ID_PHOTO_REQUIRED', 'Upload a clear photo of your ID.', { field: 'idPhoto' });

    const stored = moveUpload(req.file, path.join(config.privateDir, 'kyc'), `${req.user.id}-${Date.now()}`, ['image', 'pdf']);
    run(
      `UPDATE users SET name = ?, contact_phone = ?, whatsapp = ?, kyc_status = ?, kyc_id_type = ?, kyc_id_last4 = ?,
         kyc_id_enc = ?, kyc_file = ? WHERE id = ?`,
      name,
      contactPhone,
      whatsapp,
      config.autoApproveKyc ? 'verified' : 'pending',
      idType,
      idNumber.slice(-4),
      encryptJson(idNumber),
      path.basename(stored),
      req.user.id,
    );
    markOnboarded(req.user.id);
    res.json({ user: reload(req.user.id) });
  }),
);

authRouter.post('/logout', requireAuth, (req, res) => {
  run('DELETE FROM sessions WHERE token_hash = ?', sha256(req.get('authorization').slice(7)));
  res.json({ ok: true });
});

// Profile
export const meRouter = Router();

meRouter.get('/', requireAuth, (req, res) => res.json({ user: toMe(req.user) }));

meRouter.patch('/', requireAuth, (req, res) => {
  const body = req.body ?? {};
  const updates = {};
  if (body.name !== undefined) updates.name = requireString(body.name, 'Name', { min: 2, max: 80 });
  if (body.language !== undefined) {
    if (!['en', 'ta'].includes(body.language)) throw new HttpError(400, 'VALIDATION', 'Unsupported language.');
    updates.language = body.language;
  }
  if (body.whatsapp !== undefined) {
    const whatsapp = normalizeIndianPhone(body.whatsapp);
    if (!whatsapp) throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid 10-digit WhatsApp number.');
    updates.whatsapp = whatsapp;
  }
  if (body.available !== undefined) updates.available = body.available ? 1 : 0;

  for (const [column, value] of Object.entries(updates)) {
    run(`UPDATE users SET ${column} = ? WHERE id = ?`, value, req.user.id);
  }
  res.json({ user: reload(req.user.id) });
});

/**
 * Switches the active role on the same account (Tenant ⇄ Owner). No new account and no KYC
 * are needed to switch — an owner's ID KYC is requested when they start listing a property.
 */
meRouter.post('/role', requireRegistered, (req, res) => {
  const role = req.body?.role;
  if (!['tenant', 'owner'].includes(role)) throw new HttpError(400, 'VALIDATION', 'Choose Tenant or Owner.');
  run('UPDATE users SET role = ?, onboarded = 1 WHERE id = ?', role, req.user.id);
  res.json({ user: reload(req.user.id) });
});
