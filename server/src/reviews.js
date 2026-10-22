import { all, one, run } from './db.js';
import { HttpError, newId, nowIso } from './util.js';

/**
 * Only tenants who actually reached the owner can review: they unlocked the owner's contact (and didn't
 * report it as wrong details) or had a confirmed booking. Owners can't review their own listing.
 */
export function canReview(user, property) {
  if (!user || property.owner_id === user.id) return false;
  return Boolean(
    one("SELECT 1 AS ok FROM unlocks WHERE user_id = ? AND property_id = ? AND status = 'active' LIMIT 1", user.id, property.id) ||
      one("SELECT 1 AS ok FROM bookings WHERE user_id = ? AND property_id = ? AND status = 'CONFIRMED' LIMIT 1", user.id, property.id),
  );
}

export const myReview = (user, propertyId) =>
  (user && one('SELECT rating, comment FROM reviews WHERE property_id = ? AND user_id = ?', propertyId, user.id)) ?? null;

/** "Priya Sundaram" → "Priya S." — reviews never show full names, emails or phone numbers. */
function shortName(name) {
  const [first, ...rest] = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!first) return null;
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/** Latest reviews from previous tenants. */
export function propertyReviews(propertyId, limit = 20) {
  return all(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.booking_id, u.name
       FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.property_id = ? ORDER BY r.created_at DESC LIMIT ?`,
    propertyId,
    limit,
  ).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    author: shortName(r.name),
    via: r.booking_id ? 'booking' : 'unlock',
  }));
}

export function parseReview(body) {
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, 'VALIDATION', 'Choose a rating from 1 to 5 stars.', { field: 'rating' });
  }
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 500) || null : null;
  return { rating, comment };
}

/** One review per tenant per property — writing again updates it. A booking, once linked, stays linked. */
export function saveReview({ userId, propertyId, bookingId = null, rating, comment }) {
  run(
    `INSERT INTO reviews (id, property_id, user_id, booking_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(property_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment,
       booking_id = COALESCE(excluded.booking_id, reviews.booking_id), created_at = excluded.created_at`,
    newId(),
    propertyId,
    userId,
    bookingId,
    rating,
    comment,
    nowIso(),
  );
}
