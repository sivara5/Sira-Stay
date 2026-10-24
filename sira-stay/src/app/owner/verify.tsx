import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { KeyboardAvoidingContainer, KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
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
      <KeyboardAvoidingContainer style={styles.flex}>
        <KeyboardAwareScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{t('owner.verifyTitle')}</Text>
          <Banner tone="info" icon="shield-checkmark-outline">
            {t('owner.verifyHint')}
          </Banner>
          {kyc.fields}
        </KeyboardAwareScrollView>
        <View style={styles.footer}>
          <Button title={t('common.continue')} icon="arrow-forward" onPress={kyc.submit} loading={kyc.loading} />
        </View>
      </KeyboardAvoidingContainer>
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
