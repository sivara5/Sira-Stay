import { useEffect, useEffectEvent } from 'react';
import { Alert, AppState } from 'react-native';

import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { districtLabel } from '@/lib/districts';
import { useI18n } from '@/lib/i18n';
import { onReconnect } from '@/lib/network';
import { getActiveCheckout, listPendingPayments, removePendingPayment } from '@/lib/pending-payments';
import type { PaymentResult } from '@/lib/types';

/**
 * If the network dropped during a payment, re-check it with the server when the app opens, comes
 * back to the foreground, or the connection returns — and tell the user once it's confirmed.
 */
export function PaymentRecovery() {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const check = useEffectEvent(async () => {
    for (const pending of await listPendingPayments()) {
      if (pending.paymentId === getActiveCheckout()) continue; // the checkout screen handles it
      try {
        const result = await api<PaymentResult>(`/payments/${pending.paymentId}`);
        if (result.payment.status === 'paid') {
          await removePendingPayment(pending.paymentId);
          const message =
            pending.purpose === 'booking'
              ? result.bookingStatus === 'CONFIRMED'
                ? t('pay.bookedMsg')
                : t('pay.refundedMsg')
              : pending.purpose === 'district_pass'
                ? t('pay.passMsg', { district: districtLabel(result.payment.district ?? '', lang) })
                : t('pay.unlockedMsg');
          Alert.alert(t('pay.recoveredTitle'), message);
        } else if (result.payment.status === 'failed') {
          await removePendingPayment(pending.paymentId);
        }
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 401)) await removePendingPayment(pending.paymentId);
        // Connection problems: try again next time.
      }
    }
  });

  useEffect(() => {
    if (!user) return undefined;
    check();
    const stopReconnect = onReconnect(() => check());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      stopReconnect();
      sub.remove();
    };
  }, [user]);

  return null;
}
