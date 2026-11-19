// Last custom avatar URL used on this browser, so picking a built-in avatar on
// the profile page keeps the "custom" option to switch back. Cleared on logout.
const RECENT_CUSTOM_AVATAR_KEY = 'mostbox.profile.customAvatar'

export function loadRecentCustomAvatar() {
  try {
    return localStorage.getItem(RECENT_CUSTOM_AVATAR_KEY) || ''
  } catch {
    return ''
  }
}

export function saveRecentCustomAvatar(url: string) {
  try {
    localStorage.setItem(RECENT_CUSTOM_AVATAR_KEY, url)
  } catch {
    // Only a convenience; the option is simply not remembered.
  }
}

export function clearRecentCustomAvatar() {
  try {
    localStorage.removeItem(RECENT_CUSTOM_AVATAR_KEY)
  } catch {
    // Nothing stored or storage unavailable.
  }
}
