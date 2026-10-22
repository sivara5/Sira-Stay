import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { formatDate, fromDateString, toDateString } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type Props = {
  label: string;
  value: string | null; // YYYY-MM-DD
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onChange: (date: string) => void;
};

/** Native date picker: dialog on Android, inline calendar on iOS. */
export function DateField({ label, value, placeholder, minimumDate, maximumDate, onChange }: Props) {
  const { lang } = useI18n();
  const [showInline, setShowInline] = useState(false);
  const current = value ? fromDateString(value) : (minimumDate ?? new Date());

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event, date) => event.type === 'set' && date && onChange(toDateString(date)),
      });
    } else {
      setShowInline((v) => !v);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={open} accessibilityRole="button">
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={[styles.value, !value && styles.placeholder]}>{value ? formatDate(value, lang) : placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {showInline && (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          themeVariant="dark"
          accentColor={colors.primary}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, date) => date && onChange(toDateString(date))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  value: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  placeholder: { color: colors.textMuted, fontWeight: '400' },
});
