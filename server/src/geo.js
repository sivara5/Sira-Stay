import { hmacBytes } from './util.js';

/** Radius of the "general area" circle shown publicly. Always contains the real location. */
export const APPROX_RADIUS_M = 800;

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * Deterministic 250–600 m offset seeded by the property id, so repeated requests can't be
 * averaged to recover the real point. Rounding adds at most ~80 m, keeping the true
 * location inside APPROX_RADIUS_M.
 */
export function approximate(lat, lng, seed) {
  const h = hmacBytes(`approx:${seed}`);
  const angle = (h.readUInt32BE(0) / 0xffffffff) * 2 * Math.PI;
  const distance = 250 + (h.readUInt32BE(4) / 0xffffffff) * 350;
  const dLat = (distance * Math.cos(angle)) / 111320;
  const dLng = (distance * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: round(lat + dLat, 3), lng: round(lng + dLng, 3) };
}

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse public distance (0.5 km steps, minimum 0.5) so distance can't be used to triangulate. */
export const publicDistanceKm = (km) => Math.max(0.5, Math.round(km * 2) / 2);

/** Rough bounding box for India — rejects an unset (0,0) or obviously wrong pin. */
export const isInIndia = (lat, lng) => lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5;
