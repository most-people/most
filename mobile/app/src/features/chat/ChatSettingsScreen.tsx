import type { ReactNode } from 'react'
import {
  ArrowLeft,
  Clock,
  Hash,
  LogOut,
  Pin,
  PinOff,
  Save,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react-native'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type {
  MobileChannel,
  MobileChannelPresence,
} from '../../mobileCore/types'
import { getChannelKey, getChannelTitle } from './chatState'
import { shortAddress } from '../../../shared/format-address.mjs'

export type ChatSettingsScreenProps = {
  channel: MobileChannel
  presence: MobileChannelPresence[]
  remarkInput: string
  busy: boolean
  onBack: () => void
  onRemarkChange: (value: string) => void
  onSaveRemark: () => void | Promise<void>
  onTogglePin: () => void | Promise<void>
  onLeave: () => void
}

export function ChatSettingsScreen({
  channel,
  presence,
  remarkInput,
  busy,
  onBack,
  onRemarkChange,
  onSaveRemark,
  onTogglePin,
  onLeave,
}: ChatSettingsScreenProps) {
  const channelKey = getChannelKey(channel)
  const title = getChannelTitle(channel)
  const trimmedRemark = remarkInput.trim()
  const remarkUnchanged = trimmedRemark === channel.remark.trim()
  const saveDisabled = busy || remarkUnchanged
  const onlineCount = presence.filter(member => member.online).length
  const sortedPresence = [...presence].sort((left, right) => {
    if (left.local !== right.local) return left.local ? -1 : 1
    if (left.online !== right.online) return left.online ? -1 : 1
    return getPresenceName(left).localeCompare(getPresenceName(right))
  })

  const handleSaveRemark = () => {
    if (saveDisabled) return

    try {
      void Promise.resolve(onSaveRemark()).catch(() => {
        // App owns user-facing error alerts; keep the settings editor open.
      })
    } catch {
      // App owns user-facing error alerts; keep the settings editor open.
    }
  }

  const handleTogglePin = () => {
    if (busy) return
    void onTogglePin()
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回聊天房间"
          onPress={onBack}
          style={styles.headerIconButton}
        >
          <ArrowLeft size={22} color="#0f766e" />
        </Pressable>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerKicker}>聊天设置</Text>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleGroup}>
              <Users size={18} color="#0f766e" />
              <Text style={styles.sectionTitle}>成员</Text>
            </View>
            <Text style={styles.sectionMeta}>
              {onlineCount}/{presence.length} 在线
            </Text>
          </View>

          {sortedPresence.length ? (
            <View style={styles.memberList}>
              {sortedPresence.map(member => (
                <View
                  key={`${member.address}:${member.sessionId || member.lastSeen}`}
                  style={styles.memberRow}
                >
                  <View
                    style={[
                      styles.memberAvatar,
                      member.online ? styles.memberAvatarOnline : null,
                    ]}
                  >
                    {member.online ? (
                      <Wifi size={16} color="#0f766e" />
                    ) : (
                      <WifiOff size={16} color="#63716c" />
                    )}
                  </View>
                  <View style={styles.memberTextGroup}>
                    <View style={styles.memberTitleRow}>
                      <Text numberOfLines={1} style={styles.memberName}>
                        {getPresenceName(member)}
                      </Text>
                      {member.local ? (
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeText}>本机</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={styles.memberMeta}>
                      {member.online ? '在线' : '离线'} ·{' '}
                      {formatPresenceLastSeen(member.lastSeen)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyMembers}>
              <Text style={styles.emptyTitle}>暂无在线成员</Text>
              <Text style={styles.emptyBody}>
                进入房间后会通过 presence 显示本机和在线 peer。
              </Text>
            </View>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleGroup}>
              <Hash size={18} color="#2563eb" />
              <Text style={styles.sectionTitle}>频道信息</Text>
            </View>
          </View>

          <InfoRow label="Room ID" value={channel.channelId || channel.name} />
          <InfoRow label="Channel key" value={channelKey} />
          <InfoRow
            label="Writers"
            value={String(channel.writerCoreKeys.length)}
          />
          <InfoRow label="Peers" value={String(channel.peerCount)} />
          {channel.createdAt ? (
            <InfoRow
              icon={<Clock size={14} color="#63716c" />}
              label="创建时间"
              value={formatDateTime(channel.createdAt)}
            />
          ) : null}
        </View>

        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleGroup}>
              <Save size={18} color="#0f766e" />
              <Text style={styles.sectionTitle}>备注</Text>
            </View>
            <Text style={styles.sectionMeta}>{remarkInput.length}/50</Text>
          </View>

          <View style={styles.inputShell}>
            <TextInput
              value={remarkInput}
              onChangeText={onRemarkChange}
              placeholder="留空则使用房间 ID"
              placeholderTextColor="#7b8c86"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={handleSaveRemark}
              style={styles.input}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saveDisabled }}
            disabled={saveDisabled}
            onPress={handleSaveRemark}
            style={[
              styles.primaryAction,
              saveDisabled ? styles.actionDisabled : null,
            ]}
          >
            <Save size={16} color={saveDisabled ? '#94a3a0' : '#ffffff'} />
            <Text
              style={[
                styles.primaryActionText,
                saveDisabled ? styles.actionDisabledText : null,
              ]}
            >
              保存备注
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionPanel}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={handleTogglePin}
            style={[
              styles.secondaryAction,
              channel.pinned ? styles.secondaryActionActive : null,
              busy ? styles.actionDisabled : null,
            ]}
          >
            {channel.pinned ? (
              <PinOff size={18} color="#92400e" />
            ) : (
              <Pin size={18} color="#0f766e" />
            )}
            <Text
              style={[
                styles.secondaryActionText,
                channel.pinned ? styles.secondaryActionActiveText : null,
                busy ? styles.actionDisabledText : null,
              ]}
            >
              {channel.pinned ? '取消置顶' : '置顶频道'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onLeave}
            style={[
              styles.secondaryAction,
              styles.dangerAction,
              busy ? styles.actionDisabled : null,
            ]}
          >
            <LogOut size={18} color="#b91c1c" />
            <Text
              style={[
                styles.secondaryActionText,
                styles.dangerActionText,
                busy ? styles.actionDisabledText : null,
              ]}
            >
              退出频道
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

type InfoRowProps = {
  icon?: ReactNode
  label: string
  value: string
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelGroup}>
        {icon}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text selectable numberOfLines={2} style={styles.infoValue}>
        {value || '未知'}
      </Text>
    </View>
  )
}

