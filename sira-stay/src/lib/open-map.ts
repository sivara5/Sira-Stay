import { Linking } from 'react-native';

/** Opens the location in Google Maps (app if installed, otherwise browser). */
export function openInMaps(lat: number, lng: number) {
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
}
