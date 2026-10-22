import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorView, Loading } from '@/components/feedback';
import { cardStyle, colors, radius } from '@/constants/theme';
import { api, mediaUrl } from '@/lib/api';
import { districtLabel } from '@/lib/districts';
import { formatDate, formatTime, hoursUntil, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/strings';
import type { AdminOverview, AdminReport } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

/** Admin: approve/reject wrong-details money refunds, verify listings, restore hidden listings, read notifications. */
export default function AdminReports() {
  const { t, lang, errorText } = useI18n();
  const { data, error, loading, refreshing, refresh, reload, setData } = useQuery<AdminOverview>('/admin/reports', { pollMs: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;
  const listings = data.listings ?? [];

  async function act(key: string, path: string) {
    setBusy(key);
    try {
      setData(await api<AdminOverview>(path, { method: 'POST' }));
    } catch (err) {
      Alert.alert(t('common.error'), errorText(err));
      reload();
    } finally {
      setBusy(null);
    }
  }

  const when = (iso: string) => `${formatDate(iso, lang)} · ${formatTime(iso, lang)}`;
  const reasonText = (reason: string) => {
    const [code, ...note] = reason.split(': ');
    const key = `reason.${code}` as StringKey;
    return [t(key), note.join(': ')].filter(Boolean).join(' — ');
  };

  function approve(r: AdminReport) {
    const amount = rupees(r.amount ?? 0);
    Alert.alert(t('admin.approve', { amount }), t('admin.approveConfirm', { amount, email: r.tenant.email }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('admin.approve', { amount }), onPress: () => act(r.id, `/admin/reports/${r.id}/approve`) },
    ]);
  }

  function reject(r: AdminReport) {
    Alert.alert(t('admin.reject'), t('admin.rejectConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('admin.reject'), style: 'destructive', onPress: () => act(r.id, `/admin/reports/${r.id}/reject`) },
    ]);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      <Section title={t('admin.pending')} count={data.pending.length}>
        {data.pending.length === 0 ? (
          <Text style={styles.muted}>{t('admin.noPending')}</Text>
        ) : (
          data.pending.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.title}>{r.property.title}</Text>
              <Text style={styles.muted}>
                {r.property.area}, {districtLabel(r.property.district, lang)}
              </Text>
              <Line icon="person-outline" text={r.tenant.email} />
              <Line icon="alert-circle-outline" text={reasonText(r.reason)} />
              <Line icon="time-outline" text={when(r.reportedAt)} />
              {r.reviewDeadline && (
                <View style={styles.deadline}>
                  <Ionicons name="hourglass-outline" size={14} color={colors.warning} />
                  <Text style={styles.deadlineText}>{t('admin.autoCreditIn', { hours: hoursUntil(r.reviewDeadline) })}</Text>
                </View>
              )}
              <View style={styles.actions}>
                <Button
                  title={t('admin.approve', { amount: rupees(r.amount ?? 0) })}
                  icon="checkmark"
                  small
                  style={styles.flex}
                  loading={busy === r.id}
                  disabled={busy !== null}
                  onPress={() => approve(r)}
                />
                <Button title={t('admin.reject')} icon="close" variant="danger" small style={styles.flex} disabled={busy !== null} onPress={() => reject(r)} />
              </View>
            </View>
          ))
        )}
      </Section>

      <Section title={t('admin.listings')} count={listings.length}>
        {listings.length === 0 ? (
          <Text style={styles.muted}>{t('admin.noListings')}</Text>
        ) : (
          listings.map((l) => (
            <View key={l.id} style={styles.card}>
              <Text style={styles.title}>{l.title}</Text>
              <Text style={styles.muted}>
                {l.area}, {districtLabel(l.district, lang)}
              </Text>
              <Line icon="person-outline" text={l.owner.name ? `${l.owner.name} · ${l.owner.email}` : l.owner.email} />
              <Line icon="shield-checkmark-outline" text={t('admin.ownerKyc', { status: t(`kyc.${l.owner.kycStatus}`) })} />
              <Line icon="document-text-outline" text={l.docType ? t(`doc.${l.docType}` as StringKey) : t('admin.noDocument')} />
              {l.documentUrl && (
                <Button
                  title={t('admin.viewDocument')}
                  icon="open-outline"
                  variant="outline"
                  small
                  onPress={() => WebBrowser.openBrowserAsync(mediaUrl(l.documentUrl) ?? '')}
                />
              )}
              <View style={styles.actions}>
                <Button
                  title={l.documentChecked ? t('admin.documentDone') : t('admin.markDocument')}
                  icon={l.documentChecked ? 'checkmark-circle' : 'document-text-outline'}
                  variant="secondary"
                  small
                  style={styles.flex}
                  loading={busy === `${l.id}:doc`}
                  disabled={busy !== null || l.documentChecked || !l.documentUrl}
                  onPress={() => act(`${l.id}:doc`, `/admin/properties/${l.id}/document-checked`)}
                />
                <Button
                  title={l.adminVerified ? t('admin.verifiedDone') : t('admin.markVerified')}
                  icon={l.adminVerified ? 'checkmark-circle' : 'shield-checkmark-outline'}
                  small
                  style={styles.flex}
                  loading={busy === `${l.id}:verify`}
                  disabled={busy !== null || l.adminVerified}
                  onPress={() => act(`${l.id}:verify`, `/admin/properties/${l.id}/verify`)}
                />
              </View>
            </View>
          ))
        )}
      </Section>

      <Section title={t('admin.hidden')} count={data.hiddenProperties.length}>
        {data.hiddenProperties.length === 0 ? (
          <Text style={styles.muted}>{t('admin.noHidden')}</Text>
        ) : (
          data.hiddenProperties.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.muted}>
                {p.area}, {districtLabel(p.district, lang)}
              </Text>
              <Line icon="flag-outline" text={t('admin.reporters', { n: p.reporters })} />
              <Button
                title={t('admin.restore')}
                icon="eye-outline"
                variant="secondary"
                small
                loading={busy === p.id}
                disabled={busy !== null}
                onPress={() => act(p.id, `/admin/properties/${p.id}/restore`)}
              />
            </View>
          ))
        )}
      </Section>

      <Section title={t('admin.notifications')} count={data.unreadNotifications}>
        {data.unreadNotifications > 0 && (
          <Button title={t('admin.markRead')} variant="ghost" small onPress={() => act('read', '/admin/notifications/read')} />
        )}
        {data.notifications.map((n) => (
          <View key={n.id} style={[styles.note, !n.readAt && styles.noteUnread]}>
            <Text style={[styles.noteTitle, !n.readAt && styles.bold]}>{n.title}</Text>
            <Text style={styles.noteBody}>{n.body}</Text>
            <Text style={styles.small}>
              {when(n.createdAt)} · {n.channel === 'email' ? t('admin.viaEmail') : t('admin.viaConsole')}
            </Text>
          </View>
        ))}
      </Section>

      <Section title={t('admin.recent')}>
        {data.reports.length === 0 ? (
          <Text style={styles.muted}>{t('admin.noReports')}</Text>
        ) : (
          data.reports.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {r.property.title}
                </Text>
                <Text style={styles.small} numberOfLines={1}>
                  {r.tenant.email} · {reasonText(r.reason)}
                </Text>
                <Text style={styles.small}>
                  {t(`resolution.${r.resolution}`)}
                  {r.reviewStatus ? ` · ${t(`review.${r.reviewStatus}`)}` : ''} · {when(r.reportedAt)}
                </Text>
              </View>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

type LineIcon = 'person-outline' | 'alert-circle-outline' | 'time-outline' | 'flag-outline' | 'shield-checkmark-outline' | 'document-text-outline';

function Line({ icon, text }: { icon: LineIcon; text: string }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 22 },
  flex: { flex: 1 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  card: { ...cardStyle, padding: 14, gap: 6 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  small: { fontSize: 12, color: colors.textMuted },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  deadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
  },
  deadlineText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  note: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.border },
  noteUnread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  noteTitle: { fontSize: 14, color: colors.text },
  bold: { fontWeight: '800' },
  noteBody: { fontSize: 13, color: colors.text, lineHeight: 19 },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
});
