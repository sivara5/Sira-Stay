import { config } from './config.js';
import { all, one, run, tx } from './db.js';
import { haversineKm, publicDistanceKm } from './geo.js';
import { PHOTO_COLUMNS, photoView } from './images.js';
import { refundProviderPayment } from './payment-provider.js';
import { canReview, myReview, propertyReviews } from './reviews.js';
import { PAID, activePassFor, activeUnlock, createPass, grantUnlock, toUnlock, unlockOptions } from './unlocks.js';
import { HttpError, decryptJson, nowIso, todayIST } from './util.js';
import { verificationChecks } from './verification.js';

// Display order: Homes, Apartments, Villas, PG, Room Sharing ("house" is shown as Homes).
export const CATEGORIES = ['house', 'apartments', 'villas', 'pg', 'room_sharing'];

// ---------------------------------------------------------------- bookings

export function expireStaleHolds() {
  run("UPDATE bookings SET status = 'EXPIRED' WHERE status = 'PENDING_PAYMENT' AND hold_expires_at < ?", Date.now());
}

/**
 * A booking that blocks [start, end): any confirmed booking, or another user's unexpired
 * payment hold. Pass `ignoreHoldsOf` = the requesting user so their own holds don't block them.
 */
export function findBlockingBooking(propertyId, start, end, { ignoreHoldsOf, excludeBookingId = '' } = {}) {
  return one(
    `SELECT * FROM bookings
      WHERE property_id = ? AND id <> ? AND move_in_date < ? AND end_date > ?
        AND (status = 'CONFIRMED' OR (status = 'PENDING_PAYMENT' AND hold_expires_at > ? AND user_id <> ?))
      LIMIT 1`,
    propertyId,
    excludeBookingId,
    end,
    start,
    Date.now(),
    ignoreHoldsOf ?? '',
  );
}

/** Confirmed periods that haven't ended yet, so the app can show unavailable dates. */
export const bookedPeriods = (propertyId) =>
  all(
    `SELECT move_in_date AS moveInDate, end_date AS endDate FROM bookings
      WHERE property_id = ? AND status = 'CONFIRMED' AND end_date > ? ORDER BY move_in_date`,
    propertyId,
    todayIST(),
  );

// ---------------------------------------------------------------- properties

export const exactLocation = (property) => decryptJson(property.location_enc); // { address, lat, lng }

/**
 * Whether the user may see the exact address, map pin, owner phone and exterior photos: the owner,
 * or a tenant with a paid unlock (6 months) or a paid, confirmed booking of this listing.
 */
export function hasContactAccess(user, property) {
  if (!user) return false;
  if (property.owner_id === user.id) return true;
  if (activeUnlock(user.id, property.id)) return true;
  return Boolean(
    one(
      `SELECT 1 AS ok FROM bookings b JOIN payments p ON p.id = b.payment_id
        WHERE b.user_id = ? AND b.property_id = ? AND b.status = 'CONFIRMED' AND ${PAID('p')}`,
      user.id,
      property.id,
    ),
  );
}

/**
 * Exterior photos can show the house itself, so listing and search responses include them only for
 * the owner. Tenants get them from GET /properties/:id/unlocked after paying.
 */
const visiblePhotos = (property, user) => (user?.id === property.owner_id ? '' : " AND kind = 'interior'");

