import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { useKycForm } from '@/components/kyc-form';
import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

/**
 * ID verification for owners who switched from Tenant mode, shown when they start listing.
 * Property documents are collected next, in the listing form.
 */
export default function OwnerVerify() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const kyc = useKycForm((me) => {
    setUser(me);
    router.replace('/property/new');
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('owner.verifyTitle')}</Text>
          <Banner tone="info" icon="shield-checkmark-outline">
            {t('owner.verifyHint')}
          </Banner>
          {kyc.fields}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('common.continue')} icon="arrow-forward" onPress={kyc.submit} loading={kyc.loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
});
