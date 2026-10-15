import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

type Props = {
  title: string;
  subtitle?: string;
  step?: { n: number; total: number };
  children: ReactNode;
  footer?: ReactNode;
};

export function OnboardingScreen({ title, subtitle, step, children, footer }: Props) {
  const { t } = useI18n();
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step && (
            <View style={styles.stepRow}>
              {Array.from({ length: step.total }, (_, i) => (
                <View key={i} style={[styles.stepBar, i < step.n && styles.stepBarActive]} />
              ))}
            </View>
          )}
          {step && <Text style={styles.stepText}>{t('onb.step', { n: step.n, total: step.total })}</Text>}
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <View style={styles.body}>{children}</View>
        </ScrollView>
        {footer && <View style={styles.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 8, gap: 8 },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepBarActive: { backgroundColor: colors.primary },
  stepText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 8 },
  subtitle: { fontSize: 15, color: colors.textMuted, lineHeight: 22 },
  body: { marginTop: 20, gap: 16 },
  footer: { padding: 24, paddingTop: 8, gap: 10 },
});