export const exteriorPhotos = (propertyId) =>
  all(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE property_id = ? AND kind = 'exterior' ORDER BY position`, propertyId).map(photoView);

export function propertyStatus(property) {
  if (property.status === 'withdrawn') return { status: 'WITHDRAWN' };
  if (property.status === 'hidden') return { status: 'HIDDEN' }; // reported by 3+ tenants, awaiting admin
  const [next] = bookedPeriods(property.id);
  return next ? { status: 'BOOKED', bookedFrom: next.moveInDate, bookedUntil: next.endDate } : { status: 'AVAILABLE' };
}

export function propertyRating(propertyId) {
  const r = one('SELECT AVG(rating) AS average, COUNT(*) AS count FROM reviews WHERE property_id = ?', propertyId);
  return { average: r.count ? Math.round(r.average * 10) / 10 : null, count: r.count };
}

/** Public card: area names and the fuzzed point only. Never the street address, exact coordinates or owner contact. */
export function toCard(property, { user, origin } = {}) {
  const photoFilter = visiblePhotos(property, user);
  const cover = photoView(
    one(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE property_id = ?${photoFilter} ORDER BY position LIMIT 1`, property.id),
  );
  const { n: photoCount } = one(`SELECT COUNT(*) AS n FROM photos WHERE property_id = ?${photoFilter}`, property.id);
  const approxLocation = { lat: property.approx_lat, lng: property.approx_lng, radiusM: property.approx_radius_m };
  const favorite = user
    ? Boolean(one('SELECT 1 AS ok FROM favorites WHERE user_id = ? AND property_id = ?', user.id, property.id))
    : false;
  const card = {
    id: property.id,
    category: property.category,
    title: property.title,
    rent: property.rent,
    deposit: property.deposit,
    bookingAmount: property.booking_amount,
    furnishing: property.furnishing,
    district: property.district,
    area: property.area,
    landmark: property.landmark,
    approxLocation,
    coverPhoto: cover?.card ?? null, // card-size version — much smaller download than the original
    cover,
    photoCount,
    // "Verified" on the card = every check in the listing's Verified section: owner KYC, admin, document.
    verified: Object.values(verificationChecks(property)).every(Boolean),
    unlockFee: config.unlockFeePaise / 100, // shown on the card's "Unlock owner contact ₹29" button
    availableFrom: property.available_from,
    createdAt: property.created_at,
    isOwner: user?.id === property.owner_id,
    unlocked: hasContactAccess(user, property),
    unlockExpiresAt: (user && activeUnlock(user.id, property.id)?.expires_at) ?? null,
    favorite,
    rating: propertyRating(property.id),
    ...propertyStatus(property),
  };
  // Measured to the fuzzed point: rounded distances to the real house could be trilaterated by moving `origin`.
  if (origin) card.distanceKm = publicDistanceKm(haversineKm(origin, approxLocation));
  return card;
}

/**
 * Listing details. Like the card, never includes the address, exact pin, owner contact or (for tenants)
 * exterior photos — those come only from GET /properties/:id/unlocked.
 */
export function toDetail(property, user) {
  const card = toCard(property, { user });
  const detail = {
    ...card,
    description: property.description,
    amenities: JSON.parse(property.amenities),
    photos: all(
      `SELECT ${PHOTO_COLUMNS} FROM photos WHERE property_id = ?${visiblePhotos(property, user)} ORDER BY position`,
      property.id,
    ).map(photoView),
    bookedPeriods: bookedPeriods(property.id),
    unlock: null,
    unlockOptions: unlockOptions(user, property),
    checks: verificationChecks(property),
    reviews: propertyReviews(property.id),
    myReview: myReview(user, property.id),
    canReview: canReview(user, property),
  };
  const unlock = user && activeUnlock(user.id, property.id);
  if (unlock) detail.unlock = toUnlock(unlock);
  return detail;
}

/** What a tenant sees after unlocking: the mobile and WhatsApp numbers the owner gave in KYC. */
export function ownerContact(ownerId) {
  const owner = one('SELECT id, name, phone, contact_phone, whatsapp, available FROM users WHERE id = ?', ownerId);
  const phone = owner.contact_phone || owner.phone;
  return { id: owner.id, name: owner.name, phone, whatsapp: owner.whatsapp || phone, available: Boolean(owner.available) };
}

export function getPropertyOr404(id) {
  const property = one('SELECT * FROM properties WHERE id = ?', id);
  if (!property) throw new HttpError(404, 'NOT_FOUND', 'This property no longer exists.');
  return property;
}

// ---------------------------------------------------------------- payments

export function toPayment(p) {
  return {
    id: p.id,
    purpose: p.purpose,
    propertyId: p.property_id,
    bookingId: p.booking_id,
    district: p.district,
    amount: p.amount / 100,
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    isDuplicate: Boolean(p.is_duplicate),
    refundStatus: p.refund_status,
    refundReason: p.refund_reason,
    createdAt: p.created_at,
    paidAt: p.paid_at,
  };
}

/**
 * Marks a payment as paid and fulfils it (unlock contact / confirm booking) atomically.
 * Idempotent: safe to call from both the app callback and the provider webhook.
 * Duplicate payments and bookings that can no longer be honoured are refunded automatically.
 */
