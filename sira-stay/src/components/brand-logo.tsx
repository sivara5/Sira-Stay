import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

/** Sira Stay logo mark + wordmark, with an optional tagline underneath. */
export function BrandLogo({ tagline }: { tagline?: string }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Sira Stay">
      <View style={styles.mark}>
        <Ionicons name="home" size={22} color={colors.white} />
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>Sira Stay</Text>
        {tagline ? (
          <Text style={styles.tagline} numberOfLines={1}>
            {tagline}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  mark: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1 },
  name: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.3 },
  tagline: { fontSize: 13, color: colors.textMuted },
});
