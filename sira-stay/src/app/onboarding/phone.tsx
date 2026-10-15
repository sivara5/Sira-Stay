import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { DevCodeBanner } from '@/components/feedback';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { OtpField, TextField } from '@/components/text-field';
import { api } from '@/lib/api';
import { stepRoute, useAuth } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/types';
import { useCountdown } from '@/lib/use-countdown';

export default function PhoneStep() {
  const { t, errorText } = useI18n();
  const { user, setUser } = useAuth();
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cooldown = useCountdown(30);
  const isOwner = user?.role === 'owner';

  async function sendOtp() {
    if (!/^[6-9]\d{9}$/.test(number)) {
      setError(t('err.INVALID_PHONE'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ phone: string; devCode?: string }>('/auth/phone/start', { body: { phone: number } });
      setSentTo(res.phone);
      setDevCode(res.devCode);
      setCode('');
      cooldown.restart();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 6 || !sentTo) return;
    setLoading(true);
    setError(null);
    try {
      const { user: me } = await api<{ user: Me }>('/auth/phone/verify', { body: { phone: sentTo, code: value } });
      setUser(me);
      // Tenants are done here (the app switches to Home automatically); owners continue to KYC.
      if (me.registrationStep !== 'done') router.replace(stepRoute[me.registrationStep]);
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
    }
  }

  const step = { n: 3, total: isOwner ? 4 : 3 };

  if (!sentTo) {
    return (
      <OnboardingScreen
        title={t('onb.phoneTitle')}
        subtitle={t('onb.phoneHint')}
        step={step}
        footer={<Button title={t('onb.sendOtp')} onPress={sendOtp} loading={loading} disabled={number.length !== 10} />}>
        <TextField
          label={t('onb.phoneLabel')}
          prefix="+91"
          value={number}
          onChangeText={(v) => {
            setNumber(v.replace(/\D/g, '').slice(0, 10));
            setError(null);
          }}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={10}
          autoFocus
          error={error}
        />
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      title={t('onb.phoneTitle')}
      subtitle={t('onb.otpLabel', { target: formatPhone(sentTo) })}
      step={step}
      footer={
        <>
          <Button title={t('onb.verifyOtp')} onPress={() => verify()} loading={loading} disabled={code.length !== 6} />
          <Button
            title={cooldown.seconds > 0 ? t('onb.resendIn', { s: cooldown.seconds }) : t('onb.resend')}
            variant="ghost"
            disabled={cooldown.seconds > 0 || loading}
            onPress={sendOtp}
          />
          <Button title={t('onb.changeNumber')} variant="ghost" onPress={() => setSentTo(null)} />
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
