import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApproxMap } from '@/components/approx-map';
import { Button } from '@/components/button';
import { categoryIcon } from '@/components/category-tabs';
import { Banner, ErrorView, Loading } from '@/components/feedback';
import { FavoriteButton } from '@/components/favorite-button';
import { RatingBadge } from '@/components/rating';
import { StatusBadge } from '@/components/status-badge';
import { colors, radius } from '@/constants/theme';
import { ApiError, api, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatPhone, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Checkout, Payment, PropertyDetail } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function PropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } = useQuery<{ property: PropertyDetail }>(`/properties/${id}`);
  const [paying, setPaying] = useState(false);
  const [ownerUnreachable, setOwnerUnreachable] = useState(false);
  const callStarted = useRef(false);

  const askIfOwnerAnswered = useEffectEvent(() => {
    const report = (answered: boolean) => {
      if (!answered) setOwnerUnreachable(true);
      api(`/properties/${id}/contact-attempt`, { body: { answered } }).catch(() => {});
    };
    Alert.alert(t('prop.didAnswer'), undefined, [
      { text: t('common.no'), style: 'cancel', onPress: () => report(false) },
      { text: t('common.yes'), onPress: () => report(true) },
    ]);
  });

  // When the tenant comes back from the phone dialer, ask whether the owner picked up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && callStarted.current) {
        callStarted.current = false;
        askIfOwnerAnswered();
      }
    });
    return () => sub.remove();
  }, []);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;
  const p = data.property;
  const canBook = !p.isOwner && user?.role !== 'owner' && p.status !== 'WITHDRAWN';

  async function unlock() {
    setPaying(true);
    try {
      const res = await api<{ payment: Payment; checkout: Checkout }>('/payments', { body: { purpose: 'unlock', propertyId: p.id } });
      router.push({
        pathname: '/checkout/[paymentId]',
        params: { paymentId: res.payment.id, checkout: JSON.stringify(res.checkout), purpose: 'unlock', propertyId: p.id },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_UNLOCKED') reload();
      else Alert.alert(t('pay.failedTitle'), errorText(err));
    } finally {
      setPaying(false);
    }
  }

  const owner = p.owner;
  const showUnavailable = Boolean(owner && !p.isOwner && (!owner.available || ownerUnreachable));
  const openChat = () => user && router.push(`/chat/${p.id}/${user.id}`);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <PhotoCarousel photos={p.photos} />
          {!p.isOwner && (
            <View style={styles.favorite}>
              <FavoriteButton propertyId={p.id} favorite={p.favorite} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.badges}>
            <View style={styles.categoryBadge}>
              <Ionicons name={categoryIcon[p.category]} size={14} color={colors.primaryDark} />
              <Text style={styles.categoryText}>{t(`cat.${p.category}`)}</Text>
            </View>
            <StatusBadge status={p.status} />
            {p.verified && <VerifiedTag label={t('card.verified')} />}
          </View>
          <Text style={styles.title}>{p.title}</Text>
          <RatingBadge rating={p.rating} large />
          <View style={styles.line}>
            <Ionicons name="location-outline" size={16} color={colors.textMuted} />
            <Text style={styles.muted}>
              {p.area}, {p.district}
            </Text>
          </View>
          <View style={styles.line}>
            <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
            <Text style={styles.muted}>{t('card.near', { landmark: p.landmark })}</Text>
          </View>
          <Text style={styles.rent}>
            {rupees(p.rent)}
            <Text style={styles.perMonth}> {t('common.perMonth')}</Text>
          </Text>
        </View>

        {p.status === 'WITHDRAWN' && (
          <View style={styles.sectionTight}>
            <Banner tone="danger">{t('prop.withdrawn')}</Banner>
          </View>
        )}

        <View style={styles.grid}>
          <InfoTile label={t('prop.deposit')} value={rupees(p.deposit)} />
          <InfoTile label={t('prop.bookingAmount')} value={rupees(p.bookingAmount)} />
          <InfoTile label={t('prop.furnishing')} value={t(`furn.${p.furnishing}`)} />
          <InfoTile
            label={t('prop.availableFrom')}
            value={p.availableFrom ? formatDate(p.availableFrom, lang) : t('prop.availableNow')}
          />
        </View>

        {/* Owner contact: locked until the ₹9 unlock */}
        <View style={styles.section}>
          {p.isOwner ? (
            <Banner tone="info" icon="home">
              {t('prop.yourListing')}
            </Banner>
          ) : owner ? (
            <View style={styles.ownerCard}>
              <Text style={styles.sectionTitle}>{t('prop.ownerContact')}</Text>
              <View style={styles.ownerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(owner.name ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.ownerName}>{owner.name}</Text>
                  <Text style={styles.muted}>
                    {t('prop.phone')}: {formatPhone(owner.phone)}
                  </Text>
                  <Text style={styles.muted}>
                    {t('prop.whatsapp')}: {formatPhone(owner.whatsapp)}
                  </Text>
                </View>
              </View>
              {showUnavailable && (
                <Banner tone="warning" title={t('prop.ownerUnavailable')} icon="time-outline">
                  {t('prop.ownerUnavailableHint')}
                </Banner>
              )}
              <View style={styles.contactButtons}>
                <Button
                  title={t('prop.call')}
                  icon="call"
                  small
                  style={styles.flex}
                  onPress={() => {
                    callStarted.current = true;
                    Linking.openURL(`tel:${owner.phone}`);
                  }}
                />
                <Button
                  title={t('prop.whatsapp')}
                  icon="logo-whatsapp"
                  variant="whatsapp"
                  small
                  style={styles.flex}
                  onPress={() =>
                    Linking.openURL(
                      `https://wa.me/${owner.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(t('prop.whatsappGreeting', { title: p.title }))}`,
                    )
                  }
                />
              </View>
              <Button
                title={showUnavailable ? t('prop.messageLater') : t('prop.message')}
                icon="chatbubble-ellipses-outline"
                variant={showUnavailable ? 'primary' : 'secondary'}
                small
                onPress={openChat}
              />
            </View>
          ) : (
            <View style={styles.unlockCard}>
              <View style={styles.unlockHeader}>
                <View style={styles.lockIcon}>
                  <Ionicons name="lock-closed" size={20} color={colors.white} />
                </View>
                <Text style={styles.unlockTitle}>{t('prop.unlockTitle')}</Text>
              </View>
              <Text style={styles.unlockBody}>{t('prop.unlockBody')}</Text>
              <View style={styles.masked}>
                <Text style={styles.maskedText}>👤 ••••••••</Text>
                <Text style={styles.maskedText}>📞 +91 ••••• •••••</Text>
                <Text style={styles.maskedText}>💬 WhatsApp ••••• •••••</Text>
              </View>
              {p.status !== 'WITHDRAWN' && <Button title={t('prop.unlockCta')} icon="lock-open" onPress={unlock} loading={paying} />}
              <Text style={styles.policy}>{t('prop.refundPolicy')}</Text>
            </View>
          )}
        </View>

        {p.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('prop.about')}</Text>
            <Text style={styles.body}>{p.description}</Text>
          </View>
        ) : null}

        {p.amenities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('prop.amenities')}</Text>
            <View style={styles.amenities}>
              {p.amenities.map((a) => (
                <View key={a} style={styles.amenity}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  <Text style={styles.amenityText}>{t(`amen.${a}`)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('prop.location')}</Text>
          <View style={styles.mapCard}>
            <ApproxMap approx={p.approxLocation} exact={p.exactLocation} title={p.title} />
          </View>
          {p.exactLocation ? (
            <View style={styles.line}>
              <Ionicons name="home-outline" size={16} color={colors.text} />
              <Text style={styles.body}>
                {t('prop.exactAddress')}: {p.exactLocation.address}
              </Text>
            </View>
          ) : (
            <Text style={styles.hint}>{t('prop.approxNote')}</Text>
          )}
        </View>

        {p.bookedPeriods.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('prop.bookedPeriods')}</Text>
            {p.bookedPeriods.map((b) => (
              <Text key={b.moveInDate} style={styles.body}>
                • {formatDate(b.moveInDate, lang)} – {formatDate(b.endDate, lang)}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      {canBook && (
        <View style={styles.bottomBar}>
          <View style={styles.flex}>
            <Text style={styles.bottomLabel}>{t('prop.bookingAmount')}</Text>
            <Text style={styles.bottomAmount}>{rupees(p.bookingAmount)}</Text>
          </View>
          <Button title={t('prop.bookNow')} onPress={() => router.push(`/book/${p.id}`)} style={styles.bookButton} />
        </View>
      )}
    </SafeAreaView>
  );
}

function PhotoCarousel({ photos }: { photos: PropertyDetail['photos'] }) {
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(photo) => photo.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={2}
        windowSize={3}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Image source={{ uri: mediaUrl(item.url) }} style={{ width, height: width * 0.7 }} contentFit="cover" transition={150} />
        )}
      />
      {photos[index] && (
        <>
          <View style={[styles.photoMeta, styles.photoKind]}>
            <Text style={styles.photoMetaText}>{t(`photo.${photos[index].kind}`)}</Text>
          </View>
          <View style={[styles.photoMeta, styles.photoCounter]} accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}>
            <Text style={styles.photoCounterText}>{t('prop.photoOf', { n: index + 1, total: photos.length })}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function VerifiedTag({ label }: { label: string }) {
  return (
    <View style={styles.verified}>
      <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
      <Text style={styles.verifiedText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 24 },
  flex: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 18, gap: 8 },
  sectionTight: { paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  categoryText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  muted: { fontSize: 15, color: colors.textMuted, flexShrink: 1 },
  rent: { fontSize: 26, fontWeight: '900', color: colors.text, marginTop: 4 },
  perMonth: { fontSize: 15, fontWeight: '500', color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, gap: 2 },
  tileLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  tileValue: { fontSize: 16, color: colors.text, fontWeight: '700' },
  body: { fontSize: 15, color: colors.text, lineHeight: 22, flexShrink: 1 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  amenity: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '46%' },
  amenityText: { fontSize: 14, color: colors.text },
  mapCard: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  unlockCard: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft, padding: 16, gap: 12 },
  unlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  unlockTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.primaryDark },
  unlockBody: { fontSize: 15, color: colors.text, lineHeight: 21 },
  masked: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, gap: 6 },
  maskedText: { fontSize: 15, color: colors.textMuted, letterSpacing: 1 },
  policy: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  ownerCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 20, fontWeight: '800' },
  ownerName: { fontSize: 17, fontWeight: '700', color: colors.text },
  contactButtons: { flexDirection: 'row', gap: 10 },
  photoMeta: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: colors.overlay,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  photoKind: { left: 12 },
  photoCounter: { right: 12, paddingHorizontal: 12 },
  photoMetaText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  photoCounterText: { color: colors.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  favorite: { position: 'absolute', top: 12, right: 12 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  bottomLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  bottomAmount: { fontSize: 20, fontWeight: '900', color: colors.text },
  bookButton: { paddingHorizontal: 28 },
});
