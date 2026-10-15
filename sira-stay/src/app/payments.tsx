import { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Banner, EmptyState, ErrorView, Loading } from '@/components/feedback';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { formatDate, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Payment, RefundReason } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

const REASONS: RefundReason[] = ['duplicate', 'technical', 'withdrawn'];

export default function Payments() {
  const { t } = useI18n();
  const { data, error, loading, refreshing, refresh, reload } = useQuery<{ payments: Payment[] }>('/my/payments');

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  return (
    <FlatList
      data={data.payments}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={<Banner tone="info">{t('payments.policy')}</Banner>}
      renderItem={({ item }) => <PaymentCard payment={item} onChanged={reload} />}
      ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('payments.empty')} />}
    />
  );
}

function PaymentCard({ payment: p, onChanged }: { payment: Payment; onChanged: () => void }) {
  const { t, lang, errorText } = useI18n();
  const [choosing, setChoosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function request(reason: RefundReason) {
    setSubmitting(true);
    try {
      await api(`/payments/${p.id}/refund-request`, { body: { reason } });
      setChoosing(false);
      onChanged();
    } catch (err) {
      Alert.alert(t('common.error'), errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.purpose}>{p.purpose === 'unlock' ? t('payments.unlock') : t('payments.booking')}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {p.propertyTitle}
          </Text>
          {p.paidAt && <Text style={styles.muted}>{formatDate(p.paidAt, lang)}</Text>}
        </View>
        <Text style={styles.amount}>{rupees(p.amount)}</Text>
      </View>
      {p.isDuplicate && <Text style={styles.tag}>{t('payments.duplicateTag')}</Text>}
      {p.refundStatus ? (
        <Text style={[styles.refund, p.refundStatus === 'refunded' && { color: colors.success }]}>{t(`refundStatus.${p.refundStatus}`)}</Text>
      ) : choosing ? (
        <View style={styles.reasons}>
          <Text style={styles.muted}>{t('payments.chooseReason')}</Text>
          <View style={styles.chips}>
            {REASONS.map((r) => (
              <Chip key={r} label={t(`refund.${r}`)} onPress={() => !submitting && request(r)} />
            ))}
          </View>
          <Button title={t('common.cancel')} variant="ghost" small onPress={() => setChoosing(false)} />
        </View>
      ) : (
        <Button title={t('payments.requestRefund')} variant="outline" small icon="return-down-back-outline" onPress={() => setChoosing(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12, flexGrow: 1 },
  flex: { flex: 1, gap: 2 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: 'row', gap: 12 },
  purpose: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  amount: { fontSize: 18, fontWeight: '800', color: colors.text },
  tag: { fontSize: 12, fontWeight: '700', color: colors.danger },
  refund: { fontSize: 14, fontWeight: '700', color: colors.info },
  reasons: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
