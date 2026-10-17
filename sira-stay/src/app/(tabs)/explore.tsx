import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AreaCircle } from '@/components/approx-map';
import { CategoryTabs } from '@/components/category-tabs';
import { Chip } from '@/components/chip';
import { Banner, EmptyState, ErrorView, Loading } from '@/components/feedback';
import { PropertyCard } from '@/components/property-card';
import { TAMIL_NADU_REGION, colors, radius } from '@/constants/theme';
import { rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Category, PropertyCard as Card } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

const SORTS = ['recent', 'distance', 'rent_asc', 'rent_desc'] as const;
type Sort = (typeof SORTS)[number];

export default function Explore() {
  const { t } = useI18n();
  const [category, setCategory] = useState<Category>('house');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ category, sort: sort === 'distance' && !origin ? 'recent' : sort });
    if (query) params.set('q', query);
    if (origin) {
      params.set('lat', String(origin.lat));
      params.set('lng', String(origin.lng));
    }
    return `/properties?${params.toString()}`;
  }, [category, sort, query, origin]);

  const { data, error, loading, refreshing, refresh, reload } = useQuery<{ properties: Card[] }>(path);
  const properties = data?.properties ?? [];

  async function chooseSort(next: Sort) {
    setSort(next);
    if (next !== 'distance' || origin) return;
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      setLocationDenied(true);
      setSort('recent');
      return;
    }
    setLocationDenied(false);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }

  const header = (
    <View style={styles.header}>
      <View>
        <Text style={styles.screenTitle}>{t('tab.explore')}</Text>
        <Text style={styles.greeting}>{t('explore.greeting')}</Text>
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('explore.search')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <View style={styles.tabs}>
        <CategoryTabs value={category} onChange={setCategory} />
      </View>
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
          {SORTS.map((s) => (
            <Chip
              key={s}
              label={t(`explore.sort.${s}`)}
              icon={s === 'distance' ? 'navigate-outline' : undefined}
              selected={sort === s}
              onPress={() => chooseSort(s)}
            />
          ))}
        </ScrollView>
        <Pressable style={styles.viewToggle} onPress={() => setView(view === 'list' ? 'map' : 'list')}>
          <Ionicons name={view === 'list' ? 'map-outline' : 'list-outline'} size={16} color={colors.white} />
          <Text style={styles.viewToggleText}>{view === 'list' ? t('explore.map') : t('explore.list')}</Text>
        </Pressable>
      </View>
      {locationDenied && (
        <View style={styles.bannerWrap}>
          <Banner tone="warning">{t('explore.locationDenied')}</Banner>
        </View>
      )}

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorView error={error} onRetry={reload} />
      ) : view === 'map' ? (
        <ResultsMap properties={properties} origin={origin} />
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => <PropertyCard property={item} onPress={() => router.push(`/property/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState icon="search-outline" title={t('explore.empty', { category: t(`cat.${category}`) })} hint={t('explore.emptyHint')} />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Approximate-area circles only — exact locations are never sent to the app before unlock. */
function ResultsMap({ properties, origin }: { properties: Card[]; origin: { lat: number; lng: number } | null }) {
  const { t } = useI18n();
  const region = useMemo(() => {
    if (!properties.length) return TAMIL_NADU_REGION;
    const lats = properties.map((p) => p.approxLocation.lat);
    const lngs = properties.map((p) => p.approxLocation.lng);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.05, (maxLng - minLng) * 1.4),
    };
  }, [properties]);

  const mapRef = useRef<MapView>(null);
  useEffect(() => {
    mapRef.current?.animateToRegion(region, 300);
  }, [region]);

  return (
    <View style={styles.mapWrap}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={region} showsUserLocation={Boolean(origin)} toolbarEnabled={false}>
        {properties.map((p) => (
          <Fragment key={p.id}>
            <AreaCircle approx={p.approxLocation} />
            <Marker
              coordinate={{ latitude: p.approxLocation.lat, longitude: p.approxLocation.lng }}
              onPress={() => router.push(`/property/${p.id}`)}
              tracksViewChanges={false}>
              <View style={[styles.pricePin, p.status === 'BOOKED' && styles.pricePinBooked]}>
                <Text style={styles.pricePinText}>{rupees(p.rent)}</Text>
              </View>
            </Marker>
          </Fragment>
        ))}
      </MapView>
      <View style={styles.mapNote}>
        <Banner tone="info" icon="shield-checkmark-outline">
          {t('explore.mapNote')}
        </Banner>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  screenTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  greeting: { fontSize: 13, color: colors.textMuted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  tabs: { borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 12, gap: 8 },
  sorts: { paddingHorizontal: 16, gap: 8 },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  viewToggleText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  bannerWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 4, gap: 16, backgroundColor: colors.surface, flexGrow: 1 },
  mapWrap: { flex: 1 },
  mapNote: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  pricePin: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pricePinBooked: { backgroundColor: colors.accentSoft },
  pricePinText: { fontWeight: '800', fontSize: 13, color: colors.text },
});
