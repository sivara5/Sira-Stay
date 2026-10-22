import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState, ErrorView, Loading } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { cardStyle, colors, radius } from '@/constants/theme';
import { api, mediaUrl } from '@/lib/api';
import { formatDate, formatPhone, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { OwnerListing } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function MyListings() {
  const { t } = useI18n();
  const { data, error, loading, refreshing, refresh, reload } = useQuery<{ properties: OwnerListing[] }>('/my/properties');

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  const addButton = <Button title={t('listings.add')} icon="add" onPress={() => router.push('/property/new')} />;

  return (
    <FlatList
      data={data.properties}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={data.properties.length ? addButton : null}
      renderItem={({ item }) => <ListingCard listing={item} onChanged={reload} />}
      ListEmptyComponent={<EmptyState icon="home-outline" title={t('listings.empty')} hint={t('listings.emptyHint')} action={addButton} />}
    />
  );
}

function ListingCard({ listing: p, onChanged }: { listing: OwnerListing; onChanged: () => void }) {
  const { t, lang, errorText } = useI18n();

  function withdraw() {
    Alert.alert(t('listings.withdraw'), t('listings.withdrawConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('listings.withdraw'),
        style: 'destructive',
        onPress: () =>
          api(`/properties/${p.id}/withdraw`, { method: 'POST' })
            .then(onChanged)
            .catch((err) => Alert.alert(t('common.error'), errorText(err))),
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => router.push(`/property/${p.id}`)}>
        <Image source={{ uri: mediaUrl(p.coverPhoto) }} style={styles.cover} contentFit="cover" />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {p.title}
          </Text>
          <Text style={styles.muted}>
            {rupees(p.rent)} {t('common.perMonth')} · {p.area}
          </Text>
          <View style={styles.badges}>
            <StatusBadge status={p.status} />
            {p.verification === 'pending' && <Text style={styles.pending}>{t('listings.verificationPending')}</Text>}
          </View>
        </View>
      </Pressable>

      <View style={styles.stat}>
        <Ionicons name="lock-open-outline" size={16} color={colors.primary} />
        <Text style={styles.statText}>{t('listings.unlocks', { n: p.unlockCount })}</Text>
      </View>

      <View style={styles.bookings}>
        <Text style={styles.sectionTitle}>{t('listings.bookings')}</Text>
        {p.bookings.length === 0 ? (
          <Text style={styles.muted}>{t('listings.noBookings')}</Text>
        ) : (
          p.bookings.map((b) => (
            <View key={b.id} style={styles.booking}>
              <View style={styles.bookingTop}>
                <Text style={styles.tenant}>{b.tenantName || b.tenantEmail}</Text>
                <StatusBadge status={b.status} />
              </View>
              <Text style={styles.muted}>
                {formatDate(b.moveInDate, lang)} – {formatDate(b.endDate, lang)} · {rupees(b.amount)}
              </Text>
              {b.tenantPhone && b.status === 'CONFIRMED' && (
                <Pressable style={styles.phone} onPress={() => Linking.openURL(`tel:${b.tenantPhone}`)}>
                  <Ionicons name="call-outline" size={14} color={colors.primary} />
                  <Text style={styles.phoneText}>{formatPhone(b.tenantPhone)}</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      {p.status !== 'WITHDRAWN' && (
        <View style={styles.actions}>
          <Button
            title={t('photos.manage')}
            variant="secondary"
            icon="images-outline"
            small
            style={styles.flex}
            onPress={() => router.push(`/listing/${p.id}/photos`)}
          />
          <Button title={t('listings.withdraw')} variant="danger" icon="archive-outline" small style={styles.flex} onPress={withdraw} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16, flexGrow: 1 },
  card: { ...cardStyle, padding: 14, gap: 12 },
  header: { flexDirection: 'row', gap: 12 },
  cover: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.elevated },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pending: { fontSize: 12, color: colors.info, fontWeight: '600' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 14, fontWeight: '600', color: colors.text },
  bookings: { gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  booking: { gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tenant: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
