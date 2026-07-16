import { setImmediate as waitForImmediate } from 'node:timers/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Hypercore from 'hypercore'
import {
  MAX_CHANNEL_CONTROL_MESSAGE_BYTES,
  openChannelControlProtocol,
} from '../../src/core/channelControlProtocol.js'
import { openChannelControlProtocol as openMobileChannelControlProtocol } from '../../../mobile/android/backend/channel-control-protocol.mjs'

describe('mostbox/channel/1 protocol', () => {
  it('exchanges the same structured control messages with Android', async t => {
    const serverStream = Hypercore.createProtocolStream(true)
    const mobileStream = Hypercore.createProtocolStream(false)
    const received = []
    serverStream.pipe(mobileStream).pipe(serverStream)
    openChannelControlProtocol(serverStream, {
      onMessage: message => received.push(message),
    })
    const mobile = openMobileChannelControlProtocol(mobileStream)
    t.after(() => {
      serverStream.destroy()
      mobileStream.destroy()
    })
    await waitForImmediate()

    const presence = {
      type: 'channel-presence',
      peerId: 'android-peer',
      channelId: 'shared-room',
      channelKey: 'shared-room',
      address: '0x0000000000000000000000000000000000000001',
      status: 'online',
      sessionId: 'mobile',
      lastSeen: Date.now(),
    }
    assert.strictEqual(mobile.send(presence), true)
    await waitForImmediate()
    assert.deepStrictEqual(received, [presence])
  })

  it('rejects control messages over the shared size limit', async t => {
    const serverStream = Hypercore.createProtocolStream(true)
    const mobileStream = Hypercore.createProtocolStream(false)
    serverStream.pipe(mobileStream).pipe(serverStream)
    openChannelControlProtocol(serverStream)
    const mobile = openMobileChannelControlProtocol(mobileStream)
    t.after(() => {
      serverStream.destroy()
      mobileStream.destroy()
    })
    await waitForImmediate()

    assert.strictEqual(
      mobile.send({
        type: 'channel-hello',
        channels: ['x'.repeat(MAX_CHANNEL_CONTROL_MESSAGE_BYTES)],
      }),
      false
    )
  })
})
