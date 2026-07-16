import { setImmediate as waitForImmediate } from 'node:timers/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Hypercore from 'hypercore'
import {
  getConnectionTopicSet,
  MAX_FILE_REQUESTS_PER_CONNECTION,
  openFileDriveProtocol,
} from '../../src/core/fileDriveProtocol.js'
import {
  getConnectionTopicSet as getMobileConnectionTopicSet,
  openFileDriveProtocol as openMobileFileDriveProtocol,
} from '../../../mobile/android/backend/file-drive-protocol.mjs'

const CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
const DRIVE_KEY = 'ab'.repeat(32)

function createProtocolPair(serverOptions = {}, clientOptions = {}) {
  const serverStream = Hypercore.createProtocolStream(true)
  const clientStream = Hypercore.createProtocolStream(false)
  serverStream.pipe(clientStream).pipe(serverStream)
  const server = openFileDriveProtocol(serverStream, serverOptions)
  const client = openMobileFileDriveProtocol(clientStream, clientOptions)
  return {
    server,
    client,
    close() {
      serverStream.destroy()
      clientStream.destroy()
    },
  }
}

async function waitFor(condition, description, timeout = 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const value = condition()
    if (value) return value
    await waitForImmediate()
  }
  throw new Error(`Timed out waiting for ${description}`)
}

describe('mostbox/file/1 protocol', () => {
  it('treats empty publisher-side topic metadata as unavailable', () => {
    const topic = Buffer.from('12'.repeat(32), 'hex')

    for (const readTopics of [
      getConnectionTopicSet,
      getMobileConnectionTopicSet,
    ]) {
      assert.strictEqual(readTopics(), null)
      assert.strictEqual(readTopics({ topics: [] }), null)
      assert.deepStrictEqual(
        [...readTopics({ topics: [topic] })],
        [topic.toString('hex')]
      )
    }
  })

  it('offers only after a request and deduplicates repeated messages', async t => {
    let requestCount = 0
    const offers = []
    const pair = createProtocolPair(
      {
        onRequest(cid) {
          requestCount += 1
          return { type: 'offer', cid, driveKey: DRIVE_KEY, driveVersion: 7 }
        },
      },
      { onOffer: offer => offers.push(offer) }
    )
    t.after(() => pair.close())
    await waitForImmediate()

    assert.strictEqual(
      pair.server.offer({
        type: 'offer',
        cid: CID,
        driveKey: DRIVE_KEY,
        driveVersion: 7,
      }),
      false
    )
    assert.strictEqual(pair.client.request(CID), true)
    assert.strictEqual(pair.client.request(CID), true)
    await waitFor(() => offers.length === 1, 'one snapshot offer')

    assert.strictEqual(requestCount, 1)
    assert.deepStrictEqual(offers[0], {
      type: 'offer',
      cid: CID,
      driveKey: DRIVE_KEY,
      driveVersion: 7,
    })
    assert.strictEqual(pair.server.offer(offers[0]), true)
    await waitForImmediate()
    assert.strictEqual(offers.length, 1)
  })

  it('limits each connection to 32 distinct requests', async t => {
    const requested = []
    const pair = createProtocolPair({ onRequest: cid => requested.push(cid) })
    t.after(() => pair.close())
    await waitForImmediate()

    for (let index = 0; index < MAX_FILE_REQUESTS_PER_CONNECTION; index += 1) {
      assert.strictEqual(pair.client.request(`cid-${index}`), true)
    }
    assert.strictEqual(pair.client.request('cid-over-limit'), false)
    await waitFor(
      () => requested.length === MAX_FILE_REQUESTS_PER_CONNECTION,
      'bounded requests'
    )
  })

  it('drops malformed offers and overlong request CIDs', async t => {
    const offers = []
    const pair = createProtocolPair(
      {
        onRequest(cid) {
          return { type: 'offer', cid, driveKey: 'bad', driveVersion: 0 }
        },
      },
      { onOffer: offer => offers.push(offer) }
    )
    t.after(() => pair.close())
    await waitForImmediate()

    assert.strictEqual(pair.client.request('x'.repeat(129)), false)
    assert.strictEqual(pair.client.request(CID), true)
    await waitForImmediate()
    assert.deepStrictEqual(offers, [])
  })

  it('does not send an asynchronous offer after the connection closes', async t => {
    let resolveOffer
    const pendingOffer = new Promise(resolve => {
      resolveOffer = resolve
    })
    const offers = []
    const pair = createProtocolPair(
      { onRequest: () => pendingOffer },
      { onOffer: offer => offers.push(offer) }
    )
    t.after(() => pair.close())
    await waitForImmediate()

    pair.client.request(CID)
    await waitForImmediate()
    pair.close()
    resolveOffer({
      type: 'offer',
      cid: CID,
      driveKey: DRIVE_KEY,
      driveVersion: 1,
    })
    await waitForImmediate()
    assert.deepStrictEqual(offers, [])
  })
})
