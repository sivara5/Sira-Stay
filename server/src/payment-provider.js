import crypto from 'node:crypto';

import { config } from './config.js';
import { HttpError, safeEqual } from './util.js';

const RAZORPAY_API = config.razorpay.apiBase;

function razorpayHeaders() {
  const { keyId, keySecret } = config.razorpay;
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

export async function createProviderOrder(payment) {
  if (config.paymentProvider === 'mock') return `mock_order_${payment.id.replaceAll('-', '').slice(0, 14)}`;

  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: razorpayHeaders(),
    body: JSON.stringify({
      amount: payment.amount,
      currency: payment.currency,
      receipt: payment.id.slice(0, 40),
      notes: {
        purpose: payment.purpose,
        ...(payment.property_id && { property_id: payment.property_id }),
        ...(payment.district && { district: payment.district }),
      },
    }),
  });
  if (!res.ok) {
    console.error('[razorpay] order failed', res.status, await res.text());
    throw new HttpError(502, 'PAYMENT_PROVIDER', 'Payment service is unavailable. Please try again.');
  }
  return (await res.json()).id;
}

export function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/** Issues a full refund and returns the provider refund id. */
export async function refundProviderPayment(payment) {
  if (payment.provider === 'mock') return `mock_refund_${payment.id.replaceAll('-', '').slice(0, 14)}`;

  const res = await fetch(`${RAZORPAY_API}/payments/${payment.provider_payment_id}/refund`, {
    method: 'POST',
    headers: razorpayHeaders(),
    body: JSON.stringify({ amount: payment.amount, notes: { reason: payment.refund_reason ?? 'refund' } }),
  });
  if (!res.ok) {
    console.error('[razorpay] refund failed', res.status, await res.text());
    throw new HttpError(502, 'REFUND_FAILED', 'Refund could not be processed right now. Our team will retry.');
  }
  return (await res.json()).id;
}
