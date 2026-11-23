import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { isChannelFolded, splitFoldedChannels } from '../lib/chatFold.js'

const AT = '2026-11-18T02:00:00.000Z'
const keys = list => list.map(channel => channel.channelKey)

describe('chat fold state', () => {
  it('auto-folds channels without messages that are not pinned', () => {
    assert.equal(isChannelFolded({ channelKey: 'a', lastMessageAt: '' }), true)
    assert.equal(isChannelFolded({ channelKey: 'a' }), true)
    assert.equal(
      isChannelFolded({ channelKey: 'a', lastMessageAt: '', pinned: true }),
      false
    )
    assert.equal(isChannelFolded({ channelKey: 'a', lastMessageAt: AT }), false)
  })

  it('prefers the manual fold preference', () => {
    assert.equal(
      isChannelFolded({ channelKey: 'a', lastMessageAt: AT, folded: true }),
      true
    )
    assert.equal(
      isChannelFolded({ channelKey: 'a', lastMessageAt: '', folded: false }),
      false
    )
  })

  it('splits channels and keeps sort order', () => {
    const channels = [
      { channelKey: 'talk', lastMessageAt: AT },
      { channelKey: 'empty-1', lastMessageAt: '' },
      { channelKey: 'muted', lastMessageAt: AT, folded: true },
      { channelKey: 'empty-2', lastMessageAt: '' },
      { channelKey: 'kept', lastMessageAt: '', folded: false },
    ]
    const { main, folded } = splitFoldedChannels(channels)
    assert.deepEqual(keys(main), ['talk', 'kept'])
    assert.deepEqual(keys(folded), ['empty-1', 'muted', 'empty-2'])
  })

  it('keeps the active auto-folded channel in the current view', () => {
    const channels = [
      { channelKey: 'talk', lastMessageAt: AT },
      { channelKey: 'new', lastMessageAt: '' },
      { channelKey: 'muted', lastMessageAt: AT, folded: true },
    ]
    const inMain = splitFoldedChannels(channels, {
      activeKey: 'new',
      view: 'main',
    })
    assert.deepEqual(keys(inMain.main), ['talk', 'new'])
    assert.deepEqual(keys(inMain.folded), ['muted'])

    const inFolded = splitFoldedChannels(channels, {
      activeKey: 'new',
      view: 'folded',
    })
    assert.deepEqual(keys(inFolded.folded), ['new', 'muted'])

    const manualActive = splitFoldedChannels(channels, {
      activeKey: 'muted',
      view: 'main',
    })
    assert.deepEqual(keys(manualActive.folded), ['new', 'muted'])
  })
})
