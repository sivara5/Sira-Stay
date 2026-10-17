import { Router } from 'express';

import { requireRegistered } from '../auth.js';
import { config } from '../config.js';
import { all, one, run, tx } from '../db.js';
import {
  expireStaleHolds,
  exactLocation,
  findBlockingBooking,
  getPropertyOr404,
  hasContactAccess,
  toCard,
} from '../services.js';
import { HttpError, addDays, addMonths, isDateString, newId, nowIso, todayIST } from '../util.js';

export const bookingsRouter = Router();

export const DURATIONS = [1, 3, 6, 11, 12];
const MAX_ADVANCE_DAYS = 180;

const formatDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function toBooking(b, user, { withContact = false } = {}) {
  const property = getPropertyOr404(b.property_id);
  const card = toCard(property, { user });
  const payment = b.payment_id ? one('SELECT id, status, refund_status FROM payments WHERE id = ?', b.payment_id) : null;
  const booking = {
    id: b.id,
    status: b.status,
    amount: b.amount,
    moveInDate: b.move_in_date,
    endDate: b.end_date,
    durationMonths: b.duration_months,
    bookingDate: b.confirmed_at ?? b.created_at,
    holdExpiresAt: b.status === 'PENDING_PAYMENT' ? b.hold_expires_at : null,
    property: {
      id: card.id,
      title: card.title,
      category: card.category,
      area: card.area,
      district: card.district,
      landmark: card.landmark,
      rent: card.rent,
      coverPhoto: card.coverPhoto,
      approxLocation: card.approxLocation,
      status: card.status,
    },
    payment: payment && { id: payment.id, status: payment.status, refundStatus: payment.refund_status },
    myReview: one('SELECT rating, comment FROM reviews WHERE booking_id = ?', b.id) ?? null,
  };
  // A confirmed booking entitles the tenant to the owner's contact and the exact location (for "Open Map").
  if (withContact && b.status === 'CONFIRMED' && hasContactAccess(user, property)) {
    const owner = one('SELECT name, phone, whatsapp, available FROM users WHERE id = ?', property.owner_id);
    booking.owner = { name: owner.name, phone: owner.phone, whatsapp: owner.whatsapp || owner.phone, available: Boolean(owner.available) };
    const { lat, lng } = exactLocation(property);
    booking.exactLocation = { lat, lng };
  }
  return booking;
}

/** Step 1 of booking: reserve the dates for a short payment window. Payment confirms it. */
bookingsRouter.post('/', requireRegistered, (req, res) => {
  const property = getPropertyOr404(req.body?.propertyId);
  if (property.status !== 'active') throw new HttpError(409, 'PROPERTY_UNAVAILABLE', 'This listing is no longer available.');
  if (property.owner_id === req.user.id) throw new HttpError(400, 'OWN_PROPERTY', 'You cannot book your own property.');

  const moveIn = req.body?.moveInDate;
  const today = todayIST();
  if (!isDateString(moveIn) || moveIn < today || moveIn > addDays(today, MAX_ADVANCE_DAYS)) {
    throw new HttpError(400, 'INVALID_DATE', `Choose a move-in date within the next ${MAX_ADVANCE_DAYS} days.`, { field: 'moveInDate' });
  }
  if (property.available_from && moveIn < property.available_from) {
    throw new HttpError(400, 'INVALID_DATE', `This property is available from ${formatDate(property.available_from)}.`, { field: 'moveInDate' });
  }
  const duration = Number(req.body?.durationMonths);
  if (!DURATIONS.includes(duration)) throw new HttpError(400, 'VALIDATION', 'Choose a stay duration.', { field: 'durationMonths' });
  const endDate = addMonths(moveIn, duration);

  const booking = tx(() => {
    expireStaleHolds();
    // Starting a new attempt replaces this user's earlier unpaid hold on the same property.
    run(
      "UPDATE bookings SET status = 'CANCELLED' WHERE property_id = ? AND user_id = ? AND status = 'PENDING_PAYMENT'",
      property.id,
      req.user.id,
    );
    const blocker = findBlockingBooking(property.id, moveIn, endDate, { ignoreHoldsOf: req.user.id });
    if (blocker) {
      const message =
        blocker.status === 'CONFIRMED'
          ? `Already booked from ${formatDate(blocker.move_in_date)} to ${formatDate(blocker.end_date)}. Choose dates outside this period.`
          : 'Someone is completing a booking for these dates. Try again in a few minutes or pick other dates.';
      throw new HttpError(409, 'DATES_UNAVAILABLE', message, { field: 'moveInDate' });
    }
    const id = newId();
    run(
      `INSERT INTO bookings (id, user_id, property_id, amount, move_in_date, end_date, duration_months, status, hold_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?)`,
      id,
      req.user.id,
      property.id,
      property.booking_amount,
      moveIn,
      endDate,
      duration,
      Date.now() + config.bookingHoldMinutes * 60 * 1000,
      nowIso(),
    );
    return one('SELECT * FROM bookings WHERE id = ?', id);
  });
  res.status(201).json({ booking: toBooking(booking, req.user) });
});

bookingsRouter.get('/:id', requireRegistered, (req, res) => {
  expireStaleHolds();
  const booking = one('SELECT * FROM bookings WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
  res.json({ booking: toBooking(booking, req.user, { withContact: true }) });
});

/** Tenants rate a property (1–5★) from their own confirmed booking; rating again updates it. */
bookingsRouter.post('/:id/review', requireRegistered, (req, res) => {
  const booking = one('SELECT * FROM bookings WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
  if (booking.status !== 'CONFIRMED') {
    throw new HttpError(400, 'REVIEW_NOT_ALLOWED', 'You can rate a property after your booking is confirmed.');
  }
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, 'VALIDATION', 'Choose a rating from 1 to 5 stars.', { field: 'rating' });
  }
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 500) || null : null;
  run(
    `INSERT INTO reviews (id, property_id, booking_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(booking_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
    newId(),
    booking.property_id,
    booking.id,
    req.user.id,
    rating,
    comment,
    nowIso(),
  );
  res.json({ booking: toBooking(booking, req.user, { withContact: true }) });
});

export const myBookingsRouter = Router();

myBookingsRouter.get('/', requireRegistered, (req, res) => {
  expireStaleHolds();
  const rows = all(
    `SELECT * FROM bookings WHERE user_id = ? AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'FAILED')
      ORDER BY COALESCE(confirmed_at, created_at) DESC`,
    req.user.id,
  );
  res.json({ bookings: rows.map((b) => toBooking(b, req.user)) });
});
