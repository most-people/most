import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useI18n } from '../../i18n'
import { useFeedback } from '../../ui/feedback'
import { useMostBoxTheme } from '../../ui/theme'
import { BottomSheetCard, MostButton } from '../../ui/components'
import {
  VoiceRecordingSession,
  type VoiceRecording,
  type VoiceRecordingPhase,
} from './voiceRecordingSession'
import {
  discardVoiceRecording,
  MicrophonePermissionError,
  prepareVoiceRecorder,
} from './voiceRecorder'
import { VoiceAudioPlayer } from './VoiceAudioPlayer'
import { getChatErrorMessage } from '../../chat/chatProtocol'

type VoiceMessageRecorderProps = {
  active: boolean
  disabled: boolean
  onSend: (recording: VoiceRecording) => Promise<void>
  onActivityChange: (busy: boolean) => void
}

export function VoiceMessageRecorder({
  active,
  disabled,
  onSend,
  onActivityChange,
}: VoiceMessageRecorderProps) {
  const { t } = useI18n()
  const { toast } = useFeedback()
  const theme = useMostBoxTheme()
  const styles = createStyles(theme.colors)
  const [phase, setPhase] = useState<VoiceRecordingPhase>('idle')
  const [preview, setPreview] = useState<VoiceRecording | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const recordingRef = useRef<VoiceRecording | null>(null)
  const sessionRef = useRef<VoiceRecordingSession | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const callbacksRef = useRef({ t, toast })
  callbacksRef.current = { t, toast }
  useEffect(() => {
    const session = new VoiceRecordingSession({
      prepare: prepareVoiceRecorder,
      discard: discardVoiceRecording,
      onPhase: setPhase,
      onReady: recording => {
        recordingRef.current = recording
        setSendError('')
        setPreview(recording)
      },
      onError: (reason, error) => {
        const key =
          reason === 'tooShort'
            ? 'chat.voiceTooShort'
            : error instanceof MicrophonePermissionError
              ? 'chat.microphonePermissionBody'
              : 'chat.voiceRecordingFailed'
        callbacksRef.current.toast(callbacksRef.current.t(key), 'error')
      },
    })
    sessionRef.current = session
    return () => {
      session.dispose()
      sessionRef.current = null
      if (recordingRef.current) discardVoiceRecording(recordingRef.current)
    }
  }, [])
  useEffect(() => {
    if (!active) sessionRef.current?.cancel()
  }, [active])
  useEffect(() => {
    onActivityChange(phase !== 'idle' || Boolean(preview))
    return () => onActivityChange(false)
  }, [phase, preview, onActivityChange])
  useEffect(() => {
    if (phase !== 'recording') return
    const timer = setTimeout(() => void sessionRef.current?.end(), 60_000)
    return () => clearTimeout(timer)
  }, [phase])
  const close = () => {
    if (sending) return
    if (recordingRef.current) discardVoiceRecording(recordingRef.current)
    recordingRef.current = null
    setSendError('')
    setPreview(null)
  }
  const send = async () => {
    if (!preview || sending || !activeRef.current) return
    setSendError('')
    setSending(true)
    try {
      await onSend(preview)
      discardVoiceRecording(preview)
      recordingRef.current = null
      setPreview(null)
    } catch (error) {
      setSendError(
        getChatErrorMessage(
          error,
          t('chat.sendFailed'),
          t('chat.requestTimedOut')
        )
      )
    } finally {
      setSending(false)
    }
  }
  const label =
    phase === 'preparing'
      ? 'chat.voicePreparing'
      : phase === 'recording'
        ? 'chat.releaseToReview'
        : phase === 'stopping'
          ? 'chat.voicePreparing'
          : 'chat.holdToTalk'
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.holdToTalk')}
        disabled={disabled || !active || Boolean(preview)}
        onPressIn={() => {
          if (!disabled && active) void sessionRef.current?.begin()
        }}
        onPressOut={() => void sessionRef.current?.end()}
        style={[
          styles.hold,
          phase === 'recording' ? styles.recording : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Text style={styles.holdLabel}>{t(label)}</Text>
      </Pressable>
      <Modal
        transparent
        visible={Boolean(preview)}
        animationType="slide"
        onRequestClose={close}
      >
        <View style={styles.overlay}>
          <BottomSheetCard>
            <Text style={styles.title}>{t('chat.voiceReview')}</Text>
            <Text style={styles.hint}>
              {t('chat.voiceReviewHint', {
                seconds: Math.max(
                  1,
                  Math.round((preview?.durationMs || 0) / 1000)
                ),
              })}
            </Text>
            {preview ? (
              <VoiceAudioPlayer
                key={preview.uri}
                loadUri={async () => preview.uri}
                active={active && !sending}
              />
            ) : null}
            {sendError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {sendError}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <MostButton variant="ghost" disabled={sending} onPress={close}>
                {t('common.cancel')}
              </MostButton>
              <MostButton
                disabled={sending || !active}
                onPress={() => void send()}
              >
                {sending ? (
                  <ActivityIndicator color={theme.colors.onAccent} />
                ) : (
                  t('chat.send')
                )}
              </MostButton>
            </View>
          </BottomSheetCard>
        </View>
      </Modal>
    </>
  )
}

function createStyles(colors: ReturnType<typeof useMostBoxTheme>['colors']) {
  return StyleSheet.create({
    hold: {
      flex: 1,
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    recording: { backgroundColor: colors.accent },
    disabled: { opacity: 0.5 },
    holdLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    hint: { color: colors.textMuted, fontSize: 14, marginVertical: 12 },
    error: { color: colors.danger, fontSize: 14, marginTop: 12 },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 16,
    },
  })
}
