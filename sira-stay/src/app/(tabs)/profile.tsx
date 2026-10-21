import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { LanguageSwitch } from '@/components/language-switch';
import { TextField } from '@/components/text-field';
import { colors, radius, shadow } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { AdminOverview, Me, Role } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

const ROLES = [
  { role: 'tenant', icon: 'home', label: 'profile.tenant', hint: 'profile.tenantHint', dashboard: '/' },
  { role: 'owner', icon: 'key', label: 'profile.owner', hint: 'profile.ownerHint', dashboard: '/listings' },
] as const;

const KYC_TONE = {
  verified: { bg: colors.successSoft, fg: colors.success },
  pending: { bg: colors.accentSoft, fg: '#92400E' },
  rejected: { bg: colors.dangerSoft, fg: colors.danger },
  none: { bg: colors.surface, fg: colors.textMuted },
} as const;

export default function Profile() {
  const { t, errorText } = useI18n();
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp?.replace(/^\+91/, '') ?? '');
  const [saving, setSaving] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<Role | null>(null);
  // Admins get a badge: refunds waiting for review + unread report notifications.
  const { data: admin } = useQuery<AdminOverview>(user?.isAdmin ? '/admin/reports' : null, { pollMs: 60_000 });
  const adminBadge = admin ? admin.pending.length + admin.unreadNotifications : 0;
  if (!user) return null;
  const isOwner = user.role === 'owner';
  const showKyc = isOwner || user.kycStatus !== 'none';

  /** Same account, new active role → open that role's dashboard. */
  async function switchRole(role: Role, dashboard: '/' | '/listings') {
    if (role === user?.role || switchingTo) return;
    setSwitchingTo(role);
    try {
      const { user: me } = await api<{ user: Me }>('/me/role', { body: { role } });
      setUser(me);
      router.navigate(dashboard);
    } catch (err) {
      Alert.alert(t('common.error'), errorText(err));
    } finally {
      setSwitchingTo(null);
    }
  }

  async function update(body: Partial<Pick<Me, 'name' | 'available'>> & { whatsapp?: string }) {
    setSaving(true);
    try {
      const { user: me } = await api<{ user: Me }>('/me', { method: 'PATCH', body });
      setUser(me);
      return true;
    } catch (err) {
      Alert.alert(t('common.error'), errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails() {
    const body: { name?: string; whatsapp?: string } = {};
    if (name.trim() && name.trim() !== user?.name) body.name = name.trim();
    if (isOwner && whatsapp && `+91${whatsapp}` !== user?.whatsapp) body.whatsapp = whatsapp;
    if (Object.keys(body).length && (await update(body))) Alert.alert(t('common.saved'));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <BrandLogo tagline={t('profile.tagline')} />
          <View style={styles.activePill}>
            <Ionicons name={isOwner ? 'key' : 'home'} size={13} color={colors.primaryDark} />
            <Text style={styles.activePillText}>{isOwner ? t('profile.owner') : t('profile.tenant')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user.name || user.email).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {user.name || user.email.split('@')[0]}
                </Text>
                {user.phoneVerified && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
              </View>
              <Text style={styles.muted} numberOfLines={1}>
                {user.email}
              </Text>
              {user.phone && <Text style={styles.muted}>{formatPhone(user.phone)}</Text>}
            </View>
          </View>
          {showKyc && (
            <View style={[styles.kycChip, { backgroundColor: KYC_TONE[user.kycStatus].bg }]}>
              <Ionicons name="shield-checkmark-outline" size={13} color={KYC_TONE[user.kycStatus].fg} />
              <Text style={[styles.kycText, { color: KYC_TONE[user.kycStatus].fg }]}>
                {t('profile.kycChip', { status: t(`kyc.${user.kycStatus}`) })}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>{t('profile.roleMode')}</Text>
          <Text style={styles.hint}>{t('profile.roleModeHint')}</Text>
          <View style={styles.roleRow} accessibilityRole="radiogroup">
            {ROLES.map((r) => {
              const active = user.role === r.role;
              return (
                <Pressable
                  key={r.role}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, busy: switchingTo === r.role }}
                  onPress={() => switchRole(r.role, r.dashboard)}
                  style={({ pressed }) => [styles.roleButton, active && styles.roleButtonActive, pressed && !active && styles.pressed]}>
                  {switchingTo === r.role ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Ionicons name={r.icon} size={22} color={active ? colors.white : colors.primary} />
                  )}
                  <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{t(r.label)}</Text>
                  <Text style={[styles.roleHint, active && styles.roleHintActive]}>{t(r.hint)}</Text>
                </Pressable>
              );
            })}
          </View>
          {isOwner && user.kycStatus === 'none' && (
            <Banner tone="info" icon="document-text-outline">
              {t('profile.ownerKycNote')}
            </Banner>
          )}
        </View>

        <Text style={styles.groupTitle}>{t('profile.settings')}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t('lang.label')}</Text>
          <LanguageSwitch />
        </View>

        <View style={styles.card}>
          <TextField label={t('profile.name')} value={name} onChangeText={setName} autoComplete="name" />
          {isOwner && (
            <TextField
              label={t('profile.whatsapp')}
              prefix="+91"
              value={whatsapp}
              onChangeText={(v) => setWhatsapp(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="phone-pad"
              maxLength={10}
            />
          )}
          <Button title={t('common.save')} variant="secondary" small onPress={saveDetails} loading={saving} />
        </View>

        {isOwner && (
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={[styles.label, styles.flex]}>{t('profile.availability')}</Text>
              <Switch
                value={user.available}
                onValueChange={(available) => {
                  update({ available });
                }}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.white}
              />
            </View>
            <Text style={styles.hint}>{t('profile.availabilityHint')}</Text>
          </View>
        )}

        {user.isAdmin && (
          <Pressable style={[styles.linkRow, styles.adminRow]} onPress={() => router.push('/admin/reports')}>
            <Ionicons name="shield-half-outline" size={20} color={colors.primaryDark} />
            <Text style={[styles.label, styles.flex]}>{t('admin.open')}</Text>
            {adminBadge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{adminBadge > 99 ? '99+' : adminBadge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        <Pressable style={styles.linkRow} onPress={() => router.push('/district-pass')}>
          <Ionicons name="ticket-outline" size={20} color={colors.text} />
          <Text style={[styles.label, styles.flex]}>{t('pass.title')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable style={styles.linkRow} onPress={() => router.push('/messages')}>
          <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
          <Text style={[styles.label, styles.flex]}>{t('messages.title')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable style={styles.linkRow} onPress={() => router.push('/payments')}>
          <Ionicons name="receipt-outline" size={20} color={colors.text} />
          <Text style={[styles.label, styles.flex]}>{t('profile.payments')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Button title={t('profile.signOut')} variant="danger" icon="log-out-outline" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 14 },
  flex: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  activePillText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 12, ...shadow.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 14, color: colors.textMuted },
  kycChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  kycText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  divider: { height: 1, backgroundColor: colors.border },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  groupTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: 104,
    justifyContent: 'center',
  },
  roleButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { backgroundColor: colors.primarySoft },
  roleLabel: { fontSize: 16, fontWeight: '800', color: colors.text },
  roleLabelActive: { color: colors.white },
  roleHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  roleHintActive: { color: 'rgba(255,255,255,0.85)' },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16 },
  adminRow: { borderWidth: 1.5, borderColor: colors.primary },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '800' },
});
