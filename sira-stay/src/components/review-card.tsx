import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { LeakBanner, useLeakText } from '@/components/leak-warning';
import { StarInput } from '@/components/rating';
import { TextField } from '@/components/text-field';
import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MyReview } from '@/lib/types';

type Props<T> = {
  myReview: MyReview | null;
  /** POST endpoint that saves the review, e.g. /properties/:id/reviews or /bookings/:id/review. */
  path: string;
  onSaved: (response: T) => void;
};

/** "Rate this property" — one review per tenant per property; rating again updates it. */
export function ReviewCard<T>({ myReview, path, onSaved }: Props<T>) {
  const { t, errorText } = useI18n();
  const [stars, setStars] = useState(myReview?.rating ?? 0);
  const [comment, setComment] = useState(myReview?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const leakText = useLeakText();
  // Reviews are public: no phone number or address of the house before other tenants unlock.
  const leak = leakText(comment);

  async function submit() {
    setSaving(true);
    setMessage(null);
    try {
      onSaved(await api<T>(path, { body: { rating: stars, comment } }));
      setMessage({ tone: 'success', text: t('review.thanks') });
    } catch (err) {
      setMessage({ tone: 'danger', text: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{myReview ? t('review.yours') : t('review.title')}</Text>
      <Text style={styles.hint}>{t('review.hint')}</Text>
      <StarInput value={stars} onChange={setStars} />
      <TextField
        label={t('review.comment')}
        accessibilityLabel={t('review.comment')}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
        error={leak}
      />
      {leak && <LeakBanner>{t('leak.reviewBody')}</LeakBanner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <Button
        title={myReview ? t('review.update') : t('review.submit')}
        icon="star"
        variant="secondary"
        onPress={submit}
        loading={saving}
        disabled={stars === 0 || Boolean(leak)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, gap: 10 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
});
