import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  MobileChannel,
  MobileChannelAttachment,
  MobileChannelMessage,
} from '../../mobileCore/types'
import {
  createMessageKey,
  filterChannelsForQuery,
  getAttachmentFromMessage,
  getChannelTitle,
  getMessageSummary,
  hasUnreadChannel,
  markChannelRead,
  sortChannelsForChatList,
  sortMessagesForDisplay,
  validateChannelName,
} from './chatState'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

function createChannel(overrides: Partial<MobileChannel> = {}): MobileChannel {
  return {
    name: 'general',
    channelId: 'general',
    channelKey: 'key-general',
    key: 'legacy-general',
    type: 'chat',
    remark: '',
    pinned: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    lastMessageAt: '',
    localWriterCoreKey: 'writer-local',
    writerCoreKeys: ['writer-local'],
    peerCount: 0,
    ...overrides,
  }
}

function createMessage(
  overrides: Partial<MobileChannelMessage> = {}
): MobileChannelMessage {
  return {
    author: 'alice',
    authorName: 'Alice',
    content: 'hello',
    timestamp: 1,
    ...overrides,
  }
}

describe('Android chat state helpers', () => {
  it('validates Web-compatible channel names', () => {
    assert.deepEqual(validateChannelName(' room_01-A '), {
      valid: true,
      message: '',
      name: 'room_01-A',
    })
    assert.deepEqual(validateChannelName('ab'), {
      valid: false,
      message: '房间名至少 3 个字符',
      name: 'ab',
    })
    assert.deepEqual(validateChannelName('a'.repeat(31)), {
      valid: false,
      message: '房间名最多 30 个字符',
      name: 'a'.repeat(31),
    })
    assert.deepEqual(validateChannelName('room.01'), {
      valid: false,
      message: '点号为系统保留，不能用于手动房间 ID',
      name: 'room.01',
    })
    assert.deepEqual(validateChannelName('中文房间'), {
      valid: false,
      message: '房间名只能包含字母、数字、下划线和连字符',
      name: '中文房间',
    })
  })

  it('sorts pinned channels before recent channels without mutating input', () => {
    const pinnedOld = createChannel({
      channelKey: 'pinned-old',
      channelId: 'pinned-old',
      pinned: true,
      createdAt: '2026-06-01T00:00:00.000Z',
      lastMessageAt: '2026-06-02T00:00:00.000Z',
    })
    const recent = createChannel({
      channelKey: 'recent',
      channelId: 'recent',
      createdAt: '2026-06-01T00:00:00.000Z',
      lastMessageAt: '2026-06-05T00:00:00.000Z',
    })
    const older = createChannel({
      channelKey: 'older',
      channelId: 'older',
      createdAt: '2026-06-03T00:00:00.000Z',
      lastMessageAt: 'invalid-date',
    })
    const channels = [recent, older, pinnedOld]

    const sorted = sortChannelsForChatList(channels)

    assert.deepEqual(
      sorted.map(channel => channel.channelKey),
      ['pinned-old', 'recent', 'older']
    )
    assert.deepEqual(
      channels.map(channel => channel.channelKey),
      ['recent', 'older', 'pinned-old']
    )
  })

  it('filters channels by remark, id, key, and name', () => {
    const channels = [
      createChannel({
        name: 'alpha',
        channelId: 'room-alpha',
        channelKey: 'key-alpha',
        remark: '设计小组',
      }),
      createChannel({
        name: 'beta-name',
        channelId: 'room-beta',
        channelKey: 'key-beta',
        remark: 'Backend',
      }),
      createChannel({
        name: 'gamma',
        channelId: 'room-gamma',
        channelKey: 'special-key',
        remark: '',
      }),
    ]

    assert.deepEqual(filterChannelsForQuery(channels, '设计'), [channels[0]])
    assert.deepEqual(filterChannelsForQuery(channels, 'ROOM-BETA'), [
      channels[1],
    ])
    assert.deepEqual(filterChannelsForQuery(channels, 'special'), [channels[2]])
    assert.deepEqual(filterChannelsForQuery(channels, 'beta-name'), [
      channels[1],
    ])
    assert.deepEqual(filterChannelsForQuery(channels, '   '), channels)
  })

  it('tracks unread state from activity timestamps and marks channels read', () => {
    const channel = createChannel({
      channelKey: 'chat-key',
      lastMessageAt: '2026-06-10T12:00:00.000Z',
    })
    const activityTime = Date.parse('2026-06-10T12:00:00.000Z')

    assert.equal(hasUnreadChannel(channel, {}), true)
    assert.equal(hasUnreadChannel(channel, { 'chat-key': activityTime }), false)

    const firstRead = markChannelRead({}, 'chat-key', activityTime - 1000)
    const secondRead = markChannelRead(firstRead, 'chat-key', activityTime)
    const olderRead = markChannelRead(
      secondRead,
      'chat-key',
      activityTime - 500
    )
    const ignoredEmptyKey = markChannelRead(secondRead, '', activityTime + 1000)

    assert.deepEqual(firstRead, { 'chat-key': activityTime - 1000 })
    assert.deepEqual(secondRead, { 'chat-key': activityTime })
    assert.deepEqual(olderRead, secondRead)
    assert.equal(ignoredEmptyKey, secondRead)
  })

  it('extracts structured and fallback most link attachments', () => {
    const structured: MobileChannelAttachment = {
      kind: 'file',
      cid: VALID_CID,
      fileName: 'guide.pdf',
      link: `most://${VALID_CID}?filename=guide.pdf`,
      mimeType: 'application/pdf',
      size: 42,
    }
    const structuredMessage = createMessage({ attachment: structured })
    const fallbackLink = `most://${VALID_CID}?filename=${encodeURIComponent(
      'hello world.txt'
    )}`
    const fallbackMessage = createMessage({
      content: `看看这个 ${fallbackLink} 后面还有文字`,
    })

    assert.equal(getAttachmentFromMessage(structuredMessage), structured)
    assert.deepEqual(getAttachmentFromMessage(fallbackMessage), {
      kind: 'file',
      cid: VALID_CID,
      fileName: 'hello world.txt',
      link: fallbackLink,
    })
    assert.equal(
      getAttachmentFromMessage(createMessage({ content: 'no link' })),
      null
    )
    assert.equal(
      getAttachmentFromMessage(
        createMessage({ content: 'bad most://not-a-cid' })
      ),
      null
    )
  })

  it('trims common punctuation around fallback most links', () => {
    const plainLink = `most://${VALID_CID}`
    const namedLink = `most://${VALID_CID}?filename=a.txt`
    const encodedPunctuationLink = `most://${VALID_CID}?filename=${encodeURIComponent(
      'a，b.txt'
    )}`

    assert.deepEqual(
      getAttachmentFromMessage(createMessage({ content: `${plainLink}.` })),
      {
        kind: 'file',
        cid: VALID_CID,
        fileName: VALID_CID,
        link: plainLink,
      }
    )
    assert.deepEqual(
      getAttachmentFromMessage(createMessage({ content: `(${plainLink})` })),
      {
        kind: 'file',
        cid: VALID_CID,
        fileName: VALID_CID,
        link: plainLink,
      }
    )
    assert.deepEqual(
      getAttachmentFromMessage(
        createMessage({ content: `${namedLink}，继续` })
      ),
      {
        kind: 'file',
        cid: VALID_CID,
        fileName: 'a.txt',
        link: namedLink,
      }
    )
    assert.deepEqual(
      getAttachmentFromMessage(
        createMessage({ content: `${plainLink}。继续` })
      ),
      {
        kind: 'file',
        cid: VALID_CID,
        fileName: VALID_CID,
        link: plainLink,
      }
    )
    assert.deepEqual(
      getAttachmentFromMessage(
        createMessage({ content: `${encodedPunctuationLink}。` })
      ),
      {
        kind: 'file',
        cid: VALID_CID,
        fileName: 'a，b.txt',
        link: encodedPunctuationLink,
      }
    )
  })

  it('preserves legal query filename punctuation left by encodeURIComponent', () => {
    for (const fileName of ['a!.txt', 'a).txt', 'a.', 'a..']) {
      const link = `most://${VALID_CID}?filename=${encodeURIComponent(fileName)}`

      assert.deepEqual(
        getAttachmentFromMessage(createMessage({ content: link })),
        {
          kind: 'file',
          cid: VALID_CID,
          fileName,
          link,
        }
      )
    }
  })

  it('sorts messages, creates stable keys, and summarizes messages', () => {
    const early = createMessage({
      author: 'a',
      authorName: '',
      content: '  first  ',
      timestamp: 1,
    })
    const late = createMessage({
      author: 'b',
      authorName: 'Bob',
      content: 'late',
      timestamp: 2,
    })
    const sameTime = createMessage({
      author: 'c',
      authorName: 'Carol',
      content: 'same',
      timestamp: 2,
    })
    const attachmentMessage = createMessage({
      authorName: 'Bob',
      attachment: {
        kind: 'file',
        cid: VALID_CID,
        fileName: 'demo.txt',
        link: `most://${VALID_CID}?filename=demo.txt`,
      },
    })
    const messages = [late, sameTime, early]

    assert.deepEqual(sortMessagesForDisplay(messages), [early, late, sameTime])
    assert.deepEqual(messages, [late, sameTime, early])
    assert.equal(createMessageKey(late), 'b:2:late:')
    assert.equal(getMessageSummary(undefined), '')
    assert.equal(getMessageSummary(early), '未知: first')
    assert.equal(getMessageSummary(attachmentMessage), 'Bob: demo.txt')
  })

  it('uses trimmed remark before id when deriving channel title', () => {
    assert.equal(
      getChannelTitle(
        createChannel({ remark: '  我的房间  ', channelId: 'room-id' })
      ),
      '我的房间'
    )
    assert.equal(
      getChannelTitle(createChannel({ remark: '', channelId: 'room-id' })),
      'room-id'
    )
    assert.equal(
      getChannelTitle(
        createChannel({ remark: '', channelId: '', name: 'room-name' })
      ),
      'room-name'
    )
  })
})
