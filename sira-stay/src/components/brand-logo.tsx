import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

/** Sira Stay house + "S" mark and wordmark, with an optional tagline underneath. */
export function BrandLogo({ tagline }: { tagline?: string }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Sira Stay">
      <View style={styles.mark}>
        <Image source={require('@/assets/images/logo-mark.png')} style={styles.markImage} contentFit="contain" />
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>SIRA STAY</Text>
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
  mark: {
    width: 46,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: { width: 36, height: 36 },
  text: { flexShrink: 1 },
  name: { fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: 1.2 },
  tagline: { fontSize: 13, color: colors.textMuted },
});
