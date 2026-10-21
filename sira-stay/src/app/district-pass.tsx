import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { DetailRow } from '@/components/detail-row';
import { Banner, ErrorView, Loading } from '@/components/feedback';
import { colors, radius, shadow } from '@/constants/theme';
import { api } from '@/lib/api';
import { DISTRICTS, districtLabel } from '@/lib/districts';
import { formatDateLong, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Checkout, PassStatus, PassSummary, Payment } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

type Dashboard = {
  passes: PassSummary[];
  freeCredits: number;
  pricing: { passPrice: number; passCredits: number; passDays: number; unlockPrice: number; unlockMonths: number };
};

const STATUS_TONE: Record<PassStatus, { bg: string; fg: string }> = {
  ACTIVE: { bg: colors.successSoft, fg: colors.success },
  FULLY_USED: { bg: colors.accentSoft, fg: '#92400E' },
  EXPIRED: { bg: colors.surface, fg: colors.textMuted },
};

/** District Pass dashboard + purchase (₹99, one district, 40 unlocks, 30 days). */
export default function DistrictPass() {
  const { t, lang, errorText } = useI18n();
  const { data, error, loading, refreshing, refresh, reload } = useQuery<Dashboard>('/my/district-passes');
  const [district, setDistrict] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;
  const { pricing } = data;
  const activeDistricts = new Set(data.passes.filter((p) => p.status === 'ACTIVE').map((p) => p.district));

  async function buy() {
    if (!district) return;
    setPaying(true);
    try {
      const res = await api<{ payment: Payment; checkout: Checkout }>('/payments', { body: { purpose: 'district_pass', district } });
      router.push({
        pathname: '/checkout/[paymentId]',
        params: { paymentId: res.payment.id, checkout: JSON.stringify(res.checkout), purpose: 'district_pass', propertyId: '' },
      });
    } catch (err) {
      Alert.alert(t('pay.failedTitle'), errorText(err));
      reload();
    } finally {
      setPaying(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
        <Banner tone="info" icon="ticket-outline">
          {t('pass.pitch', { credits: pricing.passCredits, days: pricing.passDays, price: rupees(pricing.passPrice) })}
        </Banner>

        <Text style={styles.sectionTitle}>{t('pass.mine')}</Text>
        {data.passes.length === 0 ? (
          <Text style={styles.muted}>{t('pass.none')}</Text>
        ) : (
          data.passes.map((p) => <PassCard key={p.id} pass={p} />)
        )}
        {data.freeCredits > 0 && (
          <View style={styles.credits}>
            <Ionicons name="gift-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.creditsText}>{t('pass.freeCredits', { n: data.freeCredits })}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('pass.buy')}</Text>
        <Text style={styles.muted}>{t('pass.chooseDistrict')}</Text>
        <View style={styles.chips}>
          {DISTRICTS.map((d) => (
            <Chip
              key={d.name}
              label={districtLabel(d.name, lang)}
              icon={activeDistricts.has(d.name) ? 'checkmark-circle' : 'location-outline'}
              selected={district === d.name}
              onPress={() => !activeDistricts.has(d.name) && setDistrict(d.name)}
            />
          ))}
        </View>
        <Text style={styles.rules}>{t('pass.rules', { months: pricing.unlockMonths })}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={
            district
              ? t('pass.payCta', { price: rupees(pricing.passPrice), district: districtLabel(district, lang) })
              : t('pass.pickFirst')
          }
          icon="lock-closed"
          onPress={buy}
          loading={paying}
          disabled={!district}
        />
      </View>
    </SafeAreaView>
  );
}

function PassCard({ pass }: { pass: PassSummary }) {
  const { t, lang } = useI18n();
  const tone = STATUS_TONE[pass.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={styles.district}>{districtLabel(pass.district, lang)}</Text>
          <Text style={styles.muted}>{t('pass.title')}</Text>
        </View>
        <View style={[styles.status, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusText, { color: tone.fg }]}>{t(`pass.status.${pass.status}`)}</Text>
        </View>
      </View>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${(pass.usedCredits / pass.totalCredits) * 100}%` }]} />
      </View>
      <DetailRow label={t('pass.total')} value={String(pass.totalCredits)} />
      <DetailRow label={t('pass.used')} value={String(pass.usedCredits)} />
      <DetailRow label={t('pass.remaining')} value={String(pass.remainingCredits)} strong />
      <DetailRow label={t('pass.activated')} value={formatDateLong(pass.activatedAt, lang)} />
      <DetailRow label={t('pass.expires')} value={formatDateLong(pass.expiresAt, lang)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 14 },
  flex: { flex: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 6 },
  muted: { fontSize: 14, color: colors.textMuted },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 10, ...shadow.card },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  district: { fontSize: 19, fontWeight: '800', color: colors.text },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 12, fontWeight: '800' },
  progress: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.primary },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, padding: 12, borderRadius: radius.md },
  creditsText: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rules: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  footer: { padding: 16, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
});
