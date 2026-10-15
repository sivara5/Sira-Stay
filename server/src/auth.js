import { one } from './db.js';
import { HttpError, sha256 } from './util.js';

/** Registration progress: email → role → phone OTP → (owners only) KYC. */
export function registrationStep(user) {
  if (!user.role) return 'role';
  if (!user.phone_verified) return 'phone';
  if (user.role === 'owner' && user.kyc_status === 'none') return 'kyc';
  return 'done';
}

export function toMe(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    phone: user.phone,
    phoneVerified: Boolean(user.phone_verified),
    whatsapp: user.whatsapp,
    name: user.name,
    language: user.language,
    available: Boolean(user.available),
    kycStatus: user.kyc_status,
    kycIdType: user.kyc_id_type,
    kycIdLast4: user.kyc_id_last4,
    registrationStep: registrationStep(user),
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

export function requireOwner(req, _res, next) {
  requireRegistered(req, _res, () => {});
  if (req.user.role !== 'owner') throw new HttpError(403, 'OWNER_ONLY', 'Only house owners can do this.');
  next();
}
