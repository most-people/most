import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  DEFAULT_OWNER_BUCKET,
  normalizeMetadataBuckets,
} from '../../src/core/ownerMetadata.js'

describe('owner metadata buckets', () => {
  it('normalizes object buckets', () => {
    const buckets = normalizeMetadataBuckets({
      [DEFAULT_OWNER_BUCKET]: [{ cid: 'cid-local' }],
    })

    assert.deepStrictEqual(buckets, {
      [DEFAULT_OWNER_BUCKET]: [{ cid: 'cid-local' }],
    })
  })

  it('ignores legacy array metadata', () => {
    const buckets = normalizeMetadataBuckets([{ cid: 'cid-legacy' }])

    assert.deepStrictEqual(buckets, {})
  })
})
