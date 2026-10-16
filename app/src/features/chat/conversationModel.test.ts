import assert from 'node:assert/strict'
import test from 'node:test'
import {
  shouldShowMessageTime,
  getJoinedChannelNames,
  getJoinedChannels,
  getVisibleConversations,
  normalizeHiddenConversations,
  normalizeConversationState,
  getConversationDraft,
  getConversationSummaries,
  getRemainingHiddenConversations,
  markConversationRead,
  setConversationDraft,
} from './conversationModel'
import type { ChatMessage } from '../../chat/chatProtocol'

test('contacts use only joined channel identities and show no fixtures when empty', () => {
  assert.deepEqual(getJoinedChannelNames([]), [])
  assert.deepEqual(
    getJoinedChannelNames([
      { channelKey: '8848', name: 'Display name' },
      { name: '8848' },
      { channelId: 'other' },
      {},
    ]),
    ['8848', 'other']
  )
})

test('deleting a conversation leaves channel membership intact and reopening restores it', () => {
  const joined = ['8848', 'other']
  const hidden = ['8848']
  assert.deepEqual(getVisibleConversations(joined, hidden), ['other'])
  assert.deepEqual(joined, ['8848', 'other'])
  assert.deepEqual(
    getVisibleConversations(
      joined,
      hidden.filter(name => name !== '8848')
    ),
    joined
  )
})

test('invalid persisted conversation entries do not introduce fake channels', () => {
  assert.deepEqual(normalizeHiddenConversations({ channels: ['8848'] }), [])
  assert.deepEqual(
    normalizeHiddenConversations(['8848', null, 4, '8848', '']),
    ['8848']
  )
})

test('channel remarks preserve identity and pinned channels sort before ordinary channels', () => {
  const channels = getJoinedChannels([
    { channelKey: '8848', remark: 'Team', pinned: false },
    { channelKey: 'other', remark: 'Pinned team', pinned: true },
  ])
  assert.deepEqual(channels, [
    { name: 'other', remark: 'Pinned team', pinned: true },
    { name: '8848', remark: 'Team', pinned: false },
  ])
  assert.deepEqual(getJoinedChannels([{ ...channels[1], remark: '' }]), [
    { name: '8848', remark: '', pinned: false },
  ])
})

const aliceMessage = (timestamp: number, content = 'Hello'): ChatMessage => ({
  author: 'alice',
  authorName: 'Alice',
  content,
  timestamp,
})

test('drafts stay in their own channel and removing a sent draft keeps other drafts', () => {
  let state = normalizeConversationState(null)
  state = setConversationDraft(state, '# Team ', 'Unsent in team')
  state = setConversationDraft(state, 'other', 'Unsent in other')
  assert.equal(getConversationDraft(state, 'team'), 'Unsent in team')
  assert.equal(getConversationDraft(state, 'other'), 'Unsent in other')
  assert.equal(getConversationDraft(state, 'constructor'), '')
  state = setConversationDraft(state, '__proto__', 'Safe draft')
  assert.equal(getConversationDraft(state, '__proto__'), 'Safe draft')
  state = setConversationDraft(state, 'team', '')
  assert.equal(getConversationDraft(state, 'team'), '')
  assert.equal(getConversationDraft(state, 'other'), 'Unsent in other')
  assert.equal(setConversationDraft(state, 'other', 'Unsent in other'), state)
})

test('persisted conversation state accepts only canonical draft and read records', () => {
  assert.deepEqual(
    normalizeConversationState({
      drafts: { '# TEAM ': 'Draft', blank: '', number: 7 },
      readAt: { '# TEAM ': 100, bad: -1, infinite: Infinity, text: '200' },
    }),
    { drafts: { team: 'Draft' }, readAt: { team: 100 } }
  )
  assert.deepEqual(normalizeConversationState({ drafts: [], readAt: [] }), {
    drafts: {},
    readAt: {},
  })
})

test('unread messages exclude the current author and duplicate history events', () => {
  const joined = getJoinedChannels([{ name: 'team' }])
  const baseline = [aliceMessage(100)]
  const state = markConversationRead(
    normalizeConversationState(null),
    'team',
    baseline
  )
  const incoming = aliceMessage(200)
  const own = { ...aliceMessage(300), author: 'bob' }
  const messages = { team: [...baseline, incoming, incoming, own] }
  const summary = getConversationSummaries(joined, messages, state, 'bob')[0]
  assert.equal(summary.unread, 1)
  assert.equal(summary.lastMessage, own)
  const read = markConversationRead(state, 'team', messages.team)
  assert.equal(
    getConversationSummaries(joined, messages, read, 'bob')[0].unread,
    0
  )
  assert.equal(markConversationRead(read, 'team', baseline), read)
})

