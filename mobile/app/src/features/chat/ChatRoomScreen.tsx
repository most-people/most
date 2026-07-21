import { useMemo } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  ArrowLeft,
  Download,
  FileText,
  Paperclip,
  Send,
  Settings,
} from 'lucide-react-native'
import type {
  MobileChannel,
  MobileChannelAttachment,
  MobileChannelMessage,
} from '../../mobileCore/types'
import {
  createMessageKey,
  getAttachmentFromMessage,
  getChannelKey,
  getChannelTitle,
  sortMessagesForDisplay,
} from './chatState'

export type ChatRoomScreenProps = {
  channel: MobileChannel
  messages: MobileChannelMessage[]
  localWriterCoreKey: string
  draft: string
  busy: boolean
  downloadingCid: string | null
  onBack: () => void
  onOpenSettings: () => void
  onDraftChange: (value: string) => void
  onSend: () => void | Promise<void>
  onPickAttachment: () => void | Promise<void>
  onDownloadAttachment: (
    attachment: MobileChannelAttachment
  ) => void | Promise<void>
}

export function ChatRoomScreen({
  channel,
  messages,
  localWriterCoreKey,
  draft,
  busy,
  downloadingCid,
  onBack,
  onOpenSettings,
  onDraftChange,
  onSend,
  onPickAttachment,
  onDownloadAttachment,
}: ChatRoomScreenProps) {
  const sortedMessages = useMemo(
    () => sortMessagesForDisplay(messages),
    [messages]
  )
  const sendDisabled = busy || !draft.trim()
  const normalizedLocalWriterCoreKey = localWriterCoreKey.trim().toLowerCase()

  const handleSend = () => {
    if (sendDisabled) return
    void onSend()
  }

  const handlePickAttachment = () => {
    if (busy) return
    void onPickAttachment()
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回频道列表"
          onPress={onBack}
          style={styles.headerIconButton}
        >
          <ArrowLeft size={22} color="#0f766e" />
        </Pressable>

        <View style={styles.headerTitleGroup}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {getChannelTitle(channel)}
          </Text>
          <Text numberOfLines={1} style={styles.headerMeta}>
            {getChannelKey(channel)}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="频道设置"
          onPress={onOpenSettings}
          style={styles.headerIconButton}
        >
          <Settings size={21} color="#42534d" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.messageList}
        keyboardShouldPersistTaps="handled"
      >
        {sortedMessages.length ? (
          sortedMessages.map(message => {
            const attachment = getAttachmentFromMessage(message)
            const local = isLocalMessage(message, normalizedLocalWriterCoreKey)

            return (
              <View
                key={createMessageKey(message)}
                style={[
                  styles.messageRow,
                  local ? styles.messageRowLocal : styles.messageRowRemote,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    local
                      ? styles.messageBubbleLocal
                      : styles.messageBubbleRemote,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageMeta,
                      local ? styles.messageMetaLocal : null,
                    ]}
                  >
                    {getDisplayAuthor(message)} · {formatMessageTime(message)}
                  </Text>

                  {attachment ? (
                    <AttachmentCard
                      attachment={attachment}
                      downloading={downloadingCid === attachment.cid}
                      downloadBusy={Boolean(downloadingCid)}
                      local={local}
                      onDownload={onDownloadAttachment}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.messageText,
                        local ? styles.messageTextLocal : null,
                      ]}
                    >
                      {message.content}
                    </Text>
                  )}
                </View>
              </View>
            )
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>还没有聊天消息</Text>
            <Text style={styles.emptyBody}>
              发送一条消息，或用附件按钮分享 most:// 文件。
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送附件"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={handlePickAttachment}
          style={[
            styles.composerIconButton,
            busy ? styles.composerButtonDisabled : null,
          ]}
        >
          <Paperclip size={20} color={busy ? '#94a3a0' : '#0f766e'} />
        </Pressable>

        <View style={styles.composerInputShell}>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            placeholder="输入聊天消息"
            placeholderTextColor="#7b8c86"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            style={styles.composerInput}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送消息"
          accessibilityState={{ disabled: sendDisabled }}
          disabled={sendDisabled}
          onPress={handleSend}
          style={[
            styles.sendButton,
            sendDisabled ? styles.composerButtonDisabled : null,
          ]}
        >
          <Send size={20} color={sendDisabled ? '#94a3a0' : '#ffffff'} />
        </Pressable>
      </View>
    </View>
  )
}

type AttachmentCardProps = {
  attachment: MobileChannelAttachment
  downloading: boolean
  downloadBusy: boolean
  local: boolean
  onDownload: (attachment: MobileChannelAttachment) => void | Promise<void>
}

function AttachmentCard({
  attachment,
  downloading,
  downloadBusy,
  local,
  onDownload,
}: AttachmentCardProps) {
  const handlePress = () => {
    if (downloadBusy) return
    void onDownload(attachment)
  }

  return (
    <View
      style={[styles.attachmentCard, local ? styles.attachmentCardLocal : null]}
    >
      <View style={styles.attachmentIcon}>
        <FileText size={19} color="#0f766e" />
      </View>
      <View style={styles.attachmentTextGroup}>
        <Text
          numberOfLines={2}
          style={[
            styles.attachmentTitle,
            local ? styles.attachmentTitleLocal : null,
          ]}
        >
          {attachment.fileName}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.attachmentMeta,
            local ? styles.attachmentMetaLocal : null,
          ]}
        >
          {formatAttachmentSize(attachment.size)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="下载附件"
        accessibilityState={{ disabled: downloadBusy }}
        disabled={downloadBusy}
        onPress={handlePress}
        style={[
          styles.attachmentButton,
          downloadBusy ? styles.attachmentButtonDisabled : null,
        ]}
      >
        <Download size={15} color={downloadBusy ? '#94a3a0' : '#ffffff'} />
        <Text
          style={[
            styles.attachmentButtonText,
            downloadBusy ? styles.attachmentButtonTextDisabled : null,
          ]}
        >
          {downloading ? '下载中' : downloadBusy ? '请稍候' : '下载'}
        </Text>
      </Pressable>
    </View>
  )
}

