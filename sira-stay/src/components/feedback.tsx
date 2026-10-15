import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { colors, radius } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint && <Text style={styles.emptyHint}>{hint}</Text>}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  return (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      <Text style={styles.emptyHint}>{errorText(error)}</Text>
      {onRetry && <Button title={t('common.retry')} variant="outline" onPress={onRetry} small />}
    </View>
  );
}

type Tone = 'info' | 'warning' | 'danger' | 'success';
const toneColors: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' },
  warning: { bg: colors.accentSoft, fg: '#92400E', icon: 'warning' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
};

export function Banner({ tone = 'info', title, children, icon }: { tone?: Tone; title?: string; children?: ReactNode; icon?: IconName }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      <Ionicons name={icon ?? c.icon} size={20} color={c.fg} style={styles.bannerIcon} />
      <View style={styles.bannerBody}>
        {title && <Text style={[styles.bannerTitle, { color: c.fg }]}>{title}</Text>}
        {typeof children === 'string' ? <Text style={[styles.bannerText, { color: c.fg }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** Shown only when the server runs without an SMS/email provider. Tapping fills the code. */
export function DevCodeBanner({ code, onUse }: { code?: string; onUse: (code: string) => void }) {
  const { t } = useI18n();
  if (!code) return null;
  return (
    <Pressable onPress={() => onUse(code)}>
      <Banner tone="warning" icon="flask">
        {t('common.devCode', { code })}
      </Banner>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyHint: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
  bannerIcon: { marginTop: 1 },
  bannerBody: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerText: { fontSize: 14, lineHeight: 20 },
});
