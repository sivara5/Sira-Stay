import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { Redirect, router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { categoryIcon } from '@/components/category-tabs';
import { Chip } from '@/components/chip';
import { DateField } from '@/components/date-field';
import { Banner } from '@/components/feedback';
import { LeakBanner, useLeakText } from '@/components/leak-warning';
import { TextField } from '@/components/text-field';
import { darkMapProps } from '@/constants/map-style';
import { TAMIL_NADU_REGION, colors, radius } from '@/constants/theme';
import { ApiError, api, filePart } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { todayString, fromDateString } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { MAX_PHOTOS, MIN_PHOTOS, filterPicked, photoKey } from '@/lib/photo-rules';
import { choosePhotos, takePhoto, type PickedImage } from '@/lib/pick-image';
import type { StringKey } from '@/lib/strings';
import { AMENITIES, CATEGORIES, type Amenity, type Category, type Furnishing, type PropertyDetail } from '@/lib/types';
import { PhotoPrepError, prepareUploadPhotos } from '@/lib/upload-photos';

const FURNISHING: Furnishing[] = ['unfurnished', 'semi_furnished', 'furnished'];
const DOC_TYPES = ['property_tax', 'eb_bill', 'sale_deed', 'rental_agreement', 'other'] as const;
const STEPS: StringKey[] = ['new.stepDetails', 'new.stepLocation', 'new.stepPhotos', 'new.stepDocs'];

type Errors = Partial<Record<string, string>>;

/** Fields every tenant sees, by wizard step: they must not give the house away before unlock. */
const PUBLIC_FIELDS: Partial<Record<number, ('title' | 'description' | 'district' | 'area' | 'landmark')[]>> = {
  0: ['title', 'description'],
  1: ['district', 'area', 'landmark'],
};

/** Which wizard step a server-side validation error belongs to. */
const FIELD_STEP: Record<string, number> = {
  category: 0, title: 0, description: 0, rent: 0, deposit: 0, bookingAmount: 0,
  address: 1, district: 1, area: 1, landmark: 1, location: 1,
  photos: 2,
  document: 3,
};

export default function NewListing() {
  const { t, errorText } = useI18n();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const [category, setCategory] = useState<Category>('house');
  const [form, setForm] = useState({ title: '', description: '', rent: '', deposit: '', bookingAmount: '', address: '', district: '', area: '', landmark: '' });
  const [furnishing, setFurnishing] = useState<Furnishing>('unfurnished');
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [availableFrom, setAvailableFrom] = useState<string | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [skipped, setSkipped] = useState<{ duplicates: number; lowRes: number }>({ duplicates: 0, lowRes: 0 });
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>('property_tax');
  const [document, setDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const leakText = useLeakText();

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: key === 'rent' || key === 'deposit' || key === 'bookingAmount' ? value.replace(/\D/g, '') : value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (form.title.trim().length < 5) e.title = t('new.titleTooShort');
      if (Number(form.rent) < 500) e.rent = t('new.rentInvalid');
      if (Number(form.bookingAmount) < 100) e.bookingAmount = t('new.bookingInvalid');
    }
    if (s === 1) {
      (['address', 'district', 'area', 'landmark'] as const).forEach((k) => {
        if (form[k].trim().length < (k === 'address' ? 5 : 2)) e[k] = t('common.required');
      });
      if (!pin) e.location = t('new.pinRequired');
    }
    if (s === 2 && photos.length < MIN_PHOTOS) e.photos = t('new.needMin');
    if (s === 3 && !document) e.document = t('new.docRequired');
    PUBLIC_FIELDS[s]?.forEach((k) => {
      const leak = leakText(form[k]);
      if (leak) e[k] = leak;
    });
    return e;
  }

  const stepHasLeak = Boolean(PUBLIC_FIELDS[step]?.some((k) => leakText(form[k])));

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep(step + 1);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      setPin(point);
      setErrors((e) => ({ ...e, location: undefined }));
      mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 400);
      // Prefill empty address fields from the device geocoder — the owner can still edit them.
      const [place] = await Location.reverseGeocodeAsync(point).catch(() => []);
      if (place) {
        setForm((f) => ({
          ...f,
          district: f.district || place.city || place.subregion || '',
          area: f.area || place.district || place.subregion || '',
          address: f.address || [place.streetNumber, place.street].filter(Boolean).join(', '),
        }));
      }
    } finally {
      setLocating(false);
    }
  }

  function addPhotos(picked: PickedImage[]) {
    const { accepted, duplicates, lowRes } = filterPicked(picked, new Set(photos.map(photoKey)), MAX_PHOTOS - photos.length);
    setSkipped({ duplicates, lowRes });
    setPhotos((list) => [...list, ...accepted]);
    setErrors((e) => ({ ...e, photos: undefined }));
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!result.canceled) {
      setDocument(result.assets[0]);
      setErrors((e) => ({ ...e, document: undefined }));
    }
  }

  async function publish() {
    // Re-check every step: nothing is saved while a public field still gives the house away.
    for (const s of STEPS.keys()) {
      const e = validate(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    setErrors({});
    if (!pin || !document) return;

    setSubmitting(true);
    let files;
    try {
      files = await prepareUploadPhotos(photos);
    } catch (err) {
      setSubmitting(false);
      setErrors({ photos: t('new.photoPrepFailed', { n: err instanceof PhotoPrepError ? err.index + 1 : 1 }) });
      setStep(FIELD_STEP.photos);
      return;
    }

    const body = new FormData();
    const fields: Record<string, string> = {
      category,
      ...form,
      deposit: form.deposit || '0',
      furnishing,
      amenities: JSON.stringify(amenities),
      lat: String(pin.latitude),
      lng: String(pin.longitude),
      docType,
    };
    if (availableFrom) fields.availableFrom = availableFrom;
    Object.entries(fields).forEach(([k, v]) => body.append(k, v));
    files.forEach((f) => body.append('photos', filePart(f.uri, f.name, f.type)));
    body.append('document', filePart(document.uri, document.name, document.mimeType ?? 'application/octet-stream'));

    try {
      const { property } = await api<{ property: PropertyDetail }>('/properties', { form: body });
      Alert.alert(t('new.published'));
      router.replace(`/property/${property.id}`);
    } catch (err) {
      const field = err instanceof ApiError ? err.field : undefined;
      if (field && FIELD_STEP[field] !== undefined) setStep(FIELD_STEP[field]);
      setErrors({ [field ?? 'form']: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  // Owners who switched from Tenant mode verify their ID before their first listing.
  if (user?.kycStatus === 'none') return <Redirect href="/owner/verify" />;

  const thumb = (width - 32 - 20) / 3;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.stepper}>
        {STEPS.map((key, i) => (
          <View key={key} style={styles.stepItem}>
            <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
              {i < step ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]} numberOfLines={1}>
              {t(key)}
            </Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Group label={t('new.category')}>
                <View style={styles.chips}>
                  {CATEGORIES.map((c) => (
                    <Chip key={c} label={t(`cat.${c}`)} icon={categoryIcon[c]} selected={category === c} onPress={() => setCategory(c)} />
                  ))}
                </View>
              </Group>
              {stepHasLeak && <LeakBanner>{t('leak.body')}</LeakBanner>}
              <TextField
                label={t('new.titleLabel')}
                placeholder={t('new.titlePlaceholder')}
                value={form.title}
                onChangeText={set('title')}
                maxLength={80}
                error={errors.title ?? leakText(form.title)}
              />
              <TextField
                label={t('new.description')}
                placeholder={t('new.descriptionPlaceholder')}
                value={form.description}
                onChangeText={set('description')}
                multiline
                maxLength={2000}
                error={errors.description ?? leakText(form.description)}
              />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField label={t('new.rent')} value={form.rent} onChangeText={set('rent')} keyboardType="number-pad" error={errors.rent} />
                </View>
                <View style={styles.flex}>
                  <TextField label={t('new.deposit')} value={form.deposit} onChangeText={set('deposit')} keyboardType="number-pad" />
                </View>
              </View>
              <TextField
                label={t('new.bookingAmount')}
                value={form.bookingAmount}
                onChangeText={set('bookingAmount')}
                keyboardType="number-pad"
                hint={t('new.bookingAmountHint')}
                error={errors.bookingAmount}
              />
              <Group label={t('new.furnishing')}>
                <View style={styles.chips}>
                  {FURNISHING.map((f) => (
                    <Chip key={f} label={t(`furn.${f}`)} selected={furnishing === f} onPress={() => setFurnishing(f)} />
                  ))}
                </View>
              </Group>
              <Group label={t('new.amenities')}>
                <View style={styles.chips}>
                  {AMENITIES.map((a) => (
                    <Chip
                      key={a}
                      label={t(`amen.${a}`)}
                      selected={amenities.includes(a)}
                      onPress={() => setAmenities((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]))}
                    />
                  ))}
                </View>
              </Group>
              <DateField
                label={`${t('new.availableFrom')} (${t('common.optional')})`}
                value={availableFrom}
                placeholder={t('prop.availableNow')}
                minimumDate={fromDateString(todayString())}
                onChange={setAvailableFrom}
              />
            </>
          )}

          {step === 1 && (
            <>
              {stepHasLeak && <LeakBanner>{t('leak.body')}</LeakBanner>}
              <TextField label={`${t('new.address')} *`} placeholder={t('new.addressPlaceholder')} value={form.address} onChangeText={set('address')} error={errors.address} />
              <TextField
                label={`${t('new.district')} *`}
                placeholder="Chennai"
                value={form.district}
                onChangeText={set('district')}
                error={errors.district ?? leakText(form.district)}
              />
              <TextField
                label={`${t('new.area')} *`}
                placeholder="Anna Nagar"
                value={form.area}
                onChangeText={set('area')}
                error={errors.area ?? leakText(form.area)}
              />
              <TextField
                label={`${t('new.landmark')} *`}
                placeholder="Tower Park"
                value={form.landmark}
                onChangeText={set('landmark')}
                error={errors.landmark ?? leakText(form.landmark)}
              />

              <Group label={`${t('new.pinTitle')} *`}>
                <Text style={styles.hint}>{t('new.pinHint')}</Text>
                <View style={[styles.mapBox, errors.location ? styles.mapBoxError : null]}>
                  <MapView
                    {...darkMapProps}
                    ref={mapRef}
                    style={StyleSheet.absoluteFill}
                    initialRegion={pin ? { ...pin, latitudeDelta: 0.005, longitudeDelta: 0.005 } : TAMIL_NADU_REGION}
                    onPress={(e) => {
                      setPin(e.nativeEvent.coordinate);
                      setErrors((x) => ({ ...x, location: undefined }));
                    }}
                    toolbarEnabled={false}>
                    {pin && <Marker coordinate={pin} draggable onDragEnd={(e) => setPin(e.nativeEvent.coordinate)} pinColor={colors.primary} />}
                  </MapView>
                </View>
                {errors.location && <Text style={styles.error}>{errors.location}</Text>}
                <Button title={t('new.useMyLocation')} icon="locate" variant="secondary" small onPress={useMyLocation} loading={locating} />
              </Group>
              <Banner tone="success" icon="shield-checkmark-outline">
                {t('new.pinPrivacy')}
              </Banner>
            </>
          )}

          {step === 2 && (
            <>
              <Banner tone="warning" title={t('new.indoorOnly')} icon="eye-off-outline">
                {t('new.indoorOnlyBody')}
              </Banner>
              <Banner tone="info" title={t('new.photoRules')} icon="images-outline">
                {t('new.photoRulesBody')}
              </Banner>
              <View style={styles.countRow}>
                <Text style={[styles.count, photos.length >= MIN_PHOTOS && styles.countOk]}>{t('new.photoCount', { n: photos.length })}</Text>
                <View style={styles.progress}>
                  <View style={[styles.progressFill, { width: `${(photos.length / MAX_PHOTOS) * 100}%` }]} />
                </View>
              </View>
              <View style={styles.row}>
                <Button
                  title={t('new.addPhotos')}
                  icon="images-outline"
                  variant="outline"
                  small
                  style={styles.flex}
                  disabled={photos.length >= MAX_PHOTOS}
                  onPress={async () => addPhotos(await choosePhotos(MAX_PHOTOS - photos.length))}
                />
                <Button
                  title={t('new.camera')}
                  icon="camera-outline"
                  variant="outline"
                  small
                  style={styles.flex}
                  disabled={photos.length >= MAX_PHOTOS}
                  onPress={async () => {
                    const shot = await takePhoto();
                    if (shot) addPhotos([shot]);
                  }}
                />
              </View>
              {photos.length >= MAX_PHOTOS && <Text style={styles.hint}>{t('new.maxReached')}</Text>}
              {skipped.duplicates > 0 && <Banner tone="warning">{t('new.duplicateSkipped', { n: skipped.duplicates })}</Banner>}
              {skipped.lowRes > 0 && <Banner tone="warning">{t('new.lowResSkipped', { n: skipped.lowRes })}</Banner>}
              <View style={styles.grid}>
                {photos.map((p, i) => (
                  <View key={photoKey(p)} style={{ width: thumb, height: thumb }}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                    <Pressable
                      style={styles.remove}
                      hitSlop={8}
                      onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                      accessibilityLabel="Remove photo">
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
              </View>
              {errors.photos && <Banner tone="danger">{errors.photos}</Banner>}
            </>
          )}

          {step === 3 && (
            <>
              <Banner tone="info" title={t('new.docTitle')} icon="document-lock-outline">
                {t('new.docHint')}
              </Banner>
              <Group label={t('new.docType')}>
                <View style={styles.chips}>
                  {DOC_TYPES.map((d) => (
                    <Chip key={d} label={t(`doc.${d}`)} selected={docType === d} onPress={() => setDocType(d)} />
                  ))}
                </View>
              </Group>
              <Pressable style={[styles.docPicker, errors.document ? styles.mapBoxError : null]} onPress={pickDocument}>
                <Ionicons name={document ? 'document-attach' : 'cloud-upload-outline'} size={28} color={colors.primary} />
                <Text style={styles.docText} numberOfLines={2}>
                  {document ? document.name : t('new.pickDocument')}
                </Text>
              </Pressable>
              {errors.document && <Text style={styles.error}>{errors.document}</Text>}
              {submitting && <Banner tone="info" icon="cloud-upload-outline">{t('new.uploading')}</Banner>}
            </>
          )}

          {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {step > 0 && <Button title={t('common.back')} variant="outline" style={styles.flex} onPress={() => setStep(step - 1)} disabled={submitting} />}
        {step < STEPS.length - 1 ? (
          <Button title={t('common.next')} icon="arrow-forward" style={styles.flex} onPress={next} />
        ) : (
          <Button title={t('new.publish')} icon="checkmark-done" style={styles.flex} onPress={publish} loading={submitting} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  stepper: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stepNumActive: { color: colors.onPrimary },
  stepLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  stepLabelActive: { color: colors.text, fontWeight: '800' },
  content: { padding: 16, gap: 18 },
  row: { flexDirection: 'row', gap: 10 },
  group: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  error: { fontSize: 13, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mapBox: { height: 280, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  mapBoxError: { borderColor: colors.danger },
  countRow: { gap: 6 },
  count: { fontSize: 16, fontWeight: '800', color: colors.danger },
  countOk: { color: colors.success },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.elevated, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.card },
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
  docPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  docText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.primaryLight },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
});
