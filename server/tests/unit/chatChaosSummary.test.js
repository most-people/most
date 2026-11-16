import { it } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../../../scripts/chat-chaos.js'

const id = (node, seq) =>
  `${String(node).padStart(8, '0')}-0000-4000-8000-${String(seq).padStart(12, '0')}`
const a1 = id(0, 1)
const a2 = id(0, 2)
const b1 = id(1, 1)

function log(observed, ms = 100) {
  return [
    { type: 'confirm', node: 0, id: a1 },
    { type: 'confirm', node: 1, id: b1 },
    { type: 'confirm', node: 0, id: a2 },
    ...observed.map((ids, node) => ({ type: 'observe', round: 0, node, ids })),
    { type: 'converged', round: 0, ms },
  ]
}

it('passes a converged round with every message once and in order', () => {
  const summary = summarize(
    log([
      [a1, b1, a2],
      [b1, a1, a2],
    ])
  )
  assert.deepEqual(summary.violations, { C1: 0, C2: 0, C3: 0, C4: 0 })
  assert.equal(summary.convergenceP95, 100)
  // One round is below the 100-round threshold.
  assert.equal(summary.meetsThreshold, false)
})

it('flags a missing confirmed message (C1) and differing sets (C4)', () => {
  const summary = summarize(
    log([
      [a1, b1, a2],
      [a1, b1],
    ])
  )
  assert.equal(summary.violations.C1, 1)
  assert.equal(summary.violations.C4, 1)
})

it('flags a duplicate (C2)', () => {
  const summary = summarize(
    log([
      [a1, b1, a2, a2],
      [a1, b1, a2],
    ])
  )
  assert.equal(summary.violations.C2, 1)
})

it('flags one sender out of order (C3), not interleaving senders', () => {
  const summary = summarize(
    log([
      [a2, b1, a1],
      [a1, b1, a2],
    ])
  )
  assert.equal(summary.violations.C3, 1)
})

it('fails when a round never converges', () => {
  const lines = []
  for (let round = 0; round < 100; round += 1) {
    lines.push({ type: 'converged', round, ms: round === 7 ? null : 10 })
  }
  const summary = summarize(lines)
  assert.equal(summary.convergenceTimeouts, 1)
  assert.equal(summary.meetsThreshold, false)
})
