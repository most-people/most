import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectReceiveLink } from './receiveFlow'

const CID = 'bafkreigh2akiscaildcq5c2xshgoh4w7yvf4iwbubv5i5p7h6syw6yxz3m'

test('receive inspection creates a confirmed intent only after parsing', () => {
  const result = inspectReceiveLink(`  most://${CID}?filename=report.pdf  `)
  assert.equal(result.kind, 'ready')
  if (result.kind === 'ready') {
    assert.equal(result.intent.cid, CID)
    assert.equal(result.intent.fileName, 'report.pdf')
  }
})

test('receive inspection blocks restricted executable names', () => {
  assert.deepEqual(inspectReceiveLink(`most://${CID}?filename=setup.apk`), {
    kind: 'blocked',
    errorKey: 'app.file.blockedExecutable',
  })
})
