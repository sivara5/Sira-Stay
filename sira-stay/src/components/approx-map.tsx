import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { darkMapProps } from '@/constants/map-style';
import { colors } from '@/constants/theme';
import type { LatLng } from '@/lib/types';

type Area = LatLng & { radiusM: number };

type Props = {
  approx: Area;
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
  const delta = exact ? 0.01 : 0.015;
  return (
    <MapView
      {...darkMapProps}
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

/** The house is somewhere inside this circle (the server never sends anything more precise before unlock). */
export function AreaCircle({ approx }: { approx: Area }) {
  return (
    <Circle
      center={{ latitude: approx.lat, longitude: approx.lng }}
      radius={approx.radiusM}
      strokeColor={colors.primary}
      strokeWidth={2}
      fillColor="rgba(212, 175, 55, 0.18)"
    />
  );
}

/** Metres per degree of latitude. */
const M_PER_DEG = 111_320;

/**
 * A label (price, area name) sitting on the circle's top edge rather than a pin at its centre, so the
 * map never suggests a precise point. Stays visible and tappable when zoomed out past the circles.
 */
export function AreaTag({ approx, onPress, children }: { approx: Area; onPress?: () => void; children: ReactNode }) {
  // Apple Maps centres the view on the point, so lift it by half its measured height (which grows with
  // the phone's text size). Google Maps (Android) uses `anchor` instead.
  const [height, setHeight] = useState(28);
  return (
    <Marker
      coordinate={{ latitude: approx.lat + approx.radiusM / M_PER_DEG, longitude: approx.lng }}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -height / 2 }}
      onPress={onPress}
      tracksViewChanges={false}>
      <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>{children}</View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 200 },
});
