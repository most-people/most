import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import {
  prepareVoiceRecorder,
  discardVoiceRecording,
  MicrophonePermissionError,
} from './voiceRecorder.web'

function replaceProperty(
  t: TestContext,
  object: object,
  name: string,
  value: unknown
) {
  const descriptor = Object.getOwnPropertyDescriptor(object, name)
  Object.defineProperty(object, name, {
    configurable: true,
    writable: true,
    value,
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(object, name, descriptor)
    else Reflect.deleteProperty(object, name)
  })
}

class TestRecorder extends EventTarget {
  state = 'inactive'
  mimeType = 'audio/webm'
  static failConstruction = false
  static failStop = false
  constructor(_stream: MediaStream) {
    super()
    if (TestRecorder.failConstruction) throw new Error('unsupported recorder')
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    queueMicrotask(() => {
      if (TestRecorder.failStop) this.dispatchEvent(new Event('error'))
      const data = Object.assign(new Event('dataavailable'), {
        data: new Blob(['voice'], { type: this.mimeType }),
      })
      this.dispatchEvent(data)
      this.dispatchEvent(new Event('stop'))
    })
  }
}

test('Web recording releases prepared streams and preserves completed audio until discarded', async t => {
  let stopped = 0
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped += 1
        },
      },
    ],
  }
  replaceProperty(t, navigator, 'mediaDevices', {
    getUserMedia: async () => stream,
  })
  replaceProperty(t, globalThis, 'MediaRecorder', TestRecorder)
  const prepared = await prepareVoiceRecorder()
  prepared.dispose()
  prepared.dispose()
  assert.equal(stopped, 1)
  const recorder = await prepareVoiceRecorder()
  recorder.record()
  const recording = await recorder.stop()
  assert.equal((await (await fetch(recording.uri)).blob()).size, 5)
  discardVoiceRecording(recording)
  await assert.rejects(fetch(recording.uri))
  recorder.dispose()
  assert.ok(stopped >= 2)
})

test('Web recording closes its microphone after constructor failure or stop error without leaking a Blob URL', async t => {
  let stopped = 0
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped += 1
        },
      },
    ],
  }
  replaceProperty(t, navigator, 'mediaDevices', {
    getUserMedia: async () => stream,
  })
  replaceProperty(t, globalThis, 'MediaRecorder', TestRecorder)
  TestRecorder.failConstruction = true
  await assert.rejects(prepareVoiceRecorder(), /unsupported recorder/)
  assert.equal(stopped, 1)
  TestRecorder.failConstruction = false
  const recorder = await prepareVoiceRecorder()
  recorder.record()
  TestRecorder.failStop = true
  const urls = t.mock.method(URL, 'createObjectURL')
  await assert.rejects(recorder.stop())
  assert.equal(urls.mock.calls.length, 0)
  recorder.dispose()
  TestRecorder.failStop = false
})

test('Web permission denial is distinguished from unsupported capture', async t => {
  let failure: Error = Object.assign(new Error('denied'), {
    name: 'NotAllowedError',
  })
  replaceProperty(t, navigator, 'mediaDevices', {
    getUserMedia: async () => {
      throw failure
    },
  })
  await assert.rejects(prepareVoiceRecorder(), MicrophonePermissionError)
  failure = new TypeError('capture unavailable')
  await assert.rejects(
    prepareVoiceRecorder(),
    error =>
      error instanceof TypeError &&
      !(error instanceof MicrophonePermissionError)
  )
})
