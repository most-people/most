const CHAT_UI_PREFERENCES_STORAGE_PREFIX = 'mostbox.chat.uiPreferences'

/**
 * @typedef {Object} ChatUiPreferences
 * @property {boolean} pinned
 * @property {boolean} muted
 * @property {string} draft
 * @property {number} lastReadAt
 */

/**
 * @typedef {Record<string, ChatUiPreferences>} ChatUiPreferencesMap
 */

export const DEFAULT_CHAT_UI_PREFERENCES = Object.freeze({
  pinned: false,
  muted: false,
  draft: '',
  lastReadAt: 0,
})

function getStorage() {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function normalizeChannelKey(channelKey) {
  return String(channelKey || '').trim()
}

function normalizeLastReadAt(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp < 0) return 0
  return Math.floor(timestamp)
}

/**
 * @param {unknown} value
 * @returns {ChatUiPreferences}
 */
export function normalizeChatUiPreferences(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_CHAT_UI_PREFERENCES }
  }

  const input = /** @type {Partial<ChatUiPreferences>} */ (value)
  return {
    pinned: input.pinned === true,
    muted: input.muted === true,
    draft: typeof input.draft === 'string' ? input.draft : '',
    lastReadAt: normalizeLastReadAt(input.lastReadAt),
  }
}

/**
 * @param {unknown} value
 * @returns {ChatUiPreferencesMap}
 */
export function normalizeChatUiPreferencesMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const result = {}
  for (const [channelKey, preferences] of Object.entries(value)) {
    const normalizedKey = normalizeChannelKey(channelKey)
    if (!normalizedKey) continue
    result[normalizedKey] = normalizeChatUiPreferences(preferences)
  }
  return result
}

export function getChatUiPreferencesStorageKey(address) {
  const normalizedAddress = String(address || '')
    .trim()
    .toLowerCase()
  return normalizedAddress
    ? `${CHAT_UI_PREFERENCES_STORAGE_PREFIX}:${normalizedAddress}`
    : ''
}

/**
 * @param {string} storageKey
 * @param {Storage | undefined} [storage]
 * @returns {ChatUiPreferencesMap}
 */
export function readStoredChatUiPreferences(
  storageKey,
  storage = getStorage()
) {
  if (!storageKey || !storage) return {}
  try {
    const value = storage.getItem(storageKey)
    if (!value) return {}
    return normalizeChatUiPreferencesMap(JSON.parse(value))
  } catch {
    return {}
  }
}

/**
 * @param {string} storageKey
 * @param {unknown} value
 * @param {Storage | undefined} [storage]
 */
export function writeStoredChatUiPreferences(
  storageKey,
  value,
  storage = getStorage()
) {
  if (!storageKey || !storage) return
  try {
    storage.setItem(
      storageKey,
      JSON.stringify(normalizeChatUiPreferencesMap(value))
    )
  } catch {}
}

/**
 * @param {unknown} preferences
 * @param {string} channelKey
 * @returns {ChatUiPreferences}
 */
export function getChatUiPreferences(preferences, channelKey) {
  const normalizedKey = normalizeChannelKey(channelKey)
  if (!normalizedKey || !preferences || typeof preferences !== 'object') {
    return { ...DEFAULT_CHAT_UI_PREFERENCES }
  }

  const map = /** @type {Record<string, unknown>} */ (preferences)
  return normalizeChatUiPreferences(map[normalizedKey])
}

/**
 * Returns a new map and leaves the previous map untouched.
 * @param {unknown} preferences
 * @param {string} channelKey
 * @param {Partial<ChatUiPreferences>} updates
 * @returns {ChatUiPreferencesMap}
 */
export function updateChatUiPreferences(preferences, channelKey, updates) {
  const normalizedKey = normalizeChannelKey(channelKey)
  const previous = normalizeChatUiPreferencesMap(preferences)
  if (!normalizedKey) return previous

  previous[normalizedKey] = normalizeChatUiPreferences({
    ...previous[normalizedKey],
    ...updates,
  })
  return previous
}
