import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { colors, radius } from '@/constants/theme';
import { api, isConnectionError } from '@/lib/api';
import { districtLabel } from '@/lib/districts';
import { formatDateLong, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { onReconnect, onRetry } from '@/lib/network';
import { addPendingPayment, removePendingPayment, setActiveCheckout } from '@/lib/pending-payments';
import type { Checkout, PaymentResult } from '@/lib/types';

type Phase = 'ready' | 'processing' | 'waiting' | 'success' | 'failed' | 'refunded';
type Params = { paymentId: string; checkout: string; purpose: 'unlock' | 'booking' | 'district_pass'; propertyId: string; bookingId?: string };

const RECHECK_MS = 15_000;

export default function CheckoutScreen() {
  const params = useLocalSearchParams<Params>();
  const { t, lang, errorText } = useI18n();
  const checkout = useMemo(() => JSON.parse(params.checkout) as Checkout, [params.checkout]);
  const isRazorpay = checkout.provider === 'razorpay';
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [checking, setChecking] = useState(false);
  const amount = rupees(checkout.amount / 100);

  /** Remember the payment until its result is known, so it's re-checked even if the app is closed. */
  const track = () =>
    addPendingPayment({
      paymentId: params.paymentId,
      purpose: params.purpose,
      propertyId: params.propertyId,
      bookingId: params.bookingId,
      startedAt: Date.now(),
    });

  // Razorpay can finish in another app (UPI), so track it from the moment checkout opens.
  const trackOnOpen = useEffectEvent(() => {
    if (isRazorpay) track();
  });
  useEffect(() => {
    setActiveCheckout(params.paymentId);
    trackOnOpen();
    return () => setActiveCheckout(null); // anything still unknown is picked up by PaymentRecovery
  }, [params.paymentId]);

  /** The server is the source of truth — only its answer decides success. */
  function applyResult(next: PaymentResult) {
    setResult(next);
    const { payment } = next;
    if (payment.status !== 'created') removePendingPayment(params.paymentId);
    if (payment.status !== 'paid') return setPhase('failed');
    if (payment.purpose === 'booking' && next.bookingStatus !== 'CONFIRMED') return setPhase('refunded');
    setPhase('success');
  }

  const fetchStatus = () => api<PaymentResult>(`/payments/${params.paymentId}`, { retries: 0 });

  async function settle(request: () => Promise<PaymentResult>) {
    setPhase('processing');
    setError(null);
    try {
      applyResult(await request());
    } catch (err) {
      // The answer may have been lost on the way back: ask the server before giving up.
      const latest = await fetchStatus().catch(() => null);
      if (latest && latest.payment.status !== 'created') return applyResult(latest);
      // Network dropped mid-payment — don't let the user pay twice; wait and re-check instead.
      if (isConnectionError(err) && (isRazorpay || !latest)) return setPhase('waiting');
      if (!isRazorpay) removePendingPayment(params.paymentId);
      setError(errorText(err));
      setPhase('failed');
    }
  }

  async function recheck() {
    setChecking(true);
    try {
      const latest = await fetchStatus();
      if (latest.payment.status !== 'created') applyResult(latest);
      else if (!isRazorpay) {
        // The test payment never reached the server, so nothing was charged: let the user pay again.
        removePendingPayment(params.paymentId);
        setPhase('ready');
      }
    } catch {
      // Still offline — keep waiting.
    } finally {
      setChecking(false);
    }
  }

  const onRecheckTick = useEffectEvent(() => recheck());
  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    const stopReconnect = onReconnect(() => onRecheckTick());
    const stopRetry = onRetry(() => onRecheckTick());
    const timer = setInterval(() => onRecheckTick(), RECHECK_MS);
    return () => {
      stopReconnect();
      stopRetry();
      clearInterval(timer);
    };
  }, [phase]);

  async function mockPay(outcome: 'success' | 'failure') {
    setPhase('processing');
    await track();
    settle(() => api<PaymentResult>(`/payments/${params.paymentId}/mock`, { body: { outcome } }));
  }

  function onRazorpayMessage(event: WebViewMessageEvent) {
    const msg = JSON.parse(event.nativeEvent.data) as { type: 'success' | 'dismiss' | 'failed'; data?: Record<string, string> };
    if (msg.type === 'success') {
      settle(() => api<PaymentResult>(`/payments/${params.paymentId}/verify`, { body: msg.data }));
    } else if (msg.type === 'dismiss') {
      // Stays tracked: if a UPI payment still completes, PaymentRecovery confirms it; otherwise it's dropped as failed.
      api(`/payments/${params.paymentId}/cancel`, { method: 'POST' }).catch(() => {});
      router.back();
    }
  }

  function done() {
    if (params.purpose === 'booking' && phase === 'success') {
      router.dismissAll();
      router.push(`/booking/${params.bookingId}`);
    } else {
      router.back(); // property screen refetches on focus and shows the unlocked contact
    }
  }

  if (phase === 'ready' && checkout.provider === 'razorpay') {
    return (
      <WebView
        originWhitelist={['*']}
        source={{ html: razorpayHtml(checkout), baseUrl: 'https://checkout.razorpay.com' }}
        onMessage={onRazorpayMessage}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => {
          // Hand UPI app links (GPay, PhonePe, Paytm…) to the phone instead of the WebView.
          if (/^(upi|intent|tez|phonepe|paytmmp|gpay):/i.test(req.url)) {
            Linking.openURL(req.url).catch(() => {});
            return false;
          }
          return true;
        }}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} />}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === 'processing' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.muted}>{t('pay.processing')}</Text>
          </View>
        )}

        {phase === 'success' && (
          <Result
            icon="checkmark-circle"
            color={colors.success}
            title={t('pay.successTitle')}
            body={
              params.purpose === 'booking'
                ? t('pay.bookedMsg')
                : params.purpose === 'district_pass'
                  ? t('pay.passMsg', { district: districtLabel(result?.payment.district ?? '', lang) })
                  : result?.unlockExpiresAt
                    ? `${t('pay.unlockedMsg')}\n\n${t('prop.unlockedTill', { date: formatDateLong(result.unlockExpiresAt, lang) })}`
                    : t('pay.unlockedMsg')
            }
          />
        )}
        {phase === 'refunded' && <Result icon="refresh-circle" color={colors.accent} title={t('pay.refundedTitle')} body={t('pay.refundedMsg')} />}
        {phase === 'failed' && <Result icon="close-circle" color={colors.danger} title={t('pay.failedTitle')} body={error ?? t('pay.failedMsg')} />}
        {phase === 'waiting' && (
          <>
            <Result icon="cloud-offline-outline" color={colors.accent} title={t('pay.waitingTitle')} body={t('pay.waitingMsg')} />
            <ActivityIndicator color={colors.primary} />
          </>
        )}

        {phase === 'ready' && (
          <View style={styles.card}>
            <View style={styles.merchant}>
              <View style={styles.logo}>
                <Ionicons name="home" size={20} color={colors.white} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.merchantName}>{checkout.name}</Text>
                <Text style={styles.muted} numberOfLines={2}>
                  {checkout.description}
                </Text>
              </View>
            </View>
            <View style={styles.amountBox}>
              <Text style={styles.muted}>{t('pay.amount')}</Text>
              <Text style={styles.amount}>{amount}</Text>
            </View>
            <View style={styles.method}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
              <Text style={styles.methodText}>{t('pay.method')}</Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            </View>
            <Banner tone="warning" icon="flask-outline">
              {t('pay.testMode')}
            </Banner>
          </View>
        )}
        <View style={styles.secure}>
          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
          <Text style={styles.secureText}>{t('pay.secure')}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {phase === 'ready' && (
          <>
            <Button title={t('pay.payTest', { amount })} icon="lock-closed" onPress={() => mockPay('success')} />
            <Button title={t('pay.simulateFail')} variant="ghost" onPress={() => mockPay('failure')} />
          </>
        )}
        {phase === 'success' && (
          <Button
            title={
              params.purpose === 'booking' ? t('pay.viewBooking') : params.purpose === 'district_pass' ? t('pay.viewPass') : t('pay.viewContact')
            }
            icon="arrow-forward"
            onPress={done}
          />
        )}
        {phase === 'failed' && (
          <>
            <Button
              title={t('common.retry')}
              onPress={() => {
                if (isRazorpay) track();
                setPhase('ready');
              }}
            />
            <Button title={t('common.back')} variant="outline" onPress={() => router.back()} />
          </>
        )}
        {phase === 'refunded' && <Button title={t('common.back')} variant="outline" onPress={() => router.back()} />}
        {phase === 'waiting' && (
          <>
            <Button title={t('pay.checkNow')} icon="refresh" onPress={recheck} loading={checking} />
            <Button title={t('common.back')} variant="outline" onPress={() => router.back()} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

type ResultIcon = 'checkmark-circle' | 'close-circle' | 'refresh-circle' | 'cloud-offline-outline';

function Result({ icon, color, title, body }: { icon: ResultIcon; color: string; title: string; body: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={84} color={color} />
      <Text style={styles.resultTitle}>{title}</Text>
      <Text style={styles.resultBody}>{body}</Text>
    </View>
  );
}

/** Razorpay Standard Checkout page; results are posted back to the app and verified on the server. */
function razorpayHtml(c: Checkout) {
  const options = {
    key: c.keyId,
    amount: c.amount,
    currency: c.currency,
    name: c.name,
    description: c.description,
    order_id: c.orderId,
    prefill: { email: c.prefill.email, contact: c.prefill.contact ?? undefined },
    theme: { color: colors.primary },
  };
  const json = JSON.stringify(options).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head><body style="background:#fff"><script>
function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
var options=${json};
options.handler=function(r){send({type:'success',data:r});};
options.modal={ondismiss:function(){send({type:'dismiss'});},confirm_close:true};
var rzp=new Razorpay(options);
rzp.on('payment.failed',function(r){send({type:'failed'});});
rzp.open();
</script></body></html>`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16, flexGrow: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48, flexGrow: 1 },
  muted: { fontSize: 14, color: colors.textMuted },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 16 },
  merchant: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  merchantName: { fontSize: 17, fontWeight: '800', color: colors.text },
  amountBox: { alignItems: 'center', paddingVertical: 12, backgroundColor: colors.surface, borderRadius: radius.md },
  amount: { fontSize: 40, fontWeight: '900', color: colors.text },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  methodText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureText: { fontSize: 12, color: colors.textMuted },
  resultTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  resultBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12 },
  footer: { padding: 16, gap: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
});
