import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getJoinedChannelNames,
  getJoinedChannels,
  getVisibleConversations,
  normalizeHiddenConversations,
} from './conversationModel'

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
