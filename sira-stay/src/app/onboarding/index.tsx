import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LanguageSwitch } from '@/components/language-switch';
import { colors, radius } from '@/constants/theme';
import { stepRoute, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const FEATURES = [
  { icon: 'bed-outline', key: 'onb.feature1' },
  { icon: 'shield-checkmark-outline', key: 'onb.feature2' },
  { icon: 'call-outline', key: 'onb.feature3' },
] as const;

export default function Welcome() {
  const { t } = useI18n();
  const { user } = useAuth();

  // Signed in but registration unfinished → resume where they left off.
  if (user && user.registrationStep !== 'done') return <Redirect href={stepRoute[user.registrationStep]} />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Ionicons name="home" size={44} color={colors.white} />
          </View>
          <Text style={styles.brand}>Sira Stay</Text>
          <Text style={styles.tagline}>{t('onb.tagline')}</Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map(({ icon, key }) => (
            <View key={key} style={styles.feature}>
              <Ionicons name={icon} size={22} color={colors.primary} />
              <Text style={styles.featureText}>{t(key)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.langBlock}>
          <Text style={styles.langTitle}>{t('lang.title')}</Text>
          <LanguageSwitch />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button title={t('onb.getStarted')} icon="arrow-forward" onPress={() => router.push('/onboarding/email')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 28, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 10 },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  brand: { fontSize: 34, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 23, paddingHorizontal: 8 },
  features: { gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { fontSize: 15, color: colors.text, fontWeight: '500', flex: 1 },
  langBlock: { gap: 12 },
  langTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  footer: { padding: 24, paddingTop: 0 },
});
