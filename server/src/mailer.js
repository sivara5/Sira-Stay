import nodemailer from 'nodemailer';

import { config } from './config.js';

let transport;

/** Sends an email when SMTP is configured in server/.env. Returns false when nothing was sent. */
export async function sendMail({ to, subject, text }) {
  if (config.emailProvider !== 'smtp') return false;
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  await transport.sendMail({ from: `Sira Stay <${config.smtp.from}>`, to, subject, text });
  return true;
}
