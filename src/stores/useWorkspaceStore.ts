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

interface WorkspaceState extends WorkspacePreferences {
  conversations: ConversationSummary[]
  setActiveTab: (activeTab: WorkspaceTab) => void
  selectConversation: (channelId?: string) => void
  setLastRoute: (lastRoute?: string) => void
  upsertConversation: (conversation: ConversationSummary) => void
  markConversationRead: (channelId: string) => void
  togglePinned: (channelId: string) => void
  toggleMuted: (channelId: string) => void
  setDraft: (channelId: string, draft?: string) => void
}

const STORAGE_KEY = 'mostbox.workspace.v1'

function loadPreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return { activeTab: 'files' }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      activeTab:
        parsed.activeTab === 'messages' ||
        parsed.activeTab === 'files' ||
        parsed.activeTab === 'notes' ||
        parsed.activeTab === 'me'
          ? parsed.activeTab
          : 'files',
      selectedConversationId:
        typeof parsed.selectedConversationId === 'string'
          ? parsed.selectedConversationId
          : undefined,
      lastRoute:
        typeof parsed.lastRoute === 'string' ? parsed.lastRoute : undefined,
    }
  } catch {
    return { activeTab: 'files' }
  }
}

function persist(state: WorkspacePreferences) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Keep navigation available when storage is unavailable.
  }
}

function ordered(conversations: ConversationSummary[]) {
  return [...conversations].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
  })
}

const initial = loadPreferences()

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...initial,
  conversations: [],
  setActiveTab: activeTab => {
    set({ activeTab })
    persist({ ...get(), activeTab })
  },
  selectConversation: selectedConversationId => {
    set({ selectedConversationId })
    persist({ ...get(), selectedConversationId })
  },
  setLastRoute: lastRoute => {
    set({ lastRoute })
    persist({ ...get(), lastRoute })
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
  },
  markConversationRead: channelId =>
    set(state => ({
      conversations: state.conversations.map(item =>
        item.channelId === channelId ? { ...item, unreadCount: 0 } : item
      ),
    })),
  togglePinned: channelId =>
    set(state => ({
      conversations: ordered(
        state.conversations.map(item =>
          item.channelId === channelId
            ? { ...item, pinned: !item.pinned }
            : item
        )
      ),
    })),
  toggleMuted: channelId =>
    set(state => ({
      conversations: state.conversations.map(item =>
        item.channelId === channelId ? { ...item, muted: !item.muted } : item
      ),
    })),
  setDraft: (channelId, draft) =>
    set(state => ({
      conversations: state.conversations.map(item =>
        item.channelId === channelId ? { ...item, draft } : item
      ),
    })),
}))

export { STORAGE_KEY as WORKSPACE_STORAGE_KEY }
