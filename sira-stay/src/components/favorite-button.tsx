import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Props = {
  propertyId: string;
  favorite: boolean;
  /** Called after the server confirms the change (e.g. to refresh the Favorites list). */
  onChange?: (favorite: boolean) => void;
  size?: number;
};

/** ♡ toggle. Updates instantly and rolls back if the server call fails. */
export function FavoriteButton({ propertyId, favorite, onChange, size = 22 }: Props) {
  const { t } = useI18n();
  const [override, setOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const value = override ?? favorite;

  async function toggle() {
    if (busy) return;
    const next = !value;
    setOverride(next);
    setBusy(true);
    try {
      await api(`/properties/${propertyId}/favorite`, { method: next ? 'PUT' : 'DELETE' });
      onChange?.(next);
    } catch {
      setOverride(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={toggle}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={value ? t('fav.remove') : t('fav.add')}
      accessibilityState={{ selected: value }}
      style={({ pressed }) => [styles.circle, { width: size + 18, height: size + 18, borderRadius: (size + 18) / 2 }, pressed && styles.pressed]}>
      <Ionicons name={value ? 'heart' : 'heart-outline'} size={size} color={value ? colors.danger : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  pressed: { transform: [{ scale: 0.92 }] },
});
