import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'whatsapp';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.primarySoft, fg: colors.primaryLight, border: colors.primarySoft },
  outline: { bg: colors.card, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: 'transparent', fg: colors.danger, border: colors.dangerSoft },
  whatsapp: { bg: colors.whatsapp, fg: colors.white, border: colors.whatsapp },
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: p.bg, borderColor: p.border },
        inactive && styles.disabled,
        pressed && !inactive && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={p.fg} />}
          <Text style={[styles.label, small && styles.labelSmall, { color: p.fg }]} numberOfLines={2}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  small: { minHeight: 40, paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.sm },
  // Long labels (e.g. in Tamil or half-width buttons) wrap to a second line instead of being cut off.
  label: { fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  labelSmall: { fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
