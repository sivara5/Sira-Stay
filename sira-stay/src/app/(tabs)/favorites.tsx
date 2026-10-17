import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState, ErrorView, Loading } from '@/components/feedback';
import { PropertyCard } from '@/components/property-card';
import { colors } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import type { PropertyCard as Card } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function Favorites() {
  const { t } = useI18n();
  const { data, error, loading, refreshing, refresh, reload } = useQuery<{ properties: Card[] }>('/my/favorites');

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  return (
    <FlatList
      data={data.properties}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
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
