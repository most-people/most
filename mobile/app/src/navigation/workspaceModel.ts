export type WorkspaceTab = 'messages' | 'files' | 'notes' | 'me'

export type ConversationSummary = {
  channelId: string
  title: string
  avatarKey?: string
  lastMessagePreview?: string
  lastMessageAt?: number
  unreadCount: number
  pinned: boolean
  muted: boolean
  draft?: string
}

export type WorkspacePreferences = {
  activeTab: WorkspaceTab
  selectedConversationId?: string
  lastRoute?: string
}

export type WorkspaceState = {
  preferences: WorkspacePreferences
  conversations: ConversationSummary[]
}

export type WorkspaceAction =
  | { type: 'setActiveTab'; tab: WorkspaceTab }
  | { type: 'selectConversation'; channelId?: string }
  | { type: 'setLastRoute'; route?: string }
  | { type: 'upsertConversation'; conversation: ConversationSummary }
  | {
      type: 'receiveMessage'
      channelId: string
      preview?: string
      at?: number
    }
  | { type: 'markConversationRead'; channelId: string }
  | { type: 'incrementUnread'; channelId: string; amount?: number }
  | { type: 'setPinned'; channelId: string; pinned: boolean }
  | { type: 'togglePinned'; channelId: string }
  | { type: 'setMuted'; channelId: string; muted: boolean }
  | { type: 'toggleMuted'; channelId: string }
  | { type: 'setDraft'; channelId: string; draft?: string }
  | { type: 'removeConversation'; channelId: string }
  | { type: 'reset' }
  | { type: 'hydrate'; state: WorkspaceState }

export const DEFAULT_WORKSPACE_TAB: WorkspaceTab = 'files'
export const WORKSPACE_STORAGE_KEY = 'mostbox.workspace.v1'

export const createInitialWorkspaceState = createDefaultWorkspaceState

export function createDefaultWorkspaceState(): WorkspaceState {
  return {
    preferences: { activeTab: DEFAULT_WORKSPACE_TAB },
    conversations: [],
  }
}

function normalizeConversation(value: unknown): ConversationSummary | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (typeof source.channelId !== 'string' || !source.channelId.trim()) {
    return null
  }
  const title = typeof source.title === 'string' ? source.title : ''
  const unreadCount =
    typeof source.unreadCount === 'number' &&
    Number.isFinite(source.unreadCount)
      ? Math.max(0, Math.floor(source.unreadCount))
      : 0
  const conversation: ConversationSummary = {
    channelId: source.channelId,
    title,
    unreadCount,
    pinned: source.pinned === true,
    muted: source.muted === true,
  }
  if (typeof source.avatarKey === 'string')
    conversation.avatarKey = source.avatarKey
  if (typeof source.lastMessagePreview === 'string') {
    conversation.lastMessagePreview = source.lastMessagePreview
  }
  if (
    typeof source.lastMessageAt === 'number' &&
    Number.isFinite(source.lastMessageAt)
  ) {
    conversation.lastMessageAt = source.lastMessageAt
  }
  if (typeof source.draft === 'string' && source.draft.length > 0) {
    conversation.draft = source.draft
  }
  return conversation
}

function normalizeTab(value: unknown): WorkspaceTab {
  return value === 'messages' ||
    value === 'files' ||
    value === 'notes' ||
    value === 'me'
    ? value
    : DEFAULT_WORKSPACE_TAB
}

function normalizeState(value: unknown): WorkspaceState {
  if (!value || typeof value !== 'object') return createDefaultWorkspaceState()
  const source = value as Record<string, unknown>
  const rawPreferences =
    source.preferences && typeof source.preferences === 'object'
      ? (source.preferences as Record<string, unknown>)
      : {}
  const conversations = Array.isArray(source.conversations)
    ? source.conversations
        .map(normalizeConversation)
        .filter((item): item is ConversationSummary => item !== null)
    : []
  const deduplicated = new Map<string, ConversationSummary>()
  for (const conversation of conversations) {
    deduplicated.set(conversation.channelId, conversation)
  }
  const preferences: WorkspacePreferences = {
    activeTab: normalizeTab(rawPreferences.activeTab),
  }
  if (typeof rawPreferences.selectedConversationId === 'string') {
    preferences.selectedConversationId = rawPreferences.selectedConversationId
  }
  if (typeof rawPreferences.lastRoute === 'string') {
    preferences.lastRoute = rawPreferences.lastRoute
  }
  return { preferences, conversations: [...deduplicated.values()] }
}

function updateConversation(
  state: WorkspaceState,
  channelId: string,
  update: (conversation: ConversationSummary) => ConversationSummary
): WorkspaceState {
  let changed = false
  const conversations = state.conversations.map(conversation => {
    if (conversation.channelId !== channelId) return conversation
    changed = true
    return update(conversation)
  })
  return changed ? { ...state, conversations } : state
}

