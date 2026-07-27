export const APPEARANCE_PREFERENCES = ['dark', 'light', 'system'] as const

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number]
export type ResolvedAppearance = Exclude<AppearancePreference, 'system'>

export function isAppearancePreference(
  value: unknown
): value is AppearancePreference {
  return value === 'dark' || value === 'light' || value === 'system'
}

export function normalizeAppearancePreference(
  value: unknown
): AppearancePreference {
  return isAppearancePreference(value) ? value : 'system'
}

export function resolveAppearancePreference(
  preference: AppearancePreference,
  prefersDark: boolean
): ResolvedAppearance {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}
