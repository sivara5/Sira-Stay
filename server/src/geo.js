import crypto from 'node:crypto';

/** Radius of the public "general area" circle. The house is always inside it. */
export const APPROX_RADIUS_M = 400;

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const random = () => crypto.randomInt(0, 2 ** 48 - 1) / 2 ** 48;

/**
 * Random public point within APPROX_RADIUS_M of the house. Picked once when the listing is created and
 * stored, so repeated requests can't be averaged. Uniform over the disc (√ on the distance), so from the
 * public circle the house is equally likely to be anywhere inside it. Rounding moves it at most ~0.8 m,
 * covered by the 1 m margin.
 */
export function fuzzLocation(lat, lng) {
  const angle = random() * 2 * Math.PI;
  const distance = (APPROX_RADIUS_M - 1) * Math.sqrt(random());
  const dLat = (distance * Math.cos(angle)) / 111320;
  const dLng = (distance * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: round(lat + dLat, 5), lng: round(lng + dLng, 5) };
}

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse public distance (0.5 km steps, minimum 0.5). Always measured to the fuzzed point, never the house. */
export const publicDistanceKm = (km) => Math.max(0.5, Math.round(km * 2) / 2);

/** Rough bounding box for India — rejects an unset (0,0) or obviously wrong pin. */
export const isInIndia = (lat, lng) => lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5;
