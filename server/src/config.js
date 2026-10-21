import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const env = process.env;
const flag = (value, fallback) => (value === undefined || value === '' ? fallback : value === 'true');

const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
const uploadDir = path.join(dataDir, 'uploads'); // public: listing photos only
const privateDir = path.join(dataDir, 'private'); // never served: KYC + property documents
for (const dir of [
  path.join(uploadDir, 'photos'),
  path.join(privateDir, 'kyc'),
  path.join(privateDir, 'documents'),
  path.join(dataDir, 'tmp'),
]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** 32-byte master secret. In production set APP_SECRET; in dev one is generated once and kept in data/. */
function loadSecret() {
  if (env.APP_SECRET) {
    const key = Buffer.from(env.APP_SECRET, 'hex');
    if (key.length !== 32) throw new Error('APP_SECRET must be 64 hex characters (32 bytes).');
    return key;
  }
  const file = path.join(dataDir, 'app-secret.key');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    console.warn('[config] Generated a development APP_SECRET in data/app-secret.key — set APP_SECRET in production.');
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
}

const razorpay = {
  keyId: env.RAZORPAY_KEY_ID || '',
  keySecret: env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  // Only changed for automated tests against a local Razorpay simulator.
  apiBase: (env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, ''),
};

const smtp = {
  host: env.SMTP_HOST || '',
  port: Number(env.SMTP_PORT || 587),
  user: env.SMTP_USER || '',
  pass: env.SMTP_PASS || '',
  from: env.SMTP_FROM || env.SMTP_USER || '',
};

const twilio = {
  accountSid: env.TWILIO_ACCOUNT_SID || '',
  authToken: env.TWILIO_AUTH_TOKEN || '',
  from: env.TWILIO_FROM || '',
};

export const config = {
  port: Number(env.PORT || 4000),
  dataDir,
  uploadDir,
  privateDir,
  secret: loadSecret(),
  unlockFeePaise: 2900, // ₹29 single owner-contact unlock
  districtPassFeePaise: 9900, // ₹99 District Pass
  districtPassCredits: 40, // unique unlocks per pass
  districtPassDays: 30, // pass validity from activation
  unlockMonths: 6, // every unlock stays open this long
  reportWindowHours: 48, // "Report Wrong Details" window
  reportsPerMonth: 2, // max wrong-details reports per tenant in any 30 days
  refundReviewDays: 3, // unreviewed refund requests become a free unlock credit after this
  hideAfterReporters: 3, // distinct tenants reporting a listing → it is hidden
  // Accounts that can open the admin screen (comma-separated emails, set in server/.env).
  adminEmails: (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  bookingHoldMinutes: Number(env.BOOKING_HOLD_MINUTES || 10),
  paymentProvider: razorpay.keyId && razorpay.keySecret ? 'razorpay' : 'mock',
  razorpay,
  smtp,
  twilio,
  emailProvider: smtp.host && smtp.user ? 'smtp' : 'console',
  smsProvider: twilio.accountSid && twilio.authToken && twilio.from ? 'twilio' : 'console',
  // When no OTP provider is configured, return the code in the API response so it can be shown on the phone.
  devShowOtp: flag(env.DEV_SHOW_OTP, true),
  autoApproveKyc: flag(env.AUTO_APPROVE_KYC, true),
  seedDemo: flag(env.SEED_DEMO, true),
};
