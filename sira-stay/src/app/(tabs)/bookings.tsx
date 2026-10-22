import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { DetailRow as Row } from '@/components/detail-row';
import { EmptyState, ErrorView, Loading } from '@/components/feedback';
import { SavedNote } from '@/components/network-banner';
import { ProgressiveImage } from '@/components/progressive-image';
import { StatusBadge } from '@/components/status-badge';
import { cardStyle, colors, radius } from '@/constants/theme';
import { formatDate, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Booking } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function MyBookings() {
  const { t } = useI18n();
  const { data, error, loading, refreshing, refresh, reload, savedAt } = useQuery<{ bookings: Booking[] }>('/my/bookings');

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  return (
    <FlatList
      data={data.bookings}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={savedAt ? <SavedNote savedAt={savedAt} /> : null}
      renderItem={({ item }) => <BookingCard booking={item} />}
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title={t('bookings.empty')}
          hint={t('bookings.emptyHint')}
          action={<Button title={t('bookings.explore')} small onPress={() => router.navigate('/')} />}
        />
      }
    />
  );
}

function BookingCard({ booking: b }: { booking: Booking }) {
  const { t, lang } = useI18n();
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ProgressiveImage uri={b.property.coverPhoto} style={styles.cover} />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {b.property.title}
          </Text>
          <Text style={styles.muted}>
            {b.property.area}, {b.property.district}
          </Text>
          <StatusBadge status={b.status} />
        </View>
      </View>

      <View style={styles.rows}>
        <Row label={t('bookings.amount')} value={rupees(b.amount)} strong />
        <Row label={t('bookings.date')} value={formatDate(b.bookingDate, lang)} />
        <Row label={t('bookings.moveIn')} value={formatDate(b.moveInDate, lang)} />
        <Row label={t('bookings.status')} value={t(`status.${b.status}`)} />
        {b.payment?.refundStatus && <Row label={t('bookings.payment')} value={t(`refundStatus.${b.payment.refundStatus}`)} />}
      </View>

      <View style={styles.actions}>
        <Button
          title={t('bookings.viewDetails')}
          icon="document-text-outline"
          variant="secondary"
          small
          style={styles.flex}
          onPress={() => router.push(`/booking/${b.id}`)}
        />
        {b.status === 'CONFIRMED' && (
          <Button
            title={t('bookings.viewMap')}
            icon="map-outline"
            variant="outline"
            small
            style={styles.flex}
            onPress={() => router.push(`/booking/${b.id}/map`)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16, flexGrow: 1 },
  flex: { flex: 1 },
  card: { ...cardStyle, padding: 14, gap: 14 },
  header: { flexDirection: 'row', gap: 12 },
  cover: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.elevated },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  rows: { gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  actions: { flexDirection: 'row', gap: 10 },
});
