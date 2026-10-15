import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { LanguageSwitch } from '@/components/language-switch';
import { TextField } from '@/components/text-field';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/types';

export default function Profile() {
  const { t, errorText } = useI18n();
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp?.replace(/^\+91/, '') ?? '');
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const isOwner = user.role === 'owner';

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
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user.name || user.email).charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{user.name || user.email.split('@')[0]}</Text>
          <View style={styles.roleChip}>
            <Ionicons name={isOwner ? 'home' : 'key'} size={12} color={colors.primaryDark} />
            <Text style={styles.roleText}>{isOwner ? t('profile.owner') : t('profile.tenant')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <InfoRow icon="mail-outline" label={t('profile.email')} value={user.email} />
        {user.phone && <InfoRow icon="call-outline" label={t('profile.phone')} value={formatPhone(user.phone)} />}
        {isOwner && <InfoRow icon="shield-checkmark-outline" label={t('profile.kyc')} value={t(`kyc.${user.kycStatus}`)} />}
      </View>

      <Text style={styles.sectionTitle}>{t('profile.settings')}</Text>
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

      <Pressable style={styles.linkRow} onPress={() => router.push('/payments')}>
        <Ionicons name="receipt-outline" size={20} color={colors.text} />
        <Text style={[styles.label, styles.flex]}>{t('profile.payments')}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <Button title={t('profile.signOut')} variant="danger" icon="log-out-outline" onPress={signOut} />
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }: { icon: 'mail-outline' | 'call-outline' | 'shield-checkmark-outline'; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontSize: 14, color: colors.textMuted, width: 80 },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16 },
});
