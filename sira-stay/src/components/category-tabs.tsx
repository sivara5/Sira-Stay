import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { CATEGORIES, type Category } from '@/lib/types';

export const categoryIcon: Record<Category, ComponentProps<typeof Ionicons>['name']> = {
  rooms: 'bed-outline',
  villas: 'business-outline',
  pg: 'people-outline',
  house: 'home-outline',
  room_sharing: 'people-circle-outline',
};

/** Top menu: Rooms · Villas · PG · House · Room Sharing. Only the selected category's listings are shown. */
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
            <Ionicons name={categoryIcon[c]} size={24} color={selected ? colors.text : colors.textMuted} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{t(`cat.${c}`)}</Text>
            <View style={[styles.indicator, selected && styles.indicatorSelected]} />
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
  indicatorSelected: { backgroundColor: colors.text },
});
