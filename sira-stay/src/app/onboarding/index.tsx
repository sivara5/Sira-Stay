import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { stepRoute, useAuth } from '@/lib/auth';
import { GoogleSignInUnavailable, getGoogleIdToken } from '@/lib/google-auth';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/types';

const FEATURES = [
  { icon: 'bed-outline', key: 'onb.feature1' },
  { icon: 'shield-checkmark-outline', key: 'onb.feature2' },
  { icon: 'call-outline', key: 'onb.feature3' },
] as const;

/** First screen: sign in or register with Google or email. The app starts in English; language is changed in Profile. */
export default function Welcome() {
  const { t, lang, errorText } = useI18n();
  const { user, signIn } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);

  // Signed in but registration unfinished → resume where they left off.
  if (user && user.registrationStep !== 'done') return <Redirect href={stepRoute[user.registrationStep]} />;

  async function continueWithGoogle() {
    setGoogleBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return; // closed the account picker
      const res = await api<{ token: string; user: Me }>('/auth/google', { body: { idToken, language: lang } });
      // Registered users go straight to Home; new ones continue with the next step (redirect above).
      await signIn(res.token, res.user);
    } catch (err) {
      const message =
        err instanceof GoogleSignInUnavailable ? t(err.reason === 'expo-go' ? 'google.expoGo' : 'google.notConfigured') : errorText(err);
      Alert.alert(t('google.failed'), message);
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image
            source={require('@/assets/images/logo-full.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="Sira Stay"
          />
          <Text style={styles.tagline}>{t('onb.tagline')}</Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map(({ icon, key }) => (
            <View key={key} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.featureText}>{t(key)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={t('onb.google')} icon="logo-google" variant="outline" onPress={continueWithGoogle} loading={googleBusy} />
        <Button title={t('onb.withEmail')} icon="mail-outline" onPress={() => router.push('/onboarding/email')} disabled={googleBusy} />
        <Text style={styles.footnote}>{t('onb.signInNote')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 24, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 12 },
  logo: { width: 210, height: 210 },
  tagline: { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 23, paddingHorizontal: 8 },
  features: { gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  featureText: { fontSize: 14, color: colors.text, fontWeight: '500', flex: 1, lineHeight: 20 },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  footnote: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
