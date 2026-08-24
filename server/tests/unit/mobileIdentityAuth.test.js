import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyAuthHeader } from '../../src/utils/auth.js'

const MOBILE_AUTH_GOLDEN =
  '0xADB365D5737e9a0c4Ba11EDC4fAa666220a1F52A,1700000000000,0x2702d7417642632246c302a47696104e5fb91133eb633145dd54ce22d0656d6d47785fb4271da88f83d7bccad884791b173b5edcfa87bfbe2f29d76d81e216031b'

test('server accepts the mobile signed request golden sample', () => {
  assert.deepEqual(
    verifyAuthHeader(MOBILE_AUTH_GOLDEN, 'POST', '/api/download', {
      now: 1_700_000_000_000,
    }),
    {
      ok: true,
      address: '0xadb365d5737e9a0c4ba11edc4faa666220a1f52a',
    }
  )
})

test('mobile authorization stays bound to method and canonical path', () => {
  assert.equal(
    verifyAuthHeader(MOBILE_AUTH_GOLDEN, 'GET', '/api/download', {
      now: 1_700_000_000_000,
    }).ok,
    false
  )
  assert.equal(
    verifyAuthHeader(MOBILE_AUTH_GOLDEN, 'POST', '/proxy/api/download', {
      now: 1_700_000_000_000,
    }).ok,
    false
  )
})
