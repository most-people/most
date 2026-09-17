import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import {
  MessageCircle,
  Film,
  FileText,
  Image as ImageIcon,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  Send,
  Users,
  Search,
  MoreVertical,
  BellOff,
  ChevronLeft,
} from 'lucide-react-native'
import {
  ChatApiClient,
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
  MobileChannel,
  MobileChannelMessage,
  SendChannelMessageInput,
  MostBoxMobileCore,
} from '../../mobileCore/types'
import { useI18n } from '../../i18n'
import {
  MostButton,
  MostTextInput,
  getGlassSurfaceStyle,
} from '../../ui/components'
import { useFeedback } from '../../ui/feedback'
import { useMostBoxTheme } from '../../ui/theme'
import {
  createDefaultWorkspaceState,
  getOrderedConversations,
  workspaceReducer,
  deserializeWorkspaceState,
  serializeWorkspaceState,
  type ConversationSummary,
  formatConversationTime,
} from '../../navigation/workspaceModel'

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
  getChannelMessages?: (name: string) => Promise<MobileChannelMessage[]>
  sendChannelMessage?: (
    input: SendChannelMessageInput
  ) => Promise<MobileChannelMessage>
}

export type ChatAttachmentPickerKind = 'image' | 'video' | 'file'

function messageKey(message: {
  id?: string
  clientMessageId?: string
  author: string
  content: string
  timestamp?: number | string
  attachment?: { link?: string }
}) {
  return (
    message.id ||
    message.clientMessageId ||
    `${message.author}:${message.timestamp || ''}:${message.content}:${message.attachment?.link || ''}`
  )
}

export type ChatScreenProps = {
  client: MostBoxMobileCore
  snapshot: MobileCoreSnapshot
  onPublishAttachment: (
    kind: ChatAttachmentPickerKind
  ) => Promise<ChatAttachment | null>
  onOpenAttachment?: (attachment: ChatAttachment) => void
  onDetailChange?: (open: boolean, title?: string) => void
  backRequestToken?: number
}

