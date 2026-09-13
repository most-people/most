export type ChatUiPreferences = {
  pinned: boolean
  muted: boolean
  draft: string
  lastReadAt: number
}

export type ChatUiPreferencesMap = Record<string, ChatUiPreferences>

export {
  DEFAULT_CHAT_UI_PREFERENCES,
  getChatUiPreferences,
  getChatUiPreferencesStorageKey,
  normalizeChatUiPreferences,
  normalizeChatUiPreferencesMap,
  readStoredChatUiPreferences,
  updateChatUiPreferences,
  writeStoredChatUiPreferences,
} from './chatUiPreferencesRuntime.js'
