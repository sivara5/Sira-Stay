import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorView, Loading } from '@/components/feedback';
import { colors, radius } from '@/constants/theme';
import { mediaUrl } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Conversation } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function Messages() {
  const { t, lang } = useI18n();
  const { data, error, loading, refreshing, refresh, reload } = useQuery<{ conversations: Conversation[] }>('/conversations', {
    pollMs: 10_000,
  });

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  return (
    <FlatList
      data={data.conversations}
      keyExtractor={(c) => `${c.propertyId}:${c.tenantId}`}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item: c }) => {
        const last = c.lastMessage;
        const today = new Date().toDateString() === new Date(last.createdAt).toDateString();
        const preview = last.kind === 'missed_call' ? `📞 ${t('messages.missedCall')}` : last.body;
        return (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${c.propertyId}/${c.tenantId}`)}>
            <Image source={{ uri: mediaUrl(c.coverPhoto) }} style={styles.avatar} contentFit="cover" />
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.otherName}
                </Text>
                <Text style={styles.time}>{today ? formatTime(last.createdAt, lang) : formatDate(last.createdAt, lang)}</Text>
              </View>
              <Text style={styles.property} numberOfLines={1}>
                {c.propertyTitle}
              </Text>
              <View style={styles.top}>
                <Text style={[styles.preview, c.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                  {last.mine ? '✓ ' : ''}
                  {preview}
                </Text>
                {c.unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{c.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title={t('messages.empty')} hint={t('messages.emptyHint')} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, backgroundColor: colors.background },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 84 },
  row: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.card },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  time: { fontSize: 12, color: colors.textMuted },
  property: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  preview: { fontSize: 14, color: colors.textMuted, flex: 1 },
  previewUnread: { color: colors.text, fontWeight: '600' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800' },
});