function getPresenceName(presence: MobileChannelPresence) {
  return (
    presence.displayName?.trim() || shortAddress(presence.address) || 'peer'
  )
}

function formatPresenceLastSeen(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '未同步时间'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未同步时间'

  return formatDateTime(date.toISOString())
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'

  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7f5',
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#f1f7f4',
  },
  headerTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerKicker: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  headerTitle: {
    color: '#13231f',
    fontSize: 18,
    fontWeight: '900',
  },
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 96,
  },
  panel: {
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#13231f',
    fontSize: 15,
    fontWeight: '900',
  },
  sectionMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '900',
  },
  memberList: {
    gap: 9,
  },
  memberRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fbf9',
  },
  memberAvatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edf2ef',
  },
  memberAvatarOnline: {
    backgroundColor: '#ecfdf5',
  },
  memberTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  memberTitleRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    flex: 1,
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  memberMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '800',
  },
  localBadge: {
    height: 20,
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
  },
  localBadgeText: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
  },
  emptyMembers: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fbf9',
  },
  emptyTitle: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyBody: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  infoRow: {
    minHeight: 42,
    gap: 5,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#eef4f1',
  },
  infoLabelGroup: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  infoLabel: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '900',
  },
  infoValue: {
    color: '#13231f',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  inputShell: {
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
  primaryAction: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  actionPanel: {
    gap: 10,
  },
  secondaryAction: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5e3dd',
    backgroundColor: '#ffffff',
  },
  secondaryActionActive: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  secondaryActionText: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryActionActiveText: {
    color: '#92400e',
  },
  dangerAction: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  dangerActionText: {
    color: '#b91c1c',
  },
  actionDisabled: {
    borderColor: '#d9e2de',
    backgroundColor: '#edf2ef',
  },
  actionDisabledText: {
    color: '#94a3a0',
  },
})