export async function markPaid(paymentId, providerPaymentId) {
  const outcome = tx(() => {
    const payment = one('SELECT * FROM payments WHERE id = ?', paymentId);
    if (!payment) throw new HttpError(404, 'NOT_FOUND', 'Payment not found.');
    if (payment.status === 'paid') return { refund: null };

    const now = nowIso();
    run(
      "UPDATE payments SET status = 'paid', provider_payment_id = ?, paid_at = ? WHERE id = ?",
      providerPaymentId,
      now,
      paymentId,
    );

    if (payment.purpose === 'unlock') {
      // Already unlocked (e.g. two orders paid) → this payment is a duplicate and is refunded.
      if (activeUnlock(payment.user_id, payment.property_id)) {
        run('UPDATE payments SET is_duplicate = 1 WHERE id = ?', paymentId);
        return { refund: 'duplicate' };
      }
      grantUnlock({ userId: payment.user_id, propertyId: payment.property_id, method: 'payment', paymentId });
      return { refund: null };
    }

    if (payment.purpose === 'district_pass') {
      if (activePassFor(payment.user_id, payment.district)) {
        run('UPDATE payments SET is_duplicate = 1 WHERE id = ?', paymentId);
        return { refund: 'duplicate' };
      }
      createPass(payment.user_id, payment.district, paymentId);
      return { refund: null };
    }

    const booking = one('SELECT * FROM bookings WHERE id = ?', payment.booking_id);
    const property = one('SELECT status FROM properties WHERE id = ?', payment.property_id);
    if (booking.status === 'CONFIRMED') {
      run('UPDATE payments SET is_duplicate = 1 WHERE id = ?', paymentId);
      return { refund: 'duplicate' };
    }
    const fail = (reason) => {
      run("UPDATE bookings SET status = 'FAILED', payment_id = ? WHERE id = ?", paymentId, booking.id);
      run('UPDATE payments SET fulfilment_failed = 1 WHERE id = ?', paymentId);
      return { refund: reason };
    };
    if (property.status === 'withdrawn') return fail('withdrawn');
    if (!['PENDING_PAYMENT', 'EXPIRED'].includes(booking.status)) return fail('technical');

    // A still-valid hold is exclusive; an expired one only wins if nobody else holds/booked the dates.
    const blocker = findBlockingBooking(booking.property_id, booking.move_in_date, booking.end_date, {
      excludeBookingId: booking.id,
      ignoreHoldsOf: booking.status === 'PENDING_PAYMENT' ? undefined : booking.user_id,
    });
    const blockedByConfirmed = blocker?.status === 'CONFIRMED';
    const blockedByHold = blocker && booking.status === 'EXPIRED';
    if (blockedByConfirmed || blockedByHold) return fail('technical');

    run(
      "UPDATE bookings SET status = 'CONFIRMED', confirmed_at = ?, payment_id = ?, hold_expires_at = NULL WHERE id = ?",
      now,
      paymentId,
      booking.id,
    );
    // Release any other users' overlapping holds — those dates are now taken.
    run(
      `UPDATE bookings SET status = 'EXPIRED'
        WHERE property_id = ? AND id <> ? AND status = 'PENDING_PAYMENT' AND move_in_date < ? AND end_date > ?`,
      booking.property_id,
      booking.id,
      booking.end_date,
      booking.move_in_date,
    );
    return { refund: null };
  });

  if (outcome.refund) await refundPayment(paymentId, outcome.refund, 'Automatic refund');
  return one('SELECT * FROM payments WHERE id = ?', paymentId);
}

export function markFailed(paymentId) {
  run("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'created'", paymentId);
}

/** Refunds a paid payment. Falls back to manual review if the provider call fails. */
export async function refundPayment(paymentId, reason, note) {
  const payment = one('SELECT * FROM payments WHERE id = ?', paymentId);
  if (payment.status !== 'paid' || payment.refund_status === 'refunded') return payment;
  run(
    "UPDATE payments SET refund_status = 'processing', refund_reason = ?, refund_note = ? WHERE id = ?",
    reason,
    note ?? null,
    paymentId,
  );
  try {
    const refundId = await refundProviderPayment({ ...payment, refund_reason: reason });
    run("UPDATE payments SET refund_status = 'refunded', provider_refund_id = ? WHERE id = ?", refundId, paymentId);
    if (payment.purpose === 'booking') {
      // Only cancel the booking this payment confirmed — a refunded duplicate leaves it intact.
      run(
        "UPDATE bookings SET status = 'CANCELLED' WHERE id = ? AND status = 'CONFIRMED' AND payment_id = ?",
        payment.booking_id,
        paymentId,
      );
    }
    if (payment.purpose === 'district_pass') {
      // A refunded pass stops working immediately.
      run('UPDATE district_passes SET expires_at = ? WHERE payment_id = ? AND expires_at > ?', nowIso(), paymentId, nowIso());
    }
  } catch (err) {
    console.error('[refund] provider refund failed, queued for review', err);
    run("UPDATE payments SET refund_status = 'under_review' WHERE id = ?", paymentId);
  }
  return one('SELECT * FROM payments WHERE id = ?', paymentId);
}
