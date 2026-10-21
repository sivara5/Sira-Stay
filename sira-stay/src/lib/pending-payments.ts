import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Payments started on this phone whose result we don't know yet (e.g. the network dropped mid-payment).
 * They're re-checked with the server when the connection returns, and removed once final.
 */
export type PendingPayment = {
  paymentId: string;
  purpose: 'unlock' | 'booking' | 'district_pass';
  propertyId?: string;
  bookingId?: string;
  startedAt: number;
};

const KEY = 'sira.pendingPayments';
const MAX_AGE_MS = 24 * 3_600_000;

/** The payment currently open on the checkout screen (it handles its own result). */
let activeCheckout: string | null = null;
export const setActiveCheckout = (paymentId: string | null) => {
  activeCheckout = paymentId;
};
export const getActiveCheckout = () => activeCheckout;

export async function listPendingPayments(): Promise<PendingPayment[]> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as PendingPayment[];
    return all.filter((p) => Date.now() - p.startedAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

/** Writes run one after another so an add and a remove can't overwrite each other. */
let writes: Promise<void> = Promise.resolve();
function update(change: (list: PendingPayment[]) => PendingPayment[]) {
  writes = writes.then(async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(change(await listPendingPayments()))).catch(() => {});
  });
  return writes;
}

export const addPendingPayment = (payment: PendingPayment) =>
  update((list) => (list.some((p) => p.paymentId === payment.paymentId) ? list : [...list, payment]));

export const removePendingPayment = (paymentId: string) => update((list) => list.filter((p) => p.paymentId !== paymentId));

export function clearPendingPayments() {
  writes = writes.then(() => AsyncStorage.removeItem(KEY).catch(() => {}));
  return writes;
}
