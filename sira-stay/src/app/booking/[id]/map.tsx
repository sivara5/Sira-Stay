import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AreaCircle, AreaTag } from '@/components/approx-map';
import { Button } from '@/components/button';
import { ErrorView, Loading } from '@/components/feedback';
import { darkMapProps } from '@/constants/map-style';
import { colors, radius } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { openInMaps } from '@/lib/open-map';
import type { Booking } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

/**
 * Interactive map for a confirmed booking. In-app it shows only the approximate area,
 * property name and locality; "Open Map" hands the booked tenant the exact pin.
 */
export default function BookingMap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { data, error, loading, reload } = useQuery<{ booking: Booking }>(`/bookings/${id}`);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;
  const { property, exactLocation } = data.booking;
  const approx = property.approxLocation;
  const target = exactLocation ?? approx;

  return (
    <View style={styles.flex}>
      <MapView
        {...darkMapProps}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: approx.lat, longitude: approx.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        toolbarEnabled={false}>
        <AreaCircle approx={approx} />
        <AreaTag approx={approx}>
          <View style={styles.pin}>
            <Ionicons name="home" size={14} color={colors.onPrimary} />
            <Text style={styles.pinText} numberOfLines={1}>
              {property.area}
            </Text>
          </View>
        </AreaTag>
      </MapView>

      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Text style={styles.title} numberOfLines={2}>
          {property.title}
        </Text>
        <View style={styles.line}>
          <Ionicons name="location-outline" size={16} color={colors.textMuted} />
          <Text style={styles.muted}>
            {property.area}, {property.district}
          </Text>
        </View>
        <View style={styles.line}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
          <Text style={styles.note}>{t('map.approxNote')}</Text>
        </View>
        <Button title={t('map.open')} icon="navigate" onPress={() => openInMaps(target.lat, target.lng)} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 180,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pinText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    gap: 10,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontSize: 15, color: colors.textMuted },
  note: { fontSize: 13, color: colors.textMuted, flex: 1 },
});
