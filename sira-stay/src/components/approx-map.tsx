import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { colors } from '@/constants/theme';
import type { LatLng } from '@/lib/types';

type Props = {
  approx: LatLng & { radiusM: number };
  /** Only passed when the viewer is entitled to it (contact unlocked). */
  exact?: LatLng | null;
  title?: string;
  description?: string;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Map that shows a general-area circle instead of the house location (privacy by default). */
export function ApproxMap({ approx, exact, title, description, interactive = false, style }: Props) {
  const center = exact ?? approx;
  const delta = exact ? 0.01 : 0.03;
  return (
    <MapView
      style={[styles.map, style]}
      initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}>
      {exact ? (
        <Marker coordinate={{ latitude: exact.lat, longitude: exact.lng }} title={title} description={description} pinColor={colors.primary} />
      ) : (
        <AreaCircle approx={approx} />
      )}
    </MapView>
  );
}

export function AreaCircle({ approx }: { approx: LatLng & { radiusM: number } }) {
  return (
    <Circle
      center={{ latitude: approx.lat, longitude: approx.lng }}
      radius={approx.radiusM}
      strokeColor={colors.primary}
      strokeWidth={2}
      fillColor="rgba(14, 124, 102, 0.18)"
    />
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 200 },
});
