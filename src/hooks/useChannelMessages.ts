import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  channelApi,
  type ChannelAttachment,
  type ChannelMessage,
} from '~/lib/channelApi'
import { getAuthenticatedWebSocketUrl } from '~server/src/utils/api'
import {
  getChannelSubscriptionChanges,
  getChannelSubscriptionKey,
  getChannelSubscriptionNames,
} from '~/lib/channelSubscriptions.js'
import { getUserMessageIdentity } from '~/lib/userProfile'
import { useUserStore } from '~/stores/userStore'

const CHANNEL_PRESENCE_HEARTBEAT_MS = 15 * 1000

interface ChannelPresenceProfile {
  displayName?: string
  avatar?: string
  profileUpdatedAt?: number
}

interface UseChannelMessagesOptions {
  isReady: boolean
  enabled?: boolean
  channelName?: string
  extraSubscribedChannelNames?: string[]
  peerId?: string
  waitForPeerId?: boolean
  limit?: number
  reconnectBaseDelay?: number
  acceptMessage?: (message: ChannelMessage) => boolean
  getMessageKey?: (message: ChannelMessage) => string
  onSyncError?: (err: unknown) => void | Promise<void>
  onSocketEvent?: (event: string, data: any) => void
  onReconnect?: () => void | Promise<void>
  presenceEnabled?: boolean
  presenceProfile?: ChannelPresenceProfile
}

export interface SendChannelMessageOptions {
  channelName?: string
  content: string
  attachment?: ChannelAttachment
  optimisticId?: string
}

function defaultMessageKey(message: ChannelMessage) {
  return String(
    message.id ||
      `${message.author || ''}-${message.timestamp || ''}-${message.content || ''}`
  )
}

function getMessageTimestamp(message: ChannelMessage) {
  const timestamp = Number(message.timestamp)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function sortMessagesForDisplay(items: ChannelMessage[]) {
  return items
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const timeDiff =
        getMessageTimestamp(left.message) -
        getMessageTimestamp(right.message)
      if (timeDiff !== 0) return timeDiff

      return left.index - right.index
    })
    .map(item => item.message)
}

