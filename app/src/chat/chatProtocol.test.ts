import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ChatApiClient,
  ChatRequestTimeoutError,
  getChatErrorMessage,
  buildChannelSubscribeFrame,
  buildChatMessagePayload,
  createClientMessageId,
  getChatMessageTimestamp,
  isOwnChatMessage,
  mergeChatMessages,
  normalizeChatChannel,
  normalizeChatAttachment,
  parseChatHistoryResponse,
  parseChatWebSocketMessage,
} from './chatProtocol'

const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
const LINK = `most://${CID}?filename=photo.png`
const AUTHOR = '0x1111111111111111111111111111111111111111'

test('own Ethereum authors match checksum and lower-case addresses without changing other identifiers', () => {
  const address = '0x2Fd13F1a54488cFF329b7a4997351CA0847C08Cc'
  assert.equal(
    isOwnChatMessage({ author: address.toLowerCase() }, address),
    true
  )
  assert.equal(isOwnChatMessage({ author: AUTHOR }, address), false)
  assert.equal(isOwnChatMessage({ author: 'Android' }, 'Android'), true)
  assert.equal(isOwnChatMessage({ author: 'Android' }, 'android'), false)
  assert.equal(isOwnChatMessage({ author: '' }, ''), false)
})

test('local send acknowledgements and writer history merge without duplicate bubbles', () => {
  const message = {
    author: AUTHOR,
    authorName: 'Alice',
    timestamp: 100,
    content: 'hello',
  }
  assert.equal(
    mergeChatMessages(
      [message],
      [{ ...message, _coreKey: 'writer', _index: 0 }]
    ).length,
    1
  )
})

test('history timestamps accept ISO strings and ignore invalid values when sorting', () => {
  const message = { author: AUTHOR, authorName: 'Alice', content: 'hello' }
  const iso = { ...message, id: 'iso', timestamp: '2026-10-14T00:00:00.000Z' }
  const newer = {
    ...message,
    id: 'number',
    timestamp: Date.parse('2026-10-14T00:01:00.000Z'),
  }
  assert.equal(getChatMessageTimestamp(iso), Date.parse(iso.timestamp))
  assert.deepEqual(
    mergeChatMessages([newer, iso]).map(item => item.id),
    ['iso', 'number']
  )
  assert.equal(getChatMessageTimestamp({ ...message, timestamp: 'invalid' }), 0)
  assert.equal(getChatMessageTimestamp({ ...message, timestamp: Infinity }), 0)
})

test('normalizes channel IDs consistently for local and remote chat', () => {
  assert.equal(normalizeChatChannel(' #ABC '), 'abc')
  assert.equal(normalizeChatChannel('Room_42'), 'room_42')
  assert.equal(normalizeChatChannel('   '), '')
})

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

test('invalid peer retry ids do not collapse distinct legacy history or live messages', () => {
  for (const invalid of ['not-a-uuid', 123, { id: 'untrusted' }]) {
    const originals = [1, 2].map(timestamp => ({
      content: `legacy-${timestamp}`,
      author: AUTHOR,
      authorName: 'Alice',
      timestamp,
      clientMessageId: invalid,
    }))
    const history = parseChatHistoryResponse({ messages: originals }).messages
    assert.equal(mergeChatMessages(history).length, 2)
    assert.ok(
      history.every(message => !Object.hasOwn(message, 'clientMessageId'))
    )
    const event = parseChatWebSocketMessage(
      JSON.stringify({
        event: 'channel:message',
        data: { channel: 'room', message: originals[1] },
      })
    )
    assert.ok(event?.event === 'channel:message')
    assert.equal(Object.hasOwn(event.message, 'clientMessageId'), false)
    assert.equal(mergeChatMessages(history, [event.message]).length, 2)
  }
  const id = '550E8400-E29B-41D4-A716-446655440000'
  const valid = parseChatHistoryResponse({
    messages: [
      {
        content: 'valid retry',
        author: AUTHOR,
        authorName: 'Alice',
        clientMessageId: id,
      },
    ],
  }).messages
  assert.equal(valid[0].clientMessageId, id.toLowerCase())
  assert.equal(mergeChatMessages(valid, valid).length, 1)
})

