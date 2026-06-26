export type ChatNoteDraft = {
  id: string
  title: string
  content: string
  createdAt: number
}

const CHAT_NOTE_DRAFT_STORAGE_PREFIX = 'mostbox.chatNoteDraft.'

function getStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function getDraftStorageKey(id: string) {
  return `${CHAT_NOTE_DRAFT_STORAGE_PREFIX}${id}`
}

function normalizeDraft(input: unknown): ChatNoteDraft | null {
  if (!input || typeof input !== 'object') return null

  const draft = input as Partial<ChatNoteDraft>
  const id = String(draft.id || '').trim()
  const title = String(draft.title || '').trim()
  const content = String(draft.content || '')
  const createdAt = Number(draft.createdAt || 0)

  if (!id || !title || !content.trim() || !Number.isFinite(createdAt)) {
    return null
  }

  return { id, title, content, createdAt }
}

export function createChatNoteDraft(input: {
  title: string
  content: string
}): ChatNoteDraft | null {
  const storage = getStorage()
  if (!storage) return null

  const createdAt = Date.now()
  const id = `chat-${createdAt}-${Math.random().toString(36).slice(2, 8)}`
  const draft: ChatNoteDraft = {
    id,
    title: input.title,
    content: input.content,
    createdAt,
  }
  storage.setItem(getDraftStorageKey(id), JSON.stringify(draft))
  return draft
}

export function readChatNoteDraft(id: string) {
  const storage = getStorage()
  if (!storage) return null

  try {
    const rawDraft = storage.getItem(getDraftStorageKey(id)) || 'null'
    return normalizeDraft(JSON.parse(rawDraft))
  } catch {
    return null
  }
}

export function deleteChatNoteDraft(id: string) {
  getStorage()?.removeItem(getDraftStorageKey(id))
}

export function getChatNoteDraftHref(id: string) {
  const searchParams = new URLSearchParams()
  searchParams.set('chatDraft', id)
  searchParams.set('mode', 'edit')
  return `/note/?${searchParams.toString()}`
}