export function ChatScreen({
  client,
  snapshot,
  onPublishAttachment,
  onOpenAttachment,
  onDetailChange,
  backRequestToken = 0,
}: ChatScreenProps) {
  const { locale, t, formatDateTime } = useI18n()
  const theme = useMostBoxTheme()
  const styles = chatStyles(theme)
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
  const [channelInput, setChannelInput] = useState('')
  const [channel, setChannel] = useState('')
  const [workspace, dispatchWorkspace] = useReducer(
    workspaceReducer,
    undefined,
    createDefaultWorkspaceState
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [joinInputOpen, setJoinInputOpen] = useState(false)
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceRoomState | null>(null)
  const [voiceJoined, setVoiceJoined] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceConnecting, setVoiceConnecting] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [voicePanelRequested, setVoicePanelRequested] = useState(false)
  const channelRef = useRef(channel)
  const seenMessageKeysRef = useRef(new Set<string>())
  const localSnapshotInitializedRef = useRef(false)
  const conversationIds = workspace.conversations
    .map(item => item.channelId)
    .join('|')
  const workspaceStorageKey = `mostbox.workspace.${encodeURIComponent(
    endpoint || 'local'
  )}.${encodeURIComponent(identity?.address || 'anonymous')}`
  const workspaceFile = `${FileSystem.documentDirectory || ''}${workspaceStorageKey}.json`

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const serialized =
          Platform.OS === 'web' && typeof localStorage !== 'undefined'
            ? localStorage.getItem(workspaceStorageKey)
            : await FileSystem.readAsStringAsync(workspaceFile, {
                encoding: FileSystem.EncodingType.UTF8,
              })
        if (active) {
          dispatchWorkspace({
            type: 'hydrate',
            state: deserializeWorkspaceState(serialized),
          })
        }
      } catch {
        // A missing workspace is equivalent to a new one.
      } finally {
        if (active) setWorkspaceHydrated(true)
      }
    }
    setWorkspaceHydrated(false)
    void load()
    return () => {
      active = false
    }
  }, [workspaceFile, workspaceStorageKey])

  useEffect(() => {
    if (!workspaceHydrated) return
    const serialized = serializeWorkspaceState(workspace)
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(workspaceStorageKey, serialized)
      } catch {}
      return
    }
    void FileSystem.writeAsStringAsync(workspaceFile, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    }).catch(() => {})
  }, [workspace, workspaceFile, workspaceHydrated, workspaceStorageKey])

  useEffect(() => {
    channelRef.current = channel
    onDetailChange?.(Boolean(channel), channel || undefined)
  }, [channel, onDetailChange])

  const handledBackTokenRef = useRef(0)
  useEffect(() => {
    if (!backRequestToken || handledBackTokenRef.current === backRequestToken)
      return
    handledBackTokenRef.current = backRequestToken
    if (channel) {
      setChannel('')
      setMessages([])
      dispatchWorkspace({ type: 'selectConversation' })
    }
  }, [backRequestToken, channel])

  const upsertChannel = (
    item: Partial<MobileChannel> & { name?: string; preview?: string }
  ) => {
    const channelId = normalizeChatChannel(
      String(item.channelKey || item.channelId || item.name || '')
    )
    if (!channelId) return
    const existing = workspace.conversations.find(
      conversation => conversation.channelId === channelId
    )
    const title = String(
      item.remark || item.name || item.channelId || channelId
    )
    const pinned =
      item.pinned === undefined
        ? existing?.pinned === true
        : item.pinned === true
    const lastMessageAt = item.lastMessageAt
      ? Date.parse(item.lastMessageAt) || undefined
      : undefined
    if (
      existing &&
      existing.title === title &&
      existing.pinned === pinned &&
      existing.lastMessageAt === lastMessageAt &&
      (item.preview === undefined ||
        existing.lastMessagePreview === item.preview)
    ) {
      return
    }
    dispatchWorkspace({
      type: 'upsertConversation',
      conversation: {
        channelId,
        title,
        avatarKey: channelId,
        unreadCount: existing?.unreadCount || 0,
        pinned,
        muted: existing?.muted === true,
        ...(lastMessageAt ? { lastMessageAt } : {}),
        ...(existing?.lastMessagePreview
          ? { lastMessagePreview: existing.lastMessagePreview }
          : {}),
        ...(item.preview !== undefined
          ? { lastMessagePreview: item.preview }
          : {}),
      },
    })
  }

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
    setVoicePanelRequested(false)
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
    if (!api && !localMode) return
    let active = true
    const request = localMode
      ? bridge.listChannels?.() || Promise.resolve([])
      : api?.listChannels() || Promise.resolve([])
    void request
      .then(items => {
        if (!active) return
        items.forEach(item => {
          if (localMode) {
            upsertChannel({
              ...(item as Partial<MobileChannel>),
              pinned: undefined,
            })
          } else {
            upsertChannel(item as Partial<MobileChannel>)
          }
        })
        if (!localMode && api) {
          void Promise.all(
            items.map(async item => {
              const channelId = normalizeChatChannel(
                String(item.channelKey || item.channelId || item.name || '')
              )
              if (!channelId) return
              try {
                const page = await api.getHistory(channelId, { limit: 1 })
                const latest = page.messages[page.messages.length - 1]
                if (latest) {
                  upsertChannel({
                    ...(item as Partial<MobileChannel>),
                    preview: latest.attachment
                      ? latest.attachment.fileName
                      : latest.content,
                  })
                }
              } catch {
                // A summary remains usable when a channel history is offline.
              }
            })
          )
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, bridge, localMode])

  useEffect(() => {
    if (!localMode) return
    ;(snapshot.channels || []).forEach(channelItem => {
      upsertChannel({ ...channelItem, pinned: undefined })
    })
    const messageGroups = snapshot.channelMessages || {}
    Object.entries(messageGroups).forEach(([channelId, items]) => {
      const latest = items[items.length - 1]
      if (latest) {
        upsertChannel({
          name: channelId,
          preview: latest.attachment
            ? latest.attachment.fileName
            : latest.content,
          lastMessageAt: new Date(
            Number(latest.timestamp) || Date.now()
          ).toISOString(),
        })
      }
    })
    const initialMessages = Object.values(messageGroups).flat()
    if (!localSnapshotInitializedRef.current) {
      // Seed the first restored history snapshot without counting it as new.
      if (initialMessages.length === 0) return
      initialMessages.forEach(message =>
        seenMessageKeysRef.current.add(messageKey(message))
      )
      localSnapshotInitializedRef.current = true
      return
    }
    Object.entries(messageGroups).forEach(([channelId, items]) => {
      items.forEach(message => {
        const key = messageKey(message)
        if (seenMessageKeysRef.current.has(key)) return
        seenMessageKeysRef.current.add(key)
        dispatchWorkspace({
          type: 'receiveMessage',
          channelId,
          preview: message.attachment
            ? message.attachment.fileName
            : message.content,
          at: Number(message.timestamp) || Date.now(),
        })
      })
    })
  }, [localMode, snapshot.channels, snapshot.channelMessages])

  useEffect(() => {
    if (localMode || !api) return
    const session = new ChatWebSocketSession({
      baseUrl: endpoint,
      invite,
      identity,
      onEvent: event => {
        if (event.event !== 'channel:message') return
        const id = normalizeChatChannel(event.channel)
        const message = event.message
        const key = messageKey(message)
        if (seenMessageKeysRef.current.has(key)) return
        seenMessageKeysRef.current.add(key)
        dispatchWorkspace({
          type: 'receiveMessage',
          channelId: id,
          preview: message.attachment
            ? message.attachment.fileName
            : message.content,
          at: Number(message.timestamp) || Date.now(),
        })
        if (channelRef.current === id) {
          setMessages(current => mergeChatMessages(current, [message]))
          dispatchWorkspace({ type: 'markConversationRead', channelId: id })
        }
      },
    })
    socketRef.current = session
    void Promise.all(
      workspace.conversations.map(item => session.subscribe(item.channelId))
    ).catch(() => {})
    return () => {
      session.close()
      if (socketRef.current === session) socketRef.current = null
    }
  }, [api, endpoint, identity, invite, localMode, conversationIds])

  useEffect(() => {
    if (!localMode || !channel) return
    const items = snapshot.channelMessages?.[channel]
    if (items) setMessages(items)
  }, [channel, localMode, snapshot.channelMessages])

  const loadChannel = async (name: string) => {
    const normalizedName = normalizeChatChannel(name)
    if ((!api && !localMode) || !normalizedName) return
    setLoading(true)
    try {
      const localMessages = localMode
        ? await bridge.getChannelMessages?.(normalizedName)
        : null
      const page = localMode
        ? null
        : await api?.getHistory(normalizedName, { limit: 100 })
      setChannel(normalizedName)
      setMessages(localMode ? localMessages || [] : page?.messages || [])
      dispatchWorkspace({
        type: 'selectConversation',
        channelId: normalizedName,
      })
      dispatchWorkspace({
        type: 'markConversationRead',
        channelId: normalizedName,
      })
      if (!localMode && socketRef.current) {
        await socketRef.current.subscribe(normalizedName)
      }
    } catch (error) {
      toast(
        error instanceof Error ? error.message : t('chat.loadFailed'),
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  const joinChannel = async () => {
    const name = normalizeChatChannel(channelInput)
    if (!name || (!api && !localMode)) return
    setLoading(true)
    try {
      const created = localMode
        ? await bridge.createChannel?.({ name, type: 'public' })
        : await api?.createOrJoinChannel({ name, displayName: name })
      upsertChannel((created || { name }) as Partial<MobileChannel>)
      setChannelInput('')
      setJoinInputOpen(false)
      await loadChannel(name)
    } catch (error) {
      toast(
        error instanceof Error ? error.message : t('chat.joinFailed'),
        'error'
      )
      setLoading(false)
    }
  }

  const closeChannel = () => {
    setChannel('')
    setMessages([])
    dispatchWorkspace({ type: 'selectConversation' })
  }

  const showConversationMenu = (conversation: ConversationSummary) => {
    alert(conversation.title, undefined, [
      {
        text: conversation.pinned ? t('chat.unpin') : t('chat.pin'),
        onPress: () =>
          dispatchWorkspace({
            type: 'setPinned',
            channelId: conversation.channelId,
            pinned: !conversation.pinned,
          }),
      },
      {
        text: conversation.muted ? t('chat.unmute') : t('chat.mute'),
        onPress: () =>
          dispatchWorkspace({
            type: 'setMuted',
            channelId: conversation.channelId,
            muted: !conversation.muted,
          }),
      },
      {
        text: t('chat.markRead'),
        onPress: () =>
          dispatchWorkspace({
            type: 'markConversationRead',
            channelId: conversation.channelId,
          }),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  const send = async () => {
    const content = draft.trim()
    if (
      (!api && !localMode) ||
      !channel ||
      !content ||
      (!identity && !localMode)
    )
      return
    setSending(true)
    try {
      const message = localMode
        ? await bridge.sendChannelMessage?.({
            channelName: channel,
            content,
            author: identity?.address,
            authorName: identity?.username,
          })
        : await api?.sendMessage(channel, {
            content,
            author: identity?.address || '',
            authorName: identity?.username || '',
          })
      if (!message) throw new Error(t('chat.sendFailed'))
      setMessages(current => mergeChatMessages(current, [message]))
      setDraft('')
    } catch (error) {
      toast(
        error instanceof Error ? error.message : t('chat.sendFailed'),
        'error'
      )
    } finally {
      setSending(false)
    }
  }

  const sendAttachment = async (kind: ChatAttachmentPickerKind) => {
    if ((!api && !localMode) || !channel || (!identity && !localMode)) return
    setSending(true)
    try {
      const attachment = await onPublishAttachment(kind)
      if (!attachment) return
      const message = localMode
        ? await bridge.sendChannelMessage?.({
            channelName: channel,
            content: attachment.link,
            author: identity?.address,
            authorName: identity?.username,
            attachment,
          })
        : await api?.sendMessage(channel, {
            content: attachment.link,
            author: identity?.address || '',
            authorName: identity?.username || '',
            attachment,
          })
      if (!message) throw new Error(t('chat.attachmentFailed'))
      setMessages(current => mergeChatMessages(current, [message]))
    } catch (error) {
      toast(
        error instanceof Error ? error.message : t('chat.attachmentFailed'),
        'error'
      )
    } finally {
      setSending(false)
    }
  }

  const toggleVoice = async () => {
    const session = voiceSessionRef.current
    if (!session || !channel) return
    setVoiceError('')
    if (voiceJoined) {
      session.leave()
      setVoiceJoined(false)
      setVoicePanelRequested(false)
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

  const showRemoteVoiceParticipant = Object.values(
    voiceState?.participants ?? {}
  ).some(participant => !participant.local)
  const showVoicePanel =
    voicePanelRequested || voiceJoined || showRemoteVoiceParticipant

  const handleAttachmentMenuSelect = (
    kind: ChatAttachmentPickerKind | 'voice'
  ) => {
    setAttachmentMenuOpen(false)
    if (kind === 'voice') {
      setVoicePanelRequested(true)
      return
    }
    void sendAttachment(kind)
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

  if (!channel) {
    const query = searchQuery.trim().toLowerCase()
    const conversations = getOrderedConversations(
      workspace.conversations
    ).filter(
      item =>
        !query ||
        `${item.title} ${item.channelId}`.toLowerCase().includes(query)
    )
    return (
      <View style={styles.container}>
        <View style={styles.listToolbar}>
          <View style={styles.searchBox}>
            <Search size={18} color={theme.colors.textMuted} />
            <MostTextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('chat.search')}
              style={styles.searchInput}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.newConversation')}
            onPress={() =>
              alert(t('chat.newConversation'), undefined, [
                {
                  text: t('chat.create'),
                  onPress: () => setJoinInputOpen(true),
                },
                { text: t('chat.join'), onPress: () => setJoinInputOpen(true) },
                { text: t('common.cancel'), style: 'cancel' },
              ])
            }
            style={styles.addButton}
          >
            <Plus size={22} color={theme.colors.accent} />
          </Pressable>
        </View>
        {joinInputOpen ? (
          <View style={styles.joinRow}>
            <MostTextInput
              value={channelInput}
              onChangeText={setChannelInput}
              onSubmitEditing={() => void joinChannel()}
              placeholder={t('chat.channelPlaceholder')}
              style={styles.channelInput}
              autoCapitalize="none"
              autoFocus
            />
            <MostButton
              disabled={loading || !channelInput.trim()}
              onPress={() => void joinChannel()}
              variant="primary"
            >
              {t('chat.join')}
            </MostButton>
          </View>
        ) : null}
        <FlatList
          data={conversations}
          keyExtractor={item => item.channelId}
          contentContainerStyle={styles.conversationList}
          ListEmptyComponent={
            <View style={styles.emptyInline}>
              <MessageCircle size={30} color={theme.colors.textMuted} />
              <Text style={styles.emptyBody}>{t('chat.chooseChannel')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void loadChannel(item.channelId)}
              onLongPress={() => showConversationMenu(item)}
              style={({ pressed }) => [
                styles.conversationRow,
                item.pinned ? styles.conversationPinned : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.avatar}>
                <Image
                  accessibilityLabel={item.title}
                  source={{
                    uri: `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent(item.channelId)}&size=96`,
                  }}
                  style={styles.avatarImage}
                />
              </View>
              <View style={styles.conversationMain}>
                <View style={styles.conversationTitleRow}>
                  <Text numberOfLines={1} style={styles.conversationTitle}>
                    {item.title}
                  </Text>
                  {item.muted ? (
                    <BellOff size={13} color={theme.colors.textMuted} />
                  ) : null}
                  <Text style={styles.conversationTime}>
                    {item.lastMessageAt
                      ? formatConversationTime(item.lastMessageAt, locale)
                      : ''}
                  </Text>
                </View>
                <View style={styles.conversationPreviewRow}>
                  <Text numberOfLines={1} style={styles.conversationPreview}>
                    {item.draft
                      ? `${t('chat.draft')}${item.draft}`
                      : item.lastMessagePreview || `#${item.channelId}`}
                  </Text>
                  {item.unreadCount > 0 && !item.muted ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>
                        {item.unreadCount > 99 ? '99+' : item.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={closeChannel}
          style={styles.backButton}
        >
          <ChevronLeft size={22} color={theme.colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.detailTitle}>
          {workspace.conversations.find(item => item.channelId === channel)
            ?.title || `#${channel}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            showConversationMenu(
              workspace.conversations.find(
                item => item.channelId === channel
              ) || {
                channelId: channel,
                title: channel,
                unreadCount: 0,
                pinned: false,
                muted: false,
              }
            )
          }
          style={styles.backButton}
        >
          <MoreVertical size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      {!localMode && channel && showVoicePanel ? (
        <View style={styles.voiceCard}>
          <View style={styles.voiceHeader}>
            <View style={styles.voiceTitleRow}>
              <Phone size={17} color={theme.colors.accent} />
              <Text style={styles.voiceTitle}>{t('chat.voiceTitle')}</Text>
              {voiceState ? (
                <View style={styles.voiceCount}>
                  <Users size={13} color={theme.colors.textSecondary} />
                  <Text style={styles.voiceCountText}>
                    {Object.keys(voiceState.participants).length}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.voiceActions}>
              {voiceJoined ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    voiceMuted ? t('chat.voiceUnmute') : t('chat.voiceMute')
                  }
                  onPress={toggleVoiceMute}
                  style={styles.voiceIconButton}
                >
                  {voiceMuted ? (
                    <MicOff size={17} color={theme.colors.warning} />
                  ) : (
                    <Mic size={17} color={theme.colors.accent} />
                  )}
                </Pressable>
              ) : null}
              <MostButton
                disabled={voiceConnecting}
                onPress={() => void toggleVoice()}
                variant={voiceJoined ? 'danger' : 'primary'}
                icon={
                  voiceJoined ? (
                    <PhoneOff size={15} color={theme.colors.onAccent} />
                  ) : (
                    <Phone size={15} color={theme.colors.onAccent} />
                  )
                }
              >
                {voiceConnecting
                  ? t('chat.voiceConnecting')
                  : voiceJoined
                    ? t('chat.voiceLeave')
                    : t('chat.voiceJoin')}
              </MostButton>
            </View>
          </View>
          {voiceError ? (
            <Text style={styles.voiceError}>{voiceError}</Text>
          ) : null}
          {voiceJoined && voiceState ? (
            <View style={styles.voiceParticipants}>
              {Object.values(voiceState.participants).map(participant => (
                <Text
                  key={participant.sessionId}
                  style={styles.voiceParticipant}
                >
                  {participant.displayName || participant.address}
                  {participant.micMuted ? ` · ${t('chat.voiceMuted')}` : ''}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.voiceHint}>{t('chat.voiceHint')}</Text>
          )}
        </View>
      ) : null}
      <View style={styles.messagesCard}>
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
          data={messages}
          keyExtractor={(item, index) =>
            item.id ||
            item.clientMessageId ||
            `${item.author}-${item.timestamp}-${index}`
          }
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => (
            <View
              style={[
                styles.message,
                item.author === identity?.address ? styles.messageMine : null,
              ]}
            >
              <Text style={styles.author}>{item.authorName}</Text>
              {item.attachment ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.attachmentLabel', {
                    fileName: item.attachment.fileName,
                  })}
                  onPress={() => onOpenAttachment?.(item.attachment!)}
                  style={styles.attachmentCard}
                >
                  {item.attachment.kind === 'image' ? (
                    <ImageIcon size={20} color={theme.colors.accent} />
                  ) : item.attachment.kind === 'video' ? (
                    <Film size={20} color={theme.colors.accent} />
                  ) : item.attachment.kind === 'audio' ? (
                    <Mic size={20} color={theme.colors.accent} />
                  ) : (
                    <FileText size={20} color={theme.colors.accent} />
                  )}
                  <View style={styles.attachmentCardCopy}>
                    <Text numberOfLines={1} style={styles.attachmentName}>
                      {item.attachment.fileName}
                    </Text>
                    <Text style={styles.attachmentAction}>
                      {t('chat.attachment.open')}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              <Text style={styles.content}>{item.content}</Text>
              {item.timestamp ? (
                <Text style={styles.timestamp}>
                  {formatDateTime(item.timestamp)}
                </Text>
              ) : null}
            </View>
          )}
        />
        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.attach')}
            disabled={sending || !channel}
            onPress={() => setAttachmentMenuOpen(true)}
            style={[
              styles.attachButton,
              sending || !channel ? styles.disabled : null,
            ]}
          >
            <Plus size={20} color={theme.colors.accent} />
          </Pressable>
          <MostTextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.messagePlaceholder')}
            multiline
            style={styles.draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            disabled={sending || !draft.trim()}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              sending || !draft.trim() ? styles.disabled : null,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={theme.colors.onAccent} />
            ) : (
              <Send size={18} color={theme.colors.onAccent} />
            )}
          </Pressable>
        </View>
      </View>
      <Modal
        animationType="slide"
        transparent
        visible={attachmentMenuOpen}
        onRequestClose={() => setAttachmentMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={() => setAttachmentMenuOpen(false)}
          style={styles.attachmentMenuOverlay}
        >
          <Pressable
            onPress={event => event.stopPropagation()}
            style={styles.attachmentMenu}
          >
            <Text style={styles.attachmentMenuTitle}>
              {t('chat.attachmentType')}
            </Text>
            <View style={styles.attachmentMenuGrid}>
              <AttachmentMenuButton
                icon={<ImageIcon size={22} color={theme.colors.accent} />}
                label={t('chat.attachment.image')}
                onPress={() => handleAttachmentMenuSelect('image')}
                styles={styles}
              />
              <AttachmentMenuButton
                icon={<Film size={22} color={theme.colors.accent} />}
                label={t('chat.attachment.video')}
                onPress={() => handleAttachmentMenuSelect('video')}
                styles={styles}
              />
              <AttachmentMenuButton
                icon={<FileText size={22} color={theme.colors.accent} />}
                label={t('chat.attachment.file')}
                onPress={() => handleAttachmentMenuSelect('file')}
                styles={styles}
              />
              <AttachmentMenuButton
                icon={<Mic size={22} color={theme.colors.accent} />}
                label={t('chat.voice.menu')}
                onPress={() => handleAttachmentMenuSelect('voice')}
                styles={styles}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  )
}

function AttachmentMenuButton({
  icon,
  label,
  onPress,
  styles,
}: {
  icon: ReactNode
  label: string
  onPress: () => void
  styles: ReturnType<typeof chatStyles>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.attachmentMenuButton,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.attachmentMenuIcon}>{icon}</View>
      <Text style={styles.attachmentMenuLabel}>{label}</Text>
    </Pressable>
  )
}

function chatStyles(theme: ReturnType<typeof useMostBoxTheme>) {
  const { colors, radii } = theme
  return StyleSheet.create({
    container: { flex: 1, padding: 14, gap: 10 },
    listToolbar: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    searchBox: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
    },
    searchInput: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      flex: 1,
      minHeight: 40,
      paddingHorizontal: 0,
    },
    addButton: {
      alignItems: 'center',
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    conversationList: { paddingVertical: 4 },
    conversationRow: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 70,
      paddingHorizontal: 4,
      paddingVertical: 10,
    },
    conversationPinned: { backgroundColor: colors.surfaceSubtle },
    avatar: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.medium,
      height: 46,
      justifyContent: 'center',
      width: 46,
    },
    avatarImage: { height: '100%', width: '100%' },
    avatarText: { color: colors.accent, fontSize: 19, fontWeight: '700' },
    conversationMain: { flex: 1, gap: 5, minWidth: 0 },
    conversationTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    conversationTitle: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
    },
    conversationTime: { color: colors.textMuted, fontSize: 11 },
    conversationPreviewRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    conversationPreview: { color: colors.textSecondary, flex: 1, fontSize: 13 },
    unreadBadge: {
      alignItems: 'center',
      backgroundColor: colors.danger,
      borderRadius: radii.full,
      minWidth: 19,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    unreadText: { color: colors.onAccent, fontSize: 10, fontWeight: '700' },
    pressed: { opacity: 0.68 },
    detailHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 42 },
    backButton: {
      alignItems: 'center',
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    detailTitle: {
      color: colors.text,
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    joinRow: { flexDirection: 'row', gap: 8 },
    channelInput: { flex: 1 },
    channelListView: { flexGrow: 0, height: 42 },
    channelList: { gap: 8 },
    voiceCard: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      gap: 7,
      padding: 10,
    },
    voiceHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    voiceTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    voiceTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    voiceCount: { alignItems: 'center', flexDirection: 'row', gap: 3 },
    voiceCountText: { color: colors.textSecondary, fontSize: 12 },
    voiceActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    voiceIconButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.full,
      borderWidth: 1,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    voiceParticipants: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    voiceParticipant: { color: colors.textSecondary, fontSize: 12 },
    voiceHint: { color: colors.textMuted, fontSize: 12 },
    voiceError: { color: colors.danger, fontSize: 12 },
    channelChip: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    channelChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    channelText: { color: colors.textSecondary },
    channelTextActive: { color: colors.accent, fontWeight: '700' },
    messagesCard: {
      flex: 1,
      minHeight: 180,
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    messages: { padding: 12, gap: 8, flexGrow: 1 },
    message: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceSubtle,
      borderRadius: radii.medium,
      maxWidth: '86%',
      padding: 9,
    },
    messageMine: { alignSelf: 'flex-end', backgroundColor: colors.accentSoft },
    author: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
    attachmentName: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 3,
    },
    attachmentCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceSubtle,
      borderColor: colors.border,
      borderRadius: radii.small,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 9,
      maxWidth: 260,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    attachmentCardCopy: { flex: 1, gap: 2 },
    attachmentAction: { color: colors.textMuted, fontSize: 11 },
    content: { color: colors.text, fontSize: 15, marginTop: 2 },
    timestamp: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
    composer: {
      alignItems: 'flex-end',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 8,
      padding: 10,
    },
    draft: { flex: 1, maxHeight: 100 },
    attachButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.full,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    sendButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: radii.full,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    disabled: { opacity: 0.45 },
    attachmentMenuOverlay: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    attachmentMenu: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderTopLeftRadius: radii.large,
      borderTopRightRadius: radii.large,
      borderWidth: 1,
      paddingBottom: 28,
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    attachmentMenuTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 14,
      textAlign: 'center',
    },
    attachmentMenuGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
    },
    attachmentMenuButton: {
      alignItems: 'center',
      backgroundColor: colors.surfaceSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      gap: 7,
      minHeight: 82,
      paddingHorizontal: 12,
      paddingVertical: 12,
      width: '22%',
    },
    attachmentMenuIcon: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.full,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    attachmentMenuLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      textAlign: 'center',
    },
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
