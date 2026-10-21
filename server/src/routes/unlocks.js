import { Router } from 'express';

import { requireRegistered } from '../auth.js';
import { config } from '../config.js';
import { all, one } from '../db.js';
import { getPropertyOr404, refundPayment, toDetail } from '../services.js';
import { freeCredits, passSummary, reportUnlock, unlockWithCredit, unlockWithPass } from '../unlocks.js';
import { HttpError } from '../util.js';

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

/** "Report Wrong Details" within 48 hours of unlocking. */
unlocksRouter.post('/:id/report', requireRegistered, async (req, res) => {
  const { outcome, paymentId } = reportUnlock(req.user, req.params.id, req.body ?? {});
  if (outcome === 'refund') await refundPayment(paymentId, 'wrong_details', 'Owner details reported wrong within 48 hours');
  const payment = paymentId ? one('SELECT refund_status FROM payments WHERE id = ?', paymentId) : null;
  res.json({ outcome, refundStatus: outcome === 'refund' ? payment?.refund_status : null, freeCredits: freeCredits(req.user.id) });
});

export const myPassesRouter = Router();

/** District Pass dashboard: every pass with credits, dates and status, plus free unlock credits. */
myPassesRouter.get('/', requireRegistered, (req, res) => {
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
