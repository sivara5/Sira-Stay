import os from 'node:os';

import express from 'express';
import multer from 'multer';

import { loadUser } from './auth.js';
import { config } from './config.js';
import { authRouter, meRouter } from './routes/auth.js';
import { bookingsRouter, myBookingsRouter } from './routes/bookings.js';
import { conversationsRouter } from './routes/messages.js';
import { myPaymentsRouter, paymentsRouter, webhookRouter } from './routes/payments.js';
import { MAX_PHOTOS, myFavoritesRouter, myPropertiesRouter, propertiesRouter } from './routes/properties.js';
import { myPassesRouter, unlocksRouter } from './routes/unlocks.js';
import { seedDemoData } from './seed.js';
import { HttpError } from './util.js';

const app = express();
app.disable('x-powered-by');

// Webhooks need the raw body for signature checks, so mount before the JSON parser.
app.use('/webhooks', webhookRouter);
app.use(express.json({ limit: '100kb' }));
app.use(loadUser);

// Only listing photos are public. KYC files and property documents live in data/private and are never served.
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    dotfiles: 'deny',
    index: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    paymentProvider: config.paymentProvider,
    emailProvider: config.emailProvider,
    smsProvider: config.smsProvider,
    unlockFee: config.unlockFeePaise / 100,
    districtPassFee: config.districtPassFeePaise / 100,
  }),
);

app.use('/auth', authRouter);
app.use('/me', meRouter);
app.use('/properties', propertiesRouter);
app.use('/my/properties', myPropertiesRouter);
app.use('/my/favorites', myFavoritesRouter);
app.use('/unlocks', unlocksRouter);
app.use('/my/district-passes', myPassesRouter);
app.use('/bookings', bookingsRouter);
app.use('/my/bookings', myBookingsRouter);
app.use('/payments', paymentsRouter);
app.use('/my/payments', myPaymentsRouter);
app.use('/conversations', conversationsRouter);

app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Not found.')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const tooMany = err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE';
    const message = tooMany
      ? `Maximum ${MAX_PHOTOS} photos allowed.`
      : err.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be under 10 MB.'
        : 'Upload failed. Please try again.';
    return res.status(400).json({ error: { code: tooMany ? 'PHOTO_COUNT' : 'UPLOAD_ERROR', message } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Invalid request body.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } });
});

if (config.seedDemo) seedDemoData();

app.listen(config.port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i?.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${config.port}`);
  console.log(`Sira Stay API listening on port ${config.port}`);
  console.log(`  LAN: ${lan.join(', ') || 'n/a'}`);
  console.log(`  payments=${config.paymentProvider} email=${config.emailProvider} sms=${config.smsProvider}`);
});