function isLocalMessage(
  message: MobileChannelMessage,
  normalizedLocalWriterCoreKey: string
) {
  if (!normalizedLocalWriterCoreKey) return false
  const messageWithCoreKey = message as MobileChannelMessage & {
    _coreKey?: string
  }

  return [messageWithCoreKey._coreKey, message.author].some(
    value => value?.trim().toLowerCase() === normalizedLocalWriterCoreKey
  )
}

function getDisplayAuthor(message: MobileChannelMessage) {
  return message.authorName.trim() || message.author.trim() || '未知'
}

function formatMessageTime(message: MobileChannelMessage) {
  const date = new Date(message.timestamp)
  if (Number.isNaN(date.getTime())) return '--:--'

  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatAttachmentSize(size?: number) {
  if (!Number.isFinite(size) || !size || size <= 0) return 'most:// 附件'

  if (size < 1024) return `${size} B`
  const kib = size / 1024
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`
  const mib = kib / 1024
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`
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
    gap: 2,
  },
  headerTitle: {
    color: '#13231f',
    fontSize: 18,
    fontWeight: '900',
  },
  headerMeta: {
    color: '#63716c',
    fontSize: 11,
    fontWeight: '800',
  },
  messageList: {
    flexGrow: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
  },
  messageRow: {
    width: '100%',
  },
  messageRowLocal: {
    alignItems: 'flex-end',
  },
  messageRowRemote: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '84%',
    minWidth: 140,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  messageBubbleLocal: {
    borderColor: '#0f766e',
    backgroundColor: '#0f766e',
  },
  messageBubbleRemote: {
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  messageMeta: {
    color: '#63716c',
    fontSize: 11,
    fontWeight: '900',
  },
  messageMetaLocal: {
    color: '#d5f5ec',
  },
  messageText: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  messageTextLocal: {
    color: '#ffffff',
  },
  attachmentCard: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    borderRadius: 8,
    backgroundColor: '#f8fbf9',
  },
  attachmentCardLocal: {
    backgroundColor: '#147d73',
  },
  attachmentIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
  },
  attachmentTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  attachmentTitle: {
    color: '#13231f',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  attachmentTitleLocal: {
    color: '#ffffff',
  },
  attachmentMeta: {
    color: '#63716c',
    fontSize: 11,
    fontWeight: '800',
  },
  attachmentMetaLocal: {
    color: '#d5f5ec',
  },
  attachmentButton: {
    minWidth: 86,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  attachmentButtonDisabled: {
    backgroundColor: '#e3ebe7',
  },
  attachmentButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  attachmentButtonTextDisabled: {
    color: '#94a3a0',
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 18,
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
  composer: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  composerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5e3dd',
    backgroundColor: '#f8fbf9',
  },
  composerButtonDisabled: {
    borderColor: '#d9e2de',
    backgroundColor: '#edf2ef',
  },
  composerInputShell: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cddbd5',
    backgroundColor: '#f8fbf9',
  },
  composerInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#13231f',
    fontSize: 14,
    fontWeight: '700',
  },
  sendButton: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
})
