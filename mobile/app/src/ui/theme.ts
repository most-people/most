import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import { Platform, useColorScheme } from 'react-native'

export type ThemeMode = 'light' | 'dark'
export type ThemePreference = ThemeMode | 'system'

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

const WEB_THEME_PREFERENCE_KEY = 'mostbox.web.theme'
const themePreferencePath = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}mostbox-theme.txt`
  : ''

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system'
}

function getInitialThemePreference(): ThemePreference {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
    return 'system'
  }
  try {
    const value = localStorage.getItem(WEB_THEME_PREFERENCE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

async function readStoredThemePreference() {
  if (Platform.OS === 'web') return getInitialThemePreference()
  if (!themePreferencePath) return 'system' as const
  try {
    const value = await FileSystem.readAsStringAsync(themePreferencePath, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    const normalized = value.trim()
    return isThemePreference(normalized) ? normalized : 'system'
  } catch {
    return 'system' as const
  }
}

async function persistThemePreference(preference: ThemePreference) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(WEB_THEME_PREFERENCE_KEY, preference)
    } catch {
      // Keep the in-memory theme when browser storage is unavailable.
    }
    return
  }
  if (!themePreferencePath) return
  try {
    await FileSystem.writeAsStringAsync(themePreferencePath, preference, {
      encoding: FileSystem.EncodingType.UTF8,
    })
  } catch {
    // Keep the in-memory theme when preference storage is unavailable.
  }
}

export function getNextThemePreference(
  preference: ThemePreference
): ThemePreference {
  if (preference === 'system') return 'dark'
  if (preference === 'dark') return 'light'
  return 'system'
}

export const lightTheme: MostBoxTheme = {
  mode: 'light',
  statusBarStyle: 'dark-content',
  colors: {
    background: '#f5f5f7',
    backgroundGlowPrimary: 'rgba(94, 106, 210, 0.1)',
    backgroundGlowSecondary: 'rgba(90, 200, 250, 0.08)',
    backgroundGlowTertiary: 'rgba(255, 149, 120, 0.06)',
    surface: '#ffffff',
    surfaceSolid: '#ffffff',
    surfaceSubtle: '#f8f8fa',
    surfaceMuted: '#e8e8ed',
    surfaceElevated: '#ffffff',
    glass: '#ffffff',
    glassHeavy: '#ffffff',
    glassSubtle: '#f8f8fa',
    glassSolid: '#ffffff',
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
    opacity: 0.1,
    radius: 12,
    offsetY: 2,
    elevation: 3,
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
    surface: '#1c1c1e',
    surfaceSolid: '#1c1c1e',
    surfaceSubtle: '#141416',
    surfaceMuted: '#141416',
    surfaceElevated: '#242426',
    glass: '#1c1c1e',
    glassHeavy: '#1c1c1e',
    glassSubtle: '#141416',
    glassSolid: '#1c1c1e',
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
    opacity: 0.12,
    radius: 12,
    offsetY: 2,
    elevation: 3,
  },
  spacing: sharedSpacing,
}

type ThemeContextValue = {
  preference: ThemePreference
  cyclePreference: () => void
  theme: MostBoxTheme
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>(
    getInitialThemePreference
  )

  useEffect(() => {
    let active = true
    void readStoredThemePreference().then(storedPreference => {
      if (active) setPreferenceState(storedPreference)
    })
    return () => {
      active = false
    }
  }, [])

  const cyclePreference = useCallback(() => {
    setPreferenceState(currentPreference => {
      const nextPreference = getNextThemePreference(currentPreference)
      void persistThemePreference(nextPreference)
      return nextPreference
    })
  }, [])

  const resolvedMode =
    preference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference
  const theme = resolvedMode === 'dark' ? darkTheme : lightTheme
  const value = useMemo<ThemeContextValue>(
    () => ({ preference, cyclePreference, theme }),
    [cyclePreference, preference, theme]
  )

  return createElement(ThemeContext.Provider, { value }, children)
}

export function useThemePreference() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useThemePreference must be used within ThemeProvider')
  }
  return value
}

export function useMostBoxTheme() {
  const value = useContext(ThemeContext)
  const systemColorScheme = useColorScheme()
  if (value) return value.theme
  return systemColorScheme === 'dark' ? darkTheme : lightTheme
}
