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
  }
  radii: {
    small: number
    medium: number
    large: number
    full: number
  }
}

const sharedRadii = {
  small: 4,
  medium: 8,
  large: 12,
  full: 999,
} as const

export const lightTheme: MostBoxTheme = {
  mode: 'light',
  statusBarStyle: 'dark-content',
  colors: {
    background: '#f5f5f7',
    surface: '#ffffff',
    surfaceSolid: '#ffffff',
    surfaceSubtle: '#fafafd',
    surfaceMuted: '#eeeef2',
    text: '#1d1d1f',
    textSecondary: '#6e6e73',
    textMuted: '#86868b',
    border: '#e3e3e8',
    borderStrong: '#c9c9d0',
    accent: '#5e6ad2',
    accentPressed: '#4f5bc2',
    accentSoft: '#ebeefe',
    onAccent: '#ffffff',
    info: '#32a9d6',
    infoSoft: '#e8f7fc',
    success: '#248a3d',
    successSoft: '#e5f5e9',
    warning: '#c46200',
    warningSoft: '#fff1dc',
    danger: '#d70015',
    dangerSoft: '#fde8ea',
    overlay: 'rgba(15, 15, 18, 0.42)',
  },
  radii: sharedRadii,
}

export const darkTheme: MostBoxTheme = {
  mode: 'dark',
  statusBarStyle: 'light-content',
  colors: {
    background: '#000000',
    surface: '#0a0a0a',
    surfaceSolid: '#111113',
    surfaceSubtle: '#141416',
    surfaceMuted: '#1c1c1f',
    text: '#f5f5f7',
    textSecondary: '#a1a1a6',
    textMuted: '#808080',
    border: '#29292d',
    borderStrong: '#3a3a40',
    accent: '#7d88e7',
    accentPressed: '#6e7ae0',
    accentSoft: '#20243d',
    onAccent: '#ffffff',
    info: '#64d2ff',
    infoSoft: '#142a33',
    success: '#30d158',
    successSoft: '#14291a',
    warning: '#ff9f0a',
    warningSoft: '#30230f',
    danger: '#ff453a',
    dangerSoft: '#331817',
    overlay: 'rgba(0, 0, 0, 0.68)',
  },
  radii: sharedRadii,
}

export function useMostBoxTheme() {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme
}
