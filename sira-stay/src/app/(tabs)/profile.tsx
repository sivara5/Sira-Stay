import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { EditFieldDialog } from '@/components/edit-field-dialog';
import { cardStyle, colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { AdminOverview, Me, Role } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

const ROLES = [
  { role: 'tenant', icon: 'home', label: 'profile.tenant', dashboard: '/' },
  { role: 'owner', icon: 'key', label: 'profile.owner', dashboard: '/listings' },
] as const;

const KYC_TONE = {
  verified: { bg: colors.successSoft, fg: colors.success },
  pending: { bg: colors.warningSoft, fg: colors.warning },
  rejected: { bg: colors.dangerSoft, fg: colors.danger },
  none: { bg: colors.elevated, fg: colors.textMuted },
} as const;

const MOBILE = /^[6-9]\d{9}$/;

export default function Profile() {
  const { t, lang, errorText } = useI18n();
  const { user, setUser, signOut, changeLanguage } = useAuth();
  const [switchingTo, setSwitchingTo] = useState<Role | null>(null);
  const [editing, setEditing] = useState<'name' | 'whatsapp' | null>(null);
  // Admins get a badge: refunds to review, unread report notifications and listings to verify.
  const { data: admin } = useQuery<AdminOverview>(user?.isAdmin ? '/admin/reports' : null, { pollMs: 60_000 });
  const adminBadge = admin ? admin.pending.length + admin.unreadNotifications + (admin.listings?.length ?? 0) : 0;
  const insets = useSafeAreaInsets();
  if (!user) return null;
  const isOwner = user.role === 'owner';
  const displayName = user.name || user.email.split('@')[0];

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

  async function update(body: { name?: string; whatsapp?: string; available?: boolean }) {
    try {
      const { user: me } = await api<{ user: Me }>('/me', { method: 'PATCH', body });
      setUser(me);
      return true;
    } catch (err) {
      Alert.alert(t('common.error'), errorText(err));
      return false;
    }
  }

  function chooseLanguage() {
    Alert.alert(t('lang.label'), undefined, [
      { text: t('lang.en'), onPress: () => changeLanguage('en') },
      { text: t('lang.ta'), onPress: () => changeLanguage('ta') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  const kyc = KYC_TONE[user.kycStatus];

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <BrandLogo tagline={t('profile.tagline')} />
          <View style={styles.activePill}>
            <Ionicons name={isOwner ? 'key' : 'home'} size={13} color={colors.primary} />
            <Text style={styles.activePillText}>{isOwner ? t('profile.owner') : t('profile.tenant')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.flex}>
              <Pressable style={styles.nameRow} onPress={() => setEditing('name')} accessibilityRole="button" accessibilityHint={t('profile.editName')}>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName}
                </Text>
                {user.phoneVerified && <Ionicons name="checkmark-circle" size={16} color={colors.success} />}
                <Ionicons name="pencil" size={13} color={colors.textMuted} />
              </Pressable>
              <Text style={styles.muted} numberOfLines={1}>
                {user.email}
              </Text>
              {user.phone && <Text style={styles.muted}>{formatPhone(user.phone)}</Text>}
            </View>
          </View>
          <View style={[styles.kycChip, { backgroundColor: kyc.bg }]}>
            <Ionicons name="shield-checkmark-outline" size={12} color={kyc.fg} />
            <Text style={[styles.kycText, { color: kyc.fg }]}>{t('profile.kycChip', { status: t(`kyc.${user.kycStatus}`) })}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.roleTitle}>{t('profile.roleMode')}</Text>
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
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name={r.icon} size={16} color={active ? colors.onPrimary : colors.primary} />
                  )}
                  <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{t(r.label)}</Text>
                </Pressable>
              );
            })}
          </View>
          {isOwner && user.kycStatus === 'none' && <Text style={styles.hint}>{t('profile.ownerKycNote')}</Text>}
        </View>

        <Text style={styles.groupTitle}>{t('profile.settings')}</Text>
        <View style={styles.list}>
          <Row label={t('lang.label')} value={lang === 'ta' ? t('lang.ta') : t('lang.en')} onPress={chooseLanguage} first />
          {isOwner && (
            <Row
              label={t('profile.whatsapp')}
              value={user.whatsapp ? formatPhone(user.whatsapp) : t('profile.add')}
              onPress={() => setEditing('whatsapp')}
            />
          )}
          {isOwner && (
            <Row
              label={t('profile.availability')}
              hint={t('profile.availabilityHint')}
              right={
                <Switch
                  value={user.available}
                  onValueChange={(available) => {
                    update({ available });
                  }}
                  trackColor={{ true: colors.primary, false: colors.elevated }}
                  thumbColor={colors.white}
                />
              }
            />
          )}
        </View>

        <Text style={styles.groupTitle}>{t('profile.account')}</Text>
        <View style={styles.list}>
          <Row label={t('pass.title')} onPress={() => router.push('/district-pass')} first />
          <Row label={t('messages.title')} onPress={() => router.push('/messages')} />
          <Row label={t('profile.payments')} onPress={() => router.push('/payments')} />
          {/* Only accounts listed in ADMIN_EMAILS on the server are admins. */}
          {user.isAdmin && <Row label={t('admin.open')} badge={adminBadge} onPress={() => router.push('/admin/reports')} />}
          <Row label={t('profile.signOut')} danger onPress={signOut} />
        </View>
      </ScrollView>

      {editing === 'name' && (
        <EditFieldDialog
          title={t('profile.name')}
          initialValue={user.name ?? ''}
          maxLength={80}
          validate={(v) => (v.trim().length >= 2 ? null : t('common.required'))}
          onSave={(v) => update({ name: v.trim() })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'whatsapp' && (
        <EditFieldDialog
          title={t('profile.whatsapp')}
          initialValue={user.whatsapp?.replace(/^\+91/, '') ?? ''}
          prefix="+91"
          keyboardType="phone-pad"
          maxLength={10}
          format={(v) => v.replace(/\D/g, '').slice(0, 10)}
          validate={(v) => (MOBILE.test(v) ? null : t('err.INVALID_PHONE'))}
          onSave={(v) => update({ whatsapp: v })}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

/** Plain settings row: label on the left; value, control or arrow on the right. */
function Row(props: {
  label: string;
  value?: string;
  hint?: string;
  right?: ReactNode;
  badge?: number;
  danger?: boolean;
  first?: boolean;
  onPress?: () => void;
}) {
  const { label, value, hint, right, badge, danger, first, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.rowPressed]}>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {right}
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      {onPress && !danger && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  flex: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  activePillText: { fontSize: 13, fontWeight: '700', color: colors.text },
  card: { ...cardStyle, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontSize: 22, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.textMuted },
  kycChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  kycText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: colors.border },
  roleTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { backgroundColor: colors.elevated },
  roleLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  roleLabelActive: { color: colors.onPrimary },
  groupTitle: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  list: { ...cardStyle, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowPressed: { opacity: 0.7 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.primary },
  danger: { color: colors.danger, fontWeight: '700' },
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
