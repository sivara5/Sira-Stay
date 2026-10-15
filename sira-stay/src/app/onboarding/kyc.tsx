import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Banner } from '@/components/feedback';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { TextField } from '@/components/text-field';
import { colors, radius } from '@/constants/theme';
import { ApiError, api, filePart } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { choosePhotos, imageMime, imageName, takePhoto, type PickedImage } from '@/lib/pick-image';
import type { Me } from '@/lib/types';

const ID_TYPES = ['aadhaar', 'pan', 'voter_id', 'driving_licence'] as const;
type IdType = (typeof ID_TYPES)[number];

const ID_FORMAT: Record<IdType, { pattern: RegExp; placeholder: string; numeric: boolean }> = {
  aadhaar: { pattern: /^\d{12}$/, placeholder: '1234 5678 9012', numeric: true },
  pan: { pattern: /^[A-Z]{5}\d{4}[A-Z]$/, placeholder: 'ABCDE1234F', numeric: false },
  voter_id: { pattern: /^[A-Z]{3}\d{7}$/, placeholder: 'ABC1234567', numeric: false },
  driving_licence: { pattern: /^[A-Z0-9]{10,20}$/, placeholder: 'TN0120230001234', numeric: false },
};

export default function KycStep() {
  const { t, errorText } = useI18n();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [idType, setIdType] = useState<IdType>('aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const cleanId = idNumber.replace(/[\s-]/g, '').toUpperCase();

  async function submit() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = t('common.required');
    if (!ID_FORMAT[idType].pattern.test(cleanId)) next.idNumber = t('err.INVALID_ID_NUMBER');
    if (!photo) next.idPhoto = t('common.required');
    setErrors(next);
    if (Object.keys(next).length || !photo) return;

    setLoading(true);
    const form = new FormData();
    form.append('name', name.trim());
    form.append('idType', idType);
    form.append('idNumber', cleanId);
    form.append('idPhoto', filePart(photo.uri, imageName(photo, 'id'), imageMime(photo)));
    try {
      const { user: me } = await api<{ user: Me }>('/auth/kyc', { form });
      setUser(me); // registration complete → app switches to Home
    } catch (err) {
      setErrors({ [err instanceof ApiError && err.field ? err.field : 'form']: errorText(err) });
      setLoading(false);
    }
  }

  return (
    <OnboardingScreen
      title={t('onb.kycTitle')}
      subtitle={t('onb.kycHint')}
      step={{ n: 4, total: 4 }}
      footer={<Button title={t('onb.submitKyc')} onPress={submit} loading={loading} />}>
      <TextField label={t('onb.fullName')} value={name} onChangeText={setName} autoComplete="name" error={errors.name} />

      <View style={styles.group}>
        <Text style={styles.label}>{t('onb.idType')}</Text>
        <View style={styles.chips}>
          {ID_TYPES.map((type) => (
            <Chip
              key={type}
              label={t(`id.${type}`)}
              selected={idType === type}
              onPress={() => {
                setIdType(type);
                setIdNumber('');
              }}
            />
          ))}
        </View>
      </View>

      <TextField
        label={t('onb.idNumber')}
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder={ID_FORMAT[idType].placeholder}
        keyboardType={ID_FORMAT[idType].numeric ? 'number-pad' : 'default'}
        autoCapitalize="characters"
        autoCorrect={false}
        error={errors.idNumber}
      />

      <View style={styles.group}>
        <Text style={styles.label}>{t('onb.idPhoto')}</Text>
        {photo ? (
          <View style={styles.preview}>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} contentFit="cover" />
            <View style={styles.previewBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.previewText}>{t('onb.idPhotoAdded')}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.row}>
          <Button
            title={t('onb.takePhoto')}
            icon="camera-outline"
            variant="outline"
            small
            style={styles.flex}
            onPress={async () => setPhoto((await takePhoto()) ?? photo)}
          />
          <Button
            title={t('onb.choosePhoto')}
            icon="images-outline"
            variant="outline"
            small
            style={styles.flex}
            onPress={async () => setPhoto((await choosePhotos(1))[0] ?? photo)}
          />
        </View>
        {errors.idPhoto && <Text style={styles.error}>{errors.idPhoto}</Text>}
      </View>

      {errors.form && <Banner tone="danger">{errors.form}</Banner>}
      <Banner tone="info" icon="document-text-outline">
        {t('onb.docsLater')}
      </Banner>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  preview: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  previewImage: { width: '100%', height: 160 },
  previewBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: colors.successSoft },
  previewText: { fontSize: 13, color: colors.success, fontWeight: '600' },
  error: { fontSize: 13, color: colors.danger },
});
