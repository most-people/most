import assert from 'node:assert/strict'
import test from 'node:test'
import { cacheMatchesCid } from './remoteCache'

test('reuses only cache content that matches the requested CID', () => {
  const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
  assert.equal(cacheMatchesCid(cid, cid), true)
  assert.equal(
    cacheMatchesCid(
      cid,
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
    ),
    false
  )
})
