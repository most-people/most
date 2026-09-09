import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { Wallet } from 'ethers'
import { WebSocket } from 'ws'
import { createApp, createWebSocketServer } from '../../index.js'
import { MostBoxEngine } from '../../src/index.js'
import { createNodeConfigStore } from '../../src/node/config.js'
import { buildAuthMessage } from '../../src/utils/auth.js'

const wallet = new Wallet('0x' + '11'.repeat(32))
const otherWallet = new Wallet('0x' + '22'.repeat(32))
const invite = 'local-chat-transport-test'
const clientMessageId = '00000000-0000-4000-8000-000000000001'

async function createFixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'most-chat-transport-')
  )
  const dataPath = path.join(directory, 'data')
  const configStore = createNodeConfigStore(path.join(directory, 'config'))
  assert.equal(
    configStore.saveNodeConfigPatch({ remoteInvites: [invite] }).success,
    true
  )
  const fixture = { engine: null, runtime: null, configStore }
  async function start() {
    fixture.engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    await fixture.engine.start()
    fixture.runtime = createApp(fixture.engine, { port: 1976, configStore })
  }
  await start()
  fixture.restart = async () => {
    await fixture.engine.stop()
    await start()
  }
  t.after(async () => {
    await fixture.engine.stop()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return fixture
}

async function request(fixture, requestPath, body, identity = wallet) {
  const method = body === undefined ? 'GET' : 'POST'
  const timestamp = String(Date.now())
  const signature = await identity.signMessage(
    buildAuthMessage(timestamp, method, requestPath)
  )
  return fixture.runtime.app.request(
    requestPath,
    {
      method,
      headers: {
        host: 'chat.example',
        origin: 'https://popper.trade',
        'x-mostbox-invite': invite,
        authorization: `${identity.address},${timestamp},${signature}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { incoming: { socket: { remoteAddress: '203.0.113.1' } } }
  )
}

async function join(fixture, name, identity = wallet) {
  const response = await request(
    fixture,
    '/api/channels',
    { name, displayName: 'Tester' },
    identity
  )
  assert.equal(response.status, 200)
  return response.json()
}

function message(content, options = {}) {
  return { content, author: wallet.address, authorName: 'Tester', ...options }
}

describe('native chat transport (integration)', { timeout: 30000 }, () => {
  it('allows signed remote users to read upload limits while keeping updates local', async t => {
    const fixture = await createFixture(t)
    const response = await request(fixture, '/api/node/policy')
    assert.equal(response.status, 200)
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://popper.trade'
    )
    assert.deepEqual(Object.keys(await response.json()), ['maxFileSizeBytes'])
    const update = await request(fixture, '/api/node/policy', {
      maxFileSizeBytes: 1024,
    })
    assert.equal(update.status, 403)
    const anonymous = await fixture.runtime.app.request(
      '/api/node/policy',
      { headers: { host: 'chat.example', 'x-mostbox-invite': invite } },
      { incoming: { socket: { remoteAddress: '203.0.113.1' } } }
    )
    assert.equal(anonymous.status, 401)
    assert.equal((await anonymous.json()).code, 'LOGIN_REQUIRED')
  })

  it('preserves all memberships when users join a new channel concurrently', async t => {
    const fixture = await createFixture(t)
    const identities = [wallet, otherWallet, new Wallet('0x' + '33'.repeat(32))]
    const joined = await Promise.all(
      identities.map((identity, index) =>
        request(
          fixture,
          '/api/channels',
          {
            name: index === 1 ? 'CONCURRENT-ROOM' : 'concurrent-room',
            displayName: `User ${index}`,
          },
          identity
        )
      )
    )
    assert.ok(joined.every(response => response.status === 200))
    const channels = await Promise.all(joined.map(response => response.json()))
    assert.equal(new Set(channels.map(channel => channel.channelKey)).size, 1)
    assert.equal(new Set(channels.map(channel => channel.coreKey)).size, 1)
    await fixture.restart()
    for (const identity of identities) {
      assert.equal(
        fixture.engine.listChannels({ ownerAddress: identity.address }).length,
        1
      )
      const response = await request(
        fixture,
        '/api/channels/concurrent-room/messages',
        message('joined concurrently', { author: identity.address }),
        identity
      )
      assert.equal(response.status, 200)
    }
    const history = await (
      await request(fixture, '/api/channels/concurrent-room/messages')
    ).json()
    assert.equal(
      history.filter(item => item.content === 'joined concurrently').length,
      identities.length
    )
  })

  it('deduplicates simultaneous sends and retries after restart', async t => {
    const fixture = await createFixture(t)
    await join(fixture, 'retry-room')
    const route = '/api/channels/retry-room/messages'
    const body = message('one message', { clientMessageId })
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(fixture, route, body))
    )
    assert.ok(responses.every(response => response.status === 200))
    const payloads = await Promise.all(
      responses.map(response => response.json())
    )
    for (const payload of payloads) assert.deepEqual(payload, payloads[0])
    await fixture.restart()
    const retried = await request(fixture, route, body)
    assert.equal(retried.status, 200)
    assert.deepEqual(await retried.json(), payloads[0])
    const history = await (await request(fixture, route)).json()
    assert.equal(
      history.filter(item => item.content === 'one message').length,
      1
    )

    const conflict = await request(
      fixture,
      route,
      message('different', { clientMessageId })
    )
    assert.equal(conflict.status, 409)
    assert.equal((await conflict.json()).code, 'CONFLICT')
    const afterConflict = await request(
      fixture,
      route,
      message('still writable')
    )
    assert.equal(afterConflict.status, 200)
  })

  it('scopes deduplication to each author and preserves legacy append behavior', async t => {
    const fixture = await createFixture(t)
    await join(fixture, 'authors-room')
    await join(fixture, 'authors-room', otherWallet)
    const route = '/api/channels/authors-room/messages'
    for (const identity of [wallet, otherWallet]) {
      const response = await request(
        fixture,
        route,
        message('same id', {
          author: identity.address,
          clientMessageId,
        }),
        identity
      )
      assert.equal(response.status, 200)
    }
    await request(fixture, route, message('legacy'))
    await request(fixture, route, message('legacy'))
    const history = await (await request(fixture, route)).json()
    assert.equal(history.filter(item => item.content === 'same id').length, 2)
    assert.equal(history.filter(item => item.content === 'legacy').length, 2)
  })

  it('rejects reusing a message id for a different attachment', async t => {
    const fixture = await createFixture(t)
    await join(fixture, 'attachment-room')
    const route = '/api/channels/attachment-room/messages'
    const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
    const link = `most://${cid}?filename=test.txt`
    const attachment = {
      kind: 'file',
      cid,
      fileName: 'test.txt',
      link,
      size: 0,
    }
    const original = await request(
      fixture,
      route,
      message(link, { clientMessageId, attachment })
    )
    assert.equal(original.status, 200)
    const retry = await request(
      fixture,
      route,
      message(link, { clientMessageId, attachment })
    )
    assert.equal(retry.status, 200)
    const changed = await request(
      fixture,
      route,
      message(link, {
        clientMessageId,
        attachment: { ...attachment, size: 1 },
      })
    )
    assert.equal(changed.status, 409)
  })

  it('paginates older history while new messages arrive and binds cursors to the channel', async t => {
    const fixture = await createFixture(t)
    await join(fixture, 'history-room')
    for (let index = 0; index < 7; index++) {
      assert.equal(
        (
          await request(
            fixture,
            '/api/channels/history-room/messages',
            message(`m${index}`)
          )
        ).status,
        200
      )
    }
    const first = await (
      await request(fixture, '/api/channels/history-room/history?limit=3')
    ).json()
    assert.deepEqual(
      first.messages.map(item => item.content),
      ['m4', 'm5', 'm6']
    )
    assert.equal(typeof first.nextCursor, 'string')
    await request(fixture, '/api/channels/history-room/messages', message('m7'))
    const second = await (
      await request(
        fixture,
        `/api/channels/history-room/history?limit=3&before=${first.nextCursor}`
      )
    ).json()
    assert.deepEqual(
      second.messages.map(item => item.content),
      ['m1', 'm2', 'm3']
    )
    const third = await (
      await request(
        fixture,
        `/api/channels/history-room/history?limit=3&before=${second.nextCursor}`
      )
    ).json()
    assert.equal(third.nextCursor, null)
    assert.equal(third.messages.at(-1).content, 'm0')
    assert.ok(
      third.messages.every(
        item => item._coreKey === undefined && item._index === undefined
      )
    )
    await join(fixture, 'other-history')
    assert.equal(
      (
        await request(
          fixture,
          `/api/channels/other-history/history?before=${first.nextCursor}`
        )
      ).status,
      400
    )
    for (const query of [
      'limit=101',
      'limit=0',
      'limit=2x',
      'before=invalid',
      'before=',
    ]) {
      assert.equal(
        (await request(fixture, `/api/channels/history-room/history?${query}`))
          .status,
        400
      )
    }
    assert.equal(
      (
        await request(
          fixture,
          '/api/channels/history-room/history',
          undefined,
          otherWallet
        )
      ).status,
      403
    )
    assert.ok(
      Array.isArray(
        await (
          await request(fixture, '/api/channels/history-room/messages?limit=2')
        ).json()
      )
    )
  })

  it('allows the explicit browser origins for HTTP and authenticated WebSocket access', async t => {
    const fixture = await createFixture(t)
    const timestamp = String(Date.now())
    const signature = await wallet.signMessage(
      buildAuthMessage(timestamp, 'GET', '/ws')
    )
    const url = `/ws?${new URLSearchParams({ invite, address: wallet.address, timestamp, signature })}`
    for (const origin of [
      'https://popper.trade',
      'http://localhost:8081',
      'http://127.0.0.1:8081',
    ]) {
      const response = await fixture.runtime.app.request('/api/channels', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers':
            'authorization,content-type,x-mostbox-invite',
        },
      })
      assert.equal(response.status, 204)
      assert.equal(response.headers.get('access-control-allow-origin'), origin)
      assert.equal(
        fixture.runtime.validateWebSocketRequest({
          url,
          headers: { origin, host: 'chat.example' },
          socket: { remoteAddress: '203.0.113.1' },
        }),
        true
      )
    }
    assert.equal(
      fixture.runtime.validateWebSocketRequest({
        url,
        headers: { origin: 'https://attacker.example', host: 'chat.example' },
        socket: { remoteAddress: '203.0.113.1' },
      }),
      false
    )
    assert.equal(
      fixture.runtime.validateWebSocketRequest({
        url,
        headers: { host: 'chat.example' },
        socket: { remoteAddress: '203.0.113.1' },
      }),
      true
    )
  })

  it('acknowledges subscriptions before delivering channel messages', async t => {
    const fixture = await createFixture(t)
    await join(fixture, 'subscribe-room')
    const server = serve({
      fetch: fixture.runtime.app.fetch,
      hostname: '127.0.0.1',
      port: 0,
    })
    if (!server.listening) await once(server, 'listening')
    const sockets = createWebSocketServer({
      engine: fixture.engine,
      serverInstance: server,
      ...fixture.runtime,
    })
    t.after(async () => {
      for (const client of sockets.clients) client.terminate()
      await new Promise(resolve => sockets.close(resolve))
      await new Promise(resolve => server.close(resolve))
    })
    const timestamp = String(Date.now())
    const signature = await wallet.signMessage(
      buildAuthMessage(timestamp, 'GET', '/ws')
    )
    const query = new URLSearchParams({
      invite,
      address: wallet.address,
      timestamp,
      signature,
    })
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/ws?${query}`,
      { origin: 'https://popper.trade' }
    )
    await once(socket, 'open')
    const subscribed = once(socket, 'message')
    socket.send(
      JSON.stringify({
        event: 'channel:subscribe',
        data: { channel: 'SUBSCRIBE-ROOM' },
      })
    )
    const [ack] = await subscribed
    assert.deepEqual(JSON.parse(ack.toString()), {
      event: 'channel:subscribed',
      data: { channel: 'subscribe-room' },
    })
    const incoming = once(socket, 'message')
    fixture.runtime.wsSendToChannel('subscribe-room', 'channel:message', {
      channel: 'subscribe-room',
      message: { content: 'live' },
    })
    const [event] = await incoming
    assert.equal(JSON.parse(event.toString()).data.message.content, 'live')
    socket.close()
    await once(socket, 'close')
  })
})
