import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ChatApiClient,
  buildChannelSubscribeFrame,
  buildChatMessagePayload,
  createClientMessageId,
  mergeChatMessages,
  normalizeChatAttachment,
  parseChatHistoryResponse,
  parseChatWebSocketMessage,
} from './chatProtocol'

const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
const LINK = `most://${CID}?filename=photo.png`
const AUTHOR = '0x1111111111111111111111111111111111111111'

test('creates and normalizes UUID v4 client ids for retry idempotency', () => {
  const id = createClientMessageId(() => '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(id, '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(
    buildChatMessagePayload({
      content: 'hello',
      author: AUTHOR,
      authorName: 'Alice',
      clientMessageId: id.toUpperCase(),
    }).clientMessageId,
    id
  )
  assert.throws(
    () =>
      buildChatMessagePayload({
        content: 'hello',
        author: AUTHOR,
        authorName: 'Alice',
        clientMessageId: 'not-a-uuid',
      }),
    /Invalid clientMessageId/
  )
})

test('validates attachment kind, CID and link before sending', () => {
  assert.deepEqual(
    normalizeChatAttachment({
      kind: 'image',
      cid: CID,
      fileName: 'photo.png',
      link: LINK,
      mimeType: 'image/png',
      size: 42,
    }),
    {
      kind: 'image',
      cid: CID,
      fileName: 'photo.png',
      link: LINK,
      mimeType: 'image/png',
      size: 42,
    }
  )
  assert.throws(
    () =>
      normalizeChatAttachment({
        kind: 'file',
        cid: CID,
        fileName: 'photo.png',
        link: 'most://not-a-cid',
      }),
    /Invalid attachment CID/
  )
  assert.throws(
    () =>
      buildChatMessagePayload({
        content: 'caption',
        author: AUTHOR,
        authorName: 'Alice',
        attachment: {
          kind: 'image',
          cid: CID,
          fileName: 'photo.png',
          link: LINK,
        },
      }),
    /attachment message content must equal attachment link/
  )
})

test('parses history pages and ignores malformed messages', () => {
  assert.deepEqual(
    parseChatHistoryResponse({
      messages: [
        { content: 'one', author: AUTHOR, authorName: 'Alice', timestamp: 1 },
        { content: '', author: AUTHOR, authorName: 'Alice' },
      ],
      nextCursor: 'opaque-cursor',
    }),
    {
      messages: [
        { content: 'one', author: AUTHOR, authorName: 'Alice', timestamp: 1 },
      ],
      nextCursor: 'opaque-cursor',
    }
  )
  assert.equal(parseChatHistoryResponse({ messages: [] }).nextCursor, null)
})

test('parses subscribe acknowledgements and channel message WebSocket frames', () => {
  assert.deepEqual(
    parseChatWebSocketMessage(
      JSON.stringify({ event: 'channel:subscribed', data: { channel: 'room' } })
    ),
    { event: 'channel:subscribed', channel: 'room' }
  )
  assert.deepEqual(
    parseChatWebSocketMessage(
      JSON.stringify({
        event: 'channel:message',
        data: {
          channel: 'room',
          message: { content: 'live', author: AUTHOR, authorName: 'Alice' },
        },
      })
    ),
    {
      event: 'channel:message',
      channel: 'room',
      message: {
        content: 'live',
        author: AUTHOR,
        authorName: 'Alice',
      },
    }
  )
  assert.equal(parseChatWebSocketMessage('invalid'), null)
  assert.equal(
    JSON.parse(buildChannelSubscribeFrame('ROOM')).data.channel,
    'ROOM'
  )
})

test('merges history, HTTP response and live events by clientMessageId', () => {
  const first = {
    content: 'hello',
    author: AUTHOR,
    authorName: 'Alice',
    clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: 2,
  }
  const duplicate = { ...first, id: 'server-id', timestamp: 2 }
  const second = {
    content: 'older',
    author: AUTHOR,
    authorName: 'Alice',
    timestamp: 1,
  }
  assert.deepEqual(mergeChatMessages([first, second], [duplicate]), [
    second,
    duplicate,
  ])
})

test('ChatApiClient uses signed remote protocol and paginates history', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    if (String(input).endsWith('/api/channels')) {
      return new Response(
        JSON.stringify({ channels: [{ channelId: 'room' }] }),
        {
          status: 200,
        }
      )
    }
    if (String(input).includes('/history')) {
      return new Response(JSON.stringify({ messages: [], nextCursor: null }), {
        status: 200,
      })
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: {
          content: 'hello',
          author: AUTHOR,
          authorName: 'Alice',
        },
      }),
      { status: 200 }
    )
  }) as typeof fetch
  const client = new ChatApiClient({
    baseUrl: 'https://node.example/base',
    invite: 'invite',
    identity: null,
    fetchImpl,
  })
  assert.deepEqual(await client.listChannels(), [{ channelId: 'room' }])
  await client.getHistory('room', { limit: 20, before: 'cursor' })
  await client.sendMessage('room', {
    content: 'hello',
    author: AUTHOR,
    authorName: 'Alice',
  })
  assert.match(
    requests[1].url,
    /\/base\/api\/channels\/room\/history\?limit=20&before=cursor/
  )
  assert.equal(
    requests[1].init?.headers &&
      new Headers(requests[1].init.headers).get('x-mostbox-invite'),
    'invite'
  )
  const body = JSON.parse(String(requests[2].init?.body))
  assert.match(body.clientMessageId, /^[0-9a-f]{8}-[0-9a-f]{4}-4/)
})
