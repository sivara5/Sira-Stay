import { config } from './config.js';
import { all, one, run, tx } from './db.js';
import { canonicalDistrict } from './districts.js';
import { HttpError, newId, nowIso } from './util.js';

export const REPORT_REASONS = ['wrong_number', 'not_reachable', 'not_owner', 'not_available', 'other'];

const addHours = (iso, hours) => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
const addDays = (iso, days) => addHours(iso, days * 24);
function addMonths(iso, months) {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

// ---------------------------------------------------------------- unlocks

/** The user's current unlock for a property: not reported and less than 6 months old. */
export const activeUnlock = (userId, propertyId) =>
  one(
    `SELECT * FROM unlocks WHERE user_id = ? AND property_id = ? AND status = 'active' AND expires_at > ?
      ORDER BY unlocked_at DESC LIMIT 1`,
    userId,
    propertyId,
    nowIso(),
  );

export function toUnlock(u) {
  return {
    id: u.id,
    method: u.method,
    unlockedAt: u.unlocked_at,
    expiresAt: u.expires_at,
    reportDeadline: u.report_deadline,
    canReport: u.status === 'active' && Date.parse(u.report_deadline) > Date.now(),
  };
}

function alreadyUnlocked(unlock) {
  return new HttpError(409, 'ALREADY_UNLOCKED', 'You already have this owner’s contact. No need to pay again.', {
    expiresAt: unlock.expires_at,
  });
}

/** Records a 6-month unlock. Must run inside a transaction; never creates a second active unlock. */
export function grantUnlock({ userId, propertyId, method, paymentId = null, passId = null, creditId = null }) {
  const existing = activeUnlock(userId, propertyId);
  if (existing) throw alreadyUnlocked(existing);
  const now = nowIso();
  const id = newId();
  run(
    `INSERT INTO unlocks (id, user_id, property_id, method, payment_id, pass_id, credit_id, unlocked_at, expires_at, report_deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    propertyId,
    method,
    paymentId,
    passId,
    creditId,
    now,
    addMonths(now, config.unlockMonths),
    addHours(now, config.reportWindowHours),
  );
  return id;
}

function assertUnlockable(user, property) {
  if (property.status !== 'active') throw new HttpError(409, 'PROPERTY_UNAVAILABLE', 'This listing is no longer available.');
  if (property.owner_id === user.id) throw new HttpError(400, 'OWN_PROPERTY', 'This is your own listing.');
  const existing = activeUnlock(user.id, property.id);
  if (existing) throw alreadyUnlocked(existing);
}

// ---------------------------------------------------------------- District Pass

const usedCredits = (passId) => one('SELECT COUNT(*) AS n FROM pass_unlocks WHERE pass_id = ? AND returned_at IS NULL', passId).n;

export function passSummary(pass) {
  const used = usedCredits(pass.id);
  const expired = Date.parse(pass.expires_at) <= Date.now();
  return {
    id: pass.id,
    district: pass.district,
    totalCredits: pass.credits_total,
    usedCredits: used,
    remainingCredits: Math.max(0, pass.credits_total - used),
    activatedAt: pass.activated_at,
    expiresAt: pass.expires_at,
    status: expired ? 'EXPIRED' : used >= pass.credits_total ? 'FULLY_USED' : 'ACTIVE',
  };
}

/** The user's Active pass (not expired, credits left) for a district, or null. */
export function activePassFor(userId, district) {
  if (!district) return null;
  const passes = all(
    'SELECT * FROM district_passes WHERE user_id = ? AND district = ? AND expires_at > ? ORDER BY activated_at',
    userId,
    district,
    nowIso(),
  );
  return passes.map(passSummary).find((p) => p.status === 'ACTIVE') ?? null;
}

export function createPass(userId, district, paymentId) {
  const now = nowIso();
  run(
    `INSERT INTO district_passes (id, user_id, district, payment_id, credits_total, activated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    userId,
    district,
    paymentId,
    config.districtPassCredits,
    now,
    addDays(now, config.districtPassDays),
  );
}

/** Uses one pass credit. Nothing is deducted unless the unlock is actually created. */
export function unlockWithPass(user, property) {
  return tx(() => {
    assertUnlockable(user, property);
    const district = canonicalDistrict(property.district);
    const pass = activePassFor(user.id, district);
    if (!pass) {
      const passes = all('SELECT * FROM district_passes WHERE user_id = ?', user.id).map(passSummary);
      const forDistrict = passes.filter((p) => p.district === district);
      if (!passes.length) throw new HttpError(404, 'NO_PASS', 'You don’t have a District Pass yet.');
      if (!forDistrict.length) {
        throw new HttpError(403, 'PASS_DISTRICT_MISMATCH', `Your District Pass doesn't cover ${district ?? property.district}.`);
      }
      if (forDistrict.some((p) => p.status === 'FULLY_USED')) {
        throw new HttpError(403, 'PASS_FULLY_USED', 'All 40 unlocks on this District Pass are used.');
      }
      throw new HttpError(403, 'PASS_EXPIRED', 'Your District Pass has expired.');
    }
    const unlockId = grantUnlock({ userId: user.id, propertyId: property.id, method: 'pass', passId: pass.id });
    run('INSERT INTO pass_unlocks (pass_id, property_id, unlock_id, used_at) VALUES (?, ?, ?, ?)', pass.id, property.id, unlockId, nowIso());
    return unlockId;
  });
}

// ---------------------------------------------------------------- free unlock credits

export const freeCredits = (userId) => one('SELECT COUNT(*) AS n FROM unlock_credits WHERE user_id = ? AND used_at IS NULL', userId).n;

export function unlockWithCredit(user, property) {
  return tx(() => {
    assertUnlockable(user, property);
    const credit = one('SELECT * FROM unlock_credits WHERE user_id = ? AND used_at IS NULL ORDER BY created_at LIMIT 1', user.id);
    if (!credit) throw new HttpError(404, 'NO_CREDIT', 'You don’t have a free unlock credit.');
    const unlockId = grantUnlock({ userId: user.id, propertyId: property.id, method: 'credit', creditId: credit.id });
    run('UPDATE unlock_credits SET used_at = ?, used_unlock_id = ? WHERE id = ?', nowIso(), unlockId, credit.id);
    return unlockId;
  });
}

// ---------------------------------------------------------------- what the tenant can use

export function unlockOptions(user, property) {
  const district = canonicalDistrict(property.district);
  return {
    price: config.unlockFeePaise / 100,
    passPrice: config.districtPassFeePaise / 100,
    passCredits: config.districtPassCredits,
    passDays: config.districtPassDays,
    unlockMonths: config.unlockMonths,
    reportHours: config.reportWindowHours,
    district, // null when the listing's district isn't one of the 38 (no pass possible)
    pass: user ? activePassFor(user.id, district) : null,
    freeCredits: user ? freeCredits(user.id) : 0,
  };
}

// ---------------------------------------------------------------- "Report Wrong Details" (48 h)

/**
 * Revokes the unlock and compensates: ₹29 → tenant's choice of full refund or a free unlock credit;
 * pass → the credit goes back on the pass; free credit → the credit is returned.
 * Returns `{ outcome, paymentId }`; the caller issues the refund (outside the transaction).
 */
export function reportUnlock(user, unlockId, { reason, resolution, note } = {}) {
  return tx(() => {
    const unlock = one('SELECT * FROM unlocks WHERE id = ? AND user_id = ?', unlockId, user.id);
    if (!unlock) throw new HttpError(404, 'NOT_FOUND', 'Unlock not found.');
    if (unlock.status !== 'active') throw new HttpError(409, 'ALREADY_REPORTED', 'You have already reported this contact.');
    if (Date.parse(unlock.report_deadline) <= Date.now()) {
      throw new HttpError(400, 'REPORT_WINDOW_CLOSED', `Wrong details can be reported only within ${config.reportWindowHours} hours of unlocking.`);
    }
    if (!REPORT_REASONS.includes(reason)) throw new HttpError(400, 'VALIDATION', 'Choose what was wrong.', { field: 'reason' });

    let outcome;
    if (unlock.method === 'payment') {
      if (!['refund', 'credit'].includes(resolution)) {
        throw new HttpError(400, 'VALIDATION', 'Choose a full refund or a free unlock credit.', { field: 'resolution' });
      }
      outcome = resolution;
    } else {
      outcome = unlock.method === 'pass' ? 'pass_credit' : 'credit_returned';
    }

    if (outcome === 'credit' || outcome === 'credit_returned') {
      run('INSERT INTO unlock_credits (id, user_id, source_unlock_id, created_at) VALUES (?, ?, ?, ?)', newId(), user.id, unlock.id, nowIso());
    }
    if (outcome === 'pass_credit') run('UPDATE pass_unlocks SET returned_at = ? WHERE unlock_id = ?', nowIso(), unlock.id);

    run(
      "UPDATE unlocks SET status = 'reported', reported_at = ?, report_reason = ?, report_resolution = ? WHERE id = ?",
      nowIso(),
      typeof note === 'string' && note.trim() ? `${reason}: ${note.trim().slice(0, 300)}` : reason,
      outcome,
      unlock.id,
    );
    return { outcome, paymentId: unlock.payment_id };
  });
}