test('removed conversations return for new incoming messages, while historical, own and system messages stay hidden', () => {
  const original = aliceMessage(100)
  const state = markConversationRead(normalizeConversationState(null), 'team', [
    original,
  ])
  const own = { ...aliceMessage(200), author: 'bob' }
  const system = { ...aliceMessage(300), type: 'system' }
  assert.deepEqual(
    getRemainingHiddenConversations(
      ['team'],
      { team: [original, own, system] },
      state,
      'bob'
    ),
    ['team']
  )
  assert.deepEqual(
    getRemainingHiddenConversations(
      ['team'],
      { team: [original, aliceMessage(400)] },
      state,
      'bob'
    ),
    []
  )
  assert.deepEqual(
    getRemainingHiddenConversations(['team'], {}, state, 'bob'),
    ['team']
  )
  assert.deepEqual(
    getRemainingHiddenConversations(
      ['team'],
      { team: [original] },
      normalizeConversationState(null),
      'bob'
    ),
    ['team']
  )
})

test('deleting an unread conversation establishes a baseline that survives reload without replaying it', () => {
  const baseline = [aliceMessage(100), aliceMessage(200)]
  const state = markConversationRead(
    normalizeConversationState(null),
    'team',
    baseline
  )
  const reloaded = normalizeConversationState(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(
    getRemainingHiddenConversations(
      ['team'],
      { team: baseline },
      reloaded,
      'bob'
    ),
    ['team']
  )
  const address = '0x2Fd13F1a54488cFF329b7a4997351CA0847C08Cc'
  const own = { ...aliceMessage(300), author: address.toLowerCase() }
  assert.deepEqual(
    getRemainingHiddenConversations(
      ['team'],
      { team: [...baseline, own] },
      reloaded,
      address
    ),
    ['team']
  )
  assert.deepEqual(
    getRemainingHiddenConversations(
      ['team'],
      { team: [...baseline, aliceMessage(400)] },
      reloaded,
      address
    ),
    []
  )
})

test('system profile events neither replace conversation previews nor count as unread', () => {
  const joined = getJoinedChannels([{ name: 'team' }])
  const baseline = aliceMessage(100)
  const ownAddress = '0x2Fd13F1a54488cFF329b7a4997351CA0847C08Cc'
  const own = { ...aliceMessage(200), author: ownAddress.toLowerCase() }
  const system = {
    ...aliceMessage(300),
    type: 'system',
    content: 'channel.member.joined',
  }
  const state = markConversationRead(normalizeConversationState(null), 'team', [
    baseline,
  ])
  const summary = getConversationSummaries(
    joined,
    { team: [baseline, own, system] },
    state,
    ownAddress
  )[0]
  assert.equal(summary.unread, 0)
  assert.equal(summary.lastMessage, own)
  assert.equal(markConversationRead(state, 'team', [system]), state)
})

test('the conversation list sorts pinned first then recent activity and searches remarks and file names', () => {
  const channels = getJoinedChannels([
    { name: 'old', pinned: true },
    { name: 'older', remark: 'Design team' },
    { name: 'new' },
  ])
  const messages = {
    old: [aliceMessage(100)],
    older: [aliceMessage(200)],
    new: [
      {
        ...aliceMessage(300),
        attachment: {
          kind: 'file' as const,
          cid: 'cid',
          fileName: 'meeting-notes.pdf',
          link: 'most://cid',
        },
      },
    ],
  }
  const state = normalizeConversationState(null)
  assert.deepEqual(
    getConversationSummaries(channels, messages, state, 'bob').map(
      item => item.name
    ),
    ['old', 'new', 'older']
  )
  assert.deepEqual(
    getConversationSummaries(
      channels,
      messages,
      state,
      'bob',
      [],
      ' DESIGN '
    ).map(item => item.name),
    ['older']
  )
  assert.deepEqual(
    getConversationSummaries(channels, messages, state, 'bob', [], 'notes').map(
      item => item.name
    ),
    ['new']
  )
  assert.equal(
    getConversationSummaries(channels, messages, state, 'bob', ['new'], 'notes')
      .length,
    0
  )
  assert.deepEqual(
    getConversationSummaries(
      channels,
      messages,
      state,
      'bob',
      [],
      ' #NEW '
    ).map(item => item.name),
    ['new']
  )
})

test('time separators group nearby messages but retain gaps, day boundaries and missing timestamps', () => {
  const at = (timestamp?: number | string): ChatMessage => ({
    author: 'a',
    authorName: 'A',
    content: '',
    timestamp,
  })
  const start = new Date(2026, 9, 16, 12).getTime()
  assert.equal(shouldShowMessageTime(at(start)), true)
  assert.equal(shouldShowMessageTime(at(start + 299999), at(start)), false)
  assert.equal(shouldShowMessageTime(at(start + 300000), at(start)), true)
  assert.equal(shouldShowMessageTime(at('invalid'), at(start)), false)
  assert.equal(shouldShowMessageTime(at(start), at()), true)
  assert.equal(
    shouldShowMessageTime(
      at(new Date(2026, 9, 17, 0, 1).getTime()),
      at(new Date(2026, 9, 16, 23, 59).getTime())
    ),
    true
  )
})
