import { config } from './config.js';
import { one, run } from './db.js';
import { HttpError, sha256 } from './util.js';

export const isAdmin = (user) => Boolean(user && config.adminEmails.includes(user.email));

/**
 * Registration progress: email → role → phone OTP → (owners only) KYC.
 * Once finished it stays done, even if the user later switches their active role.
 */
export function registrationStep(user) {
  if (user.onboarded) return 'done';
  if (!user.role) return 'role';
  if (!user.phone_verified) return 'phone';
  if (user.role === 'owner' && user.kyc_status === 'none') return 'kyc';
  return 'done';
}

export function markOnboarded(userId) {
  const user = one('SELECT * FROM users WHERE id = ?', userId);
  if (user && !user.onboarded && registrationStep(user) === 'done') run('UPDATE users SET onboarded = 1 WHERE id = ?', userId);
}

export function toMe(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    phone: user.phone,
    phoneVerified: Boolean(user.phone_verified),
    whatsapp: user.whatsapp,
    contactPhone: user.contact_phone,
    name: user.name,
    language: user.language,
    available: Boolean(user.available),
    kycStatus: user.kyc_status,
    kycIdType: user.kyc_id_type,
    kycIdLast4: user.kyc_id_last4,
    registrationStep: registrationStep(user),
    isAdmin: isAdmin(user),
  };
}

export function loadUser(req, _res, next) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const session = one('SELECT user_id FROM sessions WHERE token_hash = ?', sha256(header.slice(7)));
    if (session) req.user = one('SELECT * FROM users WHERE id = ?', session.user_id);
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  next();
}

export function requireRegistered(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  if (registrationStep(req.user) !== 'done') {
    throw new HttpError(403, 'REGISTRATION_INCOMPLETE', 'Please complete registration first.');
  }
  next();
}

export function requireAdmin(req, _res, next) {
  requireRegistered(req, _res, () => {});
  if (!isAdmin(req.user)) throw new HttpError(403, 'ADMIN_ONLY', 'Only Sira Stay admins can do this.');
  next();
}

export function requireOwner(req, _res, next) {
  requireRegistered(req, _res, () => {});
  if (req.user.role !== 'owner') throw new HttpError(403, 'OWNER_ONLY', 'Only house owners can do this.');
  next();
}
