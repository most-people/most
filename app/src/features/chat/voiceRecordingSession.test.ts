import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VoiceRecordingSession,
  type VoiceRecorder,
  type VoiceRecording,
} from './voiceRecordingSession'

function setup(prepare?: () => Promise<VoiceRecorder>) {
  const ready: VoiceRecording[] = []
  const discarded: VoiceRecording[] = []
  const errors: string[] = []
  let starts = 0
  let disposals = 0
  const recorder = {
    record: () => {
      starts += 1
    },
    stop: async () => ({ uri: 'file://voice.m4a', durationMs: 1200 }),
    dispose: () => {
      disposals += 1
    },
  }
  const session = new VoiceRecordingSession({
    prepare: prepare || (async () => recorder),
    discard: recording => {
      discarded.push(recording)
    },
    onPhase: () => {},
    onReady: recording => {
      ready.push(recording)
    },
    onError: reason => {
      errors.push(reason)
    },
  })
  return {
    session,
    recorder,
    ready,
    discarded,
    errors,
    get starts() {
      return starts
    },
    get disposals() {
      return disposals
    },
  }
}

test('releasing while permission or preparation is pending never starts the microphone', async () => {
  let finish!: (recorder: VoiceRecorder) => void
  const state = setup(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const preparing = state.session.begin()
  await state.session.end()
  finish(state.recorder)
  await preparing
  assert.equal(state.starts, 0)
  assert.equal(state.disposals, 1)
  assert.equal(state.session.phase, 'idle')
  assert.deepEqual(state.ready, [])
})

test('a completed hold returns one review recording and releases its recorder', async () => {
  const state = setup()
  await state.session.begin()
  await state.session.begin()
  assert.equal(state.starts, 1)
  await state.session.end()
  await state.session.end()
  assert.equal(state.ready.length, 1)
  assert.equal(state.disposals, 1)
})

test('a denied permission still reports an error after the system dialog cancelled the hold', async () => {
  let reject!: (reason: Error) => void
  const state = setup(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      })
  )
  const preparing = state.session.begin()
  state.session.cancel()
  reject(new Error('permission denied'))
  await preparing
  assert.equal(state.session.phase, 'idle')
  assert.deepEqual(state.errors, ['failed'])
  assert.equal(state.starts, 0)
})

test('background cancellation during stop discards the recording instead of presenting or sending it', async () => {
  let finish!: (recording: VoiceRecording) => void
  const state = setup()
  state.recorder.stop = () =>
    new Promise(resolve => {
      finish = resolve
    })
  await state.session.begin()
  const stopping = state.session.end()
  state.session.cancel()
  finish({ uri: 'file://voice.m4a', durationMs: 1200 })
  await stopping
  assert.equal(state.ready.length, 0)
  assert.equal(state.discarded.length, 1)
  assert.equal(state.disposals, 1)
})

test('disposal while preparing cleans up the late recorder without starting it', async () => {
  let finish!: (recorder: VoiceRecorder) => void
  const state = setup(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const preparing = state.session.begin()
  state.session.dispose()
  finish(state.recorder)
  await preparing
  assert.equal(state.starts, 0)
  assert.equal(state.disposals, 1)
})

test('short recordings are discarded and a failed prepare permits a subsequent attempt', async () => {
  const state = setup()
  state.recorder.stop = async () => ({
    uri: 'file://short.m4a',
    durationMs: 100,
  })
  await state.session.begin()
  await state.session.end()
  assert.deepEqual(state.errors, ['tooShort'])
  assert.equal(state.discarded.length, 1)
  assert.equal(state.ready.length, 0)
  let attempts = 0
  const retry = setup(async () => {
    if (!attempts++) throw new Error('permission denied')
    return state.recorder
  })
  await retry.session.begin()
  assert.equal(retry.session.phase, 'idle')
  await retry.session.begin()
  assert.equal(retry.session.phase, 'recording')
  await retry.session.end()
})
