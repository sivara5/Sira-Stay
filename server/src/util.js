import crypto from 'node:crypto';

import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const encKey = Buffer.from(crypto.hkdfSync('sha256', config.secret, Buffer.alloc(0), 'sira-location-encryption', 32));
const macKey = Buffer.from(crypto.hkdfSync('sha256', config.secret, Buffer.alloc(0), 'sira-hmac', 32));

export const newId = () => crypto.randomUUID();
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const hmac = (value) => crypto.createHmac('sha256', macKey).update(value).digest('hex');
export const hmacBytes = (value) => crypto.createHmac('sha256', macKey).update(value).digest();

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** AES-256-GCM. Output: base64(iv[12] | tag[16] | ciphertext). */
export function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptJson(payload) {
  const buf = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
}

export const nowIso = () => new Date().toISOString();

/** Today's date in India (YYYY-MM-DD). */
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const isDateString = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Normalises an Indian mobile number to +91XXXXXXXXXX, or returns null. */
export function normalizeIndianPhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

export const normalizeEmail = (input) => {
  const email = String(input ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
};

export function requireString(value, field, { min = 1, max = 500 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min || s.length > max) {
    throw new HttpError(400, 'VALIDATION', `${field} must be ${min}–${max} characters.`, { field });
  }
  return s;
}

export function requireInt(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, 'VALIDATION', `${field} must be a whole number between ${min} and ${max}.`, { field });
  }
  return n;
}
