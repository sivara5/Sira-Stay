import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Language } from '@/lib/types';

const OPTIONS: { value: Language; label: string; sample: string }[] = [
  { value: 'en', label: 'English', sample: 'Aa' },
  { value: 'ta', label: 'தமிழ்', sample: 'அ' },
];

/** English ⇄ Tamil switch used in onboarding and profile settings. */
export function LanguageSwitch() {
  const { lang } = useI18n();
  const { changeLanguage } = useAuth();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const selected = o.value === lang;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => changeLanguage(o.value)}
            style={[styles.option, selected && styles.selected]}>
            <Text style={[styles.sample, selected && styles.selectedText]}>{o.sample}</Text>
            <Text style={[styles.label, selected && styles.selectedText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  sample: { fontSize: 22, fontWeight: '700', color: colors.textMuted },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  selectedText: { color: colors.primaryDark },
});
