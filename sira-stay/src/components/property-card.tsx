import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryIcon } from '@/components/category-tabs';
import { FavoriteButton } from '@/components/favorite-button';
import { RatingBadge } from '@/components/rating';
import { StatusBadge } from '@/components/status-badge';
import { colors, radius, shadow } from '@/constants/theme';
import { mediaUrl } from '@/lib/api';
import { formatDate, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { PropertyCard as Card } from '@/lib/types';

type Props = { property: Card; onPress: () => void; onFavoriteChange?: (favorite: boolean) => void };

/**
 * Exactly one main photo, then name, type, location, price, deposit and rating.
 * Owner contact stays locked until the ₹9 unlock.
 */
export function PropertyCard({ property, onPress, onFavoriteChange }: Props) {
  const { t, lang } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View>
        <Image source={{ uri: mediaUrl(property.coverPhoto) }} style={styles.image} contentFit="cover" transition={200} />
        {property.status !== 'AVAILABLE' && (
          <View style={styles.status}>
            <StatusBadge status={property.status} />
          </View>
        )}
        {!property.isOwner && (
          <View style={styles.favorite}>
            <FavoriteButton propertyId={property.id} favorite={property.favorite} onChange={onFavoriteChange} size={20} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {property.title}
          </Text>
          <RatingBadge rating={property.rating} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.type}>
            <Ionicons name={categoryIcon[property.category]} size={12} color={colors.primaryDark} />
            <Text style={styles.typeText}>{t(`cat.${property.category}`)}</Text>
          </View>
          {property.verified && <Ionicons name="shield-checkmark" size={14} color={colors.primary} />}
        </View>

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
        {!property.isOwner && (
          <View style={[styles.contact, property.unlocked && styles.contactUnlocked]}>
            <Ionicons
              name={property.unlocked ? 'lock-open' : 'lock-closed'}
              size={12}
              color={property.unlocked ? colors.success : colors.textMuted}
            />
            <Text style={[styles.contactText, property.unlocked && { color: colors.success }]}>
              {property.unlocked ? t('card.unlocked') : t('card.locked')}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  pressed: { opacity: 0.92 },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface },
  status: { position: 'absolute', top: 12, left: 12 },
  favorite: { position: 'absolute', top: 10, right: 10 },
  body: { padding: 14, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  typeText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  muted: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  distance: { fontSize: 13, color: colors.primary, fontWeight: '600', marginLeft: 'auto' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  rent: { fontSize: 19, fontWeight: '800', color: colors.text },
  perMonth: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  deposit: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  booked: { fontSize: 13, color: '#92400E', fontWeight: '600' },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  contactUnlocked: { backgroundColor: colors.successSoft },
  contactText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
});
