import {
  ActivityIndicator,
  AppState,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  FileText,
  Volume2,
  Keyboard as KeyboardIcon,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  UserRound,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Plus,
  Search,
  Smile,
  X,
} from 'lucide-react-native'
import {
  ChatApiClient,
  createClientMessageId,
  getChatErrorMessage,
  getChatMessageKey,
  isOwnChatMessage,
  mergeChatMessages,
  normalizeChatChannel,
  type ChatAttachment,
  type ChatMessage,
} from '../../chat/chatProtocol'
import { ChatWebSocketSession } from '../../chat/chatWebSocket'
import {
  createVoiceRoomState,
  VoiceWebSocketSession,
  reduceVoiceEvent,
  type VoiceRoomState,
} from '../../chat/voiceProtocol'
import type {
  MobileCoreSnapshot,
  MobileIdentity,
  MobileChannelMessage,
  SendChannelMessageInput,
  MostBoxMobileCore,
  MobileHolding,
} from '../../mobileCore/types'
import {
  formatAttachmentSize,
  getAttachmentState,
  getMessageAttachment,
} from './attachmentModel'
import { useI18n } from '../../i18n'
import {
  BottomSheetCard,
  IconButton,
  MostButton,
  MostTextInput,
  getGlassSurfaceStyle,
} from '../../ui/components'
import { useFeedback } from '../../ui/feedback'
import { useMostBoxTheme } from '../../ui/theme'

import {
  getJoinedChannels,
  shouldShowMessageTime,
  getConversationDraft,
  getConversationSummaries,
  getRemainingHiddenConversations,
  markConversationRead,
  setConversationDraft,
  type JoinedChannel,
} from './conversationModel'
import {
  loadHiddenConversations,
  saveHiddenConversations,
} from './conversationStorage'
import { useConversationState } from './useConversationState'
import { PRODUCT_PROFILE } from '../../product/productProfile'
import { ChatImagePreview } from './ChatImagePreview'
import { VoiceMessageRecorder } from './VoiceMessageRecorder'
import { VoiceAudioPlayer } from './VoiceAudioPlayer'
import type { VoiceRecording } from './voiceRecordingSession'
import { useChatNotifications } from './useChatNotifications'
import { ChannelShareSheet } from './ChannelShareSheet'
import { ChatAvatar } from './ChatAvatar'

function updateChatRoute(channel = '') {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  const path = channel ? `/chat#${encodeURIComponent(channel)}` : '/chat'
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event('most-route-change'))
}

function getInitialChatRoute() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return ''
  if (window.location.pathname !== '/chat') return ''
  return normalizeChatChannel(decodeURIComponent(window.location.hash.slice(1)))
}

type ChatBridge = MostBoxMobileCore & {
  getIdentity?: () => MobileIdentity | null
  getNodeHistory?: () => Array<{
    url: string
    invite: string
    current?: boolean
  }>
  listChannels?: () => Promise<
    Array<{ channelKey?: string; channelId?: string; name?: string }>
  >
  createChannel?: (input: { name: string; type?: string }) => Promise<unknown>
  sendChannelMessage?: (
    input: SendChannelMessageInput
  ) => Promise<MobileChannelMessage>
}

export type ChatScreenProps = {
  client: MostBoxMobileCore
  snapshot: MobileCoreSnapshot
  openChannelRequest?: { channel: string; token: number } | null
  onDetailChange?: (open: boolean) => void
  active?: boolean
  joinRequest?: number
  onUnreadChange?: (count: number) => void
  notificationsEnabled: boolean
  onOpenNotification: (channel: string) => void
  channels: JoinedChannel[]
  onChannelsChange: Dispatch<SetStateAction<JoinedChannel[]>>
  onPublishAttachment: (
    source?: 'file' | 'photos' | 'camera'
  ) => Promise<ChatAttachment | null>
  onReceiveAttachment: (attachment: ChatAttachment) => void
  onPublishVoiceMessage: (recording: VoiceRecording) => Promise<ChatAttachment>
  onOpenAttachment: (holding: MobileHolding) => void | Promise<void>
  onSaveAttachment: (holding: MobileHolding) => void | Promise<void>
}

