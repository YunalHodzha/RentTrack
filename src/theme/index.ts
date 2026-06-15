import { useColorScheme } from 'react-native';

/**
 * Имотник design system.
 *
 * A single source of truth for colors, spacing, radii and shadows so screens
 * stop hand-rolling `isDark ? ... : ...` ternaries everywhere. Consume colors
 * via `useTheme()`; spacing / radius / shadow are scheme-independent tokens.
 */

export type Scheme = 'light' | 'dark';

const light = {
  // surfaces
  bg: '#F2F4F7',
  card: '#FFFFFF',
  cardAlt: '#F8FAFC',
  // text
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  // lines
  border: '#E8EBF1',
  borderStrong: '#D7DCE5',
  // inputs
  inputBg: '#F1F4F9',
  inputBorder: '#E2E8F0',
  // brand
  primary: '#2563EB',
  primaryStrong: '#1D4ED8',
  primarySoft: '#EAF1FE',
  onPrimary: '#FFFFFF',
  // Имотник identity accents (match app icon / splash)
  emerald: '#065F46',
  mint: '#5EEAD4',
  // semantic
  success: '#15A34A',
  successSoft: '#E6F6EC',
  warning: '#C2740B',
  warningSoft: '#FBEFD9',
  danger: '#DC2626',
  dangerSoft: '#FCE9E9',
  muted: '#64748B',
  mutedSoft: '#EDF0F4',
  // misc
  overlay: 'rgba(15,23,42,0.45)',
  shadowColor: '#0F172A',
};

const dark: typeof light = {
  bg: '#0B1220',
  card: '#151D2E',
  cardAlt: '#1B2436',
  text: '#F1F5F9',
  textSecondary: '#9AA7BD',
  textMuted: '#64748B',
  border: '#243049',
  borderStrong: '#2E3B57',
  inputBg: '#1B2436',
  inputBorder: '#2C3953',
  primary: '#3B82F6',
  primaryStrong: '#2563EB',
  primarySoft: '#16244A',
  onPrimary: '#FFFFFF',
  // Имотник identity accents (match app icon / splash)
  emerald: '#065F46',
  mint: '#5EEAD4',
  success: '#22C55E',
  successSoft: '#102A1C',
  warning: '#F59E0B',
  warningSoft: '#34280E',
  danger: '#F87171',
  dangerSoft: '#371A1A',
  muted: '#94A3B8',
  mutedSoft: '#1E293B',
  overlay: 'rgba(2,6,23,0.65)',
  shadowColor: '#000000',
};

export type ThemeColors = typeof light;
export type Theme = ThemeColors & { isDark: boolean; scheme: Scheme };

export function useTheme(): Theme {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = scheme === 'dark' ? dark : light;
  return { ...colors, isDark: scheme === 'dark', scheme };
}

/** Semantic tone used by Badge / StatCard / Button accents. */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

export function toneColors(t: Theme, tone: Tone): { fg: string; soft: string } {
  switch (tone) {
    case 'success': return { fg: t.success, soft: t.successSoft };
    case 'warning': return { fg: t.warning, soft: t.warningSoft };
    case 'danger': return { fg: t.danger, soft: t.dangerSoft };
    case 'muted': return { fg: t.muted, soft: t.mutedSoft };
    case 'primary':
    default: return { fg: t.primary, soft: t.primarySoft };
  }
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  lg: {
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;
