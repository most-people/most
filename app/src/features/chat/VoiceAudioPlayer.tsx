import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { Pause, Play } from 'lucide-react-native'
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
  color?: string
}

export function VoiceAudioPlayer({
  loadUri,
  active,
  onPlay,
  color,
}: VoiceAudioPlayerProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const foreground = color || theme.colors.text
  const { toast } = useFeedback()
  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const [loading, setLoading] = useState(false)
  const uriRef = useRef('')
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
  const toggle = async () => {
    if (loading) return
    if (status.playing) {
      player.pause()
      return
    }
    onPlay?.()
    setLoading(true)
    try {
      if (!uriRef.current) {
        const uri = await loadUri()
        if (!mountedRef.current) {
          if (uri.startsWith('blob:')) URL.revokeObjectURL(uri)
          return
        }
        uriRef.current = uri
        player.replace(uri)
      }
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
      style={styles.button}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : status.playing ? (
        <Pause size={22} color={foreground} />
      ) : (
        <Play size={22} color={foreground} />
      )}
      <Text style={[styles.label, { color: foreground }]}>
        {t(status.playing ? 'chat.pauseVoice' : 'chat.playVoice')}
        {status.duration > 0 ? ` · ${Math.ceil(status.duration)}s` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15 },
})
