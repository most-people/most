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
  LogOut,
  MessageCircle,
  Pin,
  PinOff,
  Plus,
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
  type ChannelLastReadMap,
} from './chatState'

export type ChatListScreenProps = {
  channels: MobileChannel[]
  messagesByChannel: Record<string, MobileChannelMessage[]>
  lastReadAt: ChannelLastReadMap
  searchInput: string
  joinInput: string
  joinPlaceholder: string
  busy: boolean
  onSearchInputChange: (value: string) => void
  onJoinInputChange: (value: string) => void
  onOpenChannel: (channel: MobileChannel) => void
  onJoinChannel: (name: string) => void | Promise<void>
  onTogglePin: (channel: MobileChannel) => void | Promise<void>
  onRename: (channel: MobileChannel) => void | Promise<void>
  onLeave: (channel: MobileChannel) => void
}

export function ChatListScreen({
  channels,
  messagesByChannel,
  lastReadAt,
  searchInput,
  joinInput,
  joinPlaceholder,
  busy,
  onSearchInputChange,
  onJoinInputChange,
  onOpenChannel,
  onJoinChannel,
  onTogglePin,
  onRename,
  onLeave,
}: ChatListScreenProps) {
  const [editingChannelKey, setEditingChannelKey] = useState('')
  const [remarkDraft, setRemarkDraft] = useState('')

  const visibleChannels = useMemo(() => {
    return filterChannelsForQuery(
      sortChannelsForChatList(channels),
      searchInput
    )
  }, [channels, searchInput])

  const handleJoinPress = () => {
    const validation = validateChannelName(joinInput)
    if (!validation.valid) {
      Alert.alert('无法加入聊天', validation.message)
      return
    }

    void onJoinChannel(validation.name)
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
        <Text style={styles.title}>聊天频道</Text>
        <Text style={styles.subtitle}>
          选择频道继续聊天，或加入一个新的频道。
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.inputHeader}>
          <Search size={18} color="#0f766e" />
          <Text style={styles.inputHeaderText}>搜索频道</Text>
        </View>
        <View style={styles.inputShell}>
          <TextInput
            value={searchInput}
            onChangeText={onSearchInputChange}
            placeholder="输入频道名、备注或 key"
            placeholderTextColor="#7b8c86"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.inputHeader}>
          <Plus size={18} color="#2563eb" />
          <Text style={styles.inputHeaderText}>加入或新建频道</Text>
        </View>
        <View style={styles.joinRow}>
          <View style={styles.joinInputShell}>
            <TextInput
              value={joinInput}
              onChangeText={onJoinInputChange}
              placeholder={joinPlaceholder}
              placeholderTextColor="#7b8c86"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={handleJoinPress}
            style={[styles.joinButton, busy ? styles.actionDisabled : null]}
          >
            <Text
              style={[
                styles.joinButtonText,
                busy ? styles.actionDisabledText : null,
              ]}
            >
              加入
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>频道列表</Text>
        <Text style={styles.listMeta}>{visibleChannels.length} 个频道</Text>
      </View>

      {visibleChannels.length ? (
        <View style={styles.channelList}>
          {visibleChannels.map(channel => {
            const channelKey = getChannelKey(channel)
            const messages = messagesByChannel[channelKey] || []
            const latestMessage = messages[messages.length - 1]
            const summary =
              getMessageSummary(latestMessage) || '暂无消息，开始聊天吧'
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
                        <Text style={styles.pinnedBadgeText}>置顶</Text>
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
                      {channel.pinned ? '取消' : '置顶'}
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
                      改名
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
                      退出
                    </Text>
                  </Pressable>
                </View>

                {editing ? (
                  <View style={styles.remarkEditor}>
                    <Text style={styles.remarkLabel}>备注</Text>
                    <View style={styles.remarkInputShell}>
                      <TextInput
                        value={remarkDraft}
                        onChangeText={setRemarkDraft}
                        placeholder="留空则使用频道名"
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
                          保存
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
                          取消
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
          <Text style={styles.emptyTitle}>还没有可显示的频道</Text>
          <Text style={styles.emptyBody}>
            可以清空搜索条件，或输入频道名加入一个新频道。
          </Text>
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
