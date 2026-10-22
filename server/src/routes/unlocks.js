import { Router } from 'express';

import { requireAdmin, requireRegistered } from '../auth.js';
import { config } from '../config.js';
import { all, one, run } from '../db.js';
import { notifyAdmins } from '../notify.js';
import { getPropertyOr404, refundPayment, toDetail } from '../services.js';
import {
  adminOverview,
  decideRefund,
  freeCredits,
  passSummary,
  reportUnlock,
  reportsLeft,
  settleOverdueReviews,
  unlockWithCredit,
  unlockWithPass,
} from '../unlocks.js';
import { HttpError, nowIso } from '../util.js';
import { documentFileFromLink, listingsToVerify, markAdminVerified, markDocumentChecked } from '../verification.js';

export const unlocksRouter = Router();

/** Unlock without paying: one District Pass credit, or one free unlock credit. */
unlocksRouter.post('/', requireRegistered, (req, res) => {
  const property = getPropertyOr404(req.body?.propertyId);
  const method = req.body?.method;
  if (method === 'pass') unlockWithPass(req.user, property);
  else if (method === 'credit') unlockWithCredit(req.user, property);
  else throw new HttpError(400, 'VALIDATION', 'Choose how to unlock.');
  res.status(201).json({ property: toDetail(getPropertyOr404(property.id), req.user) });
});

const OUTCOME_TEXT = {
  refund_pending: `wants a money refund — approve or reject within ${config.refundReviewDays} days, otherwise they get a free unlock credit`,
  credit: 'took a free unlock credit',
  pass_credit: 'got the District Pass credit back',
  credit_returned: 'got their free unlock credit back',
};

/** "Report Wrong Details" within 48 hours of unlocking (max 2 per tenant per month). */
unlocksRouter.post('/:id/report', requireRegistered, (req, res) => {
  settleOverdueReviews();
  const result = reportUnlock(req.user, req.params.id, req.body ?? {});
  const property = one('SELECT title, area, district FROM properties WHERE id = ?', result.propertyId);
  notifyAdmins(
    result.hidden ? 'listing_hidden' : 'report',
    result.hidden ? `Listing hidden after ${result.reporters} reports: ${property.title}` : `Wrong details reported: ${property.title}`,
    [
      `${req.user.email} reported ${property.title} (${property.area}, ${property.district}).`,
      `Reason: ${req.body?.reason}${req.body?.note ? ` — ${String(req.body.note).slice(0, 300)}` : ''}`,
      `Tenant ${OUTCOME_TEXT[result.outcome]}.`,
      `Different tenants who reported this listing: ${result.reporters}.`,
      result.hidden ? 'The listing has been hidden automatically. Restore it from the admin screen if the details are fine.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  res.json({ outcome: result.outcome, freeCredits: freeCredits(req.user.id), reportsLeft: reportsLeft(req.user.id) });
});

export const myPassesRouter = Router();

/** District Pass dashboard: every pass with credits, dates and status, plus free unlock credits. */
myPassesRouter.get('/', requireRegistered, (req, res) => {
  settleOverdueReviews();
  const passes = all('SELECT * FROM district_passes WHERE user_id = ? ORDER BY activated_at DESC', req.user.id).map(passSummary);
  res.json({
    passes,
    freeCredits: freeCredits(req.user.id),
    pricing: {
      passPrice: config.districtPassFeePaise / 100,
      passCredits: config.districtPassCredits,
      passDays: config.districtPassDays,
      unlockPrice: config.unlockFeePaise / 100,
      unlockMonths: config.unlockMonths,
    },
  });
});

// ---------------------------------------------------------------- admin

export const adminRouter = Router();

/** Everything the admin screen shows: refund reports, hidden listings, notifications and listings to verify. */
const overview = () => ({ ...adminOverview(), listings: listingsToVerify() });

adminRouter.get('/reports', requireAdmin, (_req, res) => {
  settleOverdueReviews();
  res.json(overview());
});

/** Approve a pending wrong-details money refund → refunded through Razorpay. */
adminRouter.post('/reports/:id/approve', requireAdmin, async (req, res) => {
  settleOverdueReviews();
  const { paymentId } = decideRefund(req.params.id, req.user, 'approve');
  await refundPayment(paymentId, 'wrong_details', `Approved by ${req.user.email}`);
  res.json(overview());
});

/** Reject a pending refund → no money; the tenant gets the contact back. */
adminRouter.post('/reports/:id/reject', requireAdmin, (req, res) => {
  settleOverdueReviews();
  decideRefund(req.params.id, req.user, 'reject');
  res.json(overview());
});

/** Show an automatically hidden listing again. */
adminRouter.post('/properties/:id/restore', requireAdmin, (req, res) => {
  const property = getPropertyOr404(req.params.id);
  if (property.status !== 'hidden') throw new HttpError(409, 'NOT_HIDDEN', 'This listing is not hidden.');
  run("UPDATE properties SET status = 'active' WHERE id = ?", property.id);
  res.json(overview());
});

adminRouter.post('/notifications/read', requireAdmin, (_req, res) => {
  run('UPDATE admin_notifications SET read_at = ? WHERE read_at IS NULL', nowIso());
  res.json(overview());
});

/** "Admin verified" on the listing's Verified section. */
adminRouter.post('/properties/:id/verify', requireAdmin, (req, res) => {
  markAdminVerified(getPropertyOr404(req.params.id), req.user);
  res.json(overview());
});

/** "Property document checked" on the listing's Verified section. */
adminRouter.post('/properties/:id/document-checked', requireAdmin, (req, res) => {
  markDocumentChecked(getPropertyOr404(req.params.id), req.user);
  res.json(overview());
});

/** Opens the private ownership document from a signed 15-minute link (made for admins in the overview). */
adminRouter.get('/properties/:id/document', (req, res) => {
  const file = documentFileFromLink(req.params.id, req.query.expires, req.query.sig);
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(file, { headers: { 'Content-Disposition': 'inline' } });
});
