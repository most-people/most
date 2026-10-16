import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { Pause, Volume2 } from 'lucide-react-native'
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio'
import { useI18n } from '../../i18n'
import { useMostBoxTheme } from '../../ui/theme'
import { useFeedback } from '../../ui/feedback'

type VoiceAudioPlayerProps = {
  loadUri: () => Promise<string>
  active: boolean
  onPlay?: () => void
  mine?: boolean
  onLongPress?: () => void
}

export function VoiceAudioPlayer({
  loadUri,
  active,
  onPlay,
  mine = false,
  onLongPress,
}: VoiceAudioPlayerProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const foreground = mine ? '#152515' : theme.colors.text
  const styles = createStyles(foreground, mine)
  const { toast } = useFeedback()
  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const [loading, setLoading] = useState(false)
  const uriRef = useRef('')
  const loadedUriRef = useRef('')
  const pendingUriRef = useRef<Promise<string> | null>(null)
  const loadUriRef = useRef(loadUri)
  loadUriRef.current = loadUri
  const mountedRef = useRef(true)
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (uriRef.current.startsWith('blob:'))
        URL.revokeObjectURL(uriRef.current)
    }
  }, [])
  useEffect(() => {
    if (!active) player.pause()
  }, [active, player])
  const prepareAudio = useCallback(async () => {
    if (!pendingUriRef.current) {
      pendingUriRef.current = loadUriRef
        .current()
        .then(uri => {
          if (!mountedRef.current) {
            if (uri.startsWith('blob:')) URL.revokeObjectURL(uri)
            return ''
          }
          uriRef.current = uri
          return uri
        })
        .catch(error => {
          pendingUriRef.current = null
          throw error
        })
    }
    const uri = await pendingUriRef.current
    if (
      uri &&
      mountedRef.current &&
      activeRef.current &&
      loadedUriRef.current !== uri
    ) {
      player.replace(uri)
      loadedUriRef.current = uri
    }
  }, [player])
  // Read duration from the locally verified audio without starting playback.
  useEffect(() => {
    if (active) void prepareAudio().catch(() => {})
  }, [active, prepareAudio])
  const toggle = async () => {
    if (loading) return
    if (status.playing) {
      player.pause()
      return
    }
    onPlay?.()
    setLoading(true)
    try {
      await prepareAudio()
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      })
      if (!mountedRef.current || !activeRef.current) return
      if (
        status.didJustFinish ||
        (status.duration > 0 && status.currentTime >= status.duration - 0.05)
      )
        await player.seekTo(0)
      player.play()
    } catch {
      if (mountedRef.current) toast(t('chat.voicePlaybackFailed'), 'error')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        status.playing ? 'chat.pauseVoice' : 'chat.playVoice'
      )}
      onPress={() => void toggle()}
      onLongPress={onLongPress}
      style={styles.button}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : status.playing ? (
        <Pause size={22} color={foreground} />
      ) : (
        <Volume2 size={22} color={foreground} />
      )}
      <Text style={styles.label}>
        {status.duration > 0 ? `${Math.ceil(status.duration)}″` : '…'}
      </Text>
    </Pressable>
  )
}

function createStyles(color: string, mine: boolean) {
  return StyleSheet.create({
    button: {
      minHeight: 24,
      minWidth: 80,
      flexDirection: mine ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    label: { fontSize: 16, color },
  })
}
