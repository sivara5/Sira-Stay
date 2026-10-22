import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, type KeyboardTypeOptions } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { colors, radius } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

type Props = {
  title: string;
  initialValue: string;
  prefix?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  /** Cleans each keystroke, e.g. digits only. */
  format?: (value: string) => string;
  /** Returns an error message, or null when the value is fine. */
  validate: (value: string) => string | null;
  /** Saves the value; resolves true to close the dialog. */
  onSave: (value: string) => Promise<boolean>;
  onClose: () => void;
};

/** Small centred dialog for editing one profile value (name, WhatsApp number). Mount it only while editing. */
export function EditFieldDialog({ title, initialValue, prefix, keyboardType, maxLength, format, validate, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = validate(value);
    setError(problem);
    if (problem) return;
    setSaving(true);
    const ok = await onSave(value);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.cancel')} />
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <TextField
            value={value}
            onChangeText={(v) => {
              setValue(format ? format(v) : v);
              setError(null);
            }}
            prefix={prefix}
            keyboardType={keyboardType}
            maxLength={maxLength}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
            error={error}
          />
          <View style={styles.actions}>
            <Button title={t('common.cancel')} variant="outline" small style={styles.flex} onPress={onClose} />
            <Button title={t('common.save')} small style={styles.flex} onPress={save} loading={saving} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  actions: { flexDirection: 'row', gap: 10 },
});
