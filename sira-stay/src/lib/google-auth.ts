import Constants, { ExecutionEnvironment } from 'expo-constants';

/** OAuth client IDs from Google Cloud Console (see README → "Continue with Google"). */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Why Google sign-in can't run here: Expo Go has no Google native module; or no client ID is set. */
export class GoogleSignInUnavailable extends Error {
  constructor(public reason: 'expo-go' | 'not-configured') {
    super(reason);
  }
}

/**
 * Shows Google's account picker and returns an ID token for the server to verify, or null if the
 * user cancelled. The native module is loaded only here, so the rest of the app still runs in Expo Go.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new GoogleSignInUnavailable('expo-go');
  if (!WEB_CLIENT_ID) throw new GoogleSignInUnavailable('not-configured');

  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last Google account so the picker always shows (e.g. to switch accounts after signing out).
    await GoogleSignin.signOut().catch(() => {});
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new GoogleSignInUnavailable('not-configured');
    return response.data.idToken;
  } catch (err) {
    if (isErrorWithCode(err) && (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS)) return null;
    throw err;
  }
}
