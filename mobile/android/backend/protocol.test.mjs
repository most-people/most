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
  normalizeChannelAttachment,
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

  it('persists channel remark and pinned metadata in responses and candidates', () => {
    const created = createChannelRecord('android-meta', 'public', {
      createdAt: '2026-06-30T00:00:00.000Z',
      lastMessageAt: '2026-06-30T01:00:00.000Z',
      writerCoreKeys: ['aa', 'bb', 'aa'],
      remark: 'Team room',
      pinned: true,
    })
    const parsed = normalizeChannelRecord(JSON.parse(JSON.stringify(created)))
    const candidate = channelToCandidate(parsed, true)
    const response = formatChannelForResponse(parsed, 3)

    assert.equal(parsed.remark, 'Team room')
    assert.equal(parsed.pinned, true)
    assert.equal(candidate.remark, 'Team room')
    assert.equal(candidate.pinned, true)
    assert.equal(response.remark, 'Team room')
    assert.equal(response.pinned, true)
    assert.equal(response.peerCount, 3)
  })

  it('normalizes structured channel attachments', () => {
    const attachment = normalizeChannelAttachment({
      kind: 'image',
      cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
      fileName: 'photo.png',
      link: 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png',
      mimeType: 'image/png',
      size: 12345,
    })

    assert.deepEqual(attachment, {
      kind: 'image',
      cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
      fileName: 'photo.png',
      link: 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png',
      mimeType: 'image/png',
      size: 12345,
    })
  })

  it('normalizes attachments when URLSearchParams.keys is unavailable', () => {
    const originalKeys = URLSearchParams.prototype.keys
    Object.defineProperty(URLSearchParams.prototype, 'keys', {
      configurable: true,
      value: undefined,
    })

    try {
      const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
      const attachment = normalizeChannelAttachment({
        kind: 'file',
        cid,
        fileName: 'android file.txt',
        link: `most://${cid}?filename=android%20file.txt`,
      })

      assert.deepEqual(attachment, {
        kind: 'file',
        cid,
        fileName: 'android file.txt',
        link: `most://${cid}?filename=android%20file.txt`,
      })
    } finally {
      Object.defineProperty(URLSearchParams.prototype, 'keys', {
        configurable: true,
        value: originalKeys,
      })
    }
  })

  it('rejects channel attachments with invalid most links', () => {
    assert.equal(
      normalizeChannelAttachment({
        kind: 'file',
        cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
        fileName: 'archive.zip',
        link: 'https://example.test/archive.zip',
      }),
      undefined
    )
    assert.equal(
      normalizeChannelAttachment({
        kind: 'file',
        cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
        fileName: 'archive.zip',
        link: 'most://bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?filename=archive.zip',
      }),
      undefined
    )
  })

  it('maps unsupported attachment kinds to file for desktop parity', () => {
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

    assert.equal(
      normalizeChannelAttachment({
        kind: 'pdf',
        cid,
        fileName: 'paper.pdf',
        link: `most://${cid}?filename=paper.pdf`,
      }).kind,
      'file'
    )
    assert.equal(
      normalizeChannelAttachment({
        kind: 'archive',
        cid,
        fileName: 'archive.zip',
        link: `most://${cid}?filename=archive.zip`,
      }).kind,
      'file'
    )
  })

  it('rejects attachment links with invalid cid, filename, path, or query', () => {
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

    assert.equal(
      normalizeChannelAttachment({
        kind: 'file',
        cid: 'not-a-cid',
        fileName: 'archive.zip',
        link: 'most://not-a-cid?filename=archive.zip',
      }),
      undefined
    )
    assert.equal(
      normalizeChannelAttachment({
        kind: 'file',
        cid,
        fileName: 'photo.png',
        link: `most://${cid}?filename=other.png`,
      }),
      undefined
    )
    assert.equal(
      normalizeChannelAttachment({
        kind: 'file',
        cid,
        fileName: 'archive.zip',
        link: `most://${cid}/extra?filename=archive.zip`,
      }),
      undefined
    )
    assert.equal(
      normalizeChannelAttachment({
        kind: 'file',
        cid,
        fileName: 'archive.zip',
        link: `most://${cid}?filename=archive.zip&foo=bar`,
      }),
      undefined
    )
  })

  it('keeps valid channel attachment cid and link matching exactly', () => {
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    const link = `most://${cid}?filename=archive.zip`
    const attachment = normalizeChannelAttachment({
      kind: 'file',
      cid,
      fileName: 'archive.zip',
      link,
    })

    assert.equal(attachment.cid, cid)
    assert.equal(attachment.link, link)
    assert.equal(new URL(attachment.link).hostname, attachment.cid)
  })

  it('normalizes attachment optional fields like desktop server', () => {
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    const baseAttachment = {
      kind: 'file',
      cid,
      fileName: 'archive.zip',
      link: `most://${cid}?filename=archive.zip`,
    }
    const stringSizeAttachment = normalizeChannelAttachment({
      ...baseAttachment,
      size: '123',
    })
    const negativeSizeAttachment = normalizeChannelAttachment({
      ...baseAttachment,
      size: -1,
    })
    const zeroSizeAttachment = normalizeChannelAttachment({
      ...baseAttachment,
      size: 0,
    })
    const longMimeAttachment = normalizeChannelAttachment({
      ...baseAttachment,
      mimeType: `text/${'plain'.repeat(40)}`,
    })

    assert.equal(stringSizeAttachment.size, 123)
    assert.equal(negativeSizeAttachment, undefined)
    assert.equal(zeroSizeAttachment.size, 0)
    assert.equal(Object.hasOwn(longMimeAttachment, 'mimeType'), false)
  })

  it('keeps structured attachments on channel messages when content matches link', () => {
    const link = 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=photo.png'
    const message = normalizeChannelMessage(
      {
        content: link,
        authorName: 'Android',
        attachment: {
          kind: 'image',
          cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
          fileName: 'photo.png',
          link,
          mimeType: 'image/png',
          size: 12345,
        },
      },
      { timestamp: 1234 }
    )

    assert.equal(message.content, link)
    assert.equal(message.attachment.fileName, 'photo.png')
    assert.equal(message.attachment.kind, 'image')
    assert.equal(message.attachment.size, 12345)
  })

  it('drops or rejects structured attachments when content does not match link', () => {
    const cid = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    const link = `most://${cid}?filename=photo.png`
    const input = {
      content: 'photo.png',
      authorName: 'Android',
      attachment: {
        kind: 'image',
        cid,
        fileName: 'photo.png',
        link,
      },
    }

    const remoteMessage = normalizeChannelMessage(input, { timestamp: 1234 })
    assert.equal(Object.hasOwn(remoteMessage, 'attachment'), false)
    assert.throws(
      () =>
        normalizeChannelMessage(input, {
          timestamp: 1234,
          requireAttachment: true,
        }),
      /attachment content must match link/
    )
  })

  it('keeps messages with different attachment links when deduplicating', () => {
    const firstLink = 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=first.png'
    const secondLink = 'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=second.png'
    const messages = sortChannelMessages([
      {
        type: 'message',
        _coreKey: 'a',
        author: '1',
        content: firstLink,
        timestamp: 1,
        attachment: { link: firstLink },
      },
      {
        type: 'message',
        _coreKey: 'a',
        author: '1',
        content: secondLink,
        timestamp: 1,
        attachment: { link: secondLink },
      },
    ])

    assert.deepEqual(
      messages.map(message => message.attachment.link),
      [firstLink, secondLink]
    )
  })
})