function createPresenceSessionId() {
  return `presence-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useChannelMessages({
  isReady,
  enabled = true,
  channelName = '',
  extraSubscribedChannelNames = [],
  peerId = '',
  waitForPeerId = false,
  limit = 100,
  reconnectBaseDelay = 2500,
  acceptMessage,
  getMessageKey = defaultMessageKey,
  onSyncError,
  onSocketEvent,
  onReconnect,
  presenceEnabled = false,
  presenceProfile = {},
}: UseChannelMessagesOptions) {
  const userIdentity = useUserStore(s => s.identity)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [syncedChannelName, setSyncedChannelName] = useState('')
  const extraSubscribedChannelNamesKey = useMemo(
    () => getChannelSubscriptionKey(extraSubscribedChannelNames),
    [extraSubscribedChannelNames]
  )

  const wsRef = useRef<WebSocket | null>(null)
  const channelNameRef = useRef(channelName)
  const extraSubscribedChannelNamesRef = useRef(extraSubscribedChannelNames)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const acceptMessageRef = useRef(acceptMessage)
  const getMessageKeyRef = useRef(getMessageKey)
  const onSocketEventRef = useRef(onSocketEvent)
  const onSyncErrorRef = useRef(onSyncError)
  const onReconnectRef = useRef(onReconnect)
  const peerIdRef = useRef(peerId)
  const subscribedChannelsRef = useRef(new Set<string>())
  const presenceEnabledRef = useRef(presenceEnabled)
  const presenceProfileRef = useRef(presenceProfile)
  const presenceSessionIdRef = useRef(createPresenceSessionId())
  const joinedPresenceChannelRef = useRef('')

  useEffect(() => {
    extraSubscribedChannelNamesRef.current = extraSubscribedChannelNamesKey
      ? extraSubscribedChannelNamesKey.split('\n')
      : []
  }, [extraSubscribedChannelNamesKey])

  useEffect(() => {
    acceptMessageRef.current = acceptMessage
  }, [acceptMessage])

  useEffect(() => {
    getMessageKeyRef.current = getMessageKey
  }, [getMessageKey])

  useEffect(() => {
    onSocketEventRef.current = onSocketEvent
  }, [onSocketEvent])

  useEffect(() => {
    onSyncErrorRef.current = onSyncError
  }, [onSyncError])

  useEffect(() => {
    onReconnectRef.current = onReconnect
  }, [onReconnect])

  useEffect(() => {
    presenceEnabledRef.current = presenceEnabled
  }, [presenceEnabled])

  useEffect(() => {
    presenceProfileRef.current = presenceProfile
  }, [presenceProfile])

  const filterMessages = useCallback((items: ChannelMessage[]) => {
    const accept = acceptMessageRef.current
    return accept ? items.filter(accept) : items
  }, [])

  const mergeMessages = useCallback(
    (
      previous: ChannelMessage[],
      incoming: ChannelMessage[],
      replacePending = true
    ) => {
      const next = [...previous]
      for (const message of filterMessages(incoming)) {
        const key = getMessageKeyRef.current(message)
        if (replacePending) {
          const pendingIndex = next.findIndex(
            item =>
              item.pending &&
              item.author?.toLowerCase() === message.author?.toLowerCase() &&
              item.content === message.content
          )
          if (pendingIndex !== -1) {
            next[pendingIndex] = { ...message, id: message.id || key }
            continue
          }
        }
        if (next.some(item => getMessageKeyRef.current(item) === key)) continue
        next.push({ ...message, id: message.id || key })
      }
      return sortMessagesForDisplay(next)
    },
    [filterMessages]
  )

  const wsSend = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }))
    }
  }, [])

  const getPresencePayload = useCallback((channel: string) => {
    return {
      channel,
      sessionId: presenceSessionIdRef.current,
      ...presenceProfileRef.current,
    }
  }, [])

  const leavePresenceChannel = useCallback(
    (channel = joinedPresenceChannelRef.current) => {
      if (!channel) return
      wsSend('channel:presence:leave', {
        channel,
        sessionId: presenceSessionIdRef.current,
      })
      if (joinedPresenceChannelRef.current === channel) {
        joinedPresenceChannelRef.current = ''
      }
    },
    [wsSend]
  )

  const joinPresenceChannel = useCallback(
    (channel: string) => {
      if (!channel || !presenceEnabledRef.current || !userIdentity) return
      wsSend('channel:presence:join', getPresencePayload(channel))
      joinedPresenceChannelRef.current = channel
    },
    [getPresencePayload, userIdentity, wsSend]
  )

  const replaceSubscriptions = useCallback(
    (names: string[]) => {
      const nextNames = new Set(names.filter(Boolean))
      const changes = getChannelSubscriptionChanges(
        subscribedChannelsRef.current,
        nextNames
      )
      for (const name of changes.unsubscribe) {
        wsSend('channel:unsubscribe', { channel: name })
      }
      for (const name of changes.subscribe) {
        wsSend('channel:subscribe', { channel: name })
      }
      subscribedChannelsRef.current = nextNames
    },
    [wsSend]
  )

  const getSubscriptionNames = useCallback(() => {
    return getChannelSubscriptionNames(
      channelNameRef.current,
      extraSubscribedChannelNamesRef.current
    )
  }, [])

  const syncMessages = useCallback(
    async (name = channelNameRef.current, options: { replace?: boolean } = {}) => {
      if (!name || !isReady) return []
      try {
        const result = filterMessages(
          await channelApi.getChannelMessages(name, limit)
        )
        setMessages(prev =>
          options.replace
            ? sortMessagesForDisplay(result)
            : mergeMessages(prev, result, false)
        )
        if (options.replace && channelNameRef.current === name) {
          setSyncedChannelName(name)
        }
        return result
      } catch (err) {
        if (options.replace) {
          setMessages([])
          if (channelNameRef.current === name) {
            setSyncedChannelName(name)
          }
        }
        await onSyncErrorRef.current?.(err)
        return []
      }
    },
    [filterMessages, isReady, limit, mergeMessages]
  )

  useEffect(() => {
    peerIdRef.current = peerId
    if (!peerId) return
    wsSend('register', { peerId })
    if (waitForPeerId) {
      replaceSubscriptions(getSubscriptionNames())
      if (channelNameRef.current) {
        void syncMessages(channelNameRef.current, { replace: true })
      }
    }
  }, [
    getSubscriptionNames,
    peerId,
    replaceSubscriptions,
    syncMessages,
    waitForPeerId,
    wsSend,
  ])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSyncedChannelName('')
  }, [])

  const sendMessage = useCallback(
    async ({
      channelName: targetChannel = channelNameRef.current,
      content,
      attachment,
      optimisticId,
    }: SendChannelMessageOptions) => {
      const trimmed = content.trim()
      if (!targetChannel || !trimmed || !userIdentity) return null
      const messageIdentity = getUserMessageIdentity(userIdentity)
      const optimistic: ChannelMessage = {
        id:
          optimisticId ||
          `${messageIdentity.author}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...messageIdentity,
        content: trimmed,
        timestamp: Date.now(),
        pending: true,
        attachment,
      }
      setMessages(prev => sortMessagesForDisplay([...prev, optimistic]))
      try {
        const result = await channelApi.sendChannelMessage({
          channelName: targetChannel,
          content: trimmed,
          ...messageIdentity,
          attachment,
        })
        setMessages(prev =>
          sortMessagesForDisplay(
            prev.map(item =>
              item.id === optimistic.id
                ? {
                    ...result.message,
                    id:
                      result.message.id ||
                      getMessageKeyRef.current(result.message),
                  }
                : item
            )
          )
        )
        return result.message
      } catch (err) {
        setMessages(prev => prev.filter(item => item.id !== optimistic.id))
        throw err
      }
    },
    [userIdentity]
  )

  useEffect(() => {
    channelNameRef.current = channelName
    if (!isReady || !enabled) return
    if (channelName) {
      void syncMessages(channelName, { replace: true })
    }
    if (!waitForPeerId || peerIdRef.current) {
      replaceSubscriptions(getSubscriptionNames())
    }
  }, [
    channelName,
    enabled,
    extraSubscribedChannelNamesKey,
    getSubscriptionNames,
    isReady,
    replaceSubscriptions,
    syncMessages,
    waitForPeerId,
  ])

  useEffect(() => {
    if (!connected || !presenceEnabled || !userIdentity || !channelName) {
      leavePresenceChannel()
      return
    }

    const currentPresenceChannel = joinedPresenceChannelRef.current
    if (currentPresenceChannel && currentPresenceChannel !== channelName) {
      leavePresenceChannel(currentPresenceChannel)
    }
    if (joinedPresenceChannelRef.current !== channelName) {
      joinPresenceChannel(channelName)
    }
  }, [
    channelName,
    connected,
    joinPresenceChannel,
    leavePresenceChannel,
    presenceEnabled,
    userIdentity,
  ])

  const presenceProfileKey = useMemo(
    () =>
      [
        presenceProfile.displayName || '',
        presenceProfile.avatar || '',
        presenceProfile.profileUpdatedAt || '',
      ].join('\n'),
    [
      presenceProfile.avatar,
      presenceProfile.displayName,
      presenceProfile.profileUpdatedAt,
    ]
  )

  useEffect(() => {
    const channel = joinedPresenceChannelRef.current
    if (!connected || !presenceEnabled || !channel || !userIdentity) return
    wsSend('channel:presence:profile', getPresencePayload(channel))
  }, [
    connected,
    getPresencePayload,
    presenceEnabled,
    presenceProfileKey,
    userIdentity,
    wsSend,
  ])

  useEffect(() => {
    if (!connected || !presenceEnabled || !userIdentity) return
    const timer = window.setInterval(() => {
      const channel = joinedPresenceChannelRef.current
      if (!channel) return
      wsSend('channel:presence:heartbeat', {
        channel,
        sessionId: presenceSessionIdRef.current,
      })
    }, CHANNEL_PRESENCE_HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [connected, presenceEnabled, userIdentity, wsSend])

  useEffect(() => {
    if (!isReady || !enabled || (waitForPeerId && !peerIdRef.current)) return
    replaceSubscriptions(getSubscriptionNames())
  }, [
    enabled,
    getSubscriptionNames,
    isReady,
    replaceSubscriptions,
    waitForPeerId,
  ])

  useEffect(() => {
    if (!isReady || !enabled) {
      setConnected(false)
      return
    }
    let closed = false
    reconnectAttemptRef.current = 0

    async function connectWs() {
      const ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (closed) {
        ws.close()
        return
      }
      ws.onopen = () => {
        setConnected(true)
        reconnectAttemptRef.current = 0
        if (peerIdRef.current) {
          ws.send(
            JSON.stringify({
              event: 'register',
              data: { peerId: peerIdRef.current },
            })
          )
        }
        if (
          (!waitForPeerId || peerIdRef.current)
        ) {
          subscribedChannelsRef.current.clear()
          replaceSubscriptions(getSubscriptionNames())
          if (channelNameRef.current) {
            void syncMessages(channelNameRef.current, { replace: true })
          }
          void onReconnectRef.current?.()
        }
      }
      ws.onmessage = event => {
        try {
          const payload = JSON.parse(event.data)
          onSocketEventRef.current?.(payload.event, payload.data)
          if (
            payload.event === 'channel:message' &&
            payload.data?.channel === channelNameRef.current &&
            payload.data?.message
          ) {
            setMessages(prev => mergeMessages(prev, [payload.data.message]))
          }
          if (
            payload.event === 'user:metadata:updated' &&
            payload.data?.scope === 'channels' &&
            channelNameRef.current
          ) {
            void syncMessages(channelNameRef.current, { replace: true })
          }
        } catch {}
      }
      ws.onclose = () => {
        setConnected(false)
        joinedPresenceChannelRef.current = ''
        if (closed) return
        const attempt = reconnectAttemptRef.current
        if (attempt >= 20) return
        const delay = Math.min(
          reconnectBaseDelay * Math.pow(2, attempt),
          30000
        )
        reconnectAttemptRef.current = attempt + 1
        reconnectTimerRef.current = setTimeout(connectWs, delay)
      }
      ws.onerror = () => ws.close()
      wsRef.current = ws
    }

    void connectWs()

    return () => {
      closed = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      leavePresenceChannel()
      wsRef.current?.close()
      wsRef.current = null
      subscribedChannelsRef.current.clear()
    }
  }, [
    enabled,
    getSubscriptionNames,
    isReady,
    leavePresenceChannel,
    mergeMessages,
    reconnectBaseDelay,
    replaceSubscriptions,
    syncMessages,
    waitForPeerId,
  ])

  return {
    clearMessages,
    connected,
    messages,
    sendMessage,
    setMessages,
    syncedChannelName,
    syncMessages,
  }
}
