import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { DevCodeBanner } from '@/components/feedback';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { OtpField } from '@/components/text-field';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/types';
import { useCountdown } from '@/lib/use-countdown';

export default function VerifyEmailStep() {
  const params = useLocalSearchParams<{ email: string; devCode?: string }>();
  const { t, lang, errorText } = useI18n();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(params.devCode || undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cooldown = useCountdown(30);

  async function verify(value = code) {
    if (value.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: Me }>('/auth/email/verify', {
        body: { email: params.email, code: value, language: lang },
      });
      await signIn(res.token, res.user);
      // Returning users with complete registration go straight to Home (the root guard switches).
      // Otherwise pop to the welcome screen, which redirects to the next unfinished step.
      if (res.user.registrationStep !== 'done') router.dismissAll();
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
    }
  }

  async function resend() {
    try {
      const res = await api<{ devCode?: string }>('/auth/email/start', { body: { email: params.email } });
      setDevCode(res.devCode);
      cooldown.restart();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <OnboardingScreen
      title={t('onb.verifyEmailTitle')}
      subtitle={t('onb.codeSentTo', { target: params.email })}
      step={{ n: 1, total: 3 }}
      footer={
        <>
          <Button title={t('onb.verify')} onPress={() => verify()} loading={loading} disabled={code.length !== 6} />
          <Button
            title={cooldown.seconds > 0 ? t('onb.resendIn', { s: cooldown.seconds }) : t('onb.resend')}
            variant="ghost"
            disabled={cooldown.seconds > 0}
            onPress={resend}
          />
        </>
      }>
      <DevCodeBanner
        code={devCode}
        onUse={(c) => {
          setCode(c);
          verify(c);
        }}
      />
      <OtpField
        value={code}
        onChangeText={(v) => {
          setCode(v);
          setError(null);
          if (v.length === 6) verify(v);
        }}
        error={error}
      />
    </OnboardingScreen>
  );
}
