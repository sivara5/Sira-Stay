import express, { Router } from 'express';

import { requireRegistered } from '../auth.js';
import { config } from '../config.js';
import { all, one, run } from '../db.js';
import { canonicalDistrict } from '../districts.js';
import { createProviderOrder, verifyCheckoutSignature, verifyWebhookSignature } from '../payment-provider.js';
import { getPropertyOr404, markFailed, markPaid, refundPayment, toPayment } from '../services.js';
import { activePassFor, activeUnlock, passSummary } from '../unlocks.js';
import { HttpError, newId, nowIso } from '../util.js';

export const paymentsRouter = Router();

const REUSE_WINDOW_MS = 30 * 60 * 1000;

function ownPayment(req) {
  const payment = one('SELECT * FROM payments WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!payment) throw new HttpError(404, 'NOT_FOUND', 'Payment not found.');
  return payment;
}

/** Payment status plus what it unlocked, so the app can refresh from the backend's source of truth. */
function paymentResponse(payment) {
  const result = { payment: toPayment(payment) };
  if (payment.purpose === 'unlock') {
    const unlock = activeUnlock(payment.user_id, payment.property_id);
    result.unlocked = Boolean(unlock);
    result.unlockExpiresAt = unlock?.expires_at ?? null;
  } else if (payment.purpose === 'district_pass') {
    const pass = one('SELECT * FROM district_passes WHERE payment_id = ?', payment.id);
    result.pass = pass ? passSummary(pass) : null;
  } else {
    result.bookingStatus = one('SELECT status FROM bookings WHERE id = ?', payment.booking_id)?.status ?? null;
  }
  return result;
}

/**
 * Creates (or reuses) a payment order: ₹29 single unlock, ₹99 District Pass, or a booking amount.
 * Nothing is granted here — only a backend-verified payment (signature or webhook) fulfils it.
 */
paymentsRouter.post('/', requireRegistered, async (req, res) => {
  const { purpose } = req.body ?? {};
  let property = null;
  let bookingId = null;
  let district = null;
  let amount;
  let description;

  if (purpose === 'unlock') {
    property = getPropertyOr404(req.body.propertyId);
    if (property.status !== 'active') throw new HttpError(409, 'PROPERTY_UNAVAILABLE', 'This listing is no longer available.');
    if (property.owner_id === req.user.id) throw new HttpError(400, 'OWN_PROPERTY', 'This is your own listing.');
    const unlock = activeUnlock(req.user.id, property.id);
    if (unlock) {
      throw new HttpError(409, 'ALREADY_UNLOCKED', 'You already have this owner’s contact. No need to pay again.', { expiresAt: unlock.expires_at });
    }
    const pass = activePassFor(req.user.id, canonicalDistrict(property.district));
    if (pass) {
      throw new HttpError(409, 'USE_DISTRICT_PASS', `Your District Pass covers ${pass.district}. Unlock with a pass credit instead of paying.`);
    }
    amount = config.unlockFeePaise;
    description = `Owner contact unlock · ${property.title}`;
  } else if (purpose === 'district_pass') {
    district = canonicalDistrict(req.body.district);
    if (!district) throw new HttpError(400, 'VALIDATION', 'Choose a Tamil Nadu district for your pass.', { field: 'district' });
    if (activePassFor(req.user.id, district)) {
      throw new HttpError(409, 'PASS_ACTIVE', `You already have an active District Pass for ${district}.`);
    }
    amount = config.districtPassFeePaise;
    description = `District Pass · ${district} · ${config.districtPassCredits} unlocks for ${config.districtPassDays} days`;
  } else if (purpose === 'booking') {
    const booking = one('SELECT * FROM bookings WHERE id = ? AND user_id = ?', req.body.bookingId, req.user.id);
    if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
    if (booking.status !== 'PENDING_PAYMENT' || booking.hold_expires_at < Date.now()) {
      throw new HttpError(410, 'HOLD_EXPIRED', 'Your booking window expired. Please start the booking again.');
    }
    property = getPropertyOr404(booking.property_id);
    bookingId = booking.id;
    amount = booking.amount * 100;
    description = `Booking amount · ${property.title}`;
  } else {
    throw new HttpError(400, 'VALIDATION', 'Unknown payment purpose.');
  }

  // Reuse an open order instead of creating another one — avoids accidental double charges.
  let payment = one(
    `SELECT * FROM payments WHERE user_id = ? AND purpose = ? AND COALESCE(property_id, '') = ? AND COALESCE(booking_id, '') = ?
       AND COALESCE(district, '') = ? AND amount = ? AND status = 'created' AND provider = ? AND created_at > ?
     ORDER BY created_at DESC LIMIT 1`,
    req.user.id,
    purpose,
    property?.id ?? '',
    bookingId ?? '',
    district ?? '',
    amount,
    config.paymentProvider,
    new Date(Date.now() - REUSE_WINDOW_MS).toISOString(),
  );
  if (!payment) {
    const draft = {
      id: newId(),
      user_id: req.user.id,
      purpose,
      property_id: property?.id ?? null,
      booking_id: bookingId,
      district,
      amount,
      currency: 'INR',
      provider: config.paymentProvider,
    };
    const orderId = await createProviderOrder(draft);
    run(
      `INSERT INTO payments (id, user_id, purpose, property_id, booking_id, district, amount, currency, provider, provider_order_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      draft.id,
      draft.user_id,
      purpose,
      draft.property_id,
      bookingId,
      district,
      amount,
      'INR',
      draft.provider,
      orderId,
      nowIso(),
    );
    payment = one('SELECT * FROM payments WHERE id = ?', draft.id);
  }

  res.status(201).json({
    payment: toPayment(payment),
    checkout: {
      provider: payment.provider,
      keyId: payment.provider === 'razorpay' ? config.razorpay.keyId : undefined,
      orderId: payment.provider_order_id,
      amount: payment.amount,
      currency: payment.currency,
      name: 'Sira Stay',
      description,
      prefill: { email: req.user.email, contact: req.user.phone },
    },
  });
});

paymentsRouter.get('/:id', requireRegistered, (req, res) => res.json(paymentResponse(ownPayment(req))));

/** Razorpay Checkout success callback — signature is verified server-side before anything is unlocked. */
paymentsRouter.post('/:id/verify', requireRegistered, async (req, res) => {
  const payment = ownPayment(req);
  const { razorpay_order_id: orderId, razorpay_payment_id: providerPaymentId, razorpay_signature: signature } = req.body ?? {};
  if (payment.provider !== 'razorpay' || orderId !== payment.provider_order_id || !verifyCheckoutSignature(orderId, providerPaymentId, signature)) {
    throw new HttpError(400, 'PAYMENT_VERIFICATION_FAILED', 'We could not verify this payment. If money was debited it will be refunded.');
  }
  res.json(paymentResponse(await markPaid(payment.id, providerPaymentId)));
});

/** Development checkout used when Razorpay keys are not configured. */
paymentsRouter.post('/:id/mock', requireRegistered, async (req, res) => {
  const payment = ownPayment(req);
  if (payment.provider !== 'mock') throw new HttpError(400, 'NOT_MOCK', 'This payment must be completed through Razorpay.');
  if (req.body?.outcome === 'success') {
    await markPaid(payment.id, `mock_pay_${Date.now()}`);
  } else {
    markFailed(payment.id);
  }
  res.json(paymentResponse(one('SELECT * FROM payments WHERE id = ?', payment.id)));
});

paymentsRouter.post('/:id/cancel', requireRegistered, (req, res) => {
  const payment = ownPayment(req);
  markFailed(payment.id);
  res.json(paymentResponse(one('SELECT * FROM payments WHERE id = ?', payment.id)));
});

/**
 * Refunds here are for duplicate payments, technical failures, or the owner withdrawing the listing.
 * Wrong owner details are reported per unlock (POST /unlocks/:id/report) within 48 hours.
 */
paymentsRouter.post('/:id/refund-request', requireRegistered, async (req, res) => {
  const payment = ownPayment(req);
  const reason = req.body?.reason;
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : null;
  const allowed = payment.purpose === 'district_pass' ? ['duplicate', 'technical'] : ['duplicate', 'technical', 'withdrawn'];
  if (!allowed.includes(reason)) {
    throw new HttpError(400, 'REFUND_NOT_ELIGIBLE', 'Refunds are available only for duplicate payments, technical failures, or withdrawn listings.');
  }
  if (payment.status !== 'paid') throw new HttpError(400, 'REFUND_NOT_ELIGIBLE', 'Only completed payments can be refunded.');
  if (payment.refund_status) throw new HttpError(409, 'REFUND_EXISTS', 'A refund has already been requested for this payment.');

  const property = payment.property_id ? getPropertyOr404(payment.property_id) : null;
  const hasEarlierPaidTwin = Boolean(
    one(
      `SELECT 1 AS ok FROM payments WHERE user_id = ? AND purpose = ? AND COALESCE(property_id, '') = ? AND COALESCE(booking_id, '') = ?
         AND COALESCE(district, '') = ? AND status = 'paid' AND id <> ? AND paid_at < ?`,
      payment.user_id,
      payment.purpose,
      payment.property_id ?? '',
      payment.booking_id ?? '',
      payment.district ?? '',
      payment.id,
      payment.paid_at,
    ),
  );
  const autoApprove =
    (reason === 'withdrawn' && property?.status === 'withdrawn') ||
    (reason === 'duplicate' && (payment.is_duplicate || hasEarlierPaidTwin)) ||
    (reason === 'technical' && payment.fulfilment_failed);

  if (autoApprove) {
    res.json(paymentResponse(await refundPayment(payment.id, reason, note)));
  } else {
    run("UPDATE payments SET refund_status = 'under_review', refund_reason = ?, refund_note = ? WHERE id = ?", reason, note, payment.id);
    res.json(paymentResponse(one('SELECT * FROM payments WHERE id = ?', payment.id)));
  }
});

export const myPaymentsRouter = Router();

myPaymentsRouter.get('/', requireRegistered, (req, res) => {
  const rows = all(
    `SELECT p.*, pr.title AS property_title, pr.status AS property_status FROM payments p
       LEFT JOIN properties pr ON pr.id = p.property_id
      WHERE p.user_id = ? AND p.status = 'paid' ORDER BY p.paid_at DESC`,
    req.user.id,
  );
  res.json({
    payments: rows.map((p) => ({
      ...toPayment(p),
      propertyTitle: p.property_title ?? (p.district ? `District Pass · ${p.district}` : null),
      propertyWithdrawn: p.property_status === 'withdrawn',
    })),
  });
});

/** Razorpay webhook keeps payment state in sync even if the app is closed mid-payment. */
export const webhookRouter = Router();

webhookRouter.post('/razorpay', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.get('x-razorpay-signature'))) {
    throw new HttpError(400, 'BAD_SIGNATURE', 'Invalid webhook signature.');
  }
  const event = JSON.parse(req.body.toString('utf8'));
  const entity = event.payload?.payment?.entity;
  const payment = entity?.order_id && one('SELECT * FROM payments WHERE provider_order_id = ?', entity.order_id);
  if (payment) {
    if (event.event === 'payment.captured' || event.event === 'order.paid') await markPaid(payment.id, entity.id);
    if (event.event === 'payment.failed') markFailed(payment.id);
  }
  res.json({ ok: true });
});
