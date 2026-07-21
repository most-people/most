import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuthenticatedWebSocketUrl } from '~server/src/utils/api'
import {
  decryptDirectVoiceEvent,
  encryptDirectVoiceEvent,
  normalizeDirectAddress,
} from '~server/src/core/directChat.js'
import type { UserIdentity } from '~/stores/userStore'

const VOICE_HEARTBEAT_MS = 15000
const VOICE_STALE_MS = 45000
const DIRECT_VOICE_EVENT_MAX_AGE_MS = 5 * 60 * 1000
const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

type VoiceEventName = 'join' | 'state' | 'heartbeat' | 'leave' | 'signal'
type VoiceSignalType = 'offer' | 'answer' | 'candidate'
type VoiceConnectionState =
  'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

const VOICE_WS_EVENTS: Record<VoiceEventName, string> = {
  join: 'channel:voice:join',
  state: 'channel:voice:state',
  heartbeat: 'channel:voice:heartbeat',
  leave: 'channel:voice:leave',
  signal: 'channel:voice:signal',
}

export interface VoiceProfile {
  displayName?: string
  avatar?: string
  profileUpdatedAt?: number
}

interface VoiceSender extends VoiceProfile {
  address: string
}

interface VoiceSignal {
  type: VoiceSignalType
  sdp?: string
  candidate?: RTCIceCandidateInit
}

interface ChannelVoiceEvent {
  channel?: string
  channelKey?: string
  channelId?: string
  event?: VoiceEventName
  sessionId?: string
  targetSessionId?: string
  sender?: VoiceSender
  micMuted?: boolean
  signal?: VoiceSignal
  ciphertext?: string
  timestamp?: number
}

export interface VoiceParticipant {
  sessionId: string
  address: string
  displayName: string
  avatar?: string
  profileUpdatedAt?: number
  micMuted: boolean
  local: boolean
  joinedAt: number
  lastSeen: number
  connectionState: VoiceConnectionState
  stream?: MediaStream
}

interface UseVoiceRoomOptions {
  isReady: boolean
  enabled: boolean
  channelName: string
  profile: VoiceProfile
  identity?: UserIdentity | null
  directPeerAddress?: string
  directPeerPublicKey?: string
}

