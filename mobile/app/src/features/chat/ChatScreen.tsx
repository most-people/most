import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { MessageCircle, Paperclip, Plus, Send } from 'lucide-react-native'
import {
  ChatApiClient,
  mergeChatMessages,
  type ChatAttachment,
  type ChatMessage,
} from '../../chat/chatProtocol'
import { ChatWebSocketSession } from '../../chat/chatWebSocket'
import type {
  MobileCoreSnapshot,
  MobileIdentity,
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
  onPublishAttachment: () => Promise<ChatAttachment | null>
}

export function ChatScreen({
  client,
  snapshot,
  onPublishAttachment,
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
  const [channelInput, setChannelInput] = useState('')
  const [channel, setChannel] = useState('')
  const [channels, setChannels] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => () => socketRef.current?.close(), [])

  useEffect(() => {
    if (!api && !localMode) return
    let active = true
    const request = localMode
      ? bridge.listChannels?.() || Promise.resolve([])
      : api?.listChannels() || Promise.resolve([])
    void request
      .then(items => {
        if (!active) return
        const names = items
          .map(item =>
            String(item.channelKey || item.channelId || item.name || '').trim()
          )
          .filter(Boolean)
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

  const loadChannel = async (name: string) => {
    if ((!api && !localMode) || !name) return
    setLoading(true)
    try {
      const localMessages = localMode
        ? await bridge.getChannelMessages?.(name)
        : null
      const page = localMode
        ? null
        : await api?.getHistory(name, { limit: 100 })
      setChannel(name)
      setMessages(localMode ? localMessages || [] : page?.messages || [])
      socketRef.current?.close()
      if (!localMode && api) {
        const session = new ChatWebSocketSession({
          baseUrl: endpoint,
          invite,
          identity,
          onEvent: event => {
            if (event.event === 'channel:message' && event.channel === name)
              setMessages(current =>
                mergeChatMessages(current, [event.message])
              )
          },
        })
        socketRef.current = session
        await session.subscribe(name)
      }
      if (!channels.includes(name)) setChannels(current => [...current, name])
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
    const name = channelInput.trim().replace(/^#/, '')
    if (!name || (!api && !localMode)) return
    setLoading(true)
    try {
      if (localMode) await bridge.createChannel?.({ name, type: 'public' })
      else await api?.createOrJoinChannel({ name, displayName: name })
      setChannelInput('')
      await loadChannel(name)
    } catch (error) {
      toast(
        error instanceof Error ? error.message : t('chat.joinFailed'),
        'error'
      )
      setLoading(false)
    }
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
      style={styles.container}
    >
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
      {channels.length > 0 ? (
        <FlatList
          horizontal
          data={channels}
          keyExtractor={item => item}
          contentContainerStyle={styles.channelList}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void loadChannel(item)}
              style={[
                styles.channelChip,
                item === channel ? styles.channelChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.channelText,
                  item === channel ? styles.channelTextActive : null,
                ]}
              >
                #{item}
              </Text>
            </Pressable>
          )}
        />
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
                <Text style={styles.attachmentName}>
                  {t('chat.attachmentLabel', {
                    fileName: item.attachment.fileName,
                  })}
                </Text>
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
            onPress={() => void sendAttachment()}
            style={[
              styles.attachButton,
              sending || !channel ? styles.disabled : null,
            ]}
          >
            <Paperclip size={18} color={theme.colors.accent} />
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
    </KeyboardAvoidingView>
  )
}

function chatStyles(theme: ReturnType<typeof useMostBoxTheme>) {
  const { colors, radii } = theme
  return StyleSheet.create({
    container: { flex: 1, padding: 14, gap: 10 },
    joinRow: { flexDirection: 'row', gap: 8 },
    channelInput: { flex: 1 },
    channelList: { gap: 8 },
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
      ...getGlassSurfaceStyle(theme),
      flex: 1,
      minHeight: 180,
      overflow: 'hidden',
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
