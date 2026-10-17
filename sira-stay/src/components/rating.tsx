import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import type { PropertyCard } from '@/lib/types';

/** "★ 4.6 (12)", or a "New" tag when nobody has rated the property yet. */
export function RatingBadge({ rating, large }: { rating: PropertyCard['rating']; large?: boolean }) {
  const { t } = useI18n();
  if (!rating.count || rating.average === null) {
    return (
      <View style={styles.newTag}>
        <Text style={styles.newText}>{t('rating.new')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.row} accessibilityLabel={`${rating.average} / 5, ${t('rating.count', { n: rating.count })}`}>
      <Ionicons name="star" size={large ? 16 : 13} color={colors.accent} />
      <Text style={[styles.average, large && styles.averageLarge]}>{rating.average.toFixed(1)}</Text>
      <Text style={[styles.count, large && styles.countLarge]}>({rating.count})</Text>
    </View>
  );
}

/** Tap-to-rate 1–5 stars. */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.inputRow} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityLabel={`${n}`}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={34} color={n <= value ? colors.accent : colors.border} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  average: { fontSize: 13, fontWeight: '800', color: colors.text },
  averageLarge: { fontSize: 16 },
  count: { fontSize: 12, color: colors.textMuted },
  countLarge: { fontSize: 14 },
  newTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.infoSoft },
  newText: { fontSize: 11, fontWeight: '800', color: colors.info },
  inputRow: { flexDirection: 'row', gap: 10 },
});
