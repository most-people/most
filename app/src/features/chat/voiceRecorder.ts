import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import type { VoiceRecorder, VoiceRecording } from './voiceRecordingSession'

export class MicrophonePermissionError extends Error {}

export async function prepareVoiceRecorder(): Promise<VoiceRecorder> {
  let permission = await AudioModule.getRecordingPermissionsAsync()
  if (!permission.granted)
    permission = await AudioModule.requestRecordingPermissionsAsync()
  if (!permission.granted) throw new MicrophonePermissionError()
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: false,
    shouldPlayInBackground: false,
  })
  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY)
  try {
    await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY)
  } catch (error) {
    recorder.release()
    throw error
  }
  let released = false
  let retained = false
  return {
    record: () => recorder.record(),
    stop: async () => {
      const durationMs = recorder.getStatus().durationMillis
      await recorder.stop()
      const uri = recorder.uri || ''
      retained = Boolean(uri)
      return { uri, durationMs }
    },
    dispose: () => {
      if (!released) {
        released = true
        const uri = recorder.uri || ''
        recorder.release()
        if (!retained && uri) discardVoiceRecording({ uri, durationMs: 0 })
      }
    },
  }
}

export function discardVoiceRecording(recording: VoiceRecording) {
  if (recording.uri.startsWith('file:'))
    void FileSystem.deleteAsync(recording.uri, { idempotent: true }).catch(
      () => {}
    )
}
