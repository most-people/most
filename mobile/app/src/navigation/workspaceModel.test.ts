import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultWorkspaceState,
  deserializeWorkspaceState,
  formatConversationTime,
  getOrderedConversations,
  serializeWorkspaceState,
  workspaceReducer,
  type ConversationSummary,
} from './workspaceModel'

const alpha: ConversationSummary = {
  channelId: 'alpha',
  title: 'Alpha',
  unreadCount: 0,
  pinned: false,
  muted: false,
  lastMessageAt: 10,
}

test('defaults to the files workspace and has no conversations', () => {
  assert.deepEqual(createDefaultWorkspaceState(), {
    preferences: { activeTab: 'files' },
    conversations: [],
  })
})

test('conversation reducer supports selection, unread, pin, mute and drafts', () => {
  let state = workspaceReducer(createDefaultWorkspaceState(), {
    type: 'upsertConversation',
    conversation: alpha,
  })
  state = workspaceReducer(state, { type: 'setActiveTab', tab: 'messages' })
  state = workspaceReducer(state, {
    type: 'selectConversation',
    channelId: 'alpha',
  })
  state = workspaceReducer(state, {
    type: 'receiveMessage',
    channelId: 'alpha',
    preview: 'hello',
    at: 20,
  })
  assert.equal(state.conversations[0].unreadCount, 0)
  state = workspaceReducer(state, { type: 'selectConversation' })
  state = workspaceReducer(state, {
    type: 'incrementUnread',
    channelId: 'alpha',
    amount: 2,
  })
  state = workspaceReducer(state, { type: 'togglePinned', channelId: 'alpha' })
  state = workspaceReducer(state, {
    type: 'setMuted',
    channelId: 'alpha',
    muted: true,
  })
  state = workspaceReducer(state, {
    type: 'setDraft',
    channelId: 'alpha',
    draft: 'draft text',
  })
  assert.deepEqual(state.conversations[0], {
    ...alpha,
    lastMessagePreview: 'hello',
    lastMessageAt: 20,
    unreadCount: 2,
    pinned: true,
    muted: true,
    draft: 'draft text',
  })
  state = workspaceReducer(state, {
    type: 'markConversationRead',
    channelId: 'alpha',
  })
  state = workspaceReducer(state, { type: 'setDraft', channelId: 'alpha' })
  assert.equal(state.conversations[0].unreadCount, 0)
  assert.equal('draft' in state.conversations[0], false)
})

test('ordered conversations put pinned items first, then newest messages', () => {
  const ordered = getOrderedConversations([
    { ...alpha, channelId: 'old', lastMessageAt: 30 },
    { ...alpha, channelId: 'pinned', pinned: true, lastMessageAt: 1 },
    { ...alpha, channelId: 'new', lastMessageAt: 50 },
  ])
  assert.deepEqual(
    ordered.map(item => item.channelId),
    ['pinned', 'new', 'old']
  )
})

test('serialization round trips and malformed data falls back safely', () => {
  const state = workspaceReducer(createDefaultWorkspaceState(), {
    type: 'upsertConversation',
    conversation: { ...alpha, unreadCount: 3, draft: 'keep me' },
  })
  const restored = deserializeWorkspaceState(serializeWorkspaceState(state))
  assert.deepEqual(restored, state)
  assert.deepEqual(
    deserializeWorkspaceState('{bad json'),
    createDefaultWorkspaceState()
  )
  assert.deepEqual(
    deserializeWorkspaceState(
      JSON.stringify({
        preferences: { activeTab: 'unknown', selectedConversationId: 4 },
        conversations: [
          {
            channelId: 'x',
            title: 'X',
            unreadCount: -3,
            pinned: 1,
            muted: false,
          },
          {
            channelId: 'x',
            title: 'latest',
            unreadCount: 2,
            pinned: true,
            muted: true,
          },
          { title: 'missing id' },
        ],
      })
    ),
    {
      preferences: { activeTab: 'files' },
      conversations: [
        {
          channelId: 'x',
          title: 'latest',
          unreadCount: 2,
          pinned: true,
          muted: true,
        },
      ],
    }
  )
})

test('reset clears preferences and conversations', () => {
  const state = workspaceReducer(
    {
      preferences: { activeTab: 'messages', selectedConversationId: 'alpha' },
      conversations: [alpha],
    },
    { type: 'reset' }
  )
  assert.deepEqual(state, createDefaultWorkspaceState())
})

test('conversation timestamps use compact relative display rules', () => {
  const now = new Date(2026, 8, 14, 9, 27)
  assert.equal(
    formatConversationTime(new Date(2026, 8, 14, 8, 51), 'zh-CN', now),
    '08:51'
  )
  assert.equal(
    formatConversationTime(new Date(2026, 8, 13, 1, 50), 'zh-CN', now),
    '昨天 01:50'
  )
  assert.equal(
    formatConversationTime(new Date(2026, 8, 12, 1, 50), 'zh-CN', now),
    '前天 01:50'
  )
  assert.equal(
    formatConversationTime(new Date(2026, 8, 11, 1, 50), 'zh-CN', now),
    '星期五'
  )
  assert.equal(
    formatConversationTime(new Date(2026, 7, 21, 9, 53), 'zh-CN', now),
    '8月21日'
  )
})
