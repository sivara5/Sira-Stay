import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/status-badge';
import { colors, radius, shadow } from '@/constants/theme';
import { mediaUrl } from '@/lib/api';
import { formatDate, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { PropertyCard as Card } from '@/lib/types';

/** Shows rent, general address and location. Owner contact stays locked until the ₹9 unlock. */
export function PropertyCard({ property, onPress }: { property: Card; onPress: () => void }) {
  const { t, lang } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View>
        <Image source={{ uri: mediaUrl(property.coverPhoto) }} style={styles.image} contentFit="cover" transition={200} />
        <View style={styles.topRow}>
          {property.status !== 'AVAILABLE' ? <StatusBadge status={property.status} /> : <View />}
          {property.verified && (
            <View style={styles.verified}>
              <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
              <Text style={styles.verifiedText}>{t('card.verified')}</Text>
            </View>
          )}
        </View>
        <View style={styles.photoCount}>
          <Ionicons name="images-outline" size={12} color={colors.white} />
          <Text style={styles.photoCountText}>{property.photoCount}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.rentRow}>
          <Text style={styles.rent}>
            {rupees(property.rent)}
            <Text style={styles.perMonth}> {t('common.perMonth')}</Text>
          </Text>
          {property.distanceKm !== undefined && <Text style={styles.distance}>{t('common.kmAway', { km: property.distanceKm })}</Text>}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {property.title}
        </Text>
        <View style={styles.line}>
          <Ionicons name="location-outline" size={15} color={colors.textMuted} />
          <Text style={styles.muted} numberOfLines={1}>
            {property.area}, {property.district}
          </Text>
        </View>
        <View style={styles.line}>
          <Ionicons name="flag-outline" size={15} color={colors.textMuted} />
          <Text style={styles.muted} numberOfLines={1}>
            {t('card.near', { landmark: property.landmark })}
          </Text>
        </View>
        {property.status === 'BOOKED' && property.bookedUntil && (
          <Text style={styles.booked}>{t('card.bookedUntil', { date: formatDate(property.bookedUntil, lang) })}</Text>
        )}
        {!property.isOwner && (
          <View style={[styles.contact, property.unlocked && styles.contactUnlocked]}>
            <Ionicons
              name={property.unlocked ? 'lock-open' : 'lock-closed'}
              size={13}
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
  image: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surface },
  topRow: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  photoCount: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  photoCountText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  body: { padding: 14, gap: 4 },
  rentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rent: { fontSize: 20, fontWeight: '800', color: colors.text },
  perMonth: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  distance: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  booked: { fontSize: 13, color: '#92400E', fontWeight: '600', marginTop: 2 },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  contactUnlocked: { backgroundColor: colors.successSoft },
  contactText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
});
