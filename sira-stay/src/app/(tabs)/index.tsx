import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { CategoryButtons } from '@/components/category-tabs';
import { Chip } from '@/components/chip';
import { EmptyState, ErrorView } from '@/components/feedback';
import { SavedNote } from '@/components/network-banner';
import { PropertyCard } from '@/components/property-card';
import { PropertyListSkeleton } from '@/components/skeleton';
import { colors, radius } from '@/constants/theme';
import { DEFAULT_DISTRICTS, DISTRICTS, districtLabel, searchTerm, type District } from '@/lib/districts';
import { useI18n } from '@/lib/i18n';
import type { Category, Conversation, PropertyCard as Card } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function Home() {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('house');
  const [district, setDistrict] = useState<District | null>(null);
  const [allDistricts, setAllDistricts] = useState(false);

  // Debounce typing so we don't query on every keystroke. Tamil district names map to English.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchTerm(search)), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ category });
    if (district) params.set('district', district);
    if (query) params.set('q', query);
    return `/properties?${params.toString()}`;
  }, [category, district, query]);

  const { data, error, loading, refreshing, refresh, reload, savedAt } = useQuery<{ properties: Card[] }>(path);
  const insets = useSafeAreaInsets();
  const { data: inbox } = useQuery<{ conversations: Conversation[] }>('/conversations', { pollMs: 15_000 });
  const unread = inbox?.conversations.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const properties = data?.properties ?? [];

  // Collapsed: the four defaults (plus the selected district, so the choice stays visible).
  const districts: string[] = allDistricts
    ? DISTRICTS.map((d) => d.name)
    : district && !DEFAULT_DISTRICTS.includes(district)
      ? [...DEFAULT_DISTRICTS, district]
      : DEFAULT_DISTRICTS;

  const place = district ? districtLabel(district, lang) : query;

  const header = (
    <View>
      <View style={styles.padded}>
        <View style={styles.topRow}>
          <BrandLogo tagline={t('profile.tagline')} />
          <Pressable
            onPress={() => router.push('/messages')}
            style={styles.inbox}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('messages.title')}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('home.search')}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={() => setQuery(searchTerm(search))}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <CategoryButtons value={category} onChange={setCategory} />

      <View style={styles.padded}>
        <Text style={styles.sectionTitle}>{t('home.districts')}</Text>
        <Animated.View layout={LinearTransition.duration(220)} style={styles.districts}>
          {districts.map((name) => (
            <Animated.View key={name} entering={FadeIn.duration(180)}>
              <Chip
                label={districtLabel(name, lang)}
                icon="location-outline"
                selected={district === name}
                onPress={() => setDistrict(district === name ? null : (name as District))}
              />
            </Animated.View>
          ))}
        </Animated.View>
        <Pressable
          onPress={() => setAllDistricts((v) => !v)}
          style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
          accessibilityRole="button">
          <Text style={styles.viewAllText}>{allDistricts ? t('home.showLess') : t('home.viewAll')}</Text>
          <Ionicons name={allDistricts ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </Pressable>

        {data && (
          <View style={styles.resultsRow}>
            <Text style={styles.results}>
              {place ? t('home.resultsIn', { n: properties.length, place }) : t('home.results', { n: properties.length })}
            </Text>
            <SavedNote savedAt={savedAt} />
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <FlatList
        data={properties}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Render a few cards at a time so photos load lazily while scrolling.
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <PropertyCard property={item} onPress={() => router.push(`/property/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          loading && !data ? (
            <PropertyListSkeleton />
          ) : error && !data ? (
            <ErrorView error={error} onRetry={reload} />
          ) : (
            <EmptyState icon="search-outline" title={t('home.empty')} hint={t('home.emptyHint')} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  list: { paddingBottom: 24, flexGrow: 1 },
  padded: { paddingHorizontal: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 14 },
  inbox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    paddingHorizontal: 18,
    marginBottom: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  districts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  viewAllPressed: { backgroundColor: colors.primarySoft },
  viewAllText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  resultsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20, marginBottom: 12 },
  results: { fontSize: 15, fontWeight: '700', color: colors.textMuted, flexShrink: 1 },
  cardWrap: { paddingHorizontal: 16, marginBottom: 16 },
});
