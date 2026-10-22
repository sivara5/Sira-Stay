import crypto from 'node:crypto';

import { config } from './config.js';
import { HttpError, normalizeEmail } from './util.js';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CLOCK_SKEW_S = 300;

const REFETCH_UNKNOWN_KID_MS = 60_000;

let certs = { keys: new Map(), expiresAt: 0, fetchedAt: 0 };

/**
 * Google's current signing keys, cached for as long as Google says (Cache-Control max-age). An unknown
 * key ID (Google rotated keys) triggers a refetch at most once a minute, so bad tokens can't flood Google.
 */
async function signingKey(kid) {
  const expired = Date.now() >= certs.expiresAt;
  const unknown = !certs.keys.has(kid) && Date.now() - certs.fetchedAt >= REFETCH_UNKNOWN_KID_MS;
  if (expired || unknown) {
    const res = await fetch(CERTS_URL).catch(() => null);
    if (!res?.ok) throw new HttpError(502, 'GOOGLE_UNAVAILABLE', 'Google sign-in is unavailable right now. Please try again.');
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    const { keys } = await res.json();
    certs = {
      keys: new Map(keys.map((jwk) => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })])),
      expiresAt: Date.now() + maxAge * 1000,
      fetchedAt: Date.now(),
    };
  }
  return certs.keys.get(kid);
}

const invalid = () => new HttpError(401, 'GOOGLE_TOKEN_INVALID', 'We could not verify your Google account. Please try again.');

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
}

/**
 * Verifies a Google ID token from the app (RS256 signature against Google's keys, issuer, audience,
 * expiry, verified email) and returns the Google account it belongs to.
 */
export async function verifyGoogleIdToken(idToken) {
  if (!config.googleClientIds.length) {
    throw new HttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not set up yet. Please continue with email.');
  }
  const parts = typeof idToken === 'string' ? idToken.split('.') : [];
  if (parts.length !== 3) throw invalid();
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw invalid();

  const key = await signingKey(header.kid);
  const signed = Buffer.from(`${headerPart}.${payloadPart}`);
  if (!key || !crypto.verify('sha256', signed, key, Buffer.from(signaturePart, 'base64url'))) throw invalid();

  const now = Date.now() / 1000;
  if (!ISSUERS.includes(payload.iss) || !config.googleClientIds.includes(payload.aud)) throw invalid();
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < now) throw invalid();
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > now) throw invalid();

  const email = normalizeEmail(payload.email);
  if (!email || !(payload.email_verified === true || payload.email_verified === 'true')) {
    throw new HttpError(400, 'GOOGLE_EMAIL_UNVERIFIED', 'Your Google email address is not verified.');
  }
  return { sub: String(payload.sub), email, name: typeof payload.name === 'string' ? payload.name.slice(0, 80) : null };
}
