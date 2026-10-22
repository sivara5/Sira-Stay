import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { CATEGORIES, type Category } from '@/lib/types';

export const categoryIcon: Record<Category, ComponentProps<typeof Ionicons>['name']> = {
  house: 'home-outline',
  apartments: 'business-outline',
  villas: 'leaf-outline',
  pg: 'people-outline',
  room_sharing: 'bed-outline',
};

/** Top menu (Explore): Homes · Apartments · Villas · PG · Room Sharing. Only the selected category's listings are shown. */
export function CategoryTabs({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  const { t } = useI18n();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {CATEGORIES.map((c) => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(c)}
            style={styles.tab}>
            <Ionicons name={categoryIcon[c]} size={24} color={selected ? colors.primary : colors.textMuted} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{t(`cat.${c}`)}</Text>
            <View style={[styles.indicator, selected && styles.indicatorSelected]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Compact category buttons for the Home screen. */
export function CategoryButtons({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  const { t } = useI18n();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.buttons}>
      {CATEGORIES.map((c) => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(c)}
            style={({ pressed }) => [styles.button, selected && styles.buttonSelected, pressed && !selected && styles.buttonPressed]}>
            <Ionicons name={categoryIcon[c]} size={17} color={selected ? colors.onPrimary : colors.primary} />
            <Text style={[styles.buttonLabel, selected && styles.buttonLabelSelected]}>{t(`cat.${c}`)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, gap: 4 },
  tab: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 4, minWidth: 68 },
  label: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  labelSelected: { color: colors.text, fontWeight: '800' },
  indicator: { height: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'transparent', marginTop: 4 },
  indicatorSelected: { backgroundColor: colors.primary },
  buttons: { paddingHorizontal: 16, gap: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  buttonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonPressed: { backgroundColor: colors.elevated },
  buttonLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  buttonLabelSelected: { color: colors.onPrimary },
});
