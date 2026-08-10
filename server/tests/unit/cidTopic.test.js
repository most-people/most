import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CID_TOPIC_JOIN_OPTIONS } from '../../src/core/cidTopic.js'

describe('CID topic discovery roles', () => {
  it('always announces and looks up the CID topic', () => {
    assert.deepEqual(CID_TOPIC_JOIN_OPTIONS, {
      server: true,
      client: true,
    })
  })
})
