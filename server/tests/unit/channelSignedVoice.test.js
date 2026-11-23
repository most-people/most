import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import {
  voiceFrameError,
  VoiceRoutes,
} from '../../src/core/channelSignedVoice.js'

const vectors = JSON.parse(
  readFileSync(
    new URL('../../../docs/protocol/vectors/v2/voice.json', import.meta.url)
  )
)
it('checks the five Python-signed voice vectors and rejects altered, stale or misattributed frames', () => {
  for (const frame of vectors.valid)
    assert.equal(voiceFrameError(frame, vectors), '')
  for (const frame of vectors.invalid)
    assert.ok(voiceFrameError(frame, vectors))
  assert.ok(
    voiceFrameError(
      { ...vectors.valid[0], padding: 'x'.repeat(65536) },
      vectors
    )
  )
  assert.ok(voiceFrameError(vectors.valid[0], { ...vectors, event: 'leave' }))
})

it('binds target sessions to a channel and source, clearing them on leave, disconnect and timeout', () => {
  const routes = new VoiceRoutes()
  const join = vectors.valid[0],
    signal = vectors.valid.at(-1)
  const target = {
    ...join,
    body: { ...join.body, sessionId: signal.body.targetSessionId },
  }
  const remote = {}
  assert.equal(routes.accept(signal, 'ws:a', 0), null)
  assert.deepEqual(routes.accept(target, remote, 1), { broadcast: true })
  assert.equal(routes.accept(target, 'ws:other', 2), null)
  assert.deepEqual(routes.accept(signal, 'ws:a', 3), { target: remote })
  assert.equal(
    routes.accept(
      { ...signal, body: { ...signal.body, channelId: 'cd'.repeat(32) } },
      'ws:a',
      3
    ),
    null
  )
  routes.accept(
    { ...target, body: { ...target.body, event: 'leave' } },
    remote,
    4
  )
  assert.equal(routes.accept(signal, 'ws:a', 5), null)
  routes.accept(target, remote, 6)
  routes.clearSource(remote)
  assert.equal(routes.accept(signal, 'ws:a', 7), null)
  routes.accept(target, remote, 10)
  assert.equal(routes.accept(signal, 'ws:a', 45010), null)
})
