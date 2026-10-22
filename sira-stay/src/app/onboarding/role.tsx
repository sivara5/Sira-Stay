import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { stepRoute, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Me, Role } from '@/lib/types';

const ROLES = [
  { role: 'tenant', icon: 'key-outline', title: 'onb.tenant', desc: 'onb.tenantDesc', confirm: 'onb.confirmTenant' },
  { role: 'owner', icon: 'home-outline', title: 'onb.owner', desc: 'onb.ownerDesc', confirm: 'onb.confirmOwner' },
] as const;

export default function RoleStep() {
  const { t, errorText } = useI18n();
  const { user, setUser, signOut } = useAuth();
  const [role, setRole] = useState<Role | null>(user?.role ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selected = ROLES.find((r) => r.role === role);

  async function confirm() {
    if (!role) return;
    setLoading(true);
    try {
      const { user: me } = await api<{ user: Me }>('/auth/role', { body: { role } });
      setUser(me);
      router.replace(stepRoute[me.registrationStep]);
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
    }
  }

  async function useDifferentEmail() {
    await signOut();
    router.replace('/onboarding');
  }

  return (
    <OnboardingScreen
      title={t('onb.roleTitle')}
      step={{ n: 2, total: role === 'owner' ? 4 : 3 }}
      footer={
        <>
          <Button title={selected ? t(selected.confirm) : t('common.continue')} onPress={confirm} disabled={!role} loading={loading} />
          <Button title={t('onb.differentEmail')} variant="ghost" onPress={useDifferentEmail} />
        </>
      }>
      {ROLES.map((r) => {
        const active = r.role === role;
        return (
          <Pressable
            key={r.role}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => setRole(r.role)}
            style={[styles.card, active && styles.cardActive]}>
            <View style={[styles.icon, active && styles.iconActive]}>
              <Ionicons name={r.icon} size={28} color={active ? colors.onPrimary : colors.primary} />
            </View>
            <View style={styles.text}>
              <Text style={styles.title}>{t(r.title)}</Text>
              <Text style={styles.desc}>{t(r.desc)}</Text>
            </View>
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={24} color={active ? colors.primary : colors.textMuted} />
          </Pressable>
        );
      })}
      {error && <Banner tone="danger">{error}</Banner>}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  icon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.primary },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  desc: { fontSize: 14, color: colors.textMuted, lineHeight: 19 },
});
