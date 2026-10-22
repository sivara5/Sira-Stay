import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type IconName = 'home' | 'compass' | 'calendar' | 'key' | 'heart' | 'person';

/** Outline icon; the selected tab gets a filled icon on a gold pill. */
function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: ColorValue }) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Ionicons name={focused ? name : `${name}-outline`} size={22} color={focused ? colors.onPrimary : color} />
    </View>
  );
}

const icon = (name: IconName) =>
  function TabBarIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <TabIcon name={name} focused={focused} color={color} />;
  };

/** Home · Explore · Bookings (Tenant) / Listings (Owner) · Favorites · Profile */
export default function TabLayout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIconStyle: styles.iconSlot,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 20 },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home'), headerShown: false, tabBarIcon: icon('home') }} />
      <Tabs.Screen name="explore" options={{ title: t('tab.explore'), headerShown: false, tabBarIcon: icon('compass') }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: t('tab.bookings'), headerTitle: t('bookings.title'), href: isOwner ? null : undefined, tabBarIcon: icon('calendar') }}
      />
      <Tabs.Screen
        name="listings"
        options={{ title: t('tab.listings'), headerTitle: t('listings.title'), href: isOwner ? undefined : null, tabBarIcon: icon('key') }}
      />
      <Tabs.Screen name="favorites" options={{ title: t('tab.favorites'), tabBarIcon: icon('heart') }} />
      <Tabs.Screen name="profile" options={{ title: t('profile.title'), headerShown: false, tabBarIcon: icon('person') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconSlot: { width: 52, height: 28 },
  pill: { width: 52, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: colors.primary },
});
