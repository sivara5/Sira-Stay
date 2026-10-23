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

/** SQL condition: payment row `p` went through and its money hasn't been (or isn't being) refunded. */
export const PAID = (p) => `${p}.status = 'paid' AND COALESCE(${p}.refund_status, '') NOT IN ('processing', 'refunded')`;

/**
 * The user's current unlock for a property: not reported, less than 6 months old, and backed by a
 * successful payment — the ₹29 unlock for this listing, or the District Pass the credit came from.
 * Free credits are only ever given instead of refunding a paid unlock, so they count as paid.
 */
export const activeUnlock = (userId, propertyId) =>
  one(
    `SELECT u.* FROM unlocks u
       LEFT JOIN payments pay ON pay.id = u.payment_id AND pay.user_id = u.user_id AND pay.property_id = u.property_id
       LEFT JOIN district_passes dp ON dp.id = u.pass_id
       LEFT JOIN payments pass_pay ON pass_pay.id = dp.payment_id
      WHERE u.user_id = ? AND u.property_id = ? AND u.status = 'active' AND u.expires_at > ?
        AND CASE u.method
              WHEN 'payment' THEN ${PAID('pay')}
              WHEN 'pass' THEN ${PAID('pass_pay')}
              WHEN 'credit' THEN 1
              ELSE 0
            END
      ORDER BY u.unlocked_at DESC LIMIT 1`,
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
    canReport: u.status === 'active' && !u.reported_at && Date.parse(u.report_deadline) > Date.now(),
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

/** How many wrong-details reports the tenant made in the last 30 days. */
const recentReports = (userId) =>
  one('SELECT COUNT(*) AS n FROM unlocks WHERE user_id = ? AND reported_at > ?', userId, addDays(nowIso(), -30)).n;

export const reportsLeft = (userId) => Math.max(0, config.reportsPerMonth - recentReports(userId));

/** Hides a listing once enough different tenants have reported it (rejected reports don't count). */
function hideIfReportedByMany(propertyId) {
  const { n: reporters } = one(
    `SELECT COUNT(DISTINCT user_id) AS n FROM unlocks
      WHERE property_id = ? AND status = 'reported' AND COALESCE(review_status, '') <> 'rejected'`,
    propertyId,
  );
  const hidden = reporters >= config.hideAfterReporters && run("UPDATE properties SET status = 'hidden' WHERE id = ? AND status = 'active'", propertyId).changes > 0;
  return { reporters, hidden };
}

function giveCredit(userId, sourceUnlockId) {
  run('INSERT INTO unlock_credits (id, user_id, source_unlock_id, created_at) VALUES (?, ?, ?, ?)', newId(), userId, sourceUnlockId, nowIso());
}

/**
 * Revokes the unlock and compensates. At most 2 reports per tenant in any 30 days.
 * ₹29 → free unlock credit right away, or a money refund that waits for admin review
 * (3 days, then it becomes a free credit); pass → the pass credit comes back; free credit → returned.
 */
export function reportUnlock(user, unlockId, { reason, resolution, note } = {}) {
  return tx(() => {
    const unlock = one('SELECT * FROM unlocks WHERE id = ? AND user_id = ?', unlockId, user.id);
    if (!unlock) throw new HttpError(404, 'NOT_FOUND', 'Unlock not found.');
    if (unlock.status !== 'active' || unlock.reported_at) {
      throw new HttpError(409, 'ALREADY_REPORTED', 'You have already reported this contact.');
    }
    if (Date.parse(unlock.report_deadline) <= Date.now()) {
      throw new HttpError(400, 'REPORT_WINDOW_CLOSED', `Wrong details can be reported only within ${config.reportWindowHours} hours of unlocking.`);
    }
    if (recentReports(user.id) >= config.reportsPerMonth) {
      throw new HttpError(429, 'REPORT_LIMIT', `You can report wrong details at most ${config.reportsPerMonth} times a month.`);
    }
    if (!REPORT_REASONS.includes(reason)) throw new HttpError(400, 'VALIDATION', 'Choose what was wrong.', { field: 'reason' });

    let outcome;
    if (unlock.method === 'payment') {
      if (!['refund', 'credit'].includes(resolution)) {
        throw new HttpError(400, 'VALIDATION', 'Choose a full refund or a free unlock credit.', { field: 'resolution' });
      }
      outcome = resolution === 'refund' ? 'refund_pending' : 'credit';
    } else {
      outcome = unlock.method === 'pass' ? 'pass_credit' : 'credit_returned';
    }

    const now = nowIso();
    if (outcome === 'credit' || outcome === 'credit_returned') giveCredit(user.id, unlock.id);
    if (outcome === 'pass_credit') run('UPDATE pass_unlocks SET returned_at = ? WHERE unlock_id = ?', now, unlock.id);
    if (outcome === 'refund_pending') {
      run(
        "UPDATE payments SET refund_status = 'under_review', refund_reason = 'wrong_details', refund_note = ? WHERE id = ?",
        'Wrong owner details — waiting for admin review',
        unlock.payment_id,
      );
    }
    const pending = outcome === 'refund_pending';
    run(
      `UPDATE unlocks SET status = 'reported', reported_at = ?, report_reason = ?, report_resolution = ?,
         review_status = ?, review_deadline = ? WHERE id = ?`,
      now,
      typeof note === 'string' && note.trim() ? `${reason}: ${note.trim().slice(0, 300)}` : reason,
      pending ? 'refund' : outcome,
      pending ? 'pending' : null,
      pending ? addDays(now, config.refundReviewDays) : null,
      unlock.id,
    );
    return { outcome, paymentId: unlock.payment_id, propertyId: unlock.property_id, ...hideIfReportedByMany(unlock.property_id) };
  });
}

// ---------------------------------------------------------------- admin review of money refunds

/** Unreviewed refund requests older than 3 days become a free unlock credit instead of money. */
export function settleOverdueReviews() {
  const overdue = all("SELECT * FROM unlocks WHERE review_status = 'pending' AND review_deadline <= ?", nowIso());
  for (const u of overdue) {
    tx(() => {
      if (one('SELECT review_status FROM unlocks WHERE id = ?', u.id).review_status !== 'pending') return;
      giveCredit(u.user_id, u.id);
      run("UPDATE unlocks SET review_status = 'auto_credit', report_resolution = 'credit', reviewed_at = ? WHERE id = ?", nowIso(), u.id);
      run("UPDATE payments SET refund_status = 'credited' WHERE id = ? AND refund_status = 'under_review'", u.payment_id);
    });
  }
  return overdue.length;
}

/**
 * Admin decision on a pending money refund. Approve → caller refunds via Razorpay.
 * Reject → no money; the tenant gets the contact back (unless they've unlocked it again since).
 */
export function decideRefund(unlockId, admin, decision) {
  return tx(() => {
    const u = one('SELECT * FROM unlocks WHERE id = ?', unlockId);
    if (!u) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');
    if (u.review_status !== 'pending') throw new HttpError(409, 'REVIEW_CLOSED', 'This report has already been reviewed.');
    const now = nowIso();
    if (decision === 'approve') {
      run("UPDATE unlocks SET review_status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE id = ?", now, admin.email, u.id);
      return { paymentId: u.payment_id };
    }
    run("UPDATE unlocks SET review_status = 'rejected', reviewed_at = ?, reviewed_by = ? WHERE id = ?", now, admin.email, u.id);
    run("UPDATE payments SET refund_status = 'rejected' WHERE id = ? AND refund_status = 'under_review'", u.payment_id);
    if (!activeUnlock(u.user_id, u.property_id)) run("UPDATE unlocks SET status = 'active' WHERE id = ?", u.id);
    return { paymentId: null };
  });
}

/** Everything the admin screen shows. */
export function adminOverview() {
  const reports = all(
    `SELECT u.*, us.email AS tenant_email, us.name AS tenant_name, p.title AS property_title, p.area, p.district,
            p.status AS property_status, pay.amount AS paid_amount, pay.refund_status
       FROM unlocks u
       JOIN users us ON us.id = u.user_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN payments pay ON pay.id = u.payment_id
      WHERE u.reported_at IS NOT NULL
      ORDER BY u.reported_at DESC LIMIT 100`,
  ).map((r) => ({
    id: r.id,
    tenant: { email: r.tenant_email, name: r.tenant_name },
    property: { id: r.property_id, title: r.property_title, area: r.area, district: r.district, status: r.property_status },
    method: r.method,
    reason: r.report_reason,
    resolution: r.report_resolution,
    reviewStatus: r.review_status,
    reviewDeadline: r.review_deadline,
    reportedAt: r.reported_at,
    amount: r.paid_amount ? r.paid_amount / 100 : null,
    refundStatus: r.refund_status,
  }));
  const hiddenProperties = all(
    `SELECT p.id, p.title, p.area, p.district,
            (SELECT COUNT(DISTINCT user_id) FROM unlocks u WHERE u.property_id = p.id AND u.status = 'reported') AS reporters
       FROM properties p WHERE p.status = 'hidden' ORDER BY p.title`,
  );
  const notifications = all('SELECT id, kind, title, body, channel, created_at AS createdAt, read_at AS readAt FROM admin_notifications ORDER BY created_at DESC LIMIT 30');
  return {
    pending: reports.filter((r) => r.reviewStatus === 'pending'),
    reports,
    hiddenProperties,
    notifications,
    unreadNotifications: one('SELECT COUNT(*) AS n FROM admin_notifications WHERE read_at IS NULL').n,
  };
}
