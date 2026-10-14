import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import type { ChatMessage } from '../../chat/chatProtocol'
import { useI18n } from '../../i18n'
import type { JoinedChannel } from './conversationModel'
import {
  ChatNotificationCursor,
  getNotificationChannel,
} from './chatNotificationModel'
import {
  dismissChatNotifications,
  showChatNotification,
  watchChatNotificationOpens,
} from './chatNotifications'

export function useChatNotifications(input: {
  scope: string
  channels: JoinedChannel[]
  messages: Record<string, ChatMessage[]>
  ownAddress: string
  hidden: string[]
  enabled: boolean
  ready: boolean
  onOpen: (channel: string) => void
}) {
  const { t } = useI18n()
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const cursorRef = useRef<{
    scope: string
    cursor: ChatNotificationCursor
  } | null>(null)
  if (cursorRef.current?.scope !== input.scope)
    cursorRef.current = {
      scope: input.scope,
      cursor: new ChatNotificationCursor(),
    }
  const inputRef = useRef(input)
  inputRef.current = input
  const names = input.channels
    .map(channel => channel.name)
    .sort()
    .join('\n')
  useEffect(() => {
    if (!input.ready) return
    const pending =
      cursorRef.current?.cursor.observe({
        channels: input.channels.map(channel => channel.name),
        messages: input.messages,
        ownAddress: input.ownAddress,
        hidden: input.hidden,
        enabled: input.enabled,
        foreground: AppState.currentState === 'active',
      }) || []
    for (const channel of pending) {
      const remark = input.channels.find(item => item.name === channel)?.remark
      void showChatNotification({
        scope: input.scope,
        channel,
        title: `MostBox · ${remark || '#' + channel}`,
        body: t('chat.notifications.body'),
        shouldPresent: () => {
          const current = inputRef.current
          return (
            mountedRef.current &&
            current.enabled &&
            current.scope === input.scope &&
            AppState.currentState !== 'active' &&
            current.channels.some(item => item.name === channel) &&
            !current.hidden.includes(channel)
          )
        },
      }).catch(() => {})
    }
  }, [
    input.scope,
    input.channels,
    input.messages,
    input.ownAddress,
    input.hidden,
    input.enabled,
    input.ready,
    t,
  ])
  useEffect(() => {
    if (!input.ready || !names) return
    return watchChatNotificationOpens(data => {
      const current = inputRef.current
      const channel = getNotificationChannel(
        data,
        current.scope,
        current.channels.map(item => item.name)
      )
      if (channel) current.onOpen(channel)
    })
  }, [input.scope, input.ready, names])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void dismissChatNotifications().catch(() => {})
    })
    return () => {
      subscription.remove()
      void dismissChatNotifications().catch(() => {})
    }
  }, [input.scope])
}
