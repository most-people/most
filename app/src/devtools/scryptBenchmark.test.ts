import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatScryptBenchmark,
  recommendLogN,
  runScryptBenchmark,
  scryptMemoryMiB,
} from './scryptBenchmark'

describe('scrypt benchmark', () => {
  it('computes memory per N and recommends the largest N within target', () => {
    assert.equal(scryptMemoryMiB(14), 16)
    assert.equal(scryptMemoryMiB(17), 128)
    const runs = [
      { logN: 14, memoryMiB: 16, timesMs: [400], medianMs: 400 },
      { logN: 15, memoryMiB: 32, timesMs: [900], medianMs: 900 },
      { logN: 16, memoryMiB: 64, timesMs: [3100], medianMs: 3100 },
    ]
    assert.equal(recommendLogN(runs), 15)
    assert.equal(recommendLogN(runs, 300), null)
  })

  it('runs small N, reports times and stops at the first error', async () => {
    let clock = 0
    const result = await runScryptBenchmark({
      logNs: [4, 5],
      repeat: 3,
      environment: 'test',
      now: () => (clock += 100),
    })
    assert.equal(result.runs.length, 2)
    assert.deepEqual(result.runs[0].timesMs, [100, 100, 100])
    assert.equal(result.runs[0].medianMs, 100)
    assert.equal(result.recommendedLogN, 5)

    const failed = await runScryptBenchmark({ logNs: [4, -1, 6], repeat: 1 })
    assert.equal(failed.runs.length, 2)
    assert.ok(failed.runs[1].error)
    assert.match(formatScryptBenchmark(failed), /N=2\^-1 .*error/)
  })
})
