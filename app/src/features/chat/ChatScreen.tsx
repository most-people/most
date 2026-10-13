import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Camera,
  FileText,
  Keyboard as KeyboardIcon,
  MessageCircle,
  Minimize2,
  UserRound,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Plus,
  Smile,
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
  MostButton,
  MostTextInput,
  getGlassSurfaceStyle,
} from '../../ui/components'
import { useFeedback } from '../../ui/feedback'
import { useMostBoxTheme } from '../../ui/theme'

const FIXTURE_CHANNELS = ['产品讨论', '文件分享', '开发联调']
const FIXTURE_CHANNEL_PREVIEWS: Record<string, string> = {
  产品讨论: '欢迎加入产品讨论群',
  文件分享: '可以在这里发送 most:// 链接',
  开发联调: '第三方接入调试频道',
}
const FIXTURE_MESSAGES: Record<string, ChatMessage[]> = {
  产品讨论: [
    {
      id: 'fixture-product-1',
      content: '欢迎加入产品讨论群，新的消息会实时同步。',
      author: 'fixture-product',
      authorName: 'MostBox 小助手',
      timestamp: '2026-10-13T08:00:00.000Z',
    },
  ],
  文件分享: [
    {
      id: 'fixture-files-1',
      content: '可以在这里发送 most:// 链接，下载完成后会自动继续做种。',
      author: 'fixture-files',
      authorName: '文件助手',
      timestamp: '2026-10-13T08:06:00.000Z',
    },
  ],
  开发联调: [
    {
      id: 'fixture-dev-1',
      content: '这是第三方接入调试频道，适合验证邀请和消息协议。',
      author: 'fixture-dev',
      authorName: '开发联调',
      timestamp: '2026-10-13T08:12:00.000Z',
    },
  ],
}

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
  getChannelMessages?: (name: string) => Promise<MobileChannelMessage[]>
  sendChannelMessage?: (
    input: SendChannelMessageInput
  ) => Promise<MobileChannelMessage>
}

export type ChatScreenProps = {
  client: MostBoxMobileCore
  snapshot: MobileCoreSnapshot
  openChannelRequest?: { channel: string; token: number } | null
  onDetailChange?: (open: boolean) => void
  onPublishAttachment: () => Promise<ChatAttachment | null>
  onReceiveAttachment: (attachment: ChatAttachment) => void
  onOpenAttachment: (holding: MobileHolding) => void | Promise<void>
}

