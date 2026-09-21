import { describe, expect, it } from 'vitest'

import {
  APPEARANCE_PREFERENCES,
  isAppearancePreference,
  normalizeAppearancePreference,
  resolveAppearancePreference,
} from '~/lib/appearance'

describe('isAppearancePreference', () => {
  it('accepts the three supported preferences', () => {
    for (const preference of APPEARANCE_PREFERENCES) {
      expect(isAppearancePreference(preference)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isAppearancePreference('AUTO')).toBe(false)
    expect(isAppearancePreference('')).toBe(false)
    expect(isAppearancePreference(null)).toBe(false)
    expect(isAppearancePreference(undefined)).toBe(false)
    expect(isAppearancePreference(0)).toBe(false)
    expect(isAppearancePreference({})).toBe(false)
  })
})

describe('normalizeAppearancePreference', () => {
  it('passes supported preferences through', () => {
    expect(normalizeAppearancePreference('dark')).toBe('dark')
    expect(normalizeAppearancePreference('light')).toBe('light')
    expect(normalizeAppearancePreference('system')).toBe('system')
  })

  it('falls back to system for unknown values', () => {
    expect(normalizeAppearancePreference('sepia')).toBe('system')
    expect(normalizeAppearancePreference(undefined)).toBe('system')
    expect(normalizeAppearancePreference(null)).toBe('system')
  })
})

describe('resolveAppearancePreference', () => {
  it('follows the system color scheme when the preference is system', () => {
    expect(resolveAppearancePreference('system', true)).toBe('dark')
    expect(resolveAppearancePreference('system', false)).toBe('light')
  })

  it('ignores the system color scheme for explicit preferences', () => {
    expect(resolveAppearancePreference('dark', false)).toBe('dark')
    expect(resolveAppearancePreference('light', true)).toBe('light')
  })
})
