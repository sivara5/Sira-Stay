import Constants from 'expo-constants';

/**
 * The API runs on the same laptop as the Expo dev server, so reuse the host Expo Go already
 * connected to (e.g. 192.168.1.5:8081 → http://192.168.1.5:4000). Override with EXPO_PUBLIC_API_URL.
 */
function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:4000`;
}

export const API_URL = resolveApiUrl();
