import * as FileSystem from 'expo-file-system/legacy'
import {
  normalizeConversationState,
  normalizeHiddenConversations,
  type ConversationState,
} from './conversationModel'

let writeQueue: Promise<void> = Promise.resolve()

function writeState(scope: string, value: unknown) {
  const operation = writeQueue
    .catch(() => {})
    .then(async () => {
      const state = await readState()
      await FileSystem.writeAsStringAsync(
        stateUri(),
        JSON.stringify({ ...state, [scope]: value })
      )
    })
  writeQueue = operation
  return operation
}

function stateUri() {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory
  if (!base) throw new Error('Conversation storage is unavailable')
  return `${base.replace(/\/$/, '')}/mostbox-hidden-conversations.json`
}

async function readState(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(
      await FileSystem.readAsStringAsync(stateUri())
    )
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export async function loadHiddenConversations(scope: string) {
  await writeQueue.catch(() => {})
  return normalizeHiddenConversations((await readState())[scope])
}

export async function saveHiddenConversations(
  scope: string,
  channels: string[]
) {
  await writeState(scope, normalizeHiddenConversations(channels))
}

export async function loadConversationState(scope: string) {
  await writeQueue.catch(() => {})
  return normalizeConversationState((await readState())[`state:${scope}`])
}

export async function saveConversationState(
  scope: string,
  state: ConversationState
) {
  await writeState(`state:${scope}`, normalizeConversationState(state))
}
