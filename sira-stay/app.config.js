// Extends app.json with plugins that need keys from the environment (sira-stay/.env.local, see README):
// - react-native-maps: the Google Maps key for Android. Without it, maps are blank in installed builds
//   (Expo Go has its own key, so maps work there regardless).
// - Google Sign-In: on iOS the plugin needs the reversed iOS client ID as a URL scheme.
module.exports = ({ config }) => {
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const maps = ['react-native-maps', mapsApiKey ? { androidGoogleMapsApiKey: mapsApiKey } : {}];

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleSignIn = iosClientId
    ? [
        '@react-native-google-signin/google-signin',
        { iosUrlScheme: `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}` },
      ]
    : '@react-native-google-signin/google-signin';

  return { ...config, plugins: [...(config.plugins ?? []), maps, googleSignIn] };
};
