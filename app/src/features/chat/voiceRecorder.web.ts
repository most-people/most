import type { VoiceRecorder, VoiceRecording } from './voiceRecordingSession'

export class MicrophonePermissionError extends Error {}

export async function prepareVoiceRecorder(): Promise<VoiceRecorder> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    if (
      error instanceof Error &&
      ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
    )
      throw new MicrophonePermissionError()
    throw error
  }
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream)
  } catch (error) {
    stream.getTracks().forEach(track => track.stop())
    throw error
  }
  let startedAt = 0
  let disposed = false
  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', event => {
    if (event.data.size) chunks.push(event.data)
  })
  return {
    record: () => {
      startedAt = Date.now()
      recorder.start()
    },
    stop: () =>
      new Promise((resolve, reject) => {
        let failed = false
        const durationMs = Date.now() - startedAt
        recorder.addEventListener(
          'stop',
          () => {
            stream.getTracks().forEach(track => track.stop())
            if (failed) return
            const blob = new Blob(chunks, { type: recorder.mimeType })
            resolve({ uri: URL.createObjectURL(blob), durationMs })
          },
          { once: true }
        )
        recorder.addEventListener(
          'error',
          error => {
            failed = true
            stream.getTracks().forEach(track => track.stop())
            reject(error)
          },
          { once: true }
        )
        recorder.stop()
      }),
    dispose: () => {
      if (disposed) return
      disposed = true
      if (recorder.state !== 'inactive') recorder.stop()
      stream.getTracks().forEach(track => track.stop())
    },
  }
}

export function discardVoiceRecording(recording: VoiceRecording) {
  if (recording.uri.startsWith('blob:')) URL.revokeObjectURL(recording.uri)
}
