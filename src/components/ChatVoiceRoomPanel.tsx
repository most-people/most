import {
  Mic,
  MicOff,
  Minimize2,
  PhoneCall,
  PhoneOff,
  Signal,
} from 'lucide-react'
import { SafeImage } from '~/components/SafeImage'
import { generateAvatar } from '~server/src/utils/avatar.js'
import { type VoiceParticipant } from '~/hooks/useVoiceRoom'
import { useI18n } from '~/lib/i18n'

interface ChatVoiceRoomPanelProps {
  title: string
  isReady: boolean
  error: string
  joined: boolean
  joining: boolean
  micMuted: boolean
  participants: VoiceParticipant[]
  onMinimize: () => void
  onJoin: () => void
  onLeave: () => void
  onToggleMute: () => void
}

function VoiceMemberCard({ participant }: { participant: VoiceParticipant }) {
  const { t } = useI18n()
  const statusLabel = participant.local
    ? t('chat.voice.you')
    : participant.connectionState === 'connected'
      ? t('chat.voice.connected')
      : t('chat.voice.connecting')

  return (
    <div className="chat-voice-member-card">
      <span className="chat-voice-avatar-wrap">
        <SafeImage
          className="chat-voice-avatar"
          src={generateAvatar(participant.address, participant.avatar)}
          alt="avatar"
          referrerPolicy="no-referrer"
        />
        <span
          className={[
            'chat-voice-mic-state',
            participant.micMuted ? 'muted' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={
            participant.micMuted
              ? t('chat.voice.memberMuted')
              : t('chat.voice.memberSpeaking')
          }
        >
          {participant.micMuted ? <MicOff size={13} /> : <Mic size={13} />}
        </span>
      </span>
      <span className="chat-voice-member-name" translate="no">
        {participant.displayName}
      </span>
      <span className="chat-voice-member-status">{statusLabel}</span>
    </div>
  )
}

export function ChatVoiceRoomPanel({
  title,
  isReady,
  error,
  joined,
  joining,
  micMuted,
  participants,
  onMinimize,
  onJoin,
  onLeave,
  onToggleMute,
}: ChatVoiceRoomPanelProps) {
  const { t } = useI18n()

  return (
    <section
      className="chat-voice-room-panel"
      aria-label={t('chat.voice.title')}
    >
      <header className="chat-voice-room-header">
        <div className="chat-voice-room-heading">
          <span className="chat-voice-room-icon">
            <PhoneCall size={18} />
          </span>
          <div>
            <h3 translate="no">{title}</h3>
            <p>{t('chat.voice.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-icon"
          onClick={onMinimize}
          aria-label={t('chat.voice.minimize')}
          title={t('chat.voice.minimize')}
        >
          <Minimize2 size={17} />
        </button>
      </header>

      <div className="chat-voice-room-body">
        {error && (
          <div className="chat-voice-error" role="alert">
            {error}
          </div>
        )}

        <div className="chat-voice-member-grid">
          {participants.length === 0 ? (
            <div className="ui-empty-state chat-voice-empty">
              <div className="ui-empty-icon">
                <Signal size={24} />
              </div>
              <p>{t('chat.voice.empty')}</p>
            </div>
          ) : (
            participants.map(participant => (
              <VoiceMemberCard
                key={participant.sessionId}
                participant={participant}
              />
            ))
          )}
        </div>
      </div>

      <footer className="chat-voice-room-controls">
        {joined ? (
          <>
            <button
              type="button"
              className="btn btn-secondary chat-voice-control"
              onClick={onToggleMute}
              title={micMuted ? t('chat.voice.unmute') : t('chat.voice.mute')}
            >
              {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
              {micMuted ? t('chat.voice.unmute') : t('chat.voice.mute')}
            </button>
            <button
              type="button"
              className="btn btn-danger chat-voice-control"
              onClick={onLeave}
              title={t('chat.voice.leave')}
            >
              <PhoneOff size={18} />
              {t('chat.voice.leave')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary chat-voice-join"
            onClick={onJoin}
            disabled={!isReady || joining}
            title={t('chat.voice.join')}
          >
            <PhoneCall size={18} />
            {joining ? t('chat.voice.joining') : t('chat.voice.join')}
          </button>
        )}
      </footer>
    </section>
  )
}
