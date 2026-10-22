import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/strings';
import type { Checkout, Payment, PaymentMethod } from '@/lib/types';

type Request = { amount: number; description: string };
type Pick = (request: Request) => Promise<PaymentMethod | null>;

const PickerContext = createContext<Pick | null>(null);

type Option = { method: PaymentMethod; label: StringKey; hint: StringKey; icon?: ComponentProps<typeof Ionicons>['name']; badge?: string };

const UPI_OPTIONS: Option[] = [
  { method: 'gpay', label: 'payMethod.gpay', hint: 'payMethod.upiHint', icon: 'logo-google' },
  { method: 'phonepe', label: 'payMethod.phonepe', hint: 'payMethod.upiHint', badge: 'Pe' },
  { method: 'upi', label: 'payMethod.otherUpi', hint: 'payMethod.otherUpiHint', icon: 'qr-code-outline' },
];
const CARD_OPTION: Option = { method: 'card', label: 'payMethod.card', hint: 'payMethod.cardHint', icon: 'card-outline' };

export const paymentMethodLabel: Record<PaymentMethod, StringKey> = {
  gpay: 'payMethod.gpay',
  phonepe: 'payMethod.phonepe',
  upi: 'payMethod.otherUpi',
  card: 'payMethod.card',
};

/** Hosts the "How would you like to pay?" sheet once for the whole app. */
export function PaymentMethodProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const resolve = useRef<((method: PaymentMethod | null) => void) | null>(null);

  const pick = useCallback<Pick>(
    (next) =>
      new Promise((done) => {
        resolve.current?.(null); // a newer request replaces one still open
        resolve.current = done;
        setRequest(next);
      }),
    [],
  );

  const finish = (method: PaymentMethod | null) => {
    resolve.current?.(method);
    resolve.current = null;
    setRequest(null);
  };

  return (
    <PickerContext.Provider value={pick}>
      {children}
      <PaymentMethodSheet request={request} onPick={finish} />
    </PickerContext.Provider>
  );
}

type PaymentBody = { purpose: 'unlock'; propertyId: string } | { purpose: 'district_pass'; district: string };

/**
 * Asks how to pay (Google Pay, PhonePe, other UPI app, or card), then creates the order on the
 * server and opens checkout on that method. Resolves false if the tenant closed the sheet.
 * Server errors (e.g. ALREADY_UNLOCKED) are thrown for the screen to handle.
 */
export function useStartPayment() {
  const pick = useContext(PickerContext);
  if (!pick) throw new Error('useStartPayment must be used inside PaymentMethodProvider');

  return useCallback(
    async (body: PaymentBody, request: Request) => {
      const method = await pick(request);
      if (!method) return false;
      const res = await api<{ payment: Payment; checkout: Checkout }>('/payments', { body });
      router.push({
        pathname: '/checkout/[paymentId]',
        params: {
          paymentId: res.payment.id,
          checkout: JSON.stringify(res.checkout),
          purpose: body.purpose,
          propertyId: body.purpose === 'unlock' ? body.propertyId : '',
          method,
        },
      });
      return true;
    },
    [pick],
  );
}

function PaymentMethodSheet({ request, onPick }: { request: Request | null; onPick: (method: PaymentMethod | null) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const close = () => onPick(null);

  return (
    <Modal visible={request !== null} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title}>{t('payMethod.title', { amount: rupees(request?.amount ?? 0) })}</Text>
            <Text style={styles.description} numberOfLines={2}>
              {request?.description}
            </Text>
          </View>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.close}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.group}>{t('payMethod.upi')}</Text>
        <View style={styles.list}>
          {UPI_OPTIONS.map((o, i) => (
            <OptionRow key={o.method} option={o} first={i === 0} onPress={() => onPick(o.method)} />
          ))}
        </View>

        <Text style={styles.group}>{t('payMethod.cards')}</Text>
        <View style={styles.list}>
          <OptionRow option={CARD_OPTION} first onPress={() => onPick(CARD_OPTION.method)} />
        </View>

        <View style={styles.secure}>
          <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
          <Text style={styles.secureText}>{t('payMethod.secure')}</Text>
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({ option, first, onPress }: { option: Option; first: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, !first && styles.optionDivider, pressed && styles.optionPressed]}>
      <View style={styles.optionIcon}>
        {option.icon ? <Ionicons name={option.icon} size={20} color={colors.primary} /> : <Text style={styles.badgeText}>{option.badge}</Text>}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionLabel}>{t(option.label)}</Text>
        <Text style={styles.optionHint}>{t(option.hint)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  description: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  group: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  optionPressed: { backgroundColor: colors.elevated },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 15, fontWeight: '900', color: colors.primary },
  optionLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  optionHint: { fontSize: 12, color: colors.textMuted },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  secureText: { fontSize: 12, color: colors.textMuted },
});
