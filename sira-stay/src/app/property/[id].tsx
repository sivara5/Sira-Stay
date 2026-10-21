import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApproxMap } from '@/components/approx-map';
import { Button } from '@/components/button';
import { categoryIcon } from '@/components/category-tabs';
import { Banner, ErrorView } from '@/components/feedback';
import { SavedNote } from '@/components/network-banner';
import { ProgressiveImage } from '@/components/progressive-image';
import { PropertyDetailSkeleton } from '@/components/skeleton';
import { FavoriteButton } from '@/components/favorite-button';
import { RatingBadge } from '@/components/rating';
import { StatusBadge } from '@/components/status-badge';
import { colors, radius } from '@/constants/theme';
import { ApiError, api, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { districtLabel } from '@/lib/districts';
import { formatDate, formatDateLong, formatPhone, hoursUntil, rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Checkout, Payment, PropertyDetail } from '@/lib/types';
import { useQuery } from '@/lib/use-query';

export default function PropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload, setData, savedAt } = useQuery<{ property: PropertyDetail }>(`/properties/${id}`);
  const [busy, setBusy] = useState<'pay' | 'buyPass' | 'pass' | 'credit' | null>(null);
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

  if (loading && !data) return <PropertyDetailSkeleton />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;
  const p = data.property;
  const canBook = !p.isOwner && user?.role !== 'owner' && p.status !== 'WITHDRAWN';

  /** ₹29 single unlock or ₹99 District Pass → Razorpay checkout; the server verifies the payment. */
  async function pay(body: { purpose: 'unlock' | 'district_pass'; propertyId?: string; district?: string }, key: 'pay' | 'buyPass') {
    setBusy(key);
    try {
      const res = await api<{ payment: Payment; checkout: Checkout }>('/payments', { body });
      router.push({
        pathname: '/checkout/[paymentId]',
        params: { paymentId: res.payment.id, checkout: JSON.stringify(res.checkout), purpose: body.purpose, propertyId: p.id },
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'ALREADY_UNLOCKED')) Alert.alert(t('pay.failedTitle'), errorText(err));
      reload();
    } finally {
      setBusy(null);
    }
  }

  /** Unlock with a District Pass credit or a free unlock credit — no payment. */
  async function unlockWith(method: 'pass' | 'credit') {
    setBusy(method);
    try {
      setData(await api<{ property: PropertyDetail }>('/unlocks', { body: { propertyId: p.id, method } }));
    } catch (err) {
      Alert.alert(t('common.error'), errorText(err));
      reload();
    } finally {
      setBusy(null);
    }
  }

  const options = p.unlockOptions;

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
          <SavedNote savedAt={savedAt} />
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

        {/* Owner contact: locked until unlocked (₹29, District Pass credit or free credit) for 6 months */}
        <View style={styles.section}>
          {p.isOwner ? (
            <Banner tone="info" icon="home">
              {t('prop.yourListing')}
            </Banner>
          ) : owner ? (
            <View style={styles.ownerCard}>
              <Text style={styles.sectionTitle}>{t('prop.ownerContact')}</Text>
              {p.unlock && (
                <View style={styles.unlockedTill}>
                  <Ionicons name="lock-open" size={14} color={colors.success} />
                  <Text style={styles.unlockedTillText}>{t('prop.unlockedTill', { date: formatDateLong(p.unlock.expiresAt, lang) })}</Text>
                </View>
              )}
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
              {p.unlock?.canReport && (
                <Button
                  title={t('prop.reportWrong', { hours: hoursUntil(p.unlock.reportDeadline) })}
                  icon="flag-outline"
                  variant="ghost"
                  small
                  onPress={() =>
                    router.push({
                      pathname: '/unlock/[id]/report',
                      params: { id: p.unlock!.id, method: p.unlock!.method, price: String(options.price) },
                    })
                  }
                />
              )}
            </View>
          ) : (
            <View style={styles.unlockCard}>
              <View style={styles.unlockHeader}>
                <View style={styles.lockIcon}>
                  <Ionicons name="lock-closed" size={20} color={colors.white} />
                </View>
                <Text style={styles.unlockTitle}>{t('prop.unlockTitle')}</Text>
              </View>
              <Text style={styles.unlockBody}>{t('prop.unlockBody', { months: options.unlockMonths })}</Text>
              <View style={styles.masked}>
                <Text style={styles.maskedText}>👤 ••••••••</Text>
                <Text style={styles.maskedText}>📞 +91 ••••• •••••</Text>
                <Text style={styles.maskedText}>💬 WhatsApp ••••• •••••</Text>
              </View>
              {p.status !== 'WITHDRAWN' &&
                (options.pass ? (
                  <>
                    <Banner tone="success" icon="ticket-outline">
                      {t('prop.passCovers', { district: districtLabel(options.pass.district, lang) })}
                    </Banner>
                    <Button
                      title={t('prop.unlockWithPass', { n: options.pass.remainingCredits })}
                      icon="ticket"
                      onPress={() => unlockWith('pass')}
                      loading={busy === 'pass'}
                      disabled={busy !== null}
                    />
                  </>
                ) : (
                  <>
                    {options.freeCredits > 0 && (
                      <Button
                        title={t('prop.unlockWithCredit', { n: options.freeCredits })}
                        icon="gift-outline"
                        onPress={() => unlockWith('credit')}
                        loading={busy === 'credit'}
                        disabled={busy !== null}
                      />
                    )}
                    <Button
                      title={t('prop.unlockCta', { price: rupees(options.price) })}
                      icon="lock-open"
                      variant={options.freeCredits > 0 ? 'outline' : 'primary'}
                      onPress={() => pay({ purpose: 'unlock', propertyId: p.id }, 'pay')}
                      loading={busy === 'pay'}
                      disabled={busy !== null}
                    />
                    {options.district && (
                      <Pressable
                        style={({ pressed }) => [styles.passOffer, pressed && styles.passOfferPressed]}
                        disabled={busy !== null}
                        onPress={() => pay({ purpose: 'district_pass', district: options.district! }, 'buyPass')}
                        accessibilityRole="button">
                        <Ionicons name="ticket-outline" size={22} color={colors.primaryDark} />
                        <View style={styles.flex}>
                          <Text style={styles.passOfferTitle}>{t('prop.passOffer', { price: rupees(options.passPrice) })}</Text>
                          <Text style={styles.passOfferBody}>
                            {t('prop.passOfferBody', {
                              credits: options.passCredits,
                              district: districtLabel(options.district, lang),
                              days: options.passDays,
                            })}
                          </Text>
                        </View>
                        {busy === 'buyPass' ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : (
                          <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
                        )}
                      </Pressable>
                    )}
                  </>
                ))}
              <Text style={styles.policy}>{t('prop.refundPolicy', { hours: options.reportHours })}</Text>
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
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(next);
          // Fetch the next photo in the background so the following swipe is instant.
          const upcoming = photos[next + 1];
          if (upcoming) Image.prefetch(mediaUrl(upcoming.large) ?? '', { cachePolicy: 'memory-disk' }).catch(() => {});
        }}
        renderItem={({ item, index: i }) => (
          // First 2 photos load first; the rest are mounted (and downloaded) only as you swipe.
          <ProgressiveImage photo={item} size="large" priority={i < 2 ? 'high' : 'low'} style={{ width, height: width * 0.7 }} />
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
  passOffer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  passOfferPressed: { backgroundColor: colors.primarySoft },
  passOfferTitle: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  passOfferBody: { fontSize: 13, color: colors.textMuted },
  unlockedTill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  unlockedTillText: { fontSize: 13, fontWeight: '700', color: colors.success },
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
