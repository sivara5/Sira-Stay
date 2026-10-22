import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { categoryIcon } from '@/components/category-tabs';
import { FavoriteButton } from '@/components/favorite-button';
import { useStartPayment } from '@/components/payment-method-sheet';
import { ProgressiveImage } from '@/components/progressive-image';
import { RatingBadge } from '@/components/rating';
import { StatusBadge } from '@/components/status-badge';
import { cardStyle, colors, radius } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { formatDate, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { PropertyCard as Card } from '@/lib/types';

type Props = { property: Card; onPress: () => void; onFavoriteChange?: (favorite: boolean) => void };

/** Fallback for cards saved offline before the server sent the fee with each card. */
const DEFAULT_UNLOCK_FEE = 29;

/**
 * Exactly one main photo, then rating, name, type, location, price and deposit.
 * Owner contact stays locked until unlocked (₹29, District Pass or free credit) — then for 6 months.
 */
export function PropertyCard({ property, onPress, onFavoriteChange }: Props) {
  const { t, lang, errorText } = useI18n();
  const startPayment = useStartPayment();
  const [paying, setPaying] = useState(false);
  const fee = property.unlockFee ?? DEFAULT_UNLOCK_FEE;
  const canUnlock = !property.isOwner && !property.unlocked && (property.status === 'AVAILABLE' || property.status === 'BOOKED');

  async function unlock() {
    setPaying(true);
    try {
      await startPayment(
        { purpose: 'unlock', propertyId: property.id },
        { amount: fee, description: t('pay.unlockFor', { title: property.title }) },
      );
    } catch (err) {
      // Already unlocked, or a District Pass covers it: the property page shows the right option.
      if (err instanceof ApiError && err.code === 'ALREADY_UNLOCKED') router.push(`/property/${property.id}`);
      else if (err instanceof ApiError && err.code === 'USE_DISTRICT_PASS') {
        Alert.alert(t('pass.title'), errorText(err), [{ text: t('common.ok'), onPress: () => router.push(`/property/${property.id}`) }]);
      } else Alert.alert(t('pay.failedTitle'), errorText(err));
    } finally {
      setPaying(false);
    }
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View>
        <ProgressiveImage photo={property.cover} uri={property.coverPhoto} style={styles.image} />
        <View style={styles.topBadges}>
          <View style={styles.type}>
            <Ionicons name={categoryIcon[property.category]} size={12} color={colors.text} />
            <Text style={styles.typeText}>{t(`cat.${property.category}`)}</Text>
          </View>
          {property.status !== 'AVAILABLE' && <StatusBadge status={property.status} />}
        </View>
        {!property.isOwner && (
          <View style={styles.favorite}>
            <FavoriteButton propertyId={property.id} favorite={property.favorite} onChange={onFavoriteChange} size={20} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.ratingRow}>
          <RatingBadge rating={property.rating} />
          {property.verified && (
            <View style={styles.verified}>
              <Ionicons name="shield-checkmark" size={13} color={colors.success} />
              <Text style={styles.verifiedText}>{t('card.verified')}</Text>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {property.title}
        </Text>

        <View style={styles.line}>
          <Ionicons name="location-outline" size={15} color={colors.textMuted} />
          <Text style={styles.muted} numberOfLines={1}>
            {property.area}, {property.district}
          </Text>
          {property.distanceKm !== undefined && <Text style={styles.distance}>{t('common.kmAway', { km: property.distanceKm })}</Text>}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.rent}>
            {rupees(property.rent)}
            <Text style={styles.perMonth}> {t('common.perMonth')}</Text>
          </Text>
          <Text style={styles.deposit}>{t('card.deposit', { amount: rupees(property.deposit) })}</Text>
        </View>

        {property.status === 'BOOKED' && property.bookedUntil && (
          <Text style={styles.booked}>{t('card.bookedUntil', { date: formatDate(property.bookedUntil, lang) })}</Text>
        )}

        {!property.isOwner && property.unlocked && (
          <View style={styles.unlocked}>
            <Ionicons name="lock-open" size={13} color={colors.success} />
            <Text style={styles.unlockedText}>
              {property.unlockExpiresAt ? t('prop.unlockedTill', { date: formatDate(property.unlockExpiresAt, lang) }) : t('card.unlocked')}
            </Text>
          </View>
        )}
        {canUnlock && (
          <Button
            title={t('card.unlockCta', { price: rupees(fee) })}
            icon="lock-open"
            onPress={unlock}
            loading={paying}
            style={styles.unlockButton}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { ...cardStyle, overflow: 'hidden' },
  pressed: { opacity: 0.92 },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface },
  topBadges: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 },
  favorite: { position: 'absolute', top: 10, right: 10 },
  body: { padding: 14, gap: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, fontWeight: '700', color: colors.success },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(12, 13, 18, 0.75)',
  },
  typeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  muted: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  distance: { fontSize: 13, color: colors.primary, fontWeight: '600', marginLeft: 'auto' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  rent: { fontSize: 20, fontWeight: '900', color: colors.primary },
  perMonth: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  deposit: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  booked: { fontSize: 13, color: colors.warning, fontWeight: '600' },
  unlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  unlockedText: { fontSize: 12, fontWeight: '700', color: colors.success },
  unlockButton: { alignSelf: 'stretch', marginTop: 8 },
});
