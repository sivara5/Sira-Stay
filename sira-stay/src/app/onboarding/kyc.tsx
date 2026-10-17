import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { useKycForm } from '@/components/kyc-form';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function KycStep() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  // Registration completes here → the app switches to Home.
  const kyc = useKycForm(setUser);

  return (
    <OnboardingScreen
      title={t('onb.kycTitle')}
      subtitle={t('onb.kycHint')}
      step={{ n: 4, total: 4 }}
      footer={<Button title={t('onb.submitKyc')} onPress={kyc.submit} loading={kyc.loading} />}>
      {kyc.fields}
      <Banner tone="info" icon="document-text-outline">
        {t('onb.docsLater')}
      </Banner>
    </OnboardingScreen>
  );
}
