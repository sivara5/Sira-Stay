export const colors = {
  primary: '#0E7C66',
  primaryDark: '#0A5E4E',
  primarySoft: '#E7F5F1',
  accent: '#F59E0B',
  accentSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  success: '#15803D',
  successSoft: '#DCFCE7',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  background: '#FFFFFF',
  surface: '#F6F7F9',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(17, 24, 39, 0.55)',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/** Rough centre of Tamil Nadu — default map region. */
export const TAMIL_NADU_REGION = { latitude: 11.1271, longitude: 78.6569, latitudeDelta: 6, longitudeDelta: 6 };
