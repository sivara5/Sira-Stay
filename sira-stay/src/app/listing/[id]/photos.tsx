import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Banner, ErrorView, Loading } from '@/components/feedback';
import { ProgressiveImage } from '@/components/progressive-image';
import { colors, radius } from '@/constants/theme';
import { api, filePart } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { MAX_PHOTOS, MIN_PHOTOS, filterPicked, photoKey } from '@/lib/photo-rules';
import { choosePhotos, takePhoto, type PickedImage } from '@/lib/pick-image';
import type { PropertyDetail } from '@/lib/types';
import { PhotoPrepError, prepareUploadPhotos } from '@/lib/upload-photos';
import { useQuery } from '@/lib/use-query';

type Notice = { tone: 'success' | 'warning' | 'danger'; text: string };

/** Owner adds (up to 20 total) or removes photos of one listing, and picks the main photo. */
export default function ManagePhotos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorText } = useI18n();
  const { width } = useWindowDimensions();
  const { data, error, loading, reload, setData } = useQuery<{ property: PropertyDetail }>(`/properties/${id}`);
  const [pending, setPending] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorView error={error} onRetry={reload} />;

  const property = data.property;
  const photos = property.photos;
  const total = photos.length + pending.length;
  const room = MAX_PHOTOS - total;
  const thumb = (width - 32 - 20) / 3;

  const showPhotos = (next: PropertyDetail['photos']) =>
    setData({ property: { ...property, photos: next, photoCount: next.length, coverPhoto: next[0]?.url ?? null } });

  async function run(key: string, request: () => Promise<{ photos: PropertyDetail['photos'] }>, success?: string) {
    setBusy(key);
    setNotices([]);
    try {
      showPhotos((await request()).photos);
      if (success) setNotices([{ tone: 'success', text: success }]);
      return true;
    } catch (err) {
      const text = err instanceof PhotoPrepError ? t('new.photoPrepFailed', { n: err.index + 1 }) : errorText(err);
      setNotices([{ tone: 'danger', text }]);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function addPicked(picked: PickedImage[]) {
    const { accepted, duplicates, lowRes } = filterPicked(picked, new Set(pending.map(photoKey)), room);
    const next: Notice[] = [];
    if (duplicates) next.push({ tone: 'warning', text: t('new.duplicateSkipped', { n: duplicates }) });
    if (lowRes) next.push({ tone: 'warning', text: t('new.lowResSkipped', { n: lowRes }) });
    setNotices(next);
    setPending((list) => [...list, ...accepted]);
  }

  async function upload() {
    const ok = await run(
      'upload',
      async () => {
        const form = new FormData();
        const files = await prepareUploadPhotos(pending); // JPEG, no GPS/EXIF (HEIC included)
        files.forEach((f) => form.append('photos', filePart(f.uri, f.name, f.type)));
        return api<{ photos: PropertyDetail['photos'] }>(`/properties/${property.id}/photos`, { form });
      },
      t('photos.uploaded'),
    );
    if (ok) setPending([]);
  }

  function remove(photoId: string) {
    Alert.alert(t('photos.remove'), t('photos.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('photos.remove'),
        style: 'destructive',
        onPress: () => run(photoId, () => api(`/properties/${property.id}/photos/${photoId}`, { method: 'DELETE' })),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {property.title}
        </Text>
        <Banner tone="warning" title={t('new.indoorOnly')} icon="eye-off-outline">
          {t('new.indoorOnlyBody')}
        </Banner>
        <Banner tone="info" title={t('new.photoRules')} icon="images-outline">
          {t('new.photoRulesBody')}
        </Banner>

        <View style={styles.countRow}>
          <Text style={[styles.count, total >= MIN_PHOTOS && styles.countOk]}>{t('new.photoCount', { n: total })}</Text>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${(total / MAX_PHOTOS) * 100}%` }]} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('photos.current')}</Text>
        <Text style={styles.hint}>{t('photos.mainHint')}</Text>
        {photos.some((p) => p.kind === 'exterior') && <Text style={styles.hint}>{t('photos.exteriorHidden')}</Text>}
        <View style={styles.grid}>
          {photos.map((p, i) => (
            <Pressable
              key={p.id}
              style={{ width: thumb, height: thumb }}
              disabled={i === 0 || busy !== null}
              onPress={() => run(p.id, () => api(`/properties/${property.id}/photos/${p.id}/main`, { method: 'POST' }))}
              accessibilityLabel={i === 0 ? t('photos.main') : `${t(`photo.${p.kind}`)} ${i + 1}`}>
              <ProgressiveImage photo={p} style={[styles.thumb, busy === p.id && styles.thumbBusy]} />
              {i === 0 && (
                <View style={styles.mainBadge}>
                  <Ionicons name="star" size={10} color={colors.onPrimary} />
                  <Text style={styles.mainText}>{t('photos.main')}</Text>
                </View>
              )}
              <Pressable style={styles.remove} hitSlop={8} onPress={() => remove(p.id)} accessibilityLabel={t('photos.remove')}>
                <Ionicons name="close" size={14} color={colors.white} />
              </Pressable>
              <View style={[styles.kind, p.kind === 'exterior' && styles.kindExterior]}>
                {/* Exterior photos are hidden from tenants until they unlock. */}
                {p.kind === 'exterior' && <Ionicons name="lock-closed" size={10} color={colors.onPrimary} />}
                <Text style={[styles.kindText, p.kind === 'exterior' && styles.kindTextExterior]}>{t(`photo.${p.kind}`)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <Button
            title={t('new.addPhotos')}
            icon="images-outline"
            variant="outline"
            small
            style={styles.flex}
            disabled={room <= 0}
            onPress={async () => addPicked(await choosePhotos(room))}
          />
          <Button
            title={t('new.camera')}
            icon="camera-outline"
            variant="outline"
            small
            style={styles.flex}
            disabled={room <= 0}
            onPress={async () => {
              const shot = await takePhoto();
              if (shot) addPicked([shot]);
            }}
          />
        </View>
        {room <= 0 && pending.length === 0 && <Text style={styles.hint}>{t('photos.full')}</Text>}

        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('photos.toUpload')}</Text>
            <View style={styles.grid}>
              {pending.map((p, i) => (
                <View key={photoKey(p)} style={{ width: thumb, height: thumb }}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                  <Pressable
                    style={styles.remove}
                    hitSlop={8}
                    onPress={() => setPending((list) => list.filter((_, j) => j !== i))}
                    accessibilityLabel={t('photos.remove')}>
                    <Ionicons name="close" size={14} color={colors.white} />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        {notices.map((n) => (
          <Banner key={n.text} tone={n.tone}>
            {n.text}
          </Banner>
        ))}
      </ScrollView>

      {pending.length > 0 && (
        <View style={styles.footer}>
          <Button
            title={t('photos.upload', { n: pending.length })}
            icon="cloud-upload-outline"
            onPress={upload}
            loading={busy === 'upload'}
            disabled={busy !== null && busy !== 'upload'}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  flex: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  countRow: { gap: 6 },
  count: { fontSize: 16, fontWeight: '800', color: colors.danger },
  countOk: { color: colors.success },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.elevated, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  row: { flexDirection: 'row', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.card },
  thumbBusy: { opacity: 0.4 },
  mainBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  mainText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kind: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  kindExterior: { backgroundColor: colors.primary },
  kindText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  kindTextExterior: { color: colors.onPrimary },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
});
