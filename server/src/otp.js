import crypto from 'node:crypto';

import { config } from './config.js';
import { all, one, run } from './db.js';
import { sendMail } from './mailer.js';
import { HttpError, hmac, safeEqual } from './util.js';

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;
const MAX_PER_HOUR = 6;
const MAX_ATTEMPTS = 5;

function deliverEmail(email, code) {
  return sendMail({
    to: email,
    subject: `${code} is your Sira Stay verification code`,
    text: `Your Sira Stay verification code is ${code}. It expires in 10 minutes.\n\nஉங்கள் Sira Stay சரிபார்ப்புக் குறியீடு: ${code}`,
  });
}

async function deliverSms(phone, code) {
  if (config.smsProvider !== 'twilio') return false;
  const { accountSid, authToken, from } = config.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: from, Body: `${code} is your Sira Stay verification code. Valid for 10 minutes.` }),
  });
  if (!res.ok) throw new Error(`Twilio responded ${res.status}: ${await res.text()}`);
  return true;
}

const codeHash = (channel, target, code) => hmac(`otp:${channel}:${target}:${code}`);

/** Creates and delivers a 6-digit code. Returns `devCode` only when no real provider is configured. */
export async function issueOtp(channel, target) {
  const now = Date.now();
  const recent = all(
    'SELECT created_at FROM otps WHERE channel = ? AND target = ? AND created_at > ? ORDER BY created_at DESC',
    channel,
    target,
    now - 60 * 60 * 1000,
  );
  if (recent[0] && now - recent[0].created_at < COOLDOWN_MS) {
    throw new HttpError(429, 'OTP_COOLDOWN', 'Please wait 30 seconds before requesting another code.');
  }
  if (recent.length >= MAX_PER_HOUR) {
    throw new HttpError(429, 'OTP_LIMIT', 'Too many codes requested. Try again in an hour.');
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  run('UPDATE otps SET consumed = 1 WHERE channel = ? AND target = ? AND consumed = 0', channel, target);
  run(
    'INSERT INTO otps (channel, target, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    channel,
    target,
    codeHash(channel, target, code),
    now + TTL_MS,
    now,
  );

  let delivered;
  try {
    delivered = channel === 'email' ? await deliverEmail(target, code) : await deliverSms(target, code);
  } catch (err) {
    console.error(`[otp] ${channel} delivery failed`, err);
    throw new HttpError(502, 'OTP_DELIVERY_FAILED', 'Could not send the code. Please try again.');
  }
  if (!delivered) console.log(`[otp] ${channel} code for ${target}: ${code}`);
  return { devCode: !delivered && config.devShowOtp ? code : undefined };
}

export function verifyOtp(channel, target, code) {
  const otp = one(
    'SELECT * FROM otps WHERE channel = ? AND target = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1',
    channel,
    target,
  );
  if (!otp || otp.expires_at < Date.now()) {
    throw new HttpError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(429, 'OTP_TOO_MANY', 'Too many wrong attempts. Request a new code.');
  }
  if (!safeEqual(otp.code_hash, codeHash(channel, target, String(code ?? '').trim()))) {
    run('UPDATE otps SET attempts = attempts + 1 WHERE id = ?', otp.id);
    throw new HttpError(400, 'OTP_INVALID', 'Incorrect code. Please check and try again.');
  }
  run('UPDATE otps SET consumed = 1 WHERE id = ?', otp.id);
}
