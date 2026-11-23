import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  benchmarkNativeScrypt,
  nativeScrypt,
  scryptLimits,
} from './scrypt-native.mjs'

describe('native scrypt', () => {
  it('equals standard scrypt(N, r = 8, p = 1) through the libsodium limits', async () => {
    const password = Buffer.from('correct horse battery staple')
    const salt = crypto.randomBytes(32)
    for (const logN of [13, 14, 15]) {
      const expected = crypto.scryptSync(password, salt, 32, {
        N: 2 ** logN,
        r: 8,
        p: 1,
        maxmem: 2 ** 28,
      })
      const actual = await nativeScrypt(password, salt, logN)
      assert.equal(
        Buffer.from(actual).toString('hex'),
        expected.toString('hex')
      )
    }
  })

  it('rejects unsupported parameters', async () => {
    assert.throws(() => scryptLimits(12), RangeError)
    await assert.rejects(
      nativeScrypt(Buffer.from('x'), Buffer.alloc(16), 14),
      RangeError
    )
  })

  it('benchmarks and stops escalating once a run is too slow', async () => {
    let clock = 0
    const runs = await benchmarkNativeScrypt({
      logNs: [13, 14],
      repeat: 1,
      stopAfterMs: 50,
      now: () => (clock += 100),
    })
    assert.equal(runs.length, 1)
    assert.equal(runs[0].medianMs, 100)
  })
})
