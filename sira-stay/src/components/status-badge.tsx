import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import type { BookingStatus, PropertyStatus } from '@/lib/types';

const tones: Record<PropertyStatus | BookingStatus, { bg: string; fg: string }> = {
  AVAILABLE: { bg: colors.successSoft, fg: colors.success },
  BOOKED: { bg: colors.accentSoft, fg: '#92400E' },
  WITHDRAWN: { bg: colors.surface, fg: colors.textMuted },
  HIDDEN: { bg: colors.dangerSoft, fg: colors.danger },
  PENDING_PAYMENT: { bg: colors.infoSoft, fg: colors.info },
  CONFIRMED: { bg: colors.successSoft, fg: colors.success },
  CANCELLED: { bg: colors.dangerSoft, fg: colors.danger },
  FAILED: { bg: colors.dangerSoft, fg: colors.danger },
  EXPIRED: { bg: colors.surface, fg: colors.textMuted },
};

export function StatusBadge({ status }: { status: PropertyStatus | BookingStatus }) {
  const { t } = useI18n();
  const tone = tones[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{t(`status.${status}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  text: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
