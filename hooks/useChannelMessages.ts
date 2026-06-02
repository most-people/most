'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  channelApi,
  type ChannelAttachment,
  type ChannelMessage,
} from '~/lib/channelApi'
import { getAuthenticatedWebSocketUrl } from '~/server/src/utils/api'

interface UseChannelMessagesOptions {
  isReady: boolean
  enabled?: boolean
  channelName?: string
  peerId?: string
  waitForPeerId?: boolean
  limit?: number
  reconnectBaseDelay?: number
  acceptMessage?: (message: ChannelMessage) => boolean
  getMessageKey?: (message: ChannelMessage) => string
  onSyncError?: (err: unknown) => void | Promise<void>
  onSocketEvent?: (event: string, data: any) => void
}

export interface SendChannelMessageOptions {
  channelName?: string
  content: string
  author: string
  authorName: string
  attachment?: ChannelAttachment
  optimisticId?: string
}

function defaultMessageKey(message: ChannelMessage) {
  return String(
    message.id ||
      `${message.author || ''}-${message.timestamp || ''}-${message.content || ''}`
  )
}

export function useChannelMessages({
  isReady,
  enabled = true,
  channelName = '',
  peerId = '',
  waitForPeerId = false,
  limit = 100,
  reconnectBaseDelay = 2500,
  acceptMessage,
  getMessageKey = defaultMessageKey,
  onSyncError,
  onSocketEvent,
}: UseChannelMessagesOptions) {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const channelNameRef = useRef(channelName)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const acceptMessageRef = useRef(acceptMessage)
  const getMessageKeyRef = useRef(getMessageKey)
  const onSocketEventRef = useRef(onSocketEvent)
  const onSyncErrorRef = useRef(onSyncError)
  const peerIdRef = useRef(peerId)

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
      return next
    },
    [filterMessages]
  )

  const wsSend = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }))
    }
  }, [])

  const subscribe = useCallback(
    (name: string) => {
      if (!name) return
      wsSend('channel:subscribe', { channel: name })
    },
    [wsSend]
  )

  const unsubscribe = useCallback(
    (name: string) => {
      if (!name) return
      wsSend('channel:unsubscribe', { channel: name })
    },
    [wsSend]
  )

  const syncMessages = useCallback(
    async (name = channelNameRef.current, options: { replace?: boolean } = {}) => {
      if (!name || !isReady) return []
      try {
        const result = filterMessages(
          await channelApi.getChannelMessages(name, limit)
        )
        setMessages(prev =>
          options.replace ? result : mergeMessages(prev, result, false)
        )
        return result
      } catch (err) {
        if (options.replace) setMessages([])
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
    if (waitForPeerId && channelNameRef.current) {
      subscribe(channelNameRef.current)
      void syncMessages(channelNameRef.current, { replace: true })
    }
  }, [peerId, subscribe, syncMessages, waitForPeerId, wsSend])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  const sendMessage = useCallback(
    async ({
      channelName: targetChannel = channelNameRef.current,
      content,
      author,
      authorName,
      attachment,
      optimisticId,
    }: SendChannelMessageOptions) => {
      const trimmed = content.trim()
      if (!targetChannel || !trimmed) return null
      const optimistic: ChannelMessage = {
        id:
          optimisticId ||
          `${author}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        author,
        authorName,
        content: trimmed,
        timestamp: Date.now(),
        pending: true,
        attachment,
      }
      setMessages(prev => [...prev, optimistic])
      try {
        const result = await channelApi.sendChannelMessage({
          channelName: targetChannel,
          content: trimmed,
          author,
          authorName,
          attachment,
        })
        setMessages(prev =>
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
        return result.message
      } catch (err) {
        setMessages(prev => prev.filter(item => item.id !== optimistic.id))
        throw err
      }
    },
    []
  )

  useEffect(() => {
    const previous = channelNameRef.current
    channelNameRef.current = channelName
    if (previous && previous !== channelName) {
      unsubscribe(previous)
    }
    if (!channelName || !isReady || !enabled) return
    void syncMessages(channelName, { replace: true })
    if (!waitForPeerId || peerIdRef.current) {
      subscribe(channelName)
    }
    return () => unsubscribe(channelName)
  }, [
    channelName,
    enabled,
    isReady,
    subscribe,
    syncMessages,
    unsubscribe,
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
          channelNameRef.current &&
          (!waitForPeerId || peerIdRef.current)
        ) {
          subscribe(channelNameRef.current)
          void syncMessages(channelNameRef.current, { replace: true })
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
        } catch {}
      }
      ws.onclose = () => {
        setConnected(false)
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
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [
    enabled,
    isReady,
    mergeMessages,
    reconnectBaseDelay,
    subscribe,
    syncMessages,
    waitForPeerId,
  ])

  return {
    clearMessages,
    connected,
    messages,
    sendMessage,
    setMessages,
    syncMessages,
  }
}
