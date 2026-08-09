import { useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  Hash,
  LogOut,
  MessageCircle,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings,
  Users,
} from 'lucide-react-native'
import type {
  MobileChannel,
  MobileChannelMessage,
} from '../../mobileCore/types'
import {
  filterChannelsForQuery,
  getChannelKey,
  getChannelTitle,
  getMessageSummary,
  hasUnreadChannel,
  sortChannelsForChatList,
  validateChannelName,
  parseChannelJoinInput,
  type ChannelLastReadMap,
} from './chatState'
import { useI18n, type MessageKey } from '../../i18n'

const VALIDATION_MESSAGE_KEYS: Record<string, MessageKey> = {
  '频道 ID 至少 3 个字符': 'chat.validation.tooShort',
  '频道 ID 最多 30 个字符': 'chat.validation.tooLong',
  '点号为系统保留，不能用于手动频道 ID': 'chat.validation.reservedDot',
  '频道 ID 只能包含字母、数字、下划线和连字符':
    'chat.validation.invalidCharacters',
}

export type ChatListScreenProps = {
  channels: MobileChannel[]
  messagesByChannel: Record<string, MobileChannelMessage[]>
  lastReadAt: ChannelLastReadMap
  searchInput: string
  channelInput: string
  busy: boolean
  onSearchInputChange: (value: string) => void
  onChannelInputChange: (value: string) => void
  onGenerateChannelId: () => void | Promise<void>
  onOpenChannel: (channel: MobileChannel) => void
  onOpenChannelId: (name: string) => void | Promise<void>
  onTogglePin: (channel: MobileChannel) => void | Promise<void>
  onRename: (channel: MobileChannel) => void | Promise<void>
  onLeave: (channel: MobileChannel) => void
}