export function ChatScreen({
  client,
  snapshot,
  openChannelRequest,
  onDetailChange,
  onPublishAttachment,
  onReceiveAttachment,
  onOpenAttachment,
}: ChatScreenProps) {
  const { t, formatDateTime } = useI18n()
  const theme = useMostBoxTheme()
  const styles = chatStyles(theme)
  const { toast } = useFeedback()
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
  const [channelInput, setChannelInput] = useState('')
  const [channel, setChannel] = useState('')
  const [chatOpen, setChatOpen] = useState(() => Boolean(getInitialChatRoute()))
  const [channels, setChannels] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
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
  const [recordingVoiceMessage, setRecordingVoiceMessage] = useState(false)
  const visibleChannels = channels.length ? channels : FIXTURE_CHANNELS
  const visibleMessages =
    messages.length || !channel ? messages : FIXTURE_MESSAGES[channel] || []

  useEffect(() => {
    onDetailChange?.(chatOpen)
  }, [chatOpen, onDetailChange])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onRouteChange = () => {
      const nextChannel = getInitialChatRoute()
      setChatOpen(Boolean(nextChannel))
      onDetailChange?.(Boolean(nextChannel))
      if (channel !== nextChannel) setMessages([])
      setChannel(nextChannel)
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
    if (!api && !localMode) return
    let active = true
    const request = localMode
      ? bridge.listChannels?.() || Promise.resolve([])
      : api?.listChannels() || Promise.resolve([])
    void request
      .then(items => {
        if (!active) return
        const names = [
          ...new Set(
            items
              .map(item =>
                normalizeChatChannel(
                  String(item.channelKey || item.channelId || item.name || '')
                )
              )
              .filter(Boolean)
          ),
        ]
        setChannels(names)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, bridge, localMode])

  useEffect(() => {
    if (!localMode || !channel) return
    const items = snapshot.channelMessages?.[channel]
    if (items) setMessages(items)
  }, [channel, localMode, snapshot.channelMessages])

  const loadChannel = useCallback(
    async (name: string) => {
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
        socketRef.current?.close()
        if (!localMode && api) {
          const session = new ChatWebSocketSession({
            baseUrl: endpoint,
            invite,
            identity,
            onEvent: event => {
              if (
                event.event === 'channel:message' &&
                normalizeChatChannel(event.channel) === normalizedName
              )
                setMessages(current =>
                  mergeChatMessages(current, [event.message])
                )
            },
          })
          socketRef.current = session
          await session.subscribe(normalizedName)
        }
        setChannels(current =>
          current.includes(normalizedName)
            ? current
            : [...current, normalizedName]
        )
      } catch (error) {
        toast(
          error instanceof Error ? error.message : t('chat.loadFailed'),
          'error'
        )
      } finally {
        setLoading(false)
      }
    },
    [api, bridge, endpoint, identity, invite, localMode, t, toast]
  )

  const joinChannel = async () => {
    const name = normalizeChatChannel(channelInput)
    if (!name || (!api && !localMode)) return
    setLoading(true)
    try {
      if (localMode) await bridge.createChannel?.({ name, type: 'public' })
      else await api?.createOrJoinChannel({ name, displayName: name })
      setChannelInput('')
      await loadChannel(name)
      setChatOpen(true)
      updateChatRoute(name)
    } catch (error) {
      toast(
        error instanceof Error ? error.message : t('chat.joinFailed'),
        'error'
      )
      setLoading(false)
    }
  }

  const openChannel = async (name: string) => {
    await loadChannel(name)
    setChatOpen(true)
    updateChatRoute(normalizeChatChannel(name))
  }

  useEffect(() => {
    const requestToken = openChannelRequest?.token
    const requestedChannel = normalizeChatChannel(
      openChannelRequest?.channel || ''
    )
    if (
      !requestedChannel ||
      requestToken === undefined ||
      lastOpenChannelTokenRef.current === requestToken
    )
      return
    lastOpenChannelTokenRef.current = requestToken
    void loadChannel(requestedChannel).then(() => {
      setChatOpen(true)
      updateChatRoute(requestedChannel)
    })
  }, [loadChannel, openChannelRequest?.token])

  useEffect(() => {
    const routeChannel = getInitialChatRoute()
    if (!chatOpen || channel || !routeChannel || !channels.length) return
    void loadChannel(routeChannel)
  }, [chatOpen, channel, channels.length, loadChannel])

  const closeChannel = () => {
    voiceSessionRef.current?.leave()
    setVoiceJoined(false)
    setCallSheetOpen(false)
    setActionSheetOpen(false)
    setEmojiOpen(false)
    setComposerMode('keyboard')
    setChatOpen(false)
    onDetailChange?.(false)
    updateChatRoute()
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

  const sendAttachment = async () => {
    if ((!api && !localMode) || !channel || (!identity && !localMode)) return
    setSending(true)
    try {
      const attachment = await onPublishAttachment()
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

  const appendEmoji = (emoji: string) => {
    setDraft(current => `${current}${emoji}`)
    setEmojiOpen(false)
  }

  const startVoiceMessage = () => {
    if (!channel || sending) return
    setRecordingVoiceMessage(true)
  }

  const stopVoiceMessage = () => {
    if (!recordingVoiceMessage) return
    setRecordingVoiceMessage(false)
    toast(t('chat.voiceMessageUnavailable'), 'info')
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, chatOpen ? styles.detailContainer : null]}
    >
      {!chatOpen ? (
        <>
          <View style={styles.joinRow}>
            <MostTextInput
              value={channelInput}
              onChangeText={setChannelInput}
              onSubmitEditing={joinChannel}
              placeholder={t('chat.channelPlaceholder')}
              style={styles.channelInput}
              autoCapitalize="none"
            />
            <MostButton
              disabled={loading || !channelInput.trim()}
              onPress={joinChannel}
              variant="primary"
              icon={<Plus size={16} color={theme.colors.onAccent} />}
            >
              {t('chat.join')}
            </MostButton>
          </View>
          <View style={styles.channelListCard}>
            <FlatList
              data={visibleChannels}
              keyExtractor={item => item}
              contentContainerStyle={styles.channelList}
              ListEmptyComponent={
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyBody}>
                    {t('chat.chooseChannel')}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => void openChannel(item)}
                  style={({ pressed }) => [
                    styles.channelRow,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.channelAvatar}>
                    <MessageCircle size={18} color={theme.colors.accent} />
                  </View>
                  <View style={styles.channelRowText}>
                    <Text style={styles.channelText}>#{item}</Text>
                    <Text numberOfLines={1} style={styles.channelPreview}>
                      {FIXTURE_CHANNEL_PREVIEWS[item] || t('chat.openHint')}
                    </Text>
                  </View>
                  <View style={styles.channelMeta}>
                    <Text style={styles.channelTime}>08:12</Text>
                    <Text style={styles.channelChevron}>›</Text>
                  </View>
                </Pressable>
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
              #{channel}
            </Text>
            {channel ? (
              <View style={styles.detailActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.voiceRoom')}
                  onPress={() => setCallSheetOpen(true)}
                  style={styles.detailActionButton}
                >
                  <PhoneCall size={19} color={theme.colors.accent} />
                </Pressable>
                {voiceJoined && voiceState ? (
                  <Text style={styles.detailActionCount}>
                    {Object.keys(voiceState.participants).length}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.detailHeaderSpacer} />
            )}
          </View>
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
              data={visibleMessages}
              keyExtractor={(item, index) =>
                item.id ||
                item.clientMessageId ||
                `${item.author}-${item.timestamp}-${index}`
              }
              contentContainerStyle={styles.messages}
              renderItem={({ item }) => {
                const mine = item.author === identity?.address
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
                return (
                  <View
                    style={[styles.message, mine ? styles.messageMine : null]}
                  >
                    <Text
                      style={[
                        styles.author,
                        mine ? styles.messageMineMeta : null,
                      ]}
                    >
                      {item.authorName}
                    </Text>
                    {attachment ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${attachment.fileName}, ${actionLabel}`}
                        disabled={state?.status === 'running'}
                        onPress={() => {
                          if (state?.holding)
                            void onOpenAttachment(state.holding)
                          else onReceiveAttachment(attachment)
                        }}
                        style={styles.attachmentButton}
                      >
                        <Text
                          style={[
                            styles.attachmentName,
                            mine ? styles.messageMineText : null,
                          ]}
                        >
                          {t('chat.attachmentLabel', {
                            fileName: attachment.fileName,
                          })}
                        </Text>
                        {typeof attachment.size === 'number' ? (
                          <Text
                            style={[
                              styles.attachmentDetails,
                              mine ? styles.messageMineMeta : null,
                            ]}
                          >
                            {formatAttachmentSize(attachment.size)}
                          </Text>
                        ) : null}
                        <Text
                          style={[
                            styles.attachmentAction,
                            mine ? styles.messageMineText : null,
                          ]}
                        >
                          {actionLabel}
                        </Text>
                      </Pressable>
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
                    {item.timestamp ? (
                      <Text
                        style={[
                          styles.timestamp,
                          mine ? styles.messageMineMeta : null,
                        ]}
                      >
                        {formatDateTime(item.timestamp)}
                      </Text>
                    ) : null}
                  </View>
                )
              }}
            />
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
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => setEmojiOpen(false)}
                  placeholder={t('chat.messagePlaceholder')}
                  multiline
                  style={styles.draft}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.holdToTalk')}
                  disabled={sending || !channel}
                  onPressIn={startVoiceMessage}
                  onPressOut={stopVoiceMessage}
                  style={[
                    styles.voiceMessageButton,
                    recordingVoiceMessage
                      ? styles.voiceMessageButtonActive
                      : null,
                    sending || !channel ? styles.disabled : null,
                  ]}
                >
                  <Text style={styles.voiceMessageText}>
                    {recordingVoiceMessage
                      ? t('chat.releaseToSend')
                      : t('chat.holdToTalk')}
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.emoji')}
                onPress={() => setEmojiOpen(current => !current)}
                style={styles.composerIconButton}
              >
                <Smile size={22} color={theme.colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.moreActions')}
                disabled={sending || !channel}
                onPress={() => setActionSheetOpen(true)}
                style={[
                  styles.composerIconButton,
                  sending || !channel ? styles.disabled : null,
                ]}
              >
                <Plus size={23} color={theme.colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.send')}
                disabled={sending || !draft.trim() || !channel}
                onPress={() => void send()}
                style={[
                  styles.sendButton,
                  sending || !draft.trim() || !channel ? styles.disabled : null,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={theme.colors.onAccent} />
                ) : (
                  <Text style={styles.sendLabel}>{t('chat.sendShort')}</Text>
                )}
              </Pressable>
            </View>
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
                      toast(t('chat.mediaUnavailable'), 'info')
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
    </KeyboardAvoidingView>
  )
}

function chatStyles(theme: ReturnType<typeof useMostBoxTheme>) {
  const { colors, radii } = theme
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
    detailContainer: { padding: 0 },
    joinRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
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
    channelRow: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
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
    message: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceSubtle,
      borderRadius: 4,
      maxWidth: '86%',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    messageMine: { alignSelf: 'flex-end', backgroundColor: '#95ec69' },
    messageMineText: { color: '#152515' },
    messageMineMeta: { color: '#36552c' },
    author: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
    attachmentName: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 3,
    },
    attachmentButton: { paddingVertical: 7, paddingHorizontal: 3 },
    attachmentDetails: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    attachmentAction: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 5,
    },
    content: { color: colors.text, fontSize: 15, marginTop: 2 },
    timestamp: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
    composer: {
      alignItems: 'flex-end',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    draft: { flex: 1, maxHeight: 100 },
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
      gap: 6,
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
