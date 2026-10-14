export type VoiceRecording = { uri: string; durationMs: number }
export type VoiceRecordingPhase =
  'idle' | 'preparing' | 'recording' | 'stopping'
export type VoiceRecorder = {
  record: () => void
  stop: () => Promise<VoiceRecording>
  dispose: () => void
}

type VoiceRecordingSessionOptions = {
  prepare: () => Promise<VoiceRecorder>
  discard: (recording: VoiceRecording) => void
  onPhase: (phase: VoiceRecordingPhase) => void
  onReady: (recording: VoiceRecording) => void
  onError: (reason: 'tooShort' | 'failed', error?: unknown) => void
}

/** Owns one press-and-hold recording, including asynchronous permission setup. */
export class VoiceRecordingSession {
  #options: VoiceRecordingSessionOptions
  #phase: VoiceRecordingPhase = 'idle'
  #recorder: VoiceRecorder | null = null
  #pressed = false
  #cancelled = false
  #disposed = false

  constructor(options: VoiceRecordingSessionOptions) {
    this.#options = options
  }

  get phase() {
    return this.#phase
  }

  #setPhase(phase: VoiceRecordingPhase) {
    this.#phase = phase
    if (!this.#disposed) this.#options.onPhase(phase)
  }

  async begin() {
    if (this.#disposed || this.#phase !== 'idle') return
    this.#pressed = true
    this.#cancelled = false
    this.#setPhase('preparing')
    let recorder: VoiceRecorder | null = null
    try {
      recorder = await this.#options.prepare()
      if (this.#disposed || !this.#pressed || this.#cancelled) {
        recorder.dispose()
        this.#setPhase('idle')
        return
      }
      this.#recorder = recorder
      recorder.record()
      this.#setPhase('recording')
    } catch (error) {
      recorder?.dispose()
      this.#recorder = null
      if (!this.#disposed) this.#options.onError('failed', error)
      this.#setPhase('idle')
    }
  }

  async end() {
    this.#pressed = false
    if (this.#phase !== 'recording' || !this.#recorder) return
    const recorder = this.#recorder
    this.#setPhase('stopping')
    try {
      const recording = await recorder.stop()
      if (this.#disposed || this.#cancelled) this.#options.discard(recording)
      else if (
        !recording.uri ||
        !Number.isFinite(recording.durationMs) ||
        recording.durationMs < 500
      ) {
        this.#options.discard(recording)
        this.#options.onError('tooShort')
      } else this.#options.onReady(recording)
    } catch (error) {
      if (!this.#disposed && !this.#cancelled)
        this.#options.onError('failed', error)
    } finally {
      recorder.dispose()
      this.#recorder = null
      this.#setPhase('idle')
    }
  }

  cancel() {
    this.#pressed = false
    this.#cancelled = true
    if (this.#phase === 'recording') void this.end()
  }

  dispose() {
    this.#disposed = true
    this.cancel()
  }
}
