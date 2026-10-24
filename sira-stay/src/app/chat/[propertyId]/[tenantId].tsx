import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, ErrorView, Loading } from '@/components/feedback';
import { KeyboardAvoidingContainer } from '@/components/keyboard-aware-scroll-view';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Message } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

type Thread = { propertyTitle: string; otherName: string; ownerAvailable?: boolean; messages: Message[] };

export default function Chat() {
  const { propertyId, tenantId } = useLocalSearchParams<{ propertyId: string; tenantId: string }>();
  const { t, lang, errorText } = useI18n();
  const path = `/conversations/${propertyId}/${tenantId}`;
  const { data, error, loading, reload, setData } = useQuery<Thread>(path, { pollMs: 5000 });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  async function send() {
    const body = text.trim();
    if (!body || !data) return;
    setSending(true);
    setSendError(null);
    try {
      const { message } = await api<{ message: Message }>(path, { body: { body } });
      setData({ ...data, messages: [...data.messages, message] });
      setText('');
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: data.otherName }} />
      {/* The message box rises above the keyboard, and the list shrinks to the space left. */}
      <KeyboardAvoidingContainer style={styles.flex}>
        <View style={styles.propertyBar}>
          <Ionicons name="home-outline" size={14} color={colors.primary} />
          <Text style={styles.propertyText} numberOfLines={1}>
            {data.propertyTitle}
          </Text>
        </View>
        {data.ownerAvailable === false && (
          <View style={styles.bannerWrap}>
            <Banner tone="warning" title={t('prop.ownerUnavailable')} icon="time-outline">
              {t('prop.ownerUnavailableHint')}
            </Banner>
          </View>
        )}
        <FlatList
          ref={listRef}
          data={data.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          // Keep the latest messages in view when the keyboard opens and the list gets shorter.
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) =>
            m.system ? (
              <View style={styles.system}>
                <Ionicons name="call-outline" size={14} color={colors.warning} />
                <Text style={styles.systemText}>
                  {m.kind === 'missed_call' ? t('messages.missedCallBody') : m.body} · {formatTime(m.createdAt, lang)}
                </Text>
              </View>
            ) : (
              <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, m.mine && styles.mineText]}>{m.body}</Text>
                <Text style={[styles.time, m.mine && styles.mineTime]}>{formatTime(m.createdAt, lang)}</Text>
              </View>
            )
          }
        />
        {sendError && <Text style={styles.error}>{sendError}</Text>}
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('messages.placeholder')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            selectionColor={colors.primary}
            keyboardAppearance="dark"
            multiline
            maxLength={1000}
          />
          <Pressable
            accessibilityRole="button"
            onPress={send}
            disabled={sending || !text.trim()}
            style={[styles.send, (sending || !text.trim()) && styles.sendDisabled]}>
            <Ionicons name="send" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  propertyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
  },
  propertyText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.primaryLight },
  bannerWrap: { padding: 12, paddingBottom: 0 },
  messages: { padding: 12, gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  mineText: { color: colors.onPrimary },
  time: { fontSize: 11, color: colors.textMuted, alignSelf: 'flex-end' },
  mineTime: { color: 'rgba(12, 13, 18, 0.6)' },
  system: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  systemText: { fontSize: 12, color: colors.warning, flexShrink: 1 },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: 16 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
});
