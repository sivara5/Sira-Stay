import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { formatDate, formatTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { retryNow, useNetwork } from '@/lib/network';

/**
 * "No internet connection" bar shown at the very top of the app while offline (or while our
 * server can't be reached). Retry re-checks the connection and reloads the visible screen.
 */
export function NetworkBanner({ topInset }: { topInset: number }) {
  const { t } = useI18n();
  const { online, reason } = useNetwork();
  const [pressed, setPressed] = useState(false);
  if (online) return null;

  function retry() {
    setPressed(true);
    retryNow();
    setTimeout(() => setPressed(false), 1500);
  }

  return (
    <View style={[styles.bar, { paddingTop: topInset + 6 }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={reason === 'no_internet' ? 'cloud-offline-outline' : 'warning-outline'} size={20} color={colors.warning} />
      <View style={styles.text}>
        <Text style={styles.title}>{reason === 'no_internet' ? t('net.offline') : t('net.server')}</Text>
        <Text style={styles.subtitle}>{t('net.saved')}</Text>
      </View>
      <Pressable onPress={retry} style={({ pressed: p }) => [styles.retry, (p || pressed) && styles.retryPressed]} accessibilityRole="button" hitSlop={8}>
        <Ionicons name="refresh" size={15} color={colors.onPrimary} />
        <Text style={styles.retryText}>{t('net.retry')}</Text>
      </Pressable>
    </View>
  );
}

/** Small "Saved 21 Oct · 4:05 pm" note on screens that are showing a saved (offline) copy. */
export function SavedNote({ savedAt }: { savedAt: number | null }) {
  const { t, lang } = useI18n();
  if (!savedAt) return null;
  const iso = new Date(savedAt).toISOString();
  return (
    <View style={styles.note}>
      <Ionicons name="time-outline" size={13} color={colors.warning} />
      <Text style={styles.noteText}>{t('net.savedAt', { time: `${formatDate(iso, lang)} · ${formatTime(iso, lang)}` })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  text: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  retryPressed: { opacity: 0.6 },
  retryText: { fontSize: 13, fontWeight: '800', color: colors.onPrimary },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
  },
  noteText: { fontSize: 12, fontWeight: '600', color: colors.warning },
});