test('merges retries across checksum Ethereum authors without conflating other identifiers', () => {
  const original = {
    content: 'one message',
    author: '0x2Fd13F1a54488cFF329b7a4997351CA0847C08Cc',
    authorName: 'Android',
    clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: 1,
  }
  assert.equal(
    mergeChatMessages(
      [original],
      [{ ...original, author: original.author.toLowerCase() }]
    ).length,
    1
  )
  assert.equal(
    mergeChatMessages(
      [{ ...original, author: 'Alice' }],
      [{ ...original, author: 'alice' }]
    ).length,
    2
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

test('ChatApiClient preserves canonical most:// attachment metadata', async () => {
  let requestBody: Record<string, unknown> | null = null
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        message: {
          content: LINK,
          author: AUTHOR,
          authorName: 'Alice',
          attachment: {
            kind: 'image',
            cid: CID,
            fileName: 'photo.png',
            link: LINK,
            mimeType: 'image/png',
            size: 42,
          },
        },
      }),
      { status: 200 }
    )
  }) as typeof fetch
  const client = new ChatApiClient({
    baseUrl: 'https://node.example',
    invite: 'invite',
    identity: null,
    fetchImpl,
  })
  await client.sendMessage('room', {
    content: LINK,
    author: AUTHOR,
    authorName: 'Alice',
    attachment: {
      kind: 'image',
      cid: CID,
      fileName: 'photo.png',
      link: LINK,
      mimeType: 'image/png',
      size: 42,
    },
  })
  assert.ok(requestBody)
  const sentBody = requestBody as Record<string, unknown>
  assert.deepEqual(sentBody.attachment, {
    kind: 'image',
    cid: CID,
    fileName: 'photo.png',
    link: LINK,
    mimeType: 'image/png',
    size: 42,
  })
  assert.equal(sentBody.content, LINK)
})

test('channel management targets the canonical key through the signed remote transport', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const client = new ChatApiClient({
    baseUrl: 'https://node.example/base',
    invite: 'invite',
    identity: null,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as typeof fetch,
  })
  await client.setChannelRemark('room:key', 'Display name')
  await client.setChannelPinned('room:key', true)
  await client.leaveChannel('room:key')
  assert.deepEqual(
    requests.map(request => [
      request.url,
      request.init?.method,
      JSON.parse(String(request.init?.body)),
    ]),
    [
      [
        'https://node.example/base/api/channels/room%3Akey/remark',
        'PUT',
        { remark: 'Display name' },
      ],
      [
        'https://node.example/base/api/channels/room%3Akey/pin',
        'PUT',
        { pinned: true },
      ],
      [
        'https://node.example/base/api/channels',
        'DELETE',
        { channelKey: 'room:key' },
      ],
    ]
  )
  for (const request of requests) {
    assert.equal(
      new Headers(request.init?.headers).get('x-mostbox-invite'),
      'invite'
    )
  }
})

test('channel management propagates server rejection', async () => {
  const client = new ChatApiClient({
    baseUrl: 'https://node.example',
    invite: '',
    identity: null,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ error: 'denied' }), {
        status: 403,
      })) as typeof fetch,
  })
  await assert.rejects(client.leaveChannel('room'), /denied/)
  await assert.rejects(client.setChannelRemark('room', 'name'), /denied/)
  await assert.rejects(client.setChannelPinned('room', true), /denied/)
})

test('a stalled chat request aborts after 30 seconds and reports a retryable timeout', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let signal: AbortSignal | null = null
  let started: () => void = () => {}
  const ready = new Promise<void>(resolve => {
    started = resolve
  })
  const client = new ChatApiClient({
    baseUrl: 'https://node.example',
    invite: '',
    identity: null,
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal || null
      started()
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      })
    }) as typeof fetch,
  })
  const rejected = assert.rejects(client.listChannels(), error => {
    assert.ok(error instanceof ChatRequestTimeoutError)
    assert.equal(getChatErrorMessage(error, '失败', '请重试'), '请重试')
    return true
  })
  await ready
  context.mock.timers.tick(29_999)
  assert.equal((signal as AbortSignal | null)?.aborted, false)
  context.mock.timers.tick(1)
  await rejected
  assert.equal((signal as AbortSignal | null)?.aborted, true)
})

test('completed chat requests clear their deadline and preserve server errors', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const signals: AbortSignal[] = []
  let rejected = false
  const client = new ChatApiClient({
    baseUrl: 'https://node.example',
    invite: '',
    identity: null,
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      return rejected
        ? new Response(JSON.stringify({ error: 'denied' }), { status: 403 })
        : new Response(JSON.stringify({ channels: [] }), { status: 200 })
    }) as typeof fetch,
  })
  await client.listChannels()
  rejected = true
  await assert.rejects(client.listChannels(), /denied/)
  context.mock.timers.tick(30_000)
  assert.equal(signals.length, 2)
  assert.ok(signals.every(signal => !signal.aborted))
  assert.equal(
    getChatErrorMessage(new Error('denied'), '失败', '请重试'),
    'denied'
  )
})

test('the chat deadline also covers a response body that stalls after its headers arrive', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let headersReady: () => void = () => {}
  const ready = new Promise<void>(resolve => {
    headersReady = resolve
  })
  const client = new ChatApiClient({
    baseUrl: 'https://node.example',
    invite: '',
    identity: null,
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const response = new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener(
              'abort',
              () => controller.error(new Error('aborted body')),
              { once: true }
            )
          },
        })
      )
      headersReady()
      return response
    }) as typeof fetch,
  })
  const rejected = assert.rejects(
    client.listChannels(),
    ChatRequestTimeoutError
  )
  await ready
  await Promise.resolve()
  context.mock.timers.tick(30_000)
  await rejected
})
