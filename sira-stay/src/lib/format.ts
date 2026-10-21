import type { Language } from './types';

export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

const locale = (lang: Language) => (lang === 'ta' ? 'ta-IN' : 'en-IN');

/** Formats YYYY-MM-DD or an ISO timestamp as "15 Oct 2026". */
export function formatDate(value: string, lang: Language) {
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "21 April 2027" — used for unlock and pass expiry dates. */
export function formatDateLong(iso: string, lang: Language) {
  return new Date(iso).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Whole hours left until `iso` (never negative). */
export const hoursUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 3_600_000));

export function formatTime(iso: string, lang: Language) {
  return new Date(iso).toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' });
}

export const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromDateString = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Same month arithmetic as the server (clamps to the last day of the month). */
export function addMonths(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return toDateString(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

export const todayString = () => toDateString(new Date());

/** "+919876543210" → "+91 98765 43210" */
export const formatPhone = (phone: string) => phone.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