export function getOrderedConversations(
  conversations: ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
    return (right.lastMessageAt ?? 0) - (left.lastMessageAt ?? 0)
  })
}

/** Format a conversation timestamp with the compact rules used by WeChat. */
export function formatConversationTime(
  value: Date | string | number,
  locale: string,
  now: Date | string | number = Date.now()
): string {
  const date = value instanceof Date ? value : new Date(value)
  const current = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return ''

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const dayDifference = Math.floor(
    (startOfDay(current) - startOfDay(date)) / 86400000
  )
  const isChinese = locale.toLowerCase().startsWith('zh')

  if (dayDifference <= 0) return time
  if (dayDifference === 1)
    return isChinese ? `昨天 ${time}` : `Yesterday ${time}`
  if (dayDifference === 2) return isChinese ? `前天 ${time}` : `2 days ago`
  if (dayDifference < 7) {
    if (isChinese) {
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      return `星期${weekdays[date.getDay()]}`
    }
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  }
  if (isChinese) {
    if (date.getFullYear() === current.getFullYear()) {
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }
  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === current.getFullYear() ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case 'setActiveTab':
      return state.preferences.activeTab === action.tab
        ? state
        : {
            ...state,
            preferences: { ...state.preferences, activeTab: action.tab },
          }
    case 'selectConversation': {
      const preferences = { ...state.preferences }
      if (action.channelId)
        preferences.selectedConversationId = action.channelId
      else delete preferences.selectedConversationId
      return { ...state, preferences }
    }
    case 'setLastRoute': {
      const preferences = { ...state.preferences }
      if (action.route) preferences.lastRoute = action.route
      else delete preferences.lastRoute
      return { ...state, preferences }
    }
    case 'upsertConversation': {
      const incoming = normalizeConversation(action.conversation)
      if (!incoming) return state
      const index = state.conversations.findIndex(
        item => item.channelId === incoming.channelId
      )
      if (index < 0)
        return { ...state, conversations: [...state.conversations, incoming] }
      const conversations = [...state.conversations]
      conversations[index] = incoming
      return { ...state, conversations }
    }
    case 'receiveMessage': {
      const at = action.at ?? Date.now()
      return updateConversation(state, action.channelId, conversation => ({
        ...conversation,
        ...(action.preview === undefined
          ? {}
          : { lastMessagePreview: action.preview }),
        lastMessageAt: at,
        unreadCount:
          state.preferences.activeTab === 'messages' &&
          state.preferences.selectedConversationId === action.channelId
            ? 0
            : conversation.unreadCount + 1,
      }))
    }
    case 'markConversationRead':
      return updateConversation(state, action.channelId, conversation =>
        conversation.unreadCount === 0
          ? conversation
          : { ...conversation, unreadCount: 0 }
      )
    case 'incrementUnread':
      return updateConversation(state, action.channelId, conversation => {
        const amount = Math.floor(action.amount ?? 1)
        return amount > 0
          ? { ...conversation, unreadCount: conversation.unreadCount + amount }
          : conversation
      })
    case 'setPinned':
      return updateConversation(state, action.channelId, conversation =>
        conversation.pinned === action.pinned
          ? conversation
          : { ...conversation, pinned: action.pinned }
      )
    case 'togglePinned':
      return updateConversation(state, action.channelId, conversation => ({
        ...conversation,
        pinned: !conversation.pinned,
      }))
    case 'setMuted':
      return updateConversation(state, action.channelId, conversation =>
        conversation.muted === action.muted
          ? conversation
          : { ...conversation, muted: action.muted }
      )
    case 'toggleMuted':
      return updateConversation(state, action.channelId, conversation => ({
        ...conversation,
        muted: !conversation.muted,
      }))
    case 'setDraft':
      return updateConversation(state, action.channelId, conversation => {
        const next = { ...conversation }
        if (action.draft) next.draft = action.draft
        else delete next.draft
        return next
      })
    case 'removeConversation': {
      const conversations = state.conversations.filter(
        conversation => conversation.channelId !== action.channelId
      )
      const preferences = { ...state.preferences }
      if (preferences.selectedConversationId === action.channelId) {
        delete preferences.selectedConversationId
      }
      return conversations.length === state.conversations.length &&
        preferences.selectedConversationId ===
          state.preferences.selectedConversationId
        ? state
        : { preferences, conversations }
    }
    case 'reset':
      return createDefaultWorkspaceState()
    case 'hydrate':
      return normalizeState(action.state)
  }
}

export function serializeWorkspaceState(state: WorkspaceState): string {
  return JSON.stringify(normalizeState(state))
}

export function deserializeWorkspaceState(
  serialized: string | null | undefined
): WorkspaceState {
  if (!serialized) return createDefaultWorkspaceState()
  try {
    return normalizeState(JSON.parse(serialized))
  } catch {
    return createDefaultWorkspaceState()
  }
}

// Alias kept for callers that prefer parse terminology.
export const parseWorkspaceState = deserializeWorkspaceState