function createVoiceSessionId() {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isOpen(ws: WebSocket | null) {
  return ws?.readyState === WebSocket.OPEN
}

function getEventChannelKey(event: ChannelVoiceEvent) {
  return event.channelKey || event.channel || event.channelId || ''
}

function getParticipantName(sender?: VoiceSender) {
  return String(sender?.displayName || sender?.address || '').trim()
}

export function useVoiceRoom({
  isReady,
  enabled,
  channelName,
  profile,
  identity,
  directPeerAddress = '',
  directPeerPublicKey = '',
}: UseVoiceRoomOptions) {
  const sessionIdRef = useRef(createVoiceSessionId())
  const wsRef = useRef<WebSocket | null>(null)
  const joinedRef = useRef(false)
  const micMutedRef = useRef(false)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef(new Map<string, RTCPeerConnection>())
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>())
  const profileRef = useRef(profile)

  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [participantsBySession, setParticipantsBySession] = useState<
    Record<string, VoiceParticipant>
  >({})
  const [error, setError] = useState('')

  const localSessionId = sessionIdRef.current
  const normalizedSelfAddress = normalizeDirectAddress(identity?.address)
  const normalizedPeerAddress = normalizeDirectAddress(directPeerAddress)
  const directVoiceEnabled = Boolean(
    identity?.danger &&
    normalizedSelfAddress &&
    normalizedPeerAddress &&
    /^0x[a-fA-F0-9]{64}$/.test(directPeerPublicKey)
  )
  const directVoiceKey = directVoiceEnabled
    ? `${normalizedPeerAddress}:${directPeerPublicKey.toLowerCase()}`
    : ''

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const participants = useMemo(
    () =>
      Object.values(participantsBySession).sort((left, right) => {
        if (left.local !== right.local) return left.local ? -1 : 1
        return left.joinedAt - right.joinedAt
      }),
    [participantsBySession]
  )

  const sendVoiceEvent = useCallback(
    (event: VoiceEventName, data: Record<string, unknown> = {}) => {
      if (!channelName || !isOpen(wsRef.current)) return
      const timestamp = Date.now()
      let voiceData: Record<string, unknown> = {
        channel: channelName,
        sessionId: localSessionId,
        displayName: profileRef.current.displayName,
        avatar: profileRef.current.avatar,
        profileUpdatedAt: profileRef.current.profileUpdatedAt,
        micMuted: micMutedRef.current,
        ...data,
      }
      if (directVoiceEnabled && identity) {
        try {
          const ciphertext = encryptDirectVoiceEvent(
            {
              event,
              sessionId: localSessionId,
              sender: {
                address: normalizedSelfAddress,
                displayName: profileRef.current.displayName,
                avatar: profileRef.current.avatar,
                profileUpdatedAt: profileRef.current.profileUpdatedAt,
              },
              micMuted: micMutedRef.current,
              timestamp,
              ...data,
            },
            identity,
            directPeerPublicKey
          )
          if (!ciphertext) return
          voiceData = {
            channel: channelName,
            sessionId: localSessionId,
            ciphertext,
          }
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error))
          return
        }
      }
      wsRef.current?.send(
        JSON.stringify({
          event: VOICE_WS_EVENTS[event],
          data: voiceData,
        })
      )
    },
    [
      channelName,
      directPeerPublicKey,
      directVoiceEnabled,
      identity,
      localSessionId,
      normalizedSelfAddress,
    ]
  )

  const decodeVoiceEvent = useCallback(
    (event: ChannelVoiceEvent) => {
      if (!directVoiceEnabled || !identity) {
        return event.ciphertext ? null : event
      }
      if (!event.ciphertext || !event.sender?.address) return null

      const authorAddress = normalizeDirectAddress(event.sender.address)
      if (
        authorAddress !== normalizedSelfAddress &&
        authorAddress !== normalizedPeerAddress
      ) {
        return null
      }
      const payload = decryptDirectVoiceEvent(event.ciphertext, {
        identity,
        peerPublicKey: directPeerPublicKey,
        authorAddress,
      }) as ChannelVoiceEvent | null
      const payloadAuthor = normalizeDirectAddress(payload?.sender?.address)
      const timestamp = Number(payload?.timestamp)
      if (
        !payload ||
        payloadAuthor !== authorAddress ||
        payload.event !== event.event ||
        payload.sessionId !== event.sessionId ||
        !Number.isFinite(timestamp) ||
        Math.abs(Date.now() - timestamp) > DIRECT_VOICE_EVENT_MAX_AGE_MS
      ) {
        return null
      }
      return {
        ...payload,
        channel: event.channel,
        channelKey: event.channelKey,
        channelId: event.channelId,
      }
    },
    [
      directPeerPublicKey,
      directVoiceEnabled,
      identity,
      normalizedPeerAddress,
      normalizedSelfAddress,
    ]
  )

  const updateParticipant = useCallback(
    (
      sessionId: string,
      updater: (previous?: VoiceParticipant) => VoiceParticipant | null
    ) => {
      setParticipantsBySession(prev => {
        const nextParticipant = updater(prev[sessionId])
        if (!nextParticipant) {
          const next = { ...prev }
          delete next[sessionId]
          return next
        }
        return {
          ...prev,
          [sessionId]: nextParticipant,
        }
      })
    },
    []
  )

  const closePeer = useCallback((sessionId: string) => {
    const peer = peersRef.current.get(sessionId)
    if (peer) {
      peer.close()
      peersRef.current.delete(sessionId)
    }
    pendingCandidatesRef.current.delete(sessionId)
  }, [])

  useEffect(() => {
    setError('')
    setParticipantsBySession({})
    pendingCandidatesRef.current.clear()
  }, [channelName, directVoiceKey])

  useEffect(() => {
    if (enabled && isReady && channelName) return
    setError('')
    setParticipantsBySession({})
    pendingCandidatesRef.current.clear()
  }, [channelName, enabled, isReady])

  const sendSignal = useCallback(
    (targetSessionId: string, signal: VoiceSignal) => {
      sendVoiceEvent('signal', { targetSessionId, signal })
    },
    [sendVoiceEvent]
  )

  const ensurePeer = useCallback(
    (participant: VoiceParticipant, createOffer: boolean) => {
      const existing = peersRef.current.get(participant.sessionId)
      if (existing) return existing

      const peer = new RTCPeerConnection(RTC_CONFIGURATION)
      peersRef.current.set(participant.sessionId, peer)

      localStreamRef.current?.getTracks().forEach(track => {
        const stream = localStreamRef.current
        if (stream) peer.addTrack(track, stream)
      })

      peer.onicecandidate = event => {
        if (!event.candidate) return
        sendSignal(participant.sessionId, {
          type: 'candidate',
          candidate: event.candidate.toJSON(),
        })
      }

      peer.ontrack = event => {
        const [stream] = event.streams
        if (!stream) return
        updateParticipant(participant.sessionId, previous => ({
          ...(previous || participant),
          stream,
          lastSeen: Date.now(),
        }))
      }

      peer.onconnectionstatechange = () => {
        updateParticipant(participant.sessionId, previous => {
          if (!previous) return null
          return {
            ...previous,
            connectionState: peer.connectionState as VoiceConnectionState,
            lastSeen: Date.now(),
          }
        })
      }

      if (createOffer) {
        void peer
          .createOffer()
          .then(offer => peer.setLocalDescription(offer))
          .then(() => {
            if (!peer.localDescription) return
            sendSignal(participant.sessionId, {
              type: 'offer',
              sdp: peer.localDescription.sdp,
            })
          })
          .catch(err =>
            setError(err instanceof Error ? err.message : String(err))
          )
      }

      return peer
    },
    [sendSignal, updateParticipant]
  )

  const upsertRemoteParticipant = useCallback(
    (event: ChannelVoiceEvent) => {
      const sessionId = String(event.sessionId || '').trim()
      if (
        !sessionId ||
        sessionId === localSessionId ||
        !event.sender?.address
      ) {
        return null
      }

      const now = Number(event.timestamp) || Date.now()
      const participant: VoiceParticipant = {
        sessionId,
        address: event.sender.address,
        displayName: getParticipantName(event.sender) || sessionId,
        avatar: event.sender.avatar,
        profileUpdatedAt: event.sender.profileUpdatedAt,
        micMuted: typeof event.micMuted === 'boolean' ? event.micMuted : false,
        local: false,
        joinedAt: now,
        lastSeen: now,
        connectionState: 'new',
      }
      updateParticipant(sessionId, previous => {
        return {
          sessionId,
          address: participant.address || previous?.address || '',
          displayName:
            participant.displayName || previous?.displayName || sessionId,
          avatar: participant.avatar || previous?.avatar,
          profileUpdatedAt:
            participant.profileUpdatedAt || previous?.profileUpdatedAt,
          micMuted:
            typeof event.micMuted === 'boolean'
              ? event.micMuted
              : previous?.micMuted || false,
          local: false,
          joinedAt: previous?.joinedAt || now,
          lastSeen: now,
          connectionState: previous?.connectionState || 'new',
          stream: previous?.stream,
        }
      })
      return participant
    },
    [localSessionId, updateParticipant]
  )

  const handleSignal = useCallback(
    async (event: ChannelVoiceEvent, participant: VoiceParticipant) => {
      if (event.targetSessionId !== localSessionId || !event.signal) return
      const peer = ensurePeer(participant, false)

      if (event.signal.type === 'offer' && event.signal.sdp) {
        await peer.setRemoteDescription({
          type: 'offer',
          sdp: event.signal.sdp,
        })
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        if (peer.localDescription) {
          sendSignal(participant.sessionId, {
            type: 'answer',
            sdp: peer.localDescription.sdp,
          })
        }
      } else if (event.signal.type === 'answer' && event.signal.sdp) {
        await peer.setRemoteDescription({
          type: 'answer',
          sdp: event.signal.sdp,
        })
      } else if (event.signal.type === 'candidate' && event.signal.candidate) {
        if (!peer.remoteDescription) {
          const pending =
            pendingCandidatesRef.current.get(participant.sessionId) || []
          pending.push(event.signal.candidate)
          pendingCandidatesRef.current.set(participant.sessionId, pending)
          return
        }
        await peer.addIceCandidate(event.signal.candidate)
      }

      if (peer.remoteDescription) {
        const pending =
          pendingCandidatesRef.current.get(participant.sessionId) || []
        pendingCandidatesRef.current.delete(participant.sessionId)
        for (const candidate of pending) {
          await peer.addIceCandidate(candidate).catch(() => {})
        }
      }
    },
    [ensurePeer, localSessionId, sendSignal]
  )

  const handleVoiceEvent = useCallback(
    (rawEvent: ChannelVoiceEvent) => {
      const event = decodeVoiceEvent(rawEvent)
      if (!event) return
      if (getEventChannelKey(event) !== channelName) return
      const sessionId = String(event.sessionId || '').trim()
      if (!sessionId || sessionId === localSessionId) return

      if (event.event === 'leave') {
        closePeer(sessionId)
        updateParticipant(sessionId, () => null)
        return
      }

      const participant = upsertRemoteParticipant(event)
      if (!participant) return

      if (joinedRef.current && event.event === 'join') {
        sendVoiceEvent('state')
      }

      if (
        joinedRef.current &&
        event.event !== 'signal' &&
        localSessionId < participant.sessionId
      ) {
        ensurePeer(participant, true)
      }

      if (event.event === 'signal') {
        void handleSignal(event, participant).catch(err =>
          setError(err instanceof Error ? err.message : String(err))
        )
      }
    },
    [
      channelName,
      closePeer,
      decodeVoiceEvent,
      ensurePeer,
      handleSignal,
      localSessionId,
      sendVoiceEvent,
      updateParticipant,
      upsertRemoteParticipant,
    ]
  )

  const leave = useCallback(() => {
    if (joinedRef.current) {
      sendVoiceEvent('leave')
    }
    joinedRef.current = false
    setJoined(false)
    setJoining(false)
    micMutedRef.current = false
    setMicMuted(false)
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    for (const sessionId of [...peersRef.current.keys()]) {
      closePeer(sessionId)
    }
    setParticipantsBySession(prev => {
      const next: Record<string, VoiceParticipant> = {}
      for (const participant of Object.values(prev)) {
        if (!participant.local) next[participant.sessionId] = participant
      }
      return next
    })
  }, [closePeer, sendVoiceEvent])

  const join = useCallback(async () => {
    if (!enabled || !isReady || !channelName || joinedRef.current || joining) {
      return
    }
    setJoining(true)
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      localStreamRef.current = stream
      joinedRef.current = true
      micMutedRef.current = false
      setMicMuted(false)
      setJoined(true)
      updateParticipant(localSessionId, previous => ({
        sessionId: localSessionId,
        address: 'local',
        displayName: profileRef.current.displayName || localSessionId,
        avatar: profileRef.current.avatar,
        profileUpdatedAt: profileRef.current.profileUpdatedAt,
        micMuted: false,
        local: true,
        joinedAt: previous?.joinedAt || Date.now(),
        lastSeen: Date.now(),
        connectionState: 'connected',
        stream,
      }))
      sendVoiceEvent('join', { micMuted: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      leave()
    } finally {
      setJoining(false)
    }
  }, [
    channelName,
    enabled,
    isReady,
    joining,
    leave,
    localSessionId,
    sendVoiceEvent,
    updateParticipant,
  ])

  const toggleMute = useCallback(() => {
    if (!joinedRef.current || !localStreamRef.current) return
    const nextMuted = !micMutedRef.current
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted
    })
    micMutedRef.current = nextMuted
    setMicMuted(nextMuted)
    updateParticipant(localSessionId, previous =>
      previous
        ? {
            ...previous,
            micMuted: nextMuted,
            lastSeen: Date.now(),
          }
        : null
    )
    sendVoiceEvent('state', { micMuted: nextMuted })
  }, [localSessionId, sendVoiceEvent, updateParticipant])

  useEffect(() => {
    if (!enabled || !isReady || !channelName) return
    let closed = false

    async function connect() {
      const ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (closed) {
        ws.close()
        return
      }
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            event: 'channel:subscribe',
            data: { channel: channelName },
          })
        )
        if (joinedRef.current) sendVoiceEvent('join')
      }
      ws.onmessage = event => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.event === 'channel:voice') {
            handleVoiceEvent(payload.data as ChannelVoiceEvent)
          }
        } catch {}
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
      }
      wsRef.current = ws
    }

    void connect()
    return () => {
      closed = true
      leave()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [channelName, enabled, handleVoiceEvent, isReady, leave, sendVoiceEvent])

  useEffect(() => {
    if (!joined) return
    participants.forEach(participant => {
      if (!participant.local && localSessionId < participant.sessionId) {
        ensurePeer(participant, true)
      }
    })
  }, [ensurePeer, joined, localSessionId, participants])

  useEffect(() => {
    if (!joined) return
    const timer = window.setInterval(() => {
      sendVoiceEvent('heartbeat')
      updateParticipant(localSessionId, previous =>
        previous
          ? {
              ...previous,
              lastSeen: Date.now(),
            }
          : null
      )
    }, VOICE_HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [joined, localSessionId, sendVoiceEvent, updateParticipant])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setParticipantsBySession(prev => {
        let changed = false
        const next: Record<string, VoiceParticipant> = {}
        for (const participant of Object.values(prev)) {
          if (
            !participant.local &&
            now - participant.lastSeen > VOICE_STALE_MS
          ) {
            closePeer(participant.sessionId)
            changed = true
            continue
          }
          next[participant.sessionId] = participant
        }
        return changed ? next : prev
      })
    }, VOICE_HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [closePeer])

  return {
    error,
    joined,
    joining,
    localSessionId,
    micMuted,
    participants,
    join,
    leave,
    toggleMute,
  }
}
