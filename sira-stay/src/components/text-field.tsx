import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius } from '@/constants/theme';

type Props = TextInputProps & { label?: string; hint?: string; error?: string | null; prefix?: string };

export function TextField({ label, hint, error, prefix, style, multiline, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputRow, multiline && styles.multilineRow, error ? styles.inputError : null]}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          keyboardAppearance="dark"
          style={[styles.input, multiline && styles.multiline, style]}
          multiline={multiline}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Single input for 6-digit codes; supports SMS autofill on Android and iOS. */
export function OtpField({ value, onChangeText, error }: { value: string; onChangeText: (v: string) => void; error?: string | null }) {
  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        placeholder="••••••"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        keyboardAppearance="dark"
        style={[styles.otp, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  multilineRow: { alignItems: 'flex-start' },
  prefix: { fontSize: 16, color: colors.text, fontWeight: '600', marginRight: 8 },
  input: { flex: 1, minHeight: 50, fontSize: 16, color: colors.text },
  multiline: { minHeight: 100, paddingTop: 14, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
  otp: {
    height: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 30,
    letterSpacing: 14,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