export function ChatScreen({
  client,
  snapshot,
  openChannelRequest,
  onDetailChange,
  active = true,
  joinRequest = 0,
  onUnreadChange,
  notificationsEnabled,
  onOpenNotification,
  onChannelsChange,
  channels,
  onPublishAttachment,
  onPublishVoiceMessage,
  onReceiveAttachment,
  onOpenAttachment,
  onSaveAttachment,
}: ChatScreenProps) {
  const { t, formatDateTime, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const theme = useMostBoxTheme()
  const [draftHeight, setDraftHeight] = useState(42)
  const [draftWidth, setDraftWidth] = useState(0)
  const draftInputRef = useRef<TextInput>(null)
  const styles = chatStyles(theme, draftHeight)
  const { alert, toast } = useFeedback()
  const bridge = client as ChatBridge
  const localMode = snapshot.node.mode !== 'remote'
  const endpoint = snapshot.node.endpoint || ''
  const identity = bridge.getIdentity?.() || null
  const invite =
    bridge.getNodeHistory?.().find(item => item.current)?.invite ||
    bridge.getNodeHistory?.()[0]?.invite ||
    ''
  const api = useMemo(
    () =>
      endpoint
        ? new ChatApiClient({ baseUrl: endpoint, invite, identity })
        : null,
    [endpoint, invite, identity]
  )
  const socketRef = useRef<ChatWebSocketSession | null>(null)
  const voiceSessionRef = useRef<VoiceWebSocketSession | null>(null)
  const lastOpenChannelTokenRef = useRef<number | null>(null)
  const lastJoinRequestRef = useRef(0)
  const loadRequestRef = useRef(0)
  const selectedChannelRef = useRef('')
  const messageListRef = useRef<FlatList<ChatMessage>>(null)
  const historyCursorRef = useRef<string | null>(null)
  const historyRequestRef = useRef(false)
  const textAttemptsRef = useRef(
    new Map<string, { content: string; clientMessageId: string }>()
  )
  const voiceAttemptRef = useRef<{
    scope: string
    channel: string
    uri: string
    clientMessageId: string
    attachment?: ChatAttachment
  } | null>(null)
  const [channelInput, setChannelInput] = useState('')
  const [joinSheetOpen, setJoinSheetOpen] = useState(false)
  const [shareRequest, setShareRequest] = useState<{
    scope: string
    name: string
  } | null>(null)
  const [channel, setChannel] = useState('')
  const [chatOpen, setChatOpen] = useState(() => Boolean(getInitialChatRoute()))
  const setChannels = onChannelsChange
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [search, setSearch] = useState('')
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  )
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [nearLatest, setNearLatest] = useState(true)
  const [chatConnected, setChatConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceRoomState | null>(null)
  const [voiceJoined, setVoiceJoined] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceConnecting, setVoiceConnecting] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [callSheetOpen, setCallSheetOpen] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [composerMode, setComposerMode] = useState<'keyboard' | 'voice'>(
    'keyboard'
  )
  const [playingMessageKey, setPlayingMessageKey] = useState('')
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false)
  const conversationScope = `${localMode ? snapshot.node.storagePath : endpoint}:${identity?.address || snapshot.node.userAddress || 'local'}`
  const sharingChannel =
    shareRequest?.scope === conversationScope
      ? channels.find(item => item.name === shareRequest.name)
      : undefined
  const scopeRef = useRef(conversationScope)
  scopeRef.current = conversationScope
  const conversation = useConversationState(conversationScope, () =>
    toast(t('chat.stateSaveFailed'), 'error')
  )
  const draft = getConversationDraft(conversation.state, channel)
  const setDraft = (value: string) =>
    conversation.update(state => setConversationDraft(state, channel, value))
  const [inbox, setInbox] = useState<{
    scope: string
    messages: Record<string, ChatMessage[]>
  } | null>(null)
  const channelNames = channels
    .map(item => item.name)
    .sort()
    .join('\n')
  const inboxMessages = inbox?.scope === conversationScope ? inbox.messages : {}
  const channelMessages = localMode
    ? { ...inboxMessages, ...snapshot.channelMessages }
    : inboxMessages
  const [hiddenState, setHiddenState] = useState<{
    scope: string
    channels: string[]
  } | null>(null)
  const hiddenChannels =
    hiddenState?.scope === conversationScope
      ? getRemainingHiddenConversations(
          hiddenState.channels,
          channelMessages,
          conversation.state,
          identity?.address || snapshot.node.userAddress || ''
        )
      : []
  const visibleChannels =
    hiddenState?.scope === conversationScope
      ? getConversationSummaries(
          channels,
          channelMessages,
          conversation.state,
          identity?.address || snapshot.node.userAddress || '',
          hiddenChannels,
          search
        )
      : []
  const visibleMessages = useMemo(
    () => messages.filter(message => message.type !== 'system').reverse(),
    [messages]
  )
  useChatNotifications({
    scope: conversationScope,
    channels,
    messages: channelMessages,
    ownAddress: identity?.address || snapshot.node.userAddress || '',
    hidden: hiddenChannels,
    enabled: notificationsEnabled,
    ready:
      conversation.ready &&
      hiddenState?.scope === conversationScope &&
      snapshot.node.status === 'ready',
    onOpen: onOpenNotification,
  })
  const totalUnread =
    hiddenState?.scope === conversationScope && conversation.ready
      ? getConversationSummaries(
          channels,
          channelMessages,
          conversation.state,
          identity?.address || snapshot.node.userAddress || '',
          hiddenChannels
        ).reduce((total, item) => total + item.unread, 0)
      : 0
  useEffect(() => {
    onUnreadChange?.(totalUnread)
  }, [totalUnread, onUnreadChange])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setForeground(state === 'active')
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    loadRequestRef.current += 1
    textAttemptsRef.current.clear()
    voiceAttemptRef.current = null
    selectedChannelRef.current = ''
    setChannel('')
    setMessages([])
    setChatOpen(Boolean(getInitialChatRoute()))
    setLoading(false)
    setSending(false)
    setInbox(null)
    setJoinSheetOpen(false)
  }, [conversationScope])

  const rememberMessages = useCallback(
    (name: string, items: ChatMessage[]) => {
      if (scopeRef.current !== conversationScope) return
      setInbox(current => ({
        scope: conversationScope,
        messages: {
          ...(current?.scope === conversationScope ? current.messages : {}),
          [name]: mergeChatMessages(
            current?.scope === conversationScope &&
              Object.hasOwn(current.messages, name)
              ? current.messages[name]
              : [],
            items
          ).slice(-100),
        },
      }))
    },
    [conversationScope]
  )

  useEffect(() => {
    if (snapshot.node.status !== 'ready' || (!localMode && !api)) return
    let running = true
    const names = channelNames ? channelNames.split('\n') : []
    const refresh = async (name: string) => {
      try {
        const items = localMode
          ? await bridge.getChannelMessages?.(name)
          : (await api?.getHistory(name, { limit: 100 }))?.messages
        if (!running || !items) return
        rememberMessages(name, items)
        if (selectedChannelRef.current === name)
          setMessages(current => mergeChatMessages(current, items))
      } catch {
        // Opening the channel provides visible retry feedback.
      }
    }
    if (localMode) {
      void (async () => {
        for (const name of names) {
          if (!running) break
          await refresh(name)
        }
      })()
      return () => {
        running = false
      }
    }
    const session = new ChatWebSocketSession({
      baseUrl: endpoint,
      invite,
      identity,
      onConnectionChange: connected => {
        if (running && scopeRef.current === conversationScope)
          setChatConnected(connected)
      },
      onEvent: event => {
        if (!running) return
        const name = normalizeChatChannel(event.channel)
        if (event.event === 'channel:subscribed') void refresh(name)
        else {
          rememberMessages(name, [event.message])
          if (selectedChannelRef.current === name)
            setMessages(current => mergeChatMessages(current, [event.message]))
        }
      },
    })
    socketRef.current = session
    for (const name of names) void session.subscribe(name).catch(() => {})
    return () => {
      running = false
      session.close()
      if (socketRef.current === session) socketRef.current = null
    }
  }, [
    api,
    bridge,
    channelNames,
    endpoint,
    identity,
    invite,
    localMode,
    rememberMessages,
    snapshot.node.status,
  ])

  const connectionNotice =
    snapshot.node.status !== 'ready' ||
    (!localMode && channelNames && !chatConnected) ? (
      <View style={styles.connectionNotice} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={theme.colors.accent} />
        <Text style={styles.connectionNoticeText}>
          {t('chat.restoringConnection')}
        </Text>
      </View>
    ) : null

  useEffect(() => {
    if (
      !conversation.ready ||
      hiddenState?.scope !== conversationScope ||
      hiddenChannels.length === hiddenState.channels.length
    )
      return
    const scope = conversationScope
    setHiddenState(current =>
      current === hiddenState ? { scope, channels: hiddenChannels } : current
    )
    void saveHiddenConversations(scope, hiddenChannels).catch(() => {
      if (scopeRef.current === scope) toast(t('chat.deleteFailed'), 'error')
    })
  }, [
    conversation.ready,
    conversationScope,
    hiddenState,
    hiddenChannels,
    t,
    toast,
  ])

  useEffect(() => {
    if (!conversation.ready) return
    conversation.update(state => {
      let next = state
      for (const item of channels) {
        if (!Object.hasOwn(channelMessages, item.name)) continue
        if (
          !Object.hasOwn(next.readAt, item.name) ||
          (active &&
            foreground &&
            chatOpen &&
            channel === item.name &&
            nearLatest &&
            !loading)
        )
          next = markConversationRead(
            next,
            item.name,
            channelMessages[item.name]
          )
      }
      return next
    })
  }, [
    active,
    foreground,
    chatOpen,
    channel,
    channelMessages,
    channels,
    conversation.ready,
    conversation.update,
    loading,
    nearLatest,
  ])

  useEffect(() => {
    let active = true
    void loadHiddenConversations(conversationScope).then(channels => {
      if (active) setHiddenState({ scope: conversationScope, channels })
    })
    return () => {
      active = false
    }
  }, [conversationScope])

  useEffect(() => {
    if (localMode && snapshot.node.status === 'ready')
      setChannels(getJoinedChannels(snapshot.channels || []))
  }, [localMode, snapshot.channels, snapshot.node.status, setChannels])

  const deleteConversation = async (name: string) => {
    const scope = conversationScope
    const history = Object.hasOwn(channelMessages, name)
      ? channelMessages[name]
      : []
    try {
      await saveHiddenConversations(scope, [
        ...new Set([...hiddenChannels, name]),
      ])
      if (scopeRef.current !== scope) return
      conversation.update(state => markConversationRead(state, name, history))
      conversation.flush()
      setHiddenState({
        scope,
        channels: [...new Set([...hiddenChannels, name])],
      })
    } catch {
      if (scopeRef.current === scope) toast(t('chat.deleteFailed'), 'error')
    }
  }

  const showConversationMenu = (name: string) => {
    alert(`#${name}`, t('chat.deleteConversationHint'), [
      {
        text: t('chat.channelInfo'),
        onPress: () => setShareRequest({ scope: conversationScope, name }),
      },
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void deleteConversation(name),
      },
    ])
  }

  useEffect(() => {
    onDetailChange?.(chatOpen)
  }, [chatOpen, onDetailChange])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onRouteChange = () => {
      const nextChannel = getInitialChatRoute()
      setChatOpen(Boolean(nextChannel))
      onDetailChange?.(Boolean(nextChannel))
      if (channel !== nextChannel) {
        loadRequestRef.current += 1
        selectedChannelRef.current = ''
        setMessages([])
        setChannel('')
      }
    }
    window.addEventListener('popstate', onRouteChange)
    window.addEventListener('most-route-change', onRouteChange)
    return () => {
      window.removeEventListener('popstate', onRouteChange)
      window.removeEventListener('most-route-change', onRouteChange)
    }
  }, [channel, onDetailChange])

  useEffect(
    () => () => {
      socketRef.current?.close()
      voiceSessionRef.current?.close()
    },
    []
  )

  useEffect(() => {
    voiceSessionRef.current?.close()
    voiceSessionRef.current = null
    setVoiceJoined(false)
    setVoiceMuted(false)
    setVoiceConnecting(false)
    setVoiceError('')
    if (!channel || localMode || !endpoint) {
      setVoiceState(null)
      return
    }
    const session = new VoiceWebSocketSession({
      baseUrl: endpoint,
      invite,
      identity,
      channel,
      profile: identity?.username ? { displayName: identity.username } : {},
      onEvent: event => {
        setVoiceState(current =>
          reduceVoiceEvent(
            current || createVoiceRoomState(channel),
            event,
            session.sessionId
          )
        )
      },
    })
    voiceSessionRef.current = session
    setVoiceState(
      createVoiceRoomState(channel, session.sessionId, identity?.address, {
        displayName: identity?.username,
      })
    )
    return () => {
      session.close()
      if (voiceSessionRef.current === session) voiceSessionRef.current = null
    }
  }, [channel, endpoint, identity, invite, localMode])

  useEffect(() => {
    if (!voiceJoined) return
    const timer = setInterval(
      () => voiceSessionRef.current?.heartbeat(),
      10_000
    )
    return () => clearInterval(timer)
  }, [voiceJoined])

  useEffect(() => {
    if (snapshot.node.status !== 'ready') return
    if (!api && !localMode) return
    let active = true
    const request = localMode
      ? bridge.listChannels?.() || Promise.resolve([])
      : api?.listChannels() || Promise.resolve([])
    void request
      .then(items => {
        if (!active) return
        const names = getJoinedChannels(items)
        setChannels(names)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, bridge, localMode, setChannels, snapshot.node.status])

  useEffect(() => {
    if (!localMode || !channel) return
    const items = snapshot.channelMessages?.[channel]
    if (items) setMessages(current => mergeChatMessages(current, items))
  }, [channel, localMode, snapshot.channelMessages])

  const loadChannel = useCallback(
    async (name: string) => {
      const normalizedName = normalizeChatChannel(name)
      if ((!api && !localMode) || !normalizedName || !conversation.ready)
        return false
      const request = ++loadRequestRef.current
      const isCurrent = () =>
        request === loadRequestRef.current &&
        scopeRef.current === conversationScope
      selectedChannelRef.current = normalizedName
      historyCursorRef.current = null
      historyRequestRef.current = false
      setLoadingHistory(false)
      setHasOlderMessages(false)
      setNearLatest(true)
      setChannel(normalizedName)
      setMessages([])
      setChatOpen(true)
      setActionSheetOpen(false)
      setEmojiOpen(false)
      setComposerMode('keyboard')
      Keyboard.dismiss()
      setLoading(true)
      try {
        const localMessages = localMode
          ? await bridge.getChannelMessages?.(normalizedName, { limit: 100 })
          : null
        const page = localMode
          ? null
          : await api?.getHistory(normalizedName, { limit: 100 })
        if (!isCurrent()) return false
        const savedHidden = await loadHiddenConversations(conversationScope)
        const nextHidden = savedHidden.filter(name => name !== normalizedName)
        if (savedHidden.includes(normalizedName)) {
          await saveHiddenConversations(conversationScope, nextHidden)
        }
        if (!isCurrent()) return false
        setHiddenState({ scope: conversationScope, channels: nextHidden })
        setChannel(normalizedName)
        const items = localMode ? localMessages || [] : page?.messages || []
        historyCursorRef.current = page?.nextCursor || null
        setHasOlderMessages(
          localMode ? items.length === 100 : Boolean(page?.nextCursor)
        )
        setMessages(current => mergeChatMessages(items, current))
        rememberMessages(normalizedName, items)
        setChannels(current =>
          current.some(item => item.name === normalizedName)
            ? current
            : [...current, { name: normalizedName, remark: '', pinned: false }]
        )
        return true
      } catch (error) {
        if (!isCurrent()) return false
        toast(
          getChatErrorMessage(
            error,
            t('chat.loadFailed'),
            t('chat.requestTimedOut')
          ),
          'error'
        )
        return false
      } finally {
        if (isCurrent()) setLoading(false)
      }
    },
    [
      api,
      bridge,
      endpoint,
      identity,
      invite,
      localMode,
      t,
      toast,
      conversationScope,
      conversation.ready,
      rememberMessages,
      setChannels,
    ]
  )

  const joinChannel = async () => {
    const name = normalizeChatChannel(channelInput)
    if (!name || (!api && !localMode)) return
    setLoading(true)
    const scope = conversationScope
    try {
      if (localMode) await bridge.createChannel?.({ name, type: 'public' })
      else await api?.createOrJoinChannel({ name, displayName: name })
      if (scopeRef.current !== scope) return
      setChannelInput('')
      setJoinSheetOpen(false)
      if (await loadChannel(name)) updateChatRoute(name)
    } catch (error) {
      if (scopeRef.current !== scope) return
      toast(
        getChatErrorMessage(
          error,
          t('chat.joinFailed'),
          t('chat.requestTimedOut')
        ),
        'error'
      )
      setLoading(false)
    }
  }

  const openChannel = async (name: string) => {
    if (await loadChannel(name)) updateChatRoute(normalizeChatChannel(name))
  }

  useEffect(() => {
    const requestToken = openChannelRequest?.token
    const requestedChannel = normalizeChatChannel(
      openChannelRequest?.channel || ''
    )
    if (
      !requestedChannel ||
      requestToken === undefined ||
      !conversation.ready ||
      lastOpenChannelTokenRef.current === requestToken
    )
      return
    lastOpenChannelTokenRef.current = requestToken
    void loadChannel(requestedChannel).then(opened => {
      if (opened) updateChatRoute(requestedChannel)
    })
  }, [loadChannel, openChannelRequest?.token, conversation.ready])

  useEffect(() => {
    const routeChannel = getInitialChatRoute()
    if (!chatOpen || channel || !routeChannel || !channels.length) return
    void loadChannel(routeChannel)
  }, [chatOpen, channel, channels.length, loadChannel])

  const closeChannel = () => {
    loadRequestRef.current += 1
    selectedChannelRef.current = ''
    conversation.flush()
    Keyboard.dismiss()
    setLoading(false)
    voiceSessionRef.current?.leave()
    setVoiceJoined(false)
    setCallSheetOpen(false)
    setActionSheetOpen(false)
    setEmojiOpen(false)
    setShareRequest(null)
    setComposerMode('keyboard')
    setChatOpen(false)
    onDetailChange?.(false)
    updateChatRoute()
  }

  useEffect(() => {
    if (!active || !joinRequest || lastJoinRequestRef.current === joinRequest)
      return
    lastJoinRequestRef.current = joinRequest
    closeChannel()
    setJoinSheetOpen(true)
  }, [active, joinRequest, closeChannel])

  const loadOlderMessages = async () => {
    if (loading || historyRequestRef.current || !hasOlderMessages || !channel)
      return
    const request = loadRequestRef.current
    const scope = conversationScope
    const target = channel
    historyRequestRef.current = true
    setLoadingHistory(true)
    try {
      const page = localMode
        ? null
        : await api?.getHistory(target, {
            limit: 100,
            before: historyCursorRef.current || undefined,
          })
      const items = localMode
        ? (await bridge.getChannelMessages?.(target, {
            limit: 100,
            offset: messages.length,
          })) || []
        : page?.messages || []
      if (request !== loadRequestRef.current || scopeRef.current !== scope)
        return
      historyCursorRef.current = page?.nextCursor || null
      setHasOlderMessages(
        localMode ? items.length === 100 : Boolean(page?.nextCursor)
      )
      setMessages(current => mergeChatMessages(items, current))
      rememberMessages(target, items)
    } catch {
      if (request === loadRequestRef.current && scopeRef.current === scope)
        toast(t('chat.historyFailed'), 'error')
    } finally {
      if (request === loadRequestRef.current && scopeRef.current === scope) {
        historyRequestRef.current = false
        setLoadingHistory(false)
      }
    }
  }

  const jumpToLatest = () => {
    setNearLatest(true)
    messageListRef.current?.scrollToOffset({ offset: 0, animated: false })
  }

  const showMessageMenu = (message: ChatMessage) => {
    const attachment = getMessageAttachment(message)
    alert(t('chat.messageOptions'), undefined, [
      {
        text: t(attachment ? 'chat.copyAttachmentLink' : 'chat.copyMessage'),
        onPress: () => {
          void Clipboard.setStringAsync(attachment?.link || message.content)
            .then(() => toast(t('chat.copied'), 'success'))
            .catch(() => toast(t('app.clipboard.failed'), 'error'))
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  useEffect(() => {
    if (Platform.OS !== 'android' || !active || !chatOpen) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (emojiOpen) setEmojiOpen(false)
        else closeChannel()
        return true
      }
    )
    return () => subscription.remove()
  }, [active, chatOpen, emojiOpen, conversation.flush])

  const send = async () => {
    const content = draft.trim()
    if (
      (!api && !localMode) ||
      !channel ||
      !content ||
      sending ||
      loading ||
      (!identity && !localMode)
    )
      return
    setSending(true)
    const targetChannel = channel
    const scope = conversationScope
    const previousAttempt = textAttemptsRef.current.get(targetChannel)
    const attempt =
      previousAttempt?.content === content
        ? previousAttempt
        : { content, clientMessageId: createClientMessageId() }
    textAttemptsRef.current.set(targetChannel, attempt)
    try {
      const message = localMode
        ? await bridge.sendChannelMessage?.({
            channelName: targetChannel,
            content,
            clientMessageId: attempt.clientMessageId,
            author: identity?.address,
            authorName: identity?.username,
          })
        : await api?.sendMessage(targetChannel, {
            content,
            clientMessageId: attempt.clientMessageId,
            author: identity?.address || '',
            authorName: identity?.username || '',
          })
      if (!message) throw new Error(t('chat.sendFailed'))
      if (scopeRef.current !== scope) return
      if (textAttemptsRef.current.get(targetChannel) === attempt)
        textAttemptsRef.current.delete(targetChannel)
      rememberMessages(targetChannel, [message])
      if (selectedChannelRef.current === targetChannel) setNearLatest(true)
      if (selectedChannelRef.current === targetChannel)
        setMessages(current => mergeChatMessages(current, [message]))
      conversation.update(state =>
        getConversationDraft(state, targetChannel).trim() === content
          ? setConversationDraft(state, targetChannel, '')
          : state
      )
    } catch (error) {
      if (scopeRef.current !== scope) return
      toast(
        getChatErrorMessage(
          error,
          t('chat.sendFailed'),
          t('chat.requestTimedOut')
        ),
        'error'
      )
    } finally {
      if (scopeRef.current === scope) setSending(false)
    }
  }

  const sendAttachment = async (
    source: 'file' | 'photos' | 'camera' = 'file'
  ) => {
    if (
      (!api && !localMode) ||
      !channel ||
      sending ||
      loading ||
      (!identity && !localMode)
    )
      return
    const targetChannel = channel
    const scope = conversationScope
    setSending(true)
    try {
      const attachment = await onPublishAttachment(source)
      if (!attachment) return
      if (scopeRef.current !== scope) return
      const message = localMode
        ? await bridge.sendChannelMessage?.({
            channelName: targetChannel,
            content: attachment.link,
            author: identity?.address,
            authorName: identity?.username,
            attachment,
          })
        : await api?.sendMessage(targetChannel, {
            content: attachment.link,
            author: identity?.address || '',
            authorName: identity?.username || '',
            attachment,
          })
      if (!message) throw new Error(t('chat.attachmentFailed'))
      if (scopeRef.current !== scope) return
      rememberMessages(targetChannel, [message])
      if (selectedChannelRef.current === targetChannel) setNearLatest(true)
      if (selectedChannelRef.current === targetChannel)
        setMessages(current => mergeChatMessages(current, [message]))
    } catch (error) {
      if (scopeRef.current !== scope) return
      toast(
        getChatErrorMessage(
          error,
          t('chat.attachmentFailed'),
          t('chat.requestTimedOut')
        ),
        'error'
      )
    } finally {
      if (scopeRef.current === scope) setSending(false)
    }
  }

  const toggleVoice = async () => {
    const session = voiceSessionRef.current
    if (!session || !channel) return
    setVoiceError('')
    if (voiceJoined) {
      session.leave()
      setVoiceJoined(false)
      setVoiceMuted(false)
      setVoiceState(
        createVoiceRoomState(channel, session.sessionId, identity?.address, {
          displayName: identity?.username,
        })
      )
      return
    }
    setVoiceConnecting(true)
    try {
      await session.join()
      setVoiceJoined(true)
    } catch (error) {
      setVoiceError(
        error instanceof Error ? error.message : t('chat.voiceFailed')
      )
    } finally {
      setVoiceConnecting(false)
    }
  }

  const toggleVoiceMute = () => {
    const next = !voiceMuted
    setVoiceMuted(next)
    voiceSessionRef.current?.setMuted(next)
    setVoiceState(current => {
      if (!current || !voiceSessionRef.current) return current
      const participant =
        current.participants[voiceSessionRef.current.sessionId]
      if (!participant) return current
      return {
        ...current,
        participants: {
          ...current.participants,
          [participant.sessionId]: { ...participant, micMuted: next },
        },
      }
    })
  }

  const startVoiceCall = () => {
    if (localMode) {
      setCallSheetOpen(false)
      toast(t('chat.voiceRequiresRemote'), 'info')
      return
    }
    void toggleVoice()
  }

  const toggleComposerMode = () => {
    setEmojiOpen(false)
    if (composerMode === 'keyboard') Keyboard.dismiss()
    setComposerMode(current => (current === 'keyboard' ? 'voice' : 'keyboard'))
  }

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || composerMode !== 'keyboard') return
    const input = draftInputRef.current as unknown as HTMLTextAreaElement | null
    if (!input) return
    // Measure from the natural height so deleting text can shrink the textarea.
    input.style.height = 'auto'
    const height = Math.max(42, Math.min(240, input.scrollHeight + 2))
    input.style.height = `${height}px`
    setDraftHeight(height)
  }, [draft, draftWidth, composerMode, channel])

  const appendEmoji = (emoji: string) => {
    setDraft(`${draft}${emoji}`)
  }

  const sendVoiceMessage = async (recording: VoiceRecording) => {
    if (!channel || sending || loading || (!localMode && !api))
      throw new Error(t('chat.sendFailed'))
    const targetChannel = channel
    const scope = conversationScope
    const previousAttempt = voiceAttemptRef.current
    const attempt: NonNullable<typeof voiceAttemptRef.current> =
      previousAttempt?.scope === scope &&
      previousAttempt.channel === targetChannel &&
      previousAttempt.uri === recording.uri
        ? previousAttempt
        : {
            scope,
            channel: targetChannel,
            uri: recording.uri,
            clientMessageId: createClientMessageId(),
          }
    voiceAttemptRef.current = attempt
    setSending(true)
    setPlayingMessageKey('')
    try {
      const attachment =
        attempt.attachment || (await onPublishVoiceMessage(recording))
      attempt.attachment = attachment
      if (
        scopeRef.current !== scope ||
        selectedChannelRef.current !== targetChannel
      )
        throw new Error(t('chat.sendFailed'))
      const message = localMode
        ? await bridge.sendChannelMessage?.({
            channelName: targetChannel,
            content: attachment.link,
            author: identity?.address,
            authorName: identity?.username,
            attachment,
            clientMessageId: attempt.clientMessageId,
          })
        : await api?.sendMessage(targetChannel, {
            content: attachment.link,
            author: identity?.address || '',
            authorName: identity?.username || '',
            attachment,
            clientMessageId: attempt.clientMessageId,
          })
      if (!message) throw new Error(t('chat.sendFailed'))
      if (voiceAttemptRef.current === attempt) voiceAttemptRef.current = null
      if (scopeRef.current !== scope) return
      rememberMessages(targetChannel, [message])
      if (selectedChannelRef.current === targetChannel) {
        setNearLatest(true)
        setMessages(current => mergeChatMessages(current, [message]))
      }
    } finally {
      if (scopeRef.current === scope) setSending(false)
    }
  }

  if (!localMode && !endpoint)
    return (
      <View style={styles.empty}>
        <MessageCircle size={32} color={theme.colors.textMuted} />
        <Text style={styles.emptyTitle}>{t('chat.remoteRequired')}</Text>
        <Text style={styles.emptyBody}>{t('chat.remoteRequiredBody')}</Text>
      </View>
    )
  if (!localMode && !identity)
    return (
      <View style={styles.empty}>
        <MessageCircle size={32} color={theme.colors.textMuted} />
        <Text style={styles.emptyTitle}>{t('chat.signInRequired')}</Text>
        <Text style={styles.emptyBody}>{t('chat.signInRequiredBody')}</Text>
      </View>
    )

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={!joinSheetOpen}
      keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      style={[styles.container, chatOpen ? styles.detailContainer : null]}
    >
      {!chatOpen ? (
        <>
          <View style={styles.listHeader}>
            <Text accessibilityRole="header" style={styles.listTitle}>
              {PRODUCT_PROFILE.displayName}
            </Text>
            <IconButton
              accessibilityLabel={t('chat.joinChannel')}
              onPress={() => setJoinSheetOpen(true)}
            >
              <Plus size={24} color={theme.colors.text} />
            </IconButton>
          </View>
          <View style={styles.searchRow}>
            <Search size={18} color={theme.colors.textMuted} />
            <MostTextInput
              accessibilityLabel={t('chat.search')}
              autoCapitalize="none"
              value={search}
              onChangeText={setSearch}
              placeholder={t('chat.searchPlaceholder')}
              style={styles.searchInput}
            />
            {search ? (
              <IconButton
                accessibilityLabel={t('chat.clearSearch')}
                onPress={() => setSearch('')}
                variant="ghost"
              >
                <X size={18} color={theme.colors.textMuted} />
              </IconButton>
            ) : null}
          </View>
          {connectionNotice}
          <View style={styles.channelListCard}>
            <FlatList
              data={visibleChannels}
              keyExtractor={item => item.name}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.channelList}
              ListEmptyComponent={
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyBody}>
                    {t(
                      search.trim()
                        ? 'chat.noSearchResults'
                        : 'chat.chooseChannel'
                    )}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.channelListRow,
                    item.pinned ? styles.pinnedRow : null,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.remark || `#${item.name}`}${item.unread ? `, ${t('chat.unreadCount', { count: item.unread > 99 ? '99+' : item.unread })}` : ''}`}
                    disabled={!conversation.ready}
                    onPress={() => void openChannel(item.name)}
                    onLongPress={() => showConversationMenu(item.name)}
                    style={({ pressed }) => [
                      styles.channelRow,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <View style={styles.channelAvatar}>
                      <MessageCircle size={18} color={theme.colors.accent} />
                      {item.unread ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {item.unread > 99 ? '99+' : item.unread}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.channelRowText}>
                      <Text numberOfLines={1} style={styles.channelText}>
                        {item.remark || `#${item.name}`}
                      </Text>
                      <Text numberOfLines={1} style={styles.channelPreview}>
                        {item.draft.trim() ? (
                          <>
                            <Text style={styles.draftLabel}>
                              {t('chat.draftLabel')}
                            </Text>
                            {item.draft.replace(/\s+/g, ' ')}
                          </>
                        ) : item.lastMessage ? (
                          `${item.lastMessage.authorName ? `${item.lastMessage.authorName}: ` : ''}${getMessageAttachment(item.lastMessage)?.fileName ? t('chat.attachmentLabel', { fileName: getMessageAttachment(item.lastMessage)?.fileName || '' }) : item.lastMessage.content.replace(/\s+/g, ' ')}`
                        ) : (
                          t('chat.openHint')
                        )}
                      </Text>
                    </View>
                    {item.lastMessageAt ? (
                      <Text style={styles.channelTime}>
                        {new Intl.DateTimeFormat(locale, {
                          ...(new Date(item.lastMessageAt).toDateString() ===
                          new Date().toDateString()
                            ? { hour: '2-digit', minute: '2-digit' }
                            : { month: 'numeric', day: 'numeric' }),
                        }).format(item.lastMessageAt)}
                      </Text>
                    ) : null}
                  </Pressable>
                  <IconButton
                    accessibilityLabel={t('chat.conversationOptions', {
                      channel: item.remark || item.name,
                    })}
                    onPress={() => showConversationMenu(item.name)}
                    variant="ghost"
                  >
                    <MoreHorizontal
                      size={20}
                      color={theme.colors.textSecondary}
                    />
                  </IconButton>
                </View>
              )}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.detailHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.back')}
              onPress={closeChannel}
              style={styles.backButton}
            >
              <ArrowLeft size={20} color={theme.colors.text} />
            </Pressable>
            <Text numberOfLines={1} style={styles.detailTitle}>
              {channels.find(item => item.name === channel)?.remark ||
                `#${channel}`}
            </Text>
            {channel ? (
              <View style={styles.detailActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.channelInfo')}
                  onPress={() => {
                    Keyboard.dismiss()
                    setShareRequest({ scope: conversationScope, name: channel })
                  }}
                  style={styles.detailActionButton}
                >
                  <MoreHorizontal size={20} color={theme.colors.text} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.detailHeaderSpacer} />
            )}
          </View>
          {connectionNotice}
          {voiceJoined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.voiceReturn')}
              onPress={() => setCallSheetOpen(true)}
              style={styles.voiceBanner}
            >
              <PhoneCall size={16} color={theme.colors.accent} />
              <Text style={styles.voiceBannerText}>
                {t('chat.voiceReturn')}
              </Text>
            </Pressable>
          ) : null}
          {voiceError ? (
            <Text
              style={[
                styles.voiceError,
                chatOpen ? styles.detailVoiceError : null,
              ]}
            >
              {voiceError}
            </Text>
          ) : null}
          <View
            style={[
              styles.messagesCard,
              chatOpen ? styles.detailMessagesCard : null,
            ]}
          >
            {loading ? (
              <ActivityIndicator
                color={theme.colors.accent}
                style={styles.loader}
              />
            ) : null}
            {!loading && !channel ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyBody}>{t('chat.chooseChannel')}</Text>
              </View>
            ) : null}
            <FlatList
              ref={messageListRef}
              inverted
              data={visibleMessages}
              keyExtractor={getChatMessageKey}
              keyboardShouldPersistTaps="handled"
              maintainVisibleContentPosition={{
                minIndexForVisible: 0,
                autoscrollToTopThreshold: 80,
              }}
              onScroll={event =>
                setNearLatest(event.nativeEvent.contentOffset.y < 80)
              }
              scrollEventThrottle={100}
              onContentSizeChange={() => {
                if (nearLatest)
                  messageListRef.current?.scrollToOffset({
                    offset: 0,
                    animated: false,
                  })
              }}
              ListFooterComponent={
                hasOlderMessages ? (
                  <MostButton
                    disabled={loadingHistory}
                    onPress={() => void loadOlderMessages()}
                    variant="ghost"
                  >
                    {loadingHistory
                      ? t('chat.loadingHistory')
                      : t('chat.loadOlderMessages')}
                  </MostButton>
                ) : null
              }
              contentContainerStyle={styles.messages}
              renderItem={({ item, index }) => {
                const mine = isOwnChatMessage(
                  item,
                  identity?.address || snapshot.node.userAddress || ''
                )
                const attachment = getMessageAttachment(item)
                const state = attachment
                  ? getAttachmentState(
                      attachment.cid,
                      snapshot.holdings,
                      snapshot.transfers
                    )
                  : null
                const action =
                  state?.status === 'available'
                    ? 'chat.openAttachment'
                    : state?.status === 'running'
                      ? 'chat.receivingAttachment'
                      : state?.status === 'failed'
                        ? 'chat.retryAttachment'
                        : 'chat.receiveAttachment'
                const actionLabel = t(action, {
                  progress: Math.round(state?.transfer?.progress || 0),
                })
                const imageReady =
                  attachment?.kind === 'image' && state?.holding
                const fileCard =
                  attachment &&
                  !imageReady &&
                  !(attachment.kind === 'audio' && state?.holding)
                return (
                  <View>
                    {shouldShowMessageTime(item, visibleMessages[index + 1]) ? (
                      <Text style={styles.timestamp}>
                        {formatDateTime(item.timestamp!)}
                      </Text>
                    ) : null}
                    <View
                      style={[
                        styles.messageRow,
                        mine ? styles.messageRowMine : null,
                      ]}
                    >
                      <ChatAvatar address={item.author} avatar={item.avatar} />
                      <View
                        style={[
                          styles.messageBody,
                          mine ? styles.messageBodyMine : null,
                        ]}
                      >
                        {!mine ? (
                          <Text numberOfLines={1} style={styles.author}>
                            {item.authorName}
                          </Text>
                        ) : null}
                        <Pressable
                          accessible={!attachment}
                          accessibilityRole={attachment ? undefined : 'button'}
                          accessibilityLabel={
                            attachment
                              ? undefined
                              : t('chat.messageActionsA11y', {
                                  author: item.authorName,
                                  content: item.content,
                                })
                          }
                          onLongPress={() => showMessageMenu(item)}
                          style={[
                            styles.message,
                            mine ? styles.messageMine : null,
                            fileCard ? styles.fileMessage : null,
                            imageReady ? styles.imageMessage : null,
                          ]}
                        >
                          {!imageReady ? (
                            <View
                              style={[
                                styles.bubbleTail,
                                mine
                                  ? styles.bubbleTailMine
                                  : styles.bubbleTailOther,
                                fileCard
                                  ? mine
                                    ? styles.fileTailMine
                                    : styles.fileTailOther
                                  : null,
                              ]}
                            />
                          ) : null}
                          {imageReady && attachment && state.holding ? (
                            <ChatImagePreview
                              key={`${conversationScope}:${attachment.cid}`}
                              client={client}
                              cid={attachment.cid}
                              fileName={attachment.fileName}
                              mimeType={attachment.mimeType}
                              active={active && foreground}
                              onLongPress={() => showMessageMenu(item)}
                              onSave={() =>
                                void onSaveAttachment(state.holding!)
                              }
                              onOpen={() =>
                                void onOpenAttachment(state.holding!)
                              }
                            />
                          ) : attachment ? (
                            attachment.kind === 'audio' && state?.holding ? (
                              <VoiceAudioPlayer
                                mine={mine}
                                onLongPress={() => showMessageMenu(item)}
                                key={`${conversationScope}:${getChatMessageKey(item)}`}
                                active={
                                  active &&
                                  foreground &&
                                  !voiceRecordingActive &&
                                  (!playingMessageKey ||
                                    playingMessageKey ===
                                      getChatMessageKey(item))
                                }
                                onPlay={() =>
                                  setPlayingMessageKey(getChatMessageKey(item))
                                }
                                loadUri={async () => {
                                  const result = await client.exportHolding({
                                    cid: attachment.cid,
                                    fileName: attachment.fileName,
                                    mimeType: attachment.mimeType,
                                  })
                                  return /^(?:file:|content:|blob:|https?:)/.test(
                                    result.filePath
                                  )
                                    ? result.filePath
                                    : `file://${result.filePath}`
                                }}
                              />
                            ) : (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${attachment.fileName}, ${actionLabel}`}
                                disabled={state?.status === 'running'}
                                onPress={() => {
                                  if (state?.holding)
                                    void onOpenAttachment(state.holding)
                                  else onReceiveAttachment(attachment)
                                }}
                                onLongPress={() => showMessageMenu(item)}
                                style={styles.attachmentButton}
                              >
                                <View style={styles.fileInfo}>
                                  <Text
                                    numberOfLines={2}
                                    style={styles.attachmentName}
                                  >
                                    {attachment.fileName}
                                  </Text>
                                  {typeof attachment.size === 'number' ? (
                                    <Text style={styles.attachmentDetails}>
                                      {formatAttachmentSize(attachment.size)}
                                    </Text>
                                  ) : null}
                                  {!state?.holding ? (
                                    <Text style={styles.attachmentAction}>
                                      {actionLabel}
                                    </Text>
                                  ) : null}
                                </View>
                                <View style={styles.fileIcon}>
                                  {state?.status === 'running' ? (
                                    <ActivityIndicator
                                      color={theme.colors.accent}
                                    />
                                  ) : attachment.kind === 'image' ? (
                                    <ImageIcon
                                      size={30}
                                      color={theme.colors.textSecondary}
                                    />
                                  ) : attachment.kind === 'audio' ? (
                                    <Volume2
                                      size={30}
                                      color={theme.colors.textSecondary}
                                    />
                                  ) : (
                                    <FileText
                                      size={30}
                                      color={theme.colors.textSecondary}
                                    />
                                  )}
                                </View>
                              </Pressable>
                            )
                          ) : (
                            <Text
                              style={[
                                styles.content,
                                mine ? styles.messageMineText : null,
                              ]}
                            >
                              {item.content}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )
              }}
            />
            {!nearLatest ? (
              <MostButton
                onPress={jumpToLatest}
                variant="ghost"
                style={styles.latestButton}
              >
                {t('chat.jumpToLatest')}
              </MostButton>
            ) : null}
            <View style={styles.composer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  composerMode === 'keyboard'
                    ? t('chat.switchToVoice')
                    : t('chat.switchToKeyboard')
                }
                onPress={toggleComposerMode}
                style={styles.composerIconButton}
              >
                {composerMode === 'keyboard' ? (
                  <Mic size={22} color={theme.colors.text} />
                ) : (
                  <KeyboardIcon size={22} color={theme.colors.text} />
                )}
              </Pressable>
              {composerMode === 'keyboard' ? (
                <MostTextInput
                  ref={draftInputRef}
                  accessibilityLabel={t('chat.messagePlaceholder')}
                  onLayout={event =>
                    setDraftWidth(event.nativeEvent.layout.width)
                  }
                  onContentSizeChange={event => {
                    if (Platform.OS !== 'web')
                      setDraftHeight(
                        Math.max(
                          42,
                          Math.min(
                            240,
                            Math.ceil(event.nativeEvent.contentSize.height) + 2
                          )
                        )
                      )
                  }}
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => {
                    setEmojiOpen(false)
                    jumpToLatest()
                  }}
                  placeholder={t('chat.messagePlaceholder')}
                  multiline
                  numberOfLines={1}
                  scrollEnabled={draftHeight >= 240}
                  editable={conversation.ready && !loading}
                  style={styles.draft}
                />
              ) : (
                <VoiceMessageRecorder
                  key={`${conversationScope}:${channel}`}
                  active={active && foreground}
                  disabled={sending || loading || !channel}
                  onSend={sendVoiceMessage}
                  onActivityChange={setVoiceRecordingActive}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  emojiOpen ? 'chat.switchToKeyboard' : 'chat.emoji'
                )}
                onPress={() => {
                  if (emojiOpen) {
                    setEmojiOpen(false)
                    draftInputRef.current?.focus()
                  } else {
                    Keyboard.dismiss()
                    setComposerMode('keyboard')
                    setEmojiOpen(true)
                  }
                }}
                style={styles.composerIconButton}
              >
                {emojiOpen ? (
                  <KeyboardIcon size={22} color={theme.colors.text} />
                ) : (
                  <Smile size={22} color={theme.colors.text} />
                )}
              </Pressable>
              {composerMode === 'keyboard' && draft.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.send')}
                  disabled={
                    sending ||
                    loading ||
                    !draft.trim() ||
                    !channel ||
                    (!localMode && !identity)
                  }
                  onPress={() => void send()}
                  style={[
                    styles.sendButton,
                    sending || !draft.trim() || !channel
                      ? styles.disabled
                      : null,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator color={theme.colors.onAccent} />
                  ) : (
                    <Text style={styles.sendLabel}>{t('chat.sendShort')}</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.moreActions')}
                  disabled={sending || !channel}
                  onPress={() => {
                    Keyboard.dismiss()
                    setEmojiOpen(false)
                    setActionSheetOpen(true)
                  }}
                  style={[
                    styles.composerIconButton,
                    sending || !channel ? styles.disabled : null,
                  ]}
                >
                  <Plus size={23} color={theme.colors.text} />
                </Pressable>
              )}
            </View>
            {emojiOpen ? (
              <View style={styles.emojiPanel}>
                {['😀', '😂', '👍', '🎉', '❤️', '🙏', '😅', '🤝'].map(emoji => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                    key={emoji}
                    onPress={() => appendEmoji(emoji)}
                    style={styles.emojiButton}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <Modal
            animationType="slide"
            onRequestClose={() => setCallSheetOpen(false)}
            visible={callSheetOpen}
          >
            <SafeAreaView style={styles.voiceScreen}>
              <View style={styles.voiceHeader}>
                <Text style={styles.voiceTitle}>
                  {t('chat.voiceRoom')} · #{channel}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.voiceMinimize')}
                  onPress={() => setCallSheetOpen(false)}
                  style={styles.backButton}
                >
                  <Minimize2 size={22} color={theme.colors.text} />
                </Pressable>
              </View>
              <Text style={styles.voiceHint}>{t('chat.voiceHint')}</Text>
              {voiceError ? (
                <Text style={styles.voiceError}>{voiceError}</Text>
              ) : null}
              <FlatList
                data={Object.values(voiceState?.participants || {}).filter(
                  participant => voiceJoined || !participant.local
                )}
                keyExtractor={participant => participant.sessionId}
                contentContainerStyle={styles.voiceMembers}
                ListEmptyComponent={
                  <Text style={styles.voiceHint}>{t('chat.voiceEmpty')}</Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.voiceMember}>
                    <View style={styles.voiceAvatar}>
                      <UserRound size={28} color={theme.colors.accent} />
                    </View>
                    <Text style={styles.voiceMemberName}>
                      {item.displayName || item.address}
                    </Text>
                    {item.micMuted ? (
                      <MicOff size={20} color={theme.colors.warning} />
                    ) : (
                      <Mic size={20} color={theme.colors.accent} />
                    )}
                  </View>
                )}
              />
              <View style={styles.voiceControls}>
                {voiceJoined ? (
                  <>
                    <MostButton
                      icon={
                        voiceMuted ? (
                          <MicOff size={22} color={theme.colors.text} />
                        ) : (
                          <Mic size={22} color={theme.colors.text} />
                        )
                      }
                      onPress={toggleVoiceMute}
                    >
                      {voiceMuted ? t('chat.voiceUnmute') : t('chat.voiceMute')}
                    </MostButton>
                    <MostButton
                      icon={
                        <PhoneOff size={22} color={theme.colors.onAccent} />
                      }
                      onPress={() => {
                        void toggleVoice()
                        setCallSheetOpen(false)
                      }}
                      variant="danger"
                    >
                      {t('chat.voiceLeave')}
                    </MostButton>
                  </>
                ) : (
                  <MostButton
                    disabled={voiceConnecting}
                    icon={<PhoneCall size={22} color={theme.colors.onAccent} />}
                    onPress={startVoiceCall}
                    variant="primary"
                  >
                    {voiceConnecting
                      ? t('chat.voiceConnecting')
                      : t('chat.voiceJoin')}
                  </MostButton>
                )}
              </View>
            </SafeAreaView>
          </Modal>
          <Modal
            animationType="slide"
            onRequestClose={() => setActionSheetOpen(false)}
            transparent
            visible={actionSheetOpen}
          >
            <View style={styles.sheetOverlay}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setActionSheetOpen(false)}
                style={styles.sheetBackdrop}
              />
              <BottomSheetCard style={styles.sheetCard}>
                <Text style={styles.sheetTitle}>{t('chat.moreTitle')}</Text>
                <View style={styles.actionOptions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.voiceRoom')}
                    onPress={() => {
                      setActionSheetOpen(false)
                      setCallSheetOpen(true)
                    }}
                    style={({ pressed }) => [
                      styles.actionOption,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <PhoneCall size={22} color={theme.colors.accent} />
                    <Text style={styles.actionOptionLabel}>
                      {t('chat.voiceRoom')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.attach')}
                    onPress={() => {
                      setActionSheetOpen(false)
                      void sendAttachment()
                    }}
                    style={({ pressed }) => [
                      styles.actionOption,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <FileText size={22} color={theme.colors.accent} />
                    <Text style={styles.actionOptionLabel}>
                      {t('chat.fileAction')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.cameraAction')}
                    onPress={() => {
                      setActionSheetOpen(false)
                      void sendAttachment('camera')
                    }}
                    style={({ pressed }) => [
                      styles.actionOption,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Camera size={22} color={theme.colors.info} />
                    <Text style={styles.actionOptionLabel}>
                      {t('chat.cameraAction')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.photosAction')}
                    onPress={() => {
                      setActionSheetOpen(false)
                      void sendAttachment('photos')
                    }}
                    style={({ pressed }) => [
                      styles.actionOption,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <ImageIcon size={22} color={theme.colors.accent} />
                    <Text style={styles.actionOptionLabel}>
                      {t('chat.photosAction')}
                    </Text>
                  </Pressable>
                </View>
                <MostButton
                  onPress={() => setActionSheetOpen(false)}
                  style={styles.sheetCancel}
                  variant="ghost"
                >
                  {t('common.cancel')}
                </MostButton>
              </BottomSheetCard>
            </View>
          </Modal>
        </>
      )}
      <Modal
        animationType="slide"
        transparent
        visible={joinSheetOpen && active}
        onRequestClose={() => setJoinSheetOpen(false)}
      >
        <KeyboardAvoidingView
          // Padding keeps the modal frame stable while the keyboard moves.
          behavior="padding"
          style={styles.sheetOverlay}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={() => setJoinSheetOpen(false)}
            style={styles.sheetBackdrop}
          />
          <BottomSheetCard style={styles.sheetCard}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {t('chat.joinChannel')}
            </Text>
            <Text style={styles.emptyBody}>{t('chat.joinChannelHint')}</Text>
            <MostTextInput
              accessibilityLabel={t('chat.channelPlaceholder')}
              value={channelInput}
              onChangeText={setChannelInput}
              onSubmitEditing={() => {
                if (!loading && conversation.ready) void joinChannel()
              }}
              placeholder={t('chat.channelPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <MostButton
              disabled={loading || !conversation.ready || !channelInput.trim()}
              onPress={() => void joinChannel()}
              variant="primary"
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onAccent} />
              ) : (
                t('chat.join')
              )}
            </MostButton>
            <MostButton onPress={() => setJoinSheetOpen(false)} variant="ghost">
              {t('common.cancel')}
            </MostButton>
          </BottomSheetCard>
        </KeyboardAvoidingView>
      </Modal>
      {active && sharingChannel ? (
        <ChannelShareSheet
          key={`${conversationScope}:${sharingChannel.name}`}
          channel={sharingChannel}
          onSaveRemark={async remark => {
            const name = sharingChannel.name
            if (localMode) {
              if (!bridge.setChannelRemark)
                throw new Error(t('contacts.actionUnavailable'))
              await bridge.setChannelRemark({ channelName: name, remark })
            } else {
              if (!api) throw new Error(t('contacts.actionUnavailable'))
              await api.setChannelRemark(name, remark)
            }
            setChannels(current =>
              current.map(item =>
                item.name === name ? { ...item, remark } : item
              )
            )
          }}
          onClose={() => setShareRequest(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  )
}

function chatStyles(
  theme: ReturnType<typeof useMostBoxTheme>,
  draftHeight: number
) {
  const { colors, radii } = theme
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
    detailContainer: { paddingHorizontal: 0, paddingTop: 0 },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    listTitle: { color: colors.text, fontSize: 23, fontWeight: '700' },
    searchRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.surfaceSubtle,
      borderRadius: radii.small,
      paddingHorizontal: 12,
      marginVertical: 8,
    },
    searchInput: {
      flex: 1,
      backgroundColor: 'transparent',
      borderWidth: 0,
      minHeight: 42,
      paddingHorizontal: 0,
    },
    pinnedRow: { backgroundColor: colors.surfaceSubtle },
    draftLabel: { color: colors.danger },
    unreadBadge: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadBadgeText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: '700',
    },
    channelInput: {
      backgroundColor: colors.surfaceSubtle,
      borderColor: colors.border,
      borderRadius: radii.small,
      flex: 1,
      minHeight: 44,
    },
    channelListView: { flexGrow: 0, height: 42 },
    channelListCard: {
      backgroundColor: colors.background,
      flex: 1,
      minHeight: 180,
      overflow: 'hidden',
    },
    channelList: { paddingVertical: 4 },
    channelListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    channelRow: {
      flex: 1,
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      minHeight: 72,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    channelAvatar: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: 10,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    channelRowText: { flex: 1, gap: 4, minWidth: 0 },
    channelPreview: { color: colors.textSecondary, fontSize: 12 },
    channelMeta: { alignItems: 'flex-end', gap: 4 },
    channelTime: { color: colors.textMuted, fontSize: 10 },
    channelChevron: { color: colors.textMuted, fontSize: 20 },
    detailHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 42,
      paddingHorizontal: 14,
    },
    backButton: {
      alignItems: 'center',
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    detailTitle: {
      color: colors.text,
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    detailActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 3,
      justifyContent: 'flex-end',
      minWidth: 76,
    },
    detailActionButton: {
      alignItems: 'center',
      height: 36,
      justifyContent: 'center',
      width: 32,
    },
    detailActionCount: { color: colors.textSecondary, fontSize: 11 },
    detailHeaderSpacer: { width: 38 },
    pressed: { opacity: 0.65 },
    voiceError: { color: colors.danger, fontSize: 12 },
    detailVoiceError: { paddingHorizontal: 14 },
    channelChip: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    channelChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    channelText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    channelTextActive: { color: colors.accent, fontWeight: '700' },
    messagesCard: {
      backgroundColor: colors.background,
      flex: 1,
      minHeight: 180,
      overflow: 'hidden',
    },
    detailMessagesCard: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
    },
    messages: { padding: 12, gap: 10, flexGrow: 1 },
    latestButton: { alignSelf: 'center', marginVertical: 4 },
    connectionNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.surfaceSubtle,
    },
    connectionNoticeText: {
      flex: 1,
      fontSize: 12,
      color: colors.textSecondary,
    },
    messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    messageRowMine: { flexDirection: 'row-reverse' },
    messageBody: {
      maxWidth: '76%',
      flexShrink: 1,
      alignItems: 'flex-start',
      gap: 4,
    },
    messageBodyMine: { alignItems: 'flex-end' },
    message: {
      backgroundColor: colors.surfaceSubtle,
      borderRadius: 5,
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    messageMine: { backgroundColor: '#95ec69' },
    messageMineText: { color: '#152515' },
    bubbleTail: {
      position: 'absolute',
      top: 13,
      width: 0,
      height: 0,
      borderTopWidth: 5,
      borderBottomWidth: 5,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    bubbleTailOther: {
      left: -5,
      borderRightWidth: 6,
      borderRightColor: colors.surfaceSubtle,
    },
    bubbleTailMine: {
      right: -5,
      borderLeftWidth: 6,
      borderLeftColor: '#95ec69',
    },
    fileTailOther: { borderRightColor: colors.surfaceSolid },
    fileTailMine: { borderLeftColor: colors.surfaceSolid },
    author: { color: colors.textMuted, fontSize: 12, marginBottom: 1 },
    fileMessage: { backgroundColor: colors.surfaceSolid, width: 240 },
    imageMessage: {
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    attachmentButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 64,
    },
    fileInfo: { flex: 1, minWidth: 0 },
    fileIcon: {
      width: 44,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSubtle,
      borderRadius: 4,
    },
    attachmentName: { color: colors.text, fontSize: 15, lineHeight: 21 },
    attachmentDetails: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
    attachmentAction: { color: colors.accent, fontSize: 12, marginTop: 5 },
    content: { color: colors.text, fontSize: 16, lineHeight: 24 },
    timestamp: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 18,
    },
    composer: {
      alignItems: 'flex-end',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    draft: {
      flex: 1,
      minHeight: 42,
      height: draftHeight,
      maxHeight: 240,
      textAlignVertical: 'top',
      lineHeight: 22,
      paddingVertical: 9,
    },
    composerIconButton: {
      alignItems: 'center',
      height: 42,
      justifyContent: 'center',
      width: 34,
    },
    voiceMessageButton: {
      alignItems: 'center',
      backgroundColor: colors.surfaceSubtle,
      borderColor: colors.border,
      borderRadius: radii.small,
      borderWidth: 1,
      flex: 1,
      height: 42,
      justifyContent: 'center',
    },
    voiceMessageButtonActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    voiceMessageText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    emojiPanel: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    emojiButton: {
      alignItems: 'center',
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    emoji: { fontSize: 24 },
    sheetOverlay: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetBackdrop: StyleSheet.absoluteFill,
    sheetCard: {
      width: '100%',
      maxWidth: '100%',
      borderTopLeftRadius: radii.large,
      borderTopRightRadius: radii.large,
      gap: 14,
      paddingBottom: 24,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    voiceScreen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 20,
    },
    voiceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    voiceTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    voiceHint: {
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 16,
    },
    voiceMembers: { flexGrow: 1, gap: 16, paddingVertical: 24 },
    voiceMember: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    voiceAvatar: {
      backgroundColor: colors.accentSoft,
      borderRadius: radii.large,
      padding: 18,
    },
    voiceMemberName: { flex: 1, color: colors.text, fontSize: 16 },
    voiceControls: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
      paddingVertical: 32,
    },
    voiceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accentSoft,
      padding: 12,
    },
    voiceBannerText: { color: colors.accent, fontSize: 13 },
    actionOptions: { gap: 1 },
    actionOption: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 54,
      paddingHorizontal: 8,
    },
    actionOptionLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
    sheetCancel: { marginTop: 2, width: '100%' },
    sendButton: {
      alignItems: 'center',
      backgroundColor: '#07c160',
      borderRadius: 7,
      height: 42,
      justifyContent: 'center',
      minWidth: 58,
      paddingHorizontal: 10,
    },
    sendLabel: { color: colors.onAccent, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.45 },
    loader: { marginTop: 16 },
    empty: {
      alignItems: 'center',
      flex: 1,
      gap: 10,
      justifyContent: 'center',
      padding: 24,
    },
    emptyInline: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyBody: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
    },
  })
}
