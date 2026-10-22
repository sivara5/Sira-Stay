import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { DateField } from '@/components/date-field';
import { Banner, ErrorView, Loading } from '@/components/feedback';
import { cardStyle, colors, radius } from '@/constants/theme';
import { api, mediaUrl } from '@/lib/api';
import { addMonths, formatDate, fromDateString, rupees, todayString } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Booking, Checkout, Payment, PropertyDetail } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

const DURATIONS = [1, 3, 6, 11, 12];
const MAX_ADVANCE_DAYS = 180;

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { data, error, loading, reload } = useQuery<{ property: PropertyDetail }>(`/properties/${id}`);
  const [moveIn, setMoveIn] = useState<string | null>(null);
  const [duration, setDuration] = useState(11);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  const p = data.property;
  const today = todayString();
  const minDate = p.availableFrom && p.availableFrom > today ? p.availableFrom : today;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + MAX_ADVANCE_DAYS);
  const selected = moveIn ?? minDate;
  const endDate = addMonths(selected, duration);
  const overlaps = p.bookedPeriods.some((b) => selected < b.endDate && b.moveInDate < endDate);

  async function pay() {
    setSubmitting(true);
    setFormError(null);
    try {
      // 1) hold the dates on the server, 2) create the payment order for the booking amount.
      const { booking } = await api<{ booking: Booking }>('/bookings', {
        body: { propertyId: p.id, moveInDate: selected, durationMonths: duration },
      });
      const res = await api<{ payment: Payment; checkout: Checkout }>('/payments', { body: { purpose: 'booking', bookingId: booking.id } });
      router.push({
        pathname: '/checkout/[paymentId]',
        params: { paymentId: res.payment.id, checkout: JSON.stringify(res.checkout), purpose: 'booking', propertyId: p.id, bookingId: booking.id },
      });
    } catch (err) {
      setFormError(errorText(err));
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.propertyRow}>
          <Image source={{ uri: mediaUrl(p.coverPhoto) }} style={styles.cover} contentFit="cover" />
          <View style={styles.flex}>
            <Text style={styles.propertyTitle} numberOfLines={2}>
              {p.title}
            </Text>
            <Text style={styles.muted}>
              {p.area}, {p.district}
            </Text>
            <Text style={styles.muted}>
              {rupees(p.rent)} {t('common.perMonth')}
            </Text>
          </View>
        </View>

        <DateField
          label={t('book.moveIn')}
          value={selected}
          minimumDate={fromDateString(minDate)}
          maximumDate={maxDate}
          onChange={(date) => {
            setMoveIn(date);
            setFormError(null);
          }}
        />

        <View style={styles.group}>
          <Text style={styles.label}>{t('book.duration')}</Text>
          <View style={styles.chips}>
            {DURATIONS.map((d) => (
              <Chip key={d} label={d === 1 ? t('book.month') : t('book.months', { n: d })} selected={duration === d} onPress={() => setDuration(d)} />
            ))}
          </View>
          <Text style={styles.muted}>{t('book.until', { date: formatDate(endDate, lang) })}</Text>
        </View>

        {p.bookedPeriods.length > 0 && (
          <Banner tone={overlaps ? 'danger' : 'warning'} title={t('book.unavailable')} icon="calendar-clear-outline">
            <View>
              {p.bookedPeriods.map((b) => (
                <Text key={b.moveInDate} style={[styles.periodText, { color: overlaps ? colors.danger : colors.warning }]}>
                  • {formatDate(b.moveInDate, lang)} – {formatDate(b.endDate, lang)}
                </Text>
              ))}
            </View>
          </Banner>
        )}
        {overlaps && <Banner tone="danger">{t('book.overlap')}</Banner>}

        {/* The booking amount is shown clearly before any payment */}
        <View style={styles.summary}>
          <Row label={t('prop.rent')} value={`${rupees(p.rent)} ${t('common.perMonth')}`} />
          <Row label={t('prop.deposit')} value={rupees(p.deposit)} />
          <View style={styles.divider} />
          <Text style={styles.payLabel}>{t('book.payNow')}</Text>
          <Text style={styles.payAmount}>{rupees(p.bookingAmount)}</Text>
          <Text style={styles.note}>{t('book.payNote')}</Text>
        </View>

        {formError && <Banner tone="danger">{formError}</Banner>}
        <Text style={styles.note}>{t('book.holdNote')}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={t('book.pay', { amount: rupees(p.bookingAmount) })}
          icon="lock-closed"
          onPress={pay}
          loading={submitting}
          disabled={overlaps || p.status !== 'AVAILABLE'}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 20 },
  flex: { flex: 1, gap: 2 },
  propertyRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cover: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.card },
  propertyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  group: { gap: 8 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodText: { fontSize: 14, lineHeight: 20 },
  summary: { ...cardStyle, padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  payLabel: { fontSize: 14, fontWeight: '700', color: colors.primary },
  payAmount: { fontSize: 34, fontWeight: '900', color: colors.primary },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
});
