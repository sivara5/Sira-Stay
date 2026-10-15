import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { TextField } from '@/components/text-field';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function EmailStep() {
  const { t, errorText } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError(t('err.INVALID_EMAIL'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { devCode } = await api<{ devCode?: string }>('/auth/email/start', { body: { email: value } });
      router.push({ pathname: '/onboarding/verify-email', params: { email: value, devCode: devCode ?? '' } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingScreen
      title={t('onb.emailTitle')}
      subtitle={t('onb.emailHint')}
      step={{ n: 1, total: 3 }}
      footer={<Button title={t('onb.sendCode')} onPress={sendCode} loading={loading} disabled={!email.trim()} />}>
      <TextField
        label={t('onb.emailLabel')}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setError(null);
        }}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        autoFocus
        returnKeyType="send"
        onSubmitEditing={sendCode}
        error={error}
      />
    </OnboardingScreen>
  );
}
