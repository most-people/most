import { useColorScheme } from 'react-native'

export type ThemeMode = 'light' | 'dark'

export type MostBoxTheme = {
  mode: ThemeMode
  statusBarStyle: 'dark-content' | 'light-content'
  colors: {
    background: string
    surface: string
    surfaceSolid: string
    surfaceSubtle: string
    surfaceMuted: string
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
    shadow: string
  }
  radii: {
    small: number
    medium: number
    large: number
    full: number
  }
}

const sharedRadii = {
  small: 8,
  medium: 14,
  large: 20,
  full: 999,
} as const

export const lightTheme: MostBoxTheme = {
  mode: 'light',
  statusBarStyle: 'dark-content',
  colors: {
    background: '#f5f5f7',
    surface: 'rgba(255, 255, 255, 0.72)',
    surfaceSolid: '#ffffff',
    surfaceSubtle: 'rgba(255, 255, 255, 0.46)',
    surfaceMuted: '#f0f0f3',
    text: '#1d1d1f',
    textSecondary: '#6e6e73',
    textMuted: '#86868b',
    border: 'rgba(0, 0, 0, 0.07)',
    borderStrong: 'rgba(0, 0, 0, 0.14)',
    accent: '#5e6ad2',
    accentPressed: '#4f5bc2',
    accentSoft: 'rgba(94, 106, 210, 0.12)',
    onAccent: '#ffffff',
    info: '#32a9d6',
    infoSoft: 'rgba(90, 200, 250, 0.14)',
    success: '#248a3d',
    successSoft: 'rgba(52, 199, 89, 0.14)',
    warning: '#c46200',
    warningSoft: 'rgba(255, 149, 0, 0.15)',
    danger: '#d70015',
    dangerSoft: 'rgba(255, 59, 48, 0.12)',
    overlay: 'rgba(15, 15, 18, 0.42)',
    shadow: '#15151a',
  },
  radii: sharedRadii,
}

export const darkTheme: MostBoxTheme = {
  mode: 'dark',
  statusBarStyle: 'light-content',
  colors: {
    background: '#000000',
    surface: 'rgba(28, 28, 30, 0.78)',
    surfaceSolid: '#1c1c1e',
    surfaceSubtle: 'rgba(28, 28, 30, 0.5)',
    surfaceMuted: '#141416',
    text: '#f5f5f7',
    textSecondary: '#a1a1a6',
    textMuted: '#808080',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.17)',
    accent: '#7d88e7',
    accentPressed: '#6e7ae0',
    accentSoft: 'rgba(94, 106, 210, 0.2)',
    onAccent: '#ffffff',
    info: '#64d2ff',
    infoSoft: 'rgba(100, 210, 255, 0.15)',
    success: '#30d158',
    successSoft: 'rgba(48, 209, 88, 0.16)',
    warning: '#ff9f0a',
    warningSoft: 'rgba(255, 159, 10, 0.16)',
    danger: '#ff453a',
    dangerSoft: 'rgba(255, 69, 58, 0.16)',
    overlay: 'rgba(0, 0, 0, 0.68)',
    shadow: '#000000',
  },
  radii: sharedRadii,
}

export function useMostBoxTheme() {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme
}
