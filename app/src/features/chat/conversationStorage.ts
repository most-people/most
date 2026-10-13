import * as FileSystem from 'expo-file-system/legacy'
import { normalizeHiddenConversations } from './conversationModel'

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
  return normalizeHiddenConversations((await readState())[scope])
}

export async function saveHiddenConversations(
  scope: string,
  channels: string[]
) {
  const state = await readState()
  await FileSystem.writeAsStringAsync(
    stateUri(),
    JSON.stringify({
      ...state,
      [scope]: normalizeHiddenConversations(channels),
    })
  )
}
