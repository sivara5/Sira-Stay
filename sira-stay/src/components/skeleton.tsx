import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, radius, shadow } from '@/constants/theme';

/** A grey block with a light band sweeping across it — shown while content loads. */
export function Skeleton({
  width = '100%',
  height,
  rounded = radius.sm,
  style,
}: {
  width?: DimensionValue;
  /** Omit when the size comes from `style` (e.g. aspectRatio). */
  height?: DimensionValue;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [progress]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(progress.value, [0, 1], [-160, 520]) }] }));
  return (
    <View
      style={[styles.block, { width, height, borderRadius: rounded }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.sweep, sweep]} />
    </View>
  );
}

/** Same shape as a property card: one photo, then name, type, location, price + deposit. */
export function PropertyCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton rounded={0} style={styles.photo} />
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Skeleton width="62%" height={18} />
          <Skeleton width={44} height={16} />
        </View>
        <Skeleton width={84} height={20} rounded={radius.pill} />
        <Skeleton width="48%" height={14} />
        <View style={styles.row}>
          <Skeleton width="36%" height={22} />
          <Skeleton width="28%" height={14} />
        </View>
      </View>
    </View>
  );
}

export function PropertyListSkeleton({ count = 3, padded = true }: { count?: number; padded?: boolean }) {
  return (
    <View style={[styles.list, padded && styles.padded]}>
      {Array.from({ length: count }, (_, i) => (
        <PropertyCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Same shape as the property details page: gallery, title, price, info tiles, owner card. */
export function PropertyDetailSkeleton() {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.flex}>
      <Skeleton width={width} height={width * 0.7} rounded={0} />
      <View style={styles.detailBody}>
        <Skeleton width={120} height={22} rounded={radius.pill} />
        <Skeleton width="80%" height={26} />
        <Skeleton width="55%" height={16} />
        <Skeleton width="40%" height={30} />
        <View style={styles.tiles}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="48%" height={58} rounded={radius.md} />
          ))}
        </View>
        <Skeleton height={170} rounded={radius.lg} />
      </View>
    </View>
  );
}

/** Generic list rows (bookings, messages, payments…). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={[styles.list, styles.padded]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={56} height={56} rounded={radius.md} />
          <View style={styles.listText}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={13} />
            <Skeleton width="30%" height={13} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  block: { backgroundColor: '#E8EAEE', overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: 140, backgroundColor: 'rgba(255,255,255,0.55)' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  cardBody: { padding: 14, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  list: { gap: 16 },
  padded: { padding: 16 },
  detailBody: { padding: 16, gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  listRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  listText: { flex: 1, gap: 8 },
});
