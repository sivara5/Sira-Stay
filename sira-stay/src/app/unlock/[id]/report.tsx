import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Banner } from '@/components/feedback';
import { TextField } from '@/components/text-field';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/strings';
import type { ReportReason, Unlock } from '@/lib/types';

const REASONS: ReportReason[] = ['wrong_number', 'not_reachable', 'not_owner', 'not_available', 'other'];
type Outcome = 'refund_pending' | 'credit' | 'pass_credit' | 'credit_returned';
const REPORTS_PER_MONTH = 2;

/**
 * "Report Wrong Details" within 48 hours (max 2 a month). ₹29 unlocks: free credit right away, or a
 * money refund reviewed by Sira Stay. Pass/credit unlocks get their credit back.
 */
export default function ReportWrongDetails() {
  const { id, method, price } = useLocalSearchParams<{ id: string; method: Unlock['method']; price: string }>();
  const { t, errorText } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [resolution, setResolution] = useState<'refund' | 'credit'>('refund');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const paid = method === 'payment';

  async function submit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ outcome: Outcome }>(`/unlocks/${id}/report`, {
        body: { reason, note, ...(paid && { resolution }) },
      });
      setOutcome(res.outcome);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Text style={styles.doneText}>{t(`report.done.${outcome}` as StringKey)}</Text>
          <Button title={t('common.back')} onPress={() => router.back()} style={styles.doneButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>{t('report.hint')}</Text>
        <Banner tone="warning" icon="information-circle-outline">
          {t('report.limitNote', { n: REPORTS_PER_MONTH })}
        </Banner>

        <Text style={styles.label}>{t('report.reason')}</Text>
        <View style={styles.chips}>
          {REASONS.map((r) => (
            <Chip key={r} label={t(`reason.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <TextField label={t('report.note')} value={note} onChangeText={setNote} multiline maxLength={300} />

        {paid ? (
          <>
            <Text style={styles.label}>{t('report.choose')}</Text>
            <Option
              selected={resolution === 'refund'}
              icon="cash-outline"
              title={t('report.refund', { price: rupees(Number(price)) })}
              hint={t('report.refundHint')}
              onPress={() => setResolution('refund')}
            />
            <Option
              selected={resolution === 'credit'}
              icon="gift-outline"
              title={t('report.credit')}
              hint={t('report.creditHint')}
              onPress={() => setResolution('credit')}
            />
          </>
        ) : (
          <Banner tone="info" icon="ticket-outline">
            {method === 'pass' ? t('report.passNote') : t('report.creditNote')}
          </Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </ScrollView>
      <View style={styles.footer}>
        <Button title={t('report.submit')} icon="flag" onPress={submit} loading={submitting} disabled={!reason} />
      </View>
    </SafeAreaView>
  );
}

function Option(props: { selected: boolean; icon: 'cash-outline' | 'gift-outline'; title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={[styles.option, props.selected && styles.optionSelected]}>
      <Ionicons name={props.icon} size={24} color={props.selected ? colors.primary : colors.textMuted} />
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{props.title}</Text>
        <Text style={styles.hint}>{props.hint}</Text>
      </View>
      <Ionicons name={props.selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={props.selected ? colors.primary : colors.border} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  flex: { flex: 1 },
  hint: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  doneText: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 24 },
  doneButton: { alignSelf: 'stretch' },
});
