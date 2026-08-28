export * from './severity';
export * from './motion';

export const COLOR_TOKENS = {
  // Primary Editorial Spectrum
  primary: '#0E6B4A',
  primaryHover: '#0B563B',
  primarySoft: '#E6F4ED',
  primaryDeep: '#063F2C',

  // Accent Spectrum
  mint: '#10B981',
  cyan: '#06B6D4',
  violet: '#8B5CF6',
  magenta: '#E11D48',
  emerald: '#0E6B4A',
  teal: '#10B981',
  indigo: '#6366F1',
  amber: '#F59E0B',
  red: '#E11D48',

  // Day Surfaces & Backgrounds
  bgCanvas: '#F3F4F1',
  bgSurface: '#FFFFFF',
  bgElevated: '#FAFBF9',
  bgSubtle: '#ECEFEA',

  // Typography
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  textOnAccent: '#FFFFFF',

  // Borders
  border: '#E5E7EB',
  borderSubtle: '#F3F4F6',
  borderHover: '#D1D5DB',

  // Legacy Aliases
  bgVoid: '#F3F4F1',
  bgRaised: '#FAFBF9',
  borderHairline: '#F3F4F6',
} as const;

export const SPACING_SCALE = {
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '20px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
  '4xl': '48px',
  '5xl': '64px',
} as const;

export const RADIUS_SCALE = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  pill: '9999px',
} as const;