export function ChatListScreen({
  channels,
  messagesByChannel,
  lastReadAt,
  searchInput,
  channelInput,
  busy,
  onSearchInputChange,
  onChannelInputChange,
  onGenerateChannelId,
  onOpenChannel,
  onOpenChannelId,
  onTogglePin,
  onRename,
  onLeave,
}: ChatListScreenProps) {
  const { t } = useI18n()
  const [editingChannelKey, setEditingChannelKey] = useState('')
  const [remarkDraft, setRemarkDraft] = useState('')

  const visibleChannels = useMemo(() => {
    return filterChannelsForQuery(
      sortChannelsForChatList(channels),
      searchInput
    )
  }, [channels, searchInput])

  const handleOpenPress = () => {
    const validation = validateChannelName(parseChannelJoinInput(channelInput))
    if (!validation.valid) {
      const messageKey = VALIDATION_MESSAGE_KEYS[validation.message]
      Alert.alert(
        t('chat.list.openFailed'),
        messageKey ? t(messageKey) : validation.message
      )
      return
    }

    void onOpenChannelId(validation.name)
  }

  const handleStartRename = (channel: MobileChannel) => {
    const channelKey = getChannelKey(channel)
    setEditingChannelKey(channelKey)
    setRemarkDraft(channel.remark)
  }

  const handleCancelRename = () => {
    setEditingChannelKey('')
    setRemarkDraft('')
  }

  const handleSaveRename = async (channel: MobileChannel) => {
    const channelKey = getChannelKey(channel)
    if (!channelKey) return

    try {
      await onRename({
        ...channel,
        remark: remarkDraft.trim(),
      })
      setEditingChannelKey('')
      setRemarkDraft('')
    } catch {
      // App owns user-facing error alerts; keep the inline editor open.
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>MostBox</Text>
        <Text style={styles.title}>{t('chat.list.title')}</Text>
        <Text style={styles.subtitle}>{t('chat.list.subtitle')}</Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.inputHeader}>
          <Search size={18} color="#0f766e" />
          <Text style={styles.inputHeaderText}>
            {t('chat.list.searchTitle')}
          </Text>
        </View>
        <View style={styles.inputShell}>
          <TextInput
            value={searchInput}
            onChangeText={onSearchInputChange}
            placeholder={t('chat.list.searchPlaceholder')}
            placeholderTextColor="#7b8c86"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.inputHeader}>
          <Hash size={18} color="#2563eb" />
          <Text style={styles.inputHeaderText}>{t('chat.list.openTitle')}</Text>
        </View>
        <Text style={styles.inputHint}>{t('chat.list.openHint')}</Text>
        <View style={styles.joinRow}>
          <View style={styles.joinInputShell}>
            <TextInput
              value={channelInput}
              onChangeText={onChannelInputChange}
              placeholder={t('chat.list.openPlaceholder')}
              placeholderTextColor="#7b8c86"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.list.randomId')}
            disabled={busy}
            onPress={() => {
              void onGenerateChannelId()
            }}
            style={[styles.generateButton, busy ? styles.actionDisabled : null]}
          >
            <RefreshCw size={17} color={busy ? '#94a3a0' : '#2563eb'} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={handleOpenPress}
            style={[styles.joinButton, busy ? styles.actionDisabled : null]}
          >
            <Text
              style={[
                styles.joinButtonText,
                busy ? styles.actionDisabledText : null,
              ]}
            >
              {t('chat.list.openAction')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{t('chat.list.section')}</Text>
        <Text style={styles.listMeta}>
          {t(
            visibleChannels.length === 1
              ? 'chat.list.count.one'
              : 'chat.list.count',
            { count: visibleChannels.length }
          )}
        </Text>
      </View>

      {visibleChannels.length ? (
        <View style={styles.channelList}>
          {visibleChannels.map(channel => {
            const channelKey = getChannelKey(channel)
            const messages = messagesByChannel[channelKey] || []
            const latestMessage = messages[messages.length - 1]
            const summary =
              getMessageSummary(latestMessage, t('chat.room.unknownAuthor')) ||
              t('chat.list.noMessages')
            const unread = hasUnreadChannel(channel, lastReadAt)
            const editing = editingChannelKey === channelKey

            return (
              <View key={channelKey} style={styles.channelRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onOpenChannel(channel)}
                  style={[
                    styles.channelMain,
                    busy ? styles.channelMainDisabled : null,
                  ]}
                >
                  <View style={styles.channelTitleRow}>
                    {channel.pinned ? (
                      <View style={styles.pinnedBadge}>
                        <Pin size={12} color="#92400e" />
                        <Text style={styles.pinnedBadgeText}>
                          {t('chat.list.pinned')}
                        </Text>
                      </View>
                    ) : null}
                    <Text numberOfLines={1} style={styles.channelTitle}>
                      {getChannelTitle(channel)}
                    </Text>
                    {unread ? <View style={styles.unreadDot} /> : null}
                  </View>

                  <Text numberOfLines={2} style={styles.channelSummary}>
                    {summary}
                  </Text>

                  <View style={styles.channelMetaRow}>
                    <View style={styles.peerPill}>
                      <Users size={13} color="#0f766e" />
                      <Text style={styles.peerPillText}>
                        {channel.peerCount} peer
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.channelKey}>
                      {channelKey}
                    </Text>
                  </View>
                </Pressable>

                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      void onTogglePin(channel)
                    }}
                    style={[
                      styles.rowAction,
                      channel.pinned ? styles.rowActionActive : null,
                      busy ? styles.actionDisabled : null,
                    ]}
                  >
                    {channel.pinned ? (
                      <PinOff size={15} color="#92400e" />
                    ) : (
                      <Pin size={15} color="#0f766e" />
                    )}
                    <Text
                      style={[
                        styles.rowActionText,
                        channel.pinned ? styles.rowActionActiveText : null,
                        busy ? styles.actionDisabledText : null,
                      ]}
                    >
                      {channel.pinned
                        ? t('chat.list.unpin')
                        : t('chat.list.pinned')}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => handleStartRename(channel)}
                    style={[
                      styles.rowAction,
                      editing ? styles.rowActionActive : null,
                      busy ? styles.actionDisabled : null,
                    ]}
                  >
                    <Settings size={15} color="#2563eb" />
                    <Text
                      style={[
                        styles.rowActionText,
                        editing ? styles.rowActionActiveText : null,
                        busy ? styles.actionDisabledText : null,
                      ]}
                    >
                      {t('chat.list.rename')}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onLeave(channel)}
                    style={[
                      styles.rowAction,
                      styles.rowActionDanger,
                      busy ? styles.actionDisabled : null,
                    ]}
                  >
                    <LogOut size={15} color="#b91c1c" />
                    <Text
                      style={[
                        styles.rowActionText,
                        styles.rowActionDangerText,
                        busy ? styles.actionDisabledText : null,
                      ]}
                    >
                      {t('chat.list.leave')}
                    </Text>
                  </Pressable>
                </View>

                {editing ? (
                  <View style={styles.remarkEditor}>
                    <Text style={styles.remarkLabel}>
                      {t('chat.list.remark')}
                    </Text>
                    <View style={styles.remarkInputShell}>
                      <TextInput
                        value={remarkDraft}
                        onChangeText={setRemarkDraft}
                        placeholder={t('chat.list.remarkPlaceholder')}
                        placeholderTextColor="#7b8c86"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.remarkActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => {
                          void handleSaveRename(channel)
                        }}
                        style={[
                          styles.remarkAction,
                          styles.remarkActionPrimary,
                          busy ? styles.actionDisabled : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.remarkActionPrimaryText,
                            busy ? styles.actionDisabledText : null,
                          ]}
                        >
                          {t('common.save')}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={handleCancelRename}
                        style={[
                          styles.remarkAction,
                          busy ? styles.actionDisabled : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.remarkActionText,
                            busy ? styles.actionDisabledText : null,
                          ]}
                        >
                          {t('common.cancel')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MessageCircle size={28} color="#0f766e" />
          <Text style={styles.emptyTitle}>{t('chat.list.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('chat.list.emptyBody')}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 96,
    gap: 14,
    backgroundColor: '#f4f7f5',
  },
  hero: {
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: '#0d3b35',
  },
  brand: {
    color: '#a7f3d0',
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#d5f5ec',
    fontSize: 13,
    fontWeight: '700',
  },
  panel: {
    gap: 10,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  inputHeader: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputHeaderText: {
    color: '#13231f',
    fontSize: 15,
    fontWeight: '900',
  },
  inputHint: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  inputShell: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cddbd5',
    backgroundColor: '#f8fbf9',
  },
  joinRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 9,
  },
  joinInputShell: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cddbd5',
    backgroundColor: '#f8fbf9',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#13231f',
    fontSize: 14,
    fontWeight: '700',
  },
  joinButton: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  generateButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  listHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
  },
  listTitle: {
    color: '#13231f',
    fontSize: 17,
    fontWeight: '900',
  },
  listMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '800',
  },
  channelList: {
    gap: 10,
    marginHorizontal: 16,
  },
  channelRow: {
    minHeight: 150,
    gap: 11,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  channelMain: {
    minHeight: 82,
    gap: 7,
  },
  channelMainDisabled: {
    opacity: 0.6,
  },
  channelTitleRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinnedBadge: {
    minWidth: 48,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
  },
  pinnedBadgeText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '900',
  },
  channelTitle: {
    flex: 1,
    color: '#13231f',
    fontSize: 17,
    fontWeight: '900',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  channelSummary: {
    minHeight: 36,
    color: '#42534d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  channelMetaRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peerPill: {
    minWidth: 76,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
  },
  peerPillText: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
  },
  channelKey: {
    flex: 1,
    color: '#7b8c86',
    fontSize: 11,
    fontWeight: '800',
  },
  rowActions: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowAction: {
    flex: 1,
    minWidth: 74,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5e3dd',
    backgroundColor: '#f8fbf9',
  },
  rowActionActive: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  rowActionDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  rowActionText: {
    color: '#13231f',
    fontSize: 12,
    fontWeight: '900',
  },
  rowActionActiveText: {
    color: '#92400e',
  },
  rowActionDangerText: {
    color: '#b91c1c',
  },
  remarkEditor: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#f8fbf9',
  },
  remarkLabel: {
    color: '#13231f',
    fontSize: 13,
    fontWeight: '900',
  },
  remarkInputShell: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cddbd5',
    backgroundColor: '#ffffff',
  },
  remarkActions: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  remarkAction: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5e3dd',
    backgroundColor: '#ffffff',
  },
  remarkActionPrimary: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  remarkActionText: {
    color: '#13231f',
    fontSize: 13,
    fontWeight: '900',
  },
  remarkActionPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  actionDisabled: {
    borderColor: '#d9e2de',
    backgroundColor: '#edf2ef',
  },
  actionDisabledText: {
    color: '#94a3a0',
  },
  emptyState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  emptyTitle: {
    color: '#13231f',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyBody: {
    color: '#63716c',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
})
