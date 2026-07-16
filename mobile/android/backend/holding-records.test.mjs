import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { removeHoldingRecord } from './holding-records.mjs'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

describe('mobile holding deletion records', () => {
  it('removes only the target CID so the same link can be downloaded again', () => {
    const otherCid =
      'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
    const holdings = [
      {
        cid: VALID_CID,
        fileName: 'hello.txt',
        size: 11,
        source: 'downloaded',
        state: 'ready',
        transport: { type: 'hyperdrive', key: 'aa'.repeat(32), version: 2 },
      },
      {
        cid: otherCid,
        fileName: 'empty.txt',
        size: 0,
        source: 'published',
        state: 'ready',
        transport: { type: 'hyperdrive', key: 'bb'.repeat(32), version: 2 },
      },
    ]

    const result = removeHoldingRecord(holdings, VALID_CID)
    assert.equal(result.removed, true)
    assert.deepEqual(
      result.holdings.map(holding => holding.cid),
      [otherCid]
    )
    assert.equal(
      result.holdings.some(holding => holding.cid === VALID_CID),
      false
    )

    const rejoinedHolding = {
      cid: VALID_CID,
      fileName: 'hello.txt',
      size: 11,
      source: 'downloaded',
      state: 'ready',
      transport: { type: 'hyperdrive', key: 'aa'.repeat(32), version: 2 },
    }
    const afterRedownload = [rejoinedHolding, ...result.holdings]

    assert.equal(afterRedownload[0].cid, VALID_CID)
    assert.equal(afterRedownload[0].transport.version, 2)
  })
})
