import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MockMostBoxCore } from './mockCore'

describe('mobile mock core', () => {
  it('generates a most link and queued holding for small publish inputs', async () => {
    const core = new MockMostBoxCore()
    await core.start()

    const transfer = await core.publishFile({
      uri: 'memory://hello.txt',
      name: 'hello.txt',
      size: 11,
      contentBytes: Buffer.from('hello world'),
    })

    assert.equal(transfer.status, 'completed')
    assert.equal(
      transfer.cid,
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    )
    assert.equal(
      transfer.link,
      `most://${transfer.cid}?filename=${encodeURIComponent('hello.txt')}`
    )

    const snapshot = core.getSnapshot()
    assert.equal(snapshot.holdings.length, 1)
    assert.equal(snapshot.holdings[0].status, 'queued')
    assert.equal(snapshot.holdings[0].topicJoined, false)
  })

  it('keeps large or unread file inputs waiting for the real P2P core', async () => {
    const core = new MockMostBoxCore()
    const transfer = await core.publishFile({
      uri: 'file://large.bin',
      name: 'large.bin',
      size: 1024 * 1024 * 1024,
    })

    assert.equal(transfer.status, 'waitingCore')
    assert.equal(core.getSnapshot().holdings.length, 0)
  })
})
