import {
  normalizeConversationState,
  normalizeHiddenConversations,
  type ConversationState,
} from './conversationModel'

const KEY = 'mostbox.hidden-conversations.v1'

export async function loadHiddenConversations(scope: string) {
  try {
    const state = JSON.parse(localStorage.getItem(KEY) || '{}')
    return normalizeHiddenConversations(state?.[scope])
  } catch {
    return []
  }
}

export async function saveHiddenConversations(
  scope: string,
  channels: string[]
) {
  writeState(scope, normalizeHiddenConversations(channels))
}

function writeState(scope: string, value: unknown) {
  let state: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      state = parsed
  } catch {}
  localStorage.setItem(
    KEY,
    JSON.stringify({
      ...state,
      [scope]: value,
    })
  )
}

export async function loadConversationState(scope: string) {
  try {
    const state = JSON.parse(localStorage.getItem(KEY) || '{}')
    return normalizeConversationState(state?.[`state:${scope}`])
  } catch {
    return normalizeConversationState(null)
  }
}

export async function saveConversationState(
  scope: string,
  state: ConversationState
) {
  writeState(`state:${scope}`, normalizeConversationState(state))
}
