import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState, ErrorView } from '@/components/feedback';
import { SavedNote } from '@/components/network-banner';
import { PropertyCard } from '@/components/property-card';
import { PropertyListSkeleton } from '@/components/skeleton';
import { colors } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import type { PropertyCard as Card } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function Favorites() {
  const { t } = useI18n();
  const { data, error, loading, refreshing, refresh, reload, savedAt } = useQuery<{ properties: Card[] }>('/my/favorites');

  if (loading && !data) return <PropertyListSkeleton />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  return (
    <FlatList
      data={data.properties}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={savedAt ? <SavedNote savedAt={savedAt} /> : null}
      renderItem={({ item }) => (
        <PropertyCard
          property={item}
          onPress={() => router.push(`/property/${item.id}`)}
          onFavoriteChange={(favorite) => {
            if (!favorite) reload();
          }}
        />
      )}
      ListEmptyComponent={
        <EmptyState
          icon="heart-outline"
          title={t('favorites.empty')}
          hint={t('favorites.emptyHint')}
          action={<Button title={t('bookings.explore')} small onPress={() => router.navigate('/')} />}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16, flexGrow: 1 },
});
