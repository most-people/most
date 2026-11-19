import { it } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../../../scripts/relay-churn.js'

const run = (n, events) => events.map(e => ({ run: n, k: 2, ...e }))

it('counts only runs with a seed online for the whole download', () => {
  const [row] = summarize([
    // Anchor up throughout, seed 1 down at start: qualifies, succeeds.
    ...run(0, [
      { t: 0, type: 'seed-up', seed: 0 },
      { t: 1, type: 'seed-up', seed: 1 },
      { t: 5, type: 'seed-down', seed: 1 },
      { t: 10, type: 'download-start' },
      { t: 30, type: 'status', status: 'downloading' },
      { t: 50, type: 'done', ok: true },
    ]),
    // The only seed goes down mid-download: excluded.
    ...run(1, [
      { t: 0, type: 'seed-up', seed: 0 },
      { t: 10, type: 'download-start' },
      { t: 20, type: 'seed-down', seed: 0 },
      { t: 70, type: 'done', ok: false, error: 'timeout' },
    ]),
    // Seed came up only after the download started: excluded.
    ...run(2, [
      { t: 10, type: 'download-start' },
      { t: 20, type: 'seed-up', seed: 0 },
      { t: 70, type: 'done', ok: true },
    ]),
    // Qualifies, fails.
    ...run(3, [
      { t: 0, type: 'seed-up', seed: 0 },
      { t: 10, type: 'download-start' },
      { t: 70, type: 'done', ok: false, error: 'timeout' },
    ]),
  ])

  assert.equal(row.attempts, 4)
  assert.equal(row.qualifying, 2)
  assert.equal(row.withSeedDown, 1)
  assert.equal(row.ok, 1)
  assert.equal(row.failures, 1)
  assert.deepEqual(row.errors, { timeout: 1 })
  assert.equal(row.discoveryP95, 20)
  assert.equal(row.completionP95, 40)
  assert.equal(row.meetsThreshold, false)
})
