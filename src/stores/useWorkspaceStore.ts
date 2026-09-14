import { create } from 'zustand'

export type WorkspaceTab = 'messages' | 'files' | 'notes' | 'me'
export interface ConversationSummary {
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
export interface WorkspacePreferences {
  activeTab: WorkspaceTab
  selectedConversationId?: string
  lastRoute?: string
}
export interface WorkspaceScope {
  nodeId?: string
  identityId?: string
}
interface PersistedScope extends WorkspacePreferences {
  conversations: ConversationSummary[]
  messageKeysByChannel: Record<string, string[]>
}
interface PersistedWorkspace {
  version: 1
  scopes: Record<string, PersistedScope>
}
interface WorkspaceState extends WorkspacePreferences {
  scope: WorkspaceScope
  conversations: ConversationSummary[]
  messageKeysByChannel: Record<string, string[]>
  setScope: (scope: WorkspaceScope) => void
  setActiveTab: (activeTab: WorkspaceTab) => void
  selectConversation: (channelId?: string) => void
  setLastRoute: (lastRoute?: string) => void
  upsertConversation: (conversation: ConversationSummary) => void
  receiveMessage: (
    channelId: string,
    input?: { preview?: string; at?: number; messageKey?: string }
  ) => boolean
  recordMessageKey: (channelId: string, messageKey: string) => boolean
  markConversationRead: (channelId: string) => void
  incrementUnread: (channelId: string, amount?: number) => void
  togglePinned: (channelId: string) => void
  setPinned: (channelId: string, pinned: boolean) => void
  toggleMuted: (channelId: string) => void
  setMuted: (channelId: string, muted: boolean) => void
  setDraft: (channelId: string, draft?: string) => void
  removeConversation: (channelId: string) => void
  resetWorkspace: () => void
}

const STORAGE_KEY = 'mostbox.workspace.v1'
const DEFAULT_SCOPE_KEY = 'default-node::anonymous'
const MAX_MESSAGE_KEYS = 200
const normalizeTab = (value: unknown): WorkspaceTab =>
  value === 'messages' ||
  value === 'files' ||
  value === 'notes' ||
  value === 'me'
    ? value
    : 'files'
function normalizeConversation(value: unknown): ConversationSummary | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (typeof source.channelId !== 'string' || !source.channelId.trim())
    return null
  return {
    channelId: source.channelId,
    title: typeof source.title === 'string' ? source.title : '',
    ...(typeof source.avatarKey === 'string'
      ? { avatarKey: source.avatarKey }
      : {}),
    ...(typeof source.lastMessagePreview === 'string'
      ? { lastMessagePreview: source.lastMessagePreview }
      : {}),
    ...(typeof source.lastMessageAt === 'number' &&
    Number.isFinite(source.lastMessageAt)
      ? { lastMessageAt: source.lastMessageAt }
      : {}),
    unreadCount:
      typeof source.unreadCount === 'number' &&
      Number.isFinite(source.unreadCount)
        ? Math.max(0, Math.floor(source.unreadCount))
        : 0,
    pinned: source.pinned === true,
    muted: source.muted === true,
    ...(typeof source.draft === 'string' && source.draft
      ? { draft: source.draft }
      : {}),
  }
}
function normalizeScope(value: unknown): PersistedScope {
  const source =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const conversations = Array.isArray(source.conversations)
    ? source.conversations
        .map(normalizeConversation)
        .filter((item): item is ConversationSummary => item !== null)
    : []
  const deduped = new Map(conversations.map(item => [item.channelId, item]))
  const messageKeysByChannel: Record<string, string[]> = {}
  if (
    source.messageKeysByChannel &&
    typeof source.messageKeysByChannel === 'object'
  )
    for (const [channelId, keys] of Object.entries(
      source.messageKeysByChannel as Record<string, unknown>
    ))
      if (Array.isArray(keys))
        messageKeysByChannel[channelId] = keys
          .filter((key): key is string => typeof key === 'string')
          .slice(-MAX_MESSAGE_KEYS)
  return {
    activeTab: normalizeTab(source.activeTab),
    ...(typeof source.selectedConversationId === 'string'
      ? { selectedConversationId: source.selectedConversationId }
      : {}),
    ...(typeof source.lastRoute === 'string'
      ? { lastRoute: source.lastRoute }
      : {}),
    conversations: [...deduped.values()],
    messageKeysByChannel,
  }
}
export function getWorkspaceScopeKey(scope: WorkspaceScope = {}) {
  return `${encodeURIComponent(scope.nodeId?.trim() || 'default-node')}::${encodeURIComponent(scope.identityId?.trim() || 'anonymous')}`
}
function loadWorkspace(): PersistedWorkspace {
  if (typeof window === 'undefined') return { version: 1, scopes: {} }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '{}'
    ) as Record<string, unknown>
    if (parsed.scopes && typeof parsed.scopes === 'object')
      return {
        version: 1,
        scopes: Object.fromEntries(
          Object.entries(parsed.scopes as Record<string, unknown>).map(
            ([key, value]) => [key, normalizeScope(value)]
          )
        ),
      }
    return {
      version: 1,
      scopes: { [DEFAULT_SCOPE_KEY]: normalizeScope(parsed) },
    }
  } catch {
    return { version: 1, scopes: {} }
  }
}
function persistWorkspace(scopes: Record<string, PersistedScope>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, scopes }))
  } catch {}
}
function snapshot(state: WorkspaceState): PersistedScope {
  return {
    activeTab: state.activeTab,
    ...(state.selectedConversationId
      ? { selectedConversationId: state.selectedConversationId }
      : {}),
    ...(state.lastRoute ? { lastRoute: state.lastRoute } : {}),
    conversations: state.conversations,
    messageKeysByChannel: state.messageKeysByChannel,
  }
}
function ordered(items: ConversationSummary[]) {
  return [...items].sort((a, b) =>
    a.pinned !== b.pinned
      ? a.pinned
        ? -1
        : 1
      : (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
  )
}
const initialWorkspace = loadWorkspace()
const initialPersisted =
  initialWorkspace.scopes[DEFAULT_SCOPE_KEY] || normalizeScope({})
function persistCurrent(get: () => WorkspaceState) {
  const state = get()
  initialWorkspace.scopes[getWorkspaceScopeKey(state.scope)] = snapshot(state)
  persistWorkspace(initialWorkspace.scopes)
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  scope: {},
  ...initialPersisted,
  setScope: scope => {
    const persisted =
      initialWorkspace.scopes[getWorkspaceScopeKey(scope)] || normalizeScope({})
    set({ scope, ...persisted })
    initialWorkspace.scopes[getWorkspaceScopeKey(scope)] = persisted
    persistWorkspace(initialWorkspace.scopes)
  },
  setActiveTab: activeTab => {
    set({ activeTab })
    persistCurrent(get)
  },
  selectConversation: selectedConversationId => {
    set({ selectedConversationId })
    persistCurrent(get)
  },
  setLastRoute: lastRoute => {
    set({ lastRoute })
    persistCurrent(get)
  },
  upsertConversation: conversation => {
    set(state => ({
      conversations: ordered([
        ...state.conversations.filter(
          item => item.channelId !== conversation.channelId
        ),
        conversation,
      ]),
    }))
    persistCurrent(get)
  },
  receiveMessage: (channelId, input = {}) => {
    if (
      input.messageKey &&
      !get().recordMessageKey(channelId, input.messageKey)
    )
      return false
    const state = get()
    if (!state.conversations.some(item => item.channelId === channelId))
      return false
    set({
      conversations: ordered(
        state.conversations.map(item =>
          item.channelId === channelId
            ? {
                ...item,
                ...(input.preview === undefined
                  ? {}
                  : { lastMessagePreview: input.preview }),
                lastMessageAt: input.at ?? Date.now(),
                unreadCount:
                  state.activeTab === 'messages' &&
                  state.selectedConversationId === channelId
                    ? 0
                    : item.unreadCount + 1,
              }
            : item
        )
      ),
    })
    persistCurrent(get)
    return true
  },
  recordMessageKey: (channelId, messageKey) => {
    const key = messageKey.trim()
    if (!key) return false
    const state = get()
    const existing = state.messageKeysByChannel[channelId] || []
    if (existing.includes(key)) return false
    set({
      messageKeysByChannel: {
        ...state.messageKeysByChannel,
        [channelId]: [...existing, key].slice(-MAX_MESSAGE_KEYS),
      },
    })
    persistCurrent(get)
    return true
  },
  markConversationRead: channelId => {
    set(state => ({
      conversations: state.conversations.map(item =>
        item.channelId === channelId ? { ...item, unreadCount: 0 } : item
      ),
    }))
    persistCurrent(get)
  },
  incrementUnread: (channelId, amount = 1) => {
    const delta = Math.floor(amount)
    if (delta <= 0) return
    set(state => ({
      conversations: state.conversations.map(item =>
        item.channelId === channelId
          ? { ...item, unreadCount: item.unreadCount + delta }
          : item
      ),
    }))
    persistCurrent(get)
  },
  togglePinned: channelId => {
    const item = get().conversations.find(item => item.channelId === channelId)
    if (item) get().setPinned(channelId, !item.pinned)
  },
  setPinned: (channelId, pinned) => {
    set(state => ({
      conversations: ordered(
        state.conversations.map(item =>
          item.channelId === channelId ? { ...item, pinned } : item
        )
      ),
    }))
    persistCurrent(get)
  },
  toggleMuted: channelId => {
    const item = get().conversations.find(item => item.channelId === channelId)
    if (item) get().setMuted(channelId, !item.muted)
  },
  setMuted: (channelId, muted) => {
    set(state => ({
      conversations: state.conversations.map(item =>
        item.channelId === channelId ? { ...item, muted } : item
      ),
    }))
    persistCurrent(get)
  },
  setDraft: (channelId, draft) => {
    set(state => ({
      conversations: state.conversations.map(item => {
        if (item.channelId !== channelId) return item
        const next = { ...item }
        if (draft) next.draft = draft
        else delete next.draft
        return next
      }),
    }))
    persistCurrent(get)
  },
  removeConversation: channelId => {
    set(state => ({
      conversations: state.conversations.filter(
        item => item.channelId !== channelId
      ),
      ...(state.selectedConversationId === channelId
        ? { selectedConversationId: undefined }
        : {}),
    }))
    persistCurrent(get)
  },
  resetWorkspace: () => {
    const reset = normalizeScope({})
    const key = getWorkspaceScopeKey(get().scope)
    initialWorkspace.scopes[key] = reset
    set({ ...reset })
    persistWorkspace(initialWorkspace.scopes)
  },
}))
export { STORAGE_KEY as WORKSPACE_STORAGE_KEY }
