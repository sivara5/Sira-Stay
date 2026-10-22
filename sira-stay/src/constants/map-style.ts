import type { MapStyleElement, MapViewProps } from 'react-native-maps';

import { colors } from './theme';

/** Google Maps (Android) night style in the app's colours: near-black land, muted labels, gold highways. */
const darkGoogleMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#14161F' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: colors.textMuted }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: colors.background }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: colors.border }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: colors.primaryLight }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7A8296' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#132420' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: colors.elevated }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: colors.card }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: colors.textMuted }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A3424' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: colors.card }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: colors.primaryLight }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: colors.card }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A1424' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4E6D8C' }] },
];

/** Spread onto every MapView so maps match the dark theme (Google Maps on Android, Apple Maps on iOS). */
export const darkMapProps: Pick<MapViewProps, 'customMapStyle' | 'userInterfaceStyle'> = {
  customMapStyle: darkGoogleMapStyle,
  userInterfaceStyle: 'dark',
};
