import { useColorScheme } from 'react-native'

export type ThemeMode = 'light' | 'dark'

export type MostBoxTheme = {
  mode: ThemeMode
  statusBarStyle: 'dark-content' | 'light-content'
  colors: {
    background: string
    backgroundGlowPrimary: string
    backgroundGlowSecondary: string
    backgroundGlowTertiary: string
    surface: string
    surfaceSolid: string
    surfaceSubtle: string
    surfaceMuted: string
    surfaceElevated: string
    glass: string
    glassHeavy: string
    glassSubtle: string
    glassSolid: string
    glassHighlight: string
    text: string
    textSecondary: string
    textMuted: string
    border: string
    borderStrong: string
    accent: string
    accentPressed: string
    accentSoft: string
    onAccent: string
    info: string
    infoSoft: string
    success: string
    successSoft: string
    warning: string
    warningSoft: string
    danger: string
    dangerSoft: string
    overlay: string
  }
  radii: {
    xsmall: number
    small: number
    medium: number
    large: number
    xlarge: number
    full: number
  }
  shadow: {
    color: string
    opacity: number
    radius: number
    offsetY: number
    elevation: number
  }
  spacing: {
    xsmall: number
    small: number
    medium: number
    large: number
    xlarge: number
  }
}

const sharedRadii = {
  xsmall: 6,
  small: 8,
  medium: 14,
  large: 20,
  xlarge: 24,
  full: 999,
} as const

const sharedSpacing = {
  xsmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 24,
} as const

export const lightTheme: MostBoxTheme = {
  mode: 'light',
  statusBarStyle: 'dark-content',
  colors: {
    background: '#f5f5f7',
    backgroundGlowPrimary: 'rgba(94, 106, 210, 0.1)',
    backgroundGlowSecondary: 'rgba(90, 200, 250, 0.08)',
    backgroundGlowTertiary: 'rgba(255, 149, 120, 0.06)',
    surface: 'rgba(255, 255, 255, 0.45)',
    surfaceSolid: 'rgba(255, 255, 255, 0.9)',
    surfaceSubtle: 'rgba(255, 255, 255, 0.25)',
    surfaceMuted: '#e8e8ed',
    surfaceElevated: 'rgba(255, 255, 255, 0.8)',
    glass: 'rgba(255, 255, 255, 0.45)',
    glassHeavy: 'rgba(255, 255, 255, 0.9)',
    glassSubtle: 'rgba(255, 255, 255, 0.25)',
    glassSolid: 'rgba(255, 255, 255, 0.8)',
    glassHighlight: 'rgba(255, 255, 255, 0.6)',
    text: '#1d1d1f',
    textSecondary: '#6e6e73',
    textMuted: '#86868b',
    border: 'rgba(97, 97, 97, 0.1)',
    borderStrong: 'rgba(97, 97, 97, 0.18)',
    accent: '#5e6ad2',
    accentPressed: '#6e7ae0',
    accentSoft: 'rgba(94, 106, 210, 0.12)',
    onAccent: '#ffffff',
    info: '#5ac8fa',
    infoSoft: 'rgba(90, 200, 250, 0.1)',
    success: '#34c759',
    successSoft: 'rgba(52, 199, 89, 0.12)',
    warning: '#ff9500',
    warningSoft: 'rgba(255, 149, 0, 0.12)',
    danger: '#ff3b30',
    dangerSoft: 'rgba(255, 59, 48, 0.1)',
    overlay: 'rgba(0, 0, 0, 0.3)',
  },
  radii: sharedRadii,
  shadow: {
    color: '#000000',
    opacity: 0.08,
    radius: 16,
    offsetY: 8,
    elevation: 4,
  },
  spacing: sharedSpacing,
}

export const darkTheme: MostBoxTheme = {
  mode: 'dark',
  statusBarStyle: 'light-content',
  colors: {
    background: '#000000',
    backgroundGlowPrimary: 'rgba(94, 106, 210, 0.12)',
    backgroundGlowSecondary: 'rgba(90, 200, 250, 0.08)',
    backgroundGlowTertiary: 'rgba(52, 199, 89, 0.05)',
    surface: 'rgba(28, 28, 30, 0.45)',
    surfaceSolid: 'rgba(28, 28, 30, 0.94)',
    surfaceSubtle: 'rgba(28, 28, 30, 0.25)',
    surfaceMuted: '#141416',
    surfaceElevated: 'rgba(28, 28, 30, 0.8)',
    glass: 'rgba(28, 28, 30, 0.45)',
    glassHeavy: 'rgba(28, 28, 30, 0.94)',
    glassSubtle: 'rgba(28, 28, 30, 0.25)',
    glassSolid: 'rgba(28, 28, 30, 0.8)',
    glassHighlight: 'rgba(255, 255, 255, 0.08)',
    text: '#f5f5f7',
    textSecondary: '#a1a1a6',
    textMuted: '#808080',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    accent: '#5e6ad2',
    accentPressed: '#6e7ae0',
    accentSoft: 'rgba(94, 106, 210, 0.15)',
    onAccent: '#ffffff',
    info: '#64d2ff',
    infoSoft: 'rgba(100, 210, 255, 0.12)',
    success: '#30d158',
    successSoft: 'rgba(48, 209, 88, 0.16)',
    warning: '#ff9f0a',
    warningSoft: 'rgba(255, 159, 10, 0.14)',
    danger: '#ff453a',
    dangerSoft: 'rgba(255, 69, 58, 0.12)',
    overlay: 'rgba(0, 0, 0, 0.58)',
  },
  radii: sharedRadii,
  shadow: {
    color: '#000000',
    opacity: 0.34,
    radius: 24,
    offsetY: 12,
    elevation: 7,
  },
  spacing: sharedSpacing,
}

export function useMostBoxTheme() {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme
}
