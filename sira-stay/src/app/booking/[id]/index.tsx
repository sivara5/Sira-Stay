import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { DetailRow as Row } from '@/components/detail-row';
import { Banner, ErrorView, Loading } from '@/components/feedback';
import { SavedNote } from '@/components/network-banner';
import { ProgressiveImage } from '@/components/progressive-image';
import { ReviewCard } from '@/components/review-card';
import { StatusBadge } from '@/components/status-badge';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { formatDate, formatPhone, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Booking, Checkout, Payment } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function BookingDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { data, error, loading, refreshing, refresh, reload, setData, savedAt } = useQuery<{ booking: Booking }>(`/bookings/${id}`);
  const [paying, setPaying] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;
  const b = data.booking;

  async function completePayment() {
    setPaying(true);
    try {
      const res = await api<{ payment: Payment; checkout: Checkout }>('/payments', { body: { purpose: 'booking', bookingId: b.id } });
      router.push({
        pathname: '/checkout/[paymentId]',
        params: { paymentId: res.payment.id, checkout: JSON.stringify(res.checkout), purpose: 'booking', propertyId: b.property.id, bookingId: b.id },
      });
    } catch (err) {
      Alert.alert(t('pay.failedTitle'), errorText(err));
      reload();
    } finally {
      setPaying(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      <SavedNote savedAt={savedAt} />
      <ProgressiveImage uri={b.property.coverPhoto} style={styles.cover} />
      <View style={styles.titleBlock}>
        <StatusBadge status={b.status} />
        <Text style={styles.title}>{b.property.title}</Text>
        <Text style={styles.muted}>
          {b.property.area}, {b.property.district}
        </Text>
      </View>

      <View style={styles.rows}>
        <Row label={t('bookings.amount')} value={rupees(b.amount)} strong />
        <Row label={t('bookings.date')} value={formatDate(b.bookingDate, lang)} />
        <Row label={t('bookings.moveIn')} value={formatDate(b.moveInDate, lang)} />
        <Row label={t('bookings.endDate')} value={formatDate(b.endDate, lang)} />
        <Row label={t('bookings.status')} value={t(`status.${b.status}`)} />
        <Row label={t('bookings.bookingId')} value={b.id.slice(0, 8).toUpperCase()} />
        {b.payment?.refundStatus && <Row label={t('bookings.payment')} value={t(`refundStatus.${b.payment.refundStatus}`)} />}
      </View>

      {b.status === 'PENDING_PAYMENT' && (
        <Button title={t('bookings.completePayment')} icon="card-outline" onPress={completePayment} loading={paying} />
      )}

      {b.owner && (
        <View style={styles.ownerCard}>
          <Text style={styles.sectionTitle}>{t('prop.ownerContact')}</Text>
          <Text style={styles.ownerName}>{b.owner.name}</Text>
          <Text style={styles.muted}>{formatPhone(b.owner.phone)}</Text>
          {!b.owner.available && (
            <Banner tone="warning" title={t('prop.ownerUnavailable')}>
              {t('prop.ownerUnavailableHint')}
            </Banner>
          )}
          <View style={styles.actions}>
            <Button title={t('prop.call')} icon="call" small style={styles.flex} onPress={() => Linking.openURL(`tel:${b.owner?.phone}`)} />
            <Button
              title={t('prop.whatsapp')}
              icon="logo-whatsapp"
              variant="whatsapp"
              small
              style={styles.flex}
              onPress={() => Linking.openURL(`https://wa.me/${b.owner?.whatsapp.replace(/\D/g, '')}`)}
            />
          </View>
        </View>
      )}

      {b.status === 'CONFIRMED' && <ReviewCard booking={b} onSaved={(booking) => setData({ booking })} />}

      <View style={styles.actions}>
        {b.status === 'CONFIRMED' && (
          <Button
            title={t('bookings.viewMap')}
            icon="map-outline"
            variant="secondary"
            style={styles.flex}
            onPress={() => router.push(`/booking/${b.id}/map`)}
          />
        )}
        <Button
          title={t('bookings.viewProperty')}
          icon="home-outline"
          variant="outline"
          style={styles.flex}
          onPress={() => router.push(`/property/${b.property.id}`)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  flex: { flex: 1 },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: colors.surface },
  titleBlock: { gap: 6 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  rows: { gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  ownerCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, gap: 8 },
  ownerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 10 },
});
