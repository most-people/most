import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import b4a from 'b4a'
import {
  DIAGNOSTIC_AUTHOR,
  buildChannelKey,
  channelToCandidate,
  createChannelRecord,
  formatChannelForResponse,
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
  normalizeChannelMessage,
  normalizeChannelRecord,
  sortChannelMessages,
} from './channel-protocol.mjs'
import { createJsonLineParser } from './protocol.mjs'

describe('backend JSON line parser', () => {
  it('waits for a full newline-delimited command across IPC chunks', () => {
    const messages = []
    const errors = []
    const parse = createJsonLineParser(
      message => messages.push(message),
      error => errors.push(error)
    )
    const command = {
      id: 'publish_1',
      type: 'file.publish',
      payload: {
        name: 'large.bin',
        contentBase64: 'A'.repeat(70_000),
      },
    }
    const line = `${JSON.stringify(command)}\n`

    parse(Buffer.from(line.slice(0, 65_536)))
    assert.equal(messages.length, 0)
    assert.equal(errors.length, 0)

    parse(Buffer.from(line.slice(65_536)))
    assert.equal(messages.length, 1)
    assert.equal(errors.length, 0)
    assert.equal(messages[0].payload.contentBase64.length, 70_000)
  })

  it('parses multiple commands delivered in one IPC chunk', () => {
    const messages = []
    const parse = createJsonLineParser(message => messages.push(message))

    parse(Buffer.from('{"type":"node.start"}\n{"type":"log.list"}\n'))

    assert.deepEqual(
      messages.map(message => message.type),
      ['node.start', 'log.list']
    )
  })

  it('reports malformed lines without dropping the next complete command', () => {
    const messages = []
    const errors = []
    const parse = createJsonLineParser(
      message => messages.push(message),
      error => errors.push(error)
    )

    parse(Buffer.from('not-json\n{"type":"node.start"}\n'))

    assert.equal(errors.length, 1)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].type, 'node.start')
  })
})

describe('mobile channel protocol helpers', () => {
  it('derives channel discovery topics with the desktop-compatible prefix', () => {
    const channelKey = 'android-smoke'

    assert.equal(buildChannelKey(channelKey), channelKey)
    assert.equal(
      b4a.toString(generateChannelDiscoveryKey(channelKey), 'hex'),
      createHash('sha256')
        .update(`most-box-room-channel:${channelKey}`)
        .digest('hex')
    )
    assert.equal(
      b4a.toString(generateChannelChatDiscoveryKey(channelKey), 'hex'),
      createHash('sha256')
        .update(`most-box-room-channel:${channelKey}:chat`)
        .digest('hex')
    )
    assert.equal(
      b4a.toString(generateChannelIdDiscoveryKey(channelKey), 'hex'),
      createHash('sha256')
        .update(`most-box-room-id:${channelKey}:candidates`)
        .digest('hex')
    )
  })

  it('normalizes diagnostic channel messages into JSON log entries', () => {
    const message = normalizeChannelMessage(
      {
        content: '  from android  ',
        authorName: 'Android',
      },
      { timestamp: 1234 }
    )

    assert.deepEqual(message, {
      type: 'message',
      author: DIAGNOSTIC_AUTHOR,
      authorName: 'Android',
      content: 'from android',
      timestamp: 1234,
    })
  })

  it('round-trips channel metadata and writer candidates through JSON', () => {
    const created = createChannelRecord('android-smoke', 'public', {
      createdAt: '2026-06-23T00:00:00.000Z',
      writerCoreKeys: ['aa', 'bb', 'aa'],
    })
    const parsed = normalizeChannelRecord(JSON.parse(JSON.stringify(created)))
    const candidate = channelToCandidate(parsed, true)
    const response = formatChannelForResponse(parsed, 2)

    assert.equal(parsed.channelId, 'android-smoke')
    assert.equal(parsed.channelKey, 'android-smoke')
    assert.deepEqual(parsed.writerCoreKeys, ['aa', 'bb'])
    assert.deepEqual(candidate.writerCoreKeys, ['aa', 'bb'])
    assert.equal(response.peerCount, 2)
    assert.equal(response.localWriterCoreKey, '')
  })

  it('sorts and deduplicates multi-writer channel messages', () => {
    const messages = sortChannelMessages([
      { type: 'message', _coreKey: 'a', author: '1', content: 'late', timestamp: 3 },
      { type: 'message', _coreKey: 'b', author: '2', content: 'early', timestamp: 1 },
      { type: 'message', _coreKey: 'b', author: '2', content: 'early', timestamp: 1 },
    ])

    assert.deepEqual(
      messages.map(message => message.content),
      ['early', 'late']
    )
  })
})
