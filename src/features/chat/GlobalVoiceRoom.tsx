import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Mic, MicOff, PhoneCall } from 'lucide-react'
import { ChatVoiceRoomPanel } from '~/components/ChatVoiceRoomPanel'
import {
  useVoiceRoom,
  type VoiceParticipant,
  type VoiceProfile,
} from '~/hooks/useVoiceRoom'
import { useI18n } from '~/lib/i18n'
import { getUserPresenceProfile } from '~/lib/userProfile'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'

export interface VoiceRoomInfo {
  channelName: string
  title: string
}

interface GlobalVoiceRoomContextValue {
  room: VoiceRoomInfo | null
  joined: boolean
  joining: boolean
  micMuted: boolean
  participants: VoiceParticipant[]
  error: string
  isPanelOpen: boolean
  isMinimized: boolean
  elapsedSeconds: number
  openRoom: (room: VoiceRoomInfo) => void
  setPreviewRoom: (room: VoiceRoomInfo | null) => void
  minimize: () => void
  expand: () => void
  join: () => Promise<void>
  leaveAndClose: () => void
  toggleMute: () => void
}

const GlobalVoiceRoomContext =
  createContext<GlobalVoiceRoomContextValue | null>(null)

function normalizeRoom(room: VoiceRoomInfo | null) {
  const channelName = String(room?.channelName || '').trim()
  if (!channelName) return null
  const title = String(room?.title || channelName).trim() || channelName
  return {
    channelName,
    title,
  }
}

function areRoomsEqual(
  left: VoiceRoomInfo | null,
  right: VoiceRoomInfo | null
) {
  return (
    left?.channelName === right?.channelName && left?.title === right?.title
  )
}

function formatElapsedDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  const minuteLabel = String(minutes).padStart(2, '0')
  const secondLabel = String(remainingSeconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${minuteLabel}:${secondLabel}`
  }

  return `${minuteLabel}:${secondLabel}`
}

function VoiceAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
  }, [stream])

  return <audio ref={ref} autoPlay playsInline />
}

function VoiceAudioSink({
  participants,
}: {
  participants: VoiceParticipant[]
}) {
  const remoteParticipants = participants.filter(
    participant => !participant.local && participant.stream
  )

  if (remoteParticipants.length === 0) return null

  return (
    <div className="chat-voice-audio-sink" aria-hidden="true">
      {remoteParticipants.map(participant => (
        <VoiceAudio
          key={participant.sessionId}
          stream={participant.stream as MediaStream}
        />
      ))}
    </div>
  )
}

function VoiceFloatingButton({
  joined,
  micMuted,
  elapsedSeconds,
  participantCount,
  onExpand,
}: {
  joined: boolean
  micMuted: boolean
  elapsedSeconds: number
  participantCount: number
  onExpand: () => void
}) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      className="chat-voice-floating"
      onClick={onExpand}
      aria-label={t('chat.voice.expand')}
      title={t('chat.voice.expand')}
    >
      <span className="chat-voice-floating-phone">
        <PhoneCall size={26} />
      </span>
      <span className="chat-voice-floating-main">
        {joined
          ? formatElapsedDuration(elapsedSeconds)
          : t('chat.voice.floatingActive', { count: participantCount })}
      </span>
      <span className="chat-voice-floating-meta">
        {micMuted ? <MicOff size={15} /> : <Mic size={15} />}
      </span>
    </button>
  )
}

export function GlobalVoiceRoomProvider({ children }: { children: ReactNode }) {
  const hasBackend = useAppStore(s => s.hasBackend)
  const userIdentity = useUserStore(s => s.identity)
  const [activeRoom, setActiveRoom] = useState<VoiceRoomInfo | null>(null)
  const [previewRoom, setPreviewRoomState] = useState<VoiceRoomInfo | null>(
    null
  )
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [joinedAt, setJoinedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const room = activeRoom || previewRoom
  const isReady = hasBackend === true
  const profile = useMemo<VoiceProfile>(() => {
    if (!userIdentity) return {}
    return {
      ...getUserPresenceProfile(userIdentity),
      profileUpdatedAt: userIdentity.profileUpdatedAt,
    }
  }, [
    userIdentity?.avatar,
    userIdentity?.displayName,
    userIdentity?.profileUpdatedAt,
    userIdentity?.username,
  ])

  const voice = useVoiceRoom({
    isReady,
    enabled: Boolean(userIdentity && room),
    channelName: room?.channelName || '',
    profile,
  })

  const remoteParticipantCount = useMemo(
    () => voice.participants.filter(participant => !participant.local).length,
    [voice.participants]
  )
  const floatingParticipantCount = voice.joined
    ? remoteParticipantCount
    : voice.participants.length

  const setPreviewRoom = useCallback((nextRoom: VoiceRoomInfo | null) => {
    const normalized = normalizeRoom(nextRoom)
    setPreviewRoomState(previous =>
      areRoomsEqual(previous, normalized) ? previous : normalized
    )
  }, [])

  const openRoom = useCallback((nextRoom: VoiceRoomInfo) => {
    const normalized = normalizeRoom(nextRoom)
    if (!normalized) return
    setActiveRoom(previous =>
      areRoomsEqual(previous, normalized) ? previous : normalized
    )
    setIsPanelOpen(true)
    setIsMinimized(false)
  }, [])

  const minimize = useCallback(() => {
    if (!room) return
    setActiveRoom(previous => previous || room)
    setIsPanelOpen(false)
    setIsMinimized(true)
  }, [room])

  const expand = useCallback(() => {
    if (!room) return
    setActiveRoom(previous => previous || room)
    setIsPanelOpen(true)
    setIsMinimized(false)
  }, [room])

  const leaveAndClose = useCallback(() => {
    voice.leave()
    setActiveRoom(null)
    setIsPanelOpen(false)
    setIsMinimized(false)
    setJoinedAt(null)
    setElapsedSeconds(0)
  }, [voice.leave])

  useEffect(() => {
    if (voice.joined) {
      setJoinedAt(previous => previous || Date.now())
      return
    }
    setJoinedAt(null)
    setElapsedSeconds(0)
  }, [voice.joined, room?.channelName])

  useEffect(() => {
    if (!joinedAt) return
    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - joinedAt) / 1000))
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [joinedAt])

  useEffect(() => {
    if (userIdentity && isReady) return
    voice.leave()
    setActiveRoom(null)
    setIsPanelOpen(false)
    setIsMinimized(false)
    setJoinedAt(null)
    setElapsedSeconds(0)
  }, [isReady, userIdentity, voice.leave])

  const value = useMemo<GlobalVoiceRoomContextValue>(
    () => ({
      room,
      joined: voice.joined,
      joining: voice.joining,
      micMuted: voice.micMuted,
      participants: voice.participants,
      error: voice.error,
      isPanelOpen,
      isMinimized,
      elapsedSeconds,
      openRoom,
      setPreviewRoom,
      minimize,
      expand,
      join: voice.join,
      leaveAndClose,
      toggleMute: voice.toggleMute,
    }),
    [
      elapsedSeconds,
      expand,
      isMinimized,
      isPanelOpen,
      leaveAndClose,
      minimize,
      openRoom,
      room,
      setPreviewRoom,
      voice.error,
      voice.join,
      voice.joined,
      voice.joining,
      voice.micMuted,
      voice.participants,
      voice.toggleMute,
    ]
  )

  const shouldShowFloating =
    isMinimized &&
    Boolean(room) &&
    (voice.joined || voice.participants.length > 0)

  return (
    <GlobalVoiceRoomContext.Provider value={value}>
      {children}
      <VoiceAudioSink participants={voice.participants} />
      {isPanelOpen && room && (
        <ChatVoiceRoomPanel
          title={room.title}
          isReady={isReady}
          error={voice.error}
          joined={voice.joined}
          joining={voice.joining}
          micMuted={voice.micMuted}
          participants={voice.participants}
          onMinimize={minimize}
          onJoin={() => void voice.join()}
          onLeave={leaveAndClose}
          onToggleMute={voice.toggleMute}
        />
      )}
      {shouldShowFloating && (
        <VoiceFloatingButton
          joined={voice.joined}
          micMuted={voice.micMuted}
          elapsedSeconds={elapsedSeconds}
          participantCount={floatingParticipantCount}
          onExpand={expand}
        />
      )}
    </GlobalVoiceRoomContext.Provider>
  )
}

export function useGlobalVoiceRoom() {
  const value = useContext(GlobalVoiceRoomContext)
  if (!value) {
    throw new Error(
      'useGlobalVoiceRoom must be used within GlobalVoiceRoomProvider'
    )
  }
  return value
}
