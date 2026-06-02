'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { channelApi, type ChannelAttachment, type ChannelMessage } from '~/lib/channelApi'
import { api, getAuthenticatedWebSocketUrl } from '~/server/src/utils/api'

interface UseChannelMessagesOptions {
  channelName?: string
  enabled: boolean
  author?: string
  authorName?: string
  limit?: number
  onChannelListChanged?: () => void
  onEvent?: (event: string, data: any) => void
}

function messageKey(message: ChannelMessage) {
  return String(
    message.id ||
      `${message.author || ''}-${message.timestamp || ''}-${message.content || ''}`
  )
}

function mergeMessages(previous: ChannelMessage[], incoming: ChannelMessage[]) {
  const seen = new Set(previous.map(messageKey))
  const next = [...previous]
  for (const message of incoming) {
    const key = messageKey(message)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(message)
  }
  return next.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
}

export function useChannelMessages({
  channelName,
  enabled,
  author,
  authorName,
  limit = 100,
  onChannelListChanged,
  onEvent,
}: UseChannelMessagesOptions) {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [peers, setPeers] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const [myPeerId, setMyPeerId] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const channelNameRef = useRef(channelName || '')
  const onEventRef = useRef(onEvent)
  const onChannelListChangedRef = useRef(onChannelListChanged)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    channelNameRef.current = channelName || ''
  }, [channelName])

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    onChannelListChangedRef.current = onChannelListChanged
  }, [onChannelListChanged])

  const wsSend = useCallback((event: string, data: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }))
    }
  }, [])

  const refreshPeers = useCallback(async () => {
    if (!enabled || !channelNameRef.current) return
    try {
      const nextPeers = await channelApi.getChannelPeers(channelNameRef.current)
      setPeers(nextPeers)
    } catch {
      setPeers([])
    }
  }, [enabled])

  const refreshMessages = useCallback(async () => {
    if (!enabled || !channelNameRef.current) return
    const nextMessages = await channelApi.getChannelMessages(
      channelNameRef.current,
      limit
    )
    setMessages(nextMessages)
    await refreshPeers()
  }, [enabled, limit, refreshPeers])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setMyPeerId('')
      return
    }

    api
      .get('/api/node-id')
      .json<{ id: string }>()
      .then(data => {
        if (mountedRef.current) setMyPeerId(data.id)
      })
      .catch(() => {
        if (mountedRef.current) setMyPeerId('')
      })
  }, [enabled])

  useEffect(() => {
    if (!enabled || !myPeerId) return
    wsSend('register', { peerId: myPeerId })
  }, [enabled, myPeerId, wsSend])

  useEffect(() => {
    if (!enabled || !channelName) {
      setMessages([])
      setPeers([])
      return
    }
    void refreshMessages()
    wsSend('channel:subscribe', { channel: channelName })
    return () => {
      wsSend('channel:unsubscribe', { channel: channelName })
    }
  }, [channelName, enabled, refreshMessages, wsSend])

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close()
      setConnected(false)
      return
    }

    let closed = false

    async function connectWs() {
      const ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectAttemptRef.current = 0
        if (myPeerId) {
          ws.send(JSON.stringify({ event: 'register', data: { peerId: myPeerId } }))
        }
        if (channelNameRef.current) {
          ws.send(
            JSON.stringify({
              event: 'channel:subscribe',
              data: { channel: channelNameRef.current },
            })
          )
          void refreshMessages()
        }
      }

      ws.onmessage = event => {
        try {
          const { event: wsEvent, data } = JSON.parse(event.data)
          if (wsEvent === 'channel:message' && data.channel === channelNameRef.current) {
            setMessages(previous => {
              const incoming = data.message as ChannelMessage
              const pendingIndex = previous.findIndex(
                message =>
                  message.pending &&
                  message.author === incoming.author &&
                  message.content === incoming.content
              )
              if (pendingIndex !== -1) {
                const updated = [...previous]
                updated[pendingIndex] = incoming
                return updated
              }
              return mergeMessages(previous, [incoming])
            })
            void refreshPeers()
          }

          if (
            wsEvent === 'channel:peer:online' ||
            wsEvent === 'channel:peer:offline'
          ) {
            void refreshPeers()
          }

          if (wsEvent === 'channel:joined' || wsEvent === 'channel:left') {
            onChannelListChangedRef.current?.()
          }

          onEventRef.current?.(wsEvent, data)
        } catch (error) {
          console.warn('[Channel WS] Failed to parse message:', error)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (closed || !mountedRef.current) return
        const attempt = reconnectAttemptRef.current
        if (attempt >= 20) return
        const delay = Math.min(3000 * Math.pow(2, attempt), 30000)
        reconnectAttemptRef.current = attempt + 1
        reconnectTimeoutRef.current = setTimeout(connectWs, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    void connectWs()

    return () => {
      closed = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [enabled, myPeerId, refreshMessages, refreshPeers])

  const sendMessage = useCallback(
    async (content: string, attachment?: ChannelAttachment) => {
      if (!enabled || !channelName || !author || !authorName) {
        throw new Error('频道未连接或未登录')
      }
      const optimisticId = `${author}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const optimisticMessage: ChannelMessage = {
        id: optimisticId,
        author,
        authorName,
        content,
        timestamp: Date.now(),
        pending: true,
        attachment,
      }
      setMessages(previous => mergeMessages(previous, [optimisticMessage]))

      try {
        const result = await channelApi.sendChannelMessage(
          channelName,
          content,
          author,
          authorName,
          attachment
        )
        setMessages(previous =>
          previous.map(message =>
            message.id === optimisticId ? result.message : message
          )
        )
        return result.message
      } catch (error) {
        setMessages(previous => previous.filter(message => message.id !== optimisticId))
        throw error
      }
    },
    [author, authorName, channelName, enabled]
  )

  return {
    messages,
    setMessages,
    peers,
    connected,
    myPeerId,
    refreshMessages,
    refreshPeers,
    sendMessage,
  }
}
