/** Luxury dark theme: black background, slightly lighter dark cards, gold buttons and accents, white text. */
export const colors = {
  // Gold
  primary: '#D4AF37', // buttons, active states, icons, links
  primaryLight: '#E8C963', // gold text on the dark gold tint
  primarySoft: '#2A2416', // dark gold tint behind selected chips, badges and highlights
  onPrimary: '#0C0D12', // text and icons on gold

  // Surfaces
  background: '#0C0D12', // screens
  card: '#1D2033', // cards and sheets
  surface: '#161827', // inputs and inner rows (a little darker than cards)
  elevated: '#262A40', // tiles and chips placed on cards
  border: '#2D3044',

  // Text
  text: '#FFFFFF',
  textMuted: '#9AA3B5',

  // Status
  success: '#34C38F',
  successSoft: '#10302A',
  warning: '#F2C94C',
  warningSoft: '#2E2712',
  danger: '#F87171',
  dangerSoft: '#3A1D24',
  info: '#7DA8FF',
  infoSoft: '#1A2442',

  whatsapp: '#25D366',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** A dark card: lighter than the background with a hairline border (drop shadows don't show on black). */
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

/** Rough centre of Tamil Nadu — default map region. */
export const TAMIL_NADU_REGION = { latitude: 11.1271, longitude: 78.6569, latitudeDelta: 6, longitudeDelta: 6 };
