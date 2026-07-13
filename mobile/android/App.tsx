import './src/polyfills/eventTarget'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import b4a from 'b4a'
import { ListChecks, MessageCircle, ShieldCheck } from 'lucide-react-native'
import { ChatListScreen } from './src/features/chat/ChatListScreen'
import { ChatRoomScreen } from './src/features/chat/ChatRoomScreen'
import { ChatSettingsScreen } from './src/features/chat/ChatSettingsScreen'
import { NodeStatusScreen } from './src/features/node/NodeStatusScreen'
import { createMostBoxCore } from './src/mobileCore/createMostBoxCore'
import { parseMostLink } from './src/mobileCore/protocol'
import {
  getChannelKey,
  getChannelTitle,
  markChannelRead,
  type ChannelLastReadMap,
} from './src/features/chat/chatState'
import type { DocumentPickerAsset } from 'expo-document-picker'
import type {
  MobileChannel,
  MobileChannelAttachment,
  MobileChannelPresence,
  MobileCoreSnapshot,
  MobileHolding,
  MostBoxMobileCore,
} from './src/mobileCore/types'
import { shortAddress } from './shared/format-address.mjs'

const DEV_CID_MAX_BYTES = 20 * 1024 * 1024
const CHANNEL_PRESENCE_HEARTBEAT_MS = 15 * 1000
const MIME_BY_EXTENSION: Record<string, string> = {
  apk: 'application/vnd.android.package-archive',
  csv: 'text/csv',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  webp: 'image/webp',
  zip: 'application/zip',
}

type RootTab = 'chat' | 'node'

type ChatRoute =
  | { name: 'list' }
  | { name: 'room'; channelKey: string }
  | { name: 'settings'; channelKey: string }

function formatPresenceMember(presence: MobileChannelPresence) {
  return (
    presence.displayName?.trim() || shortAddress(presence.address) || 'peer'
  )
}

async function readDevCidBytes(file: DocumentPickerAsset) {
  const size = file.size || 0
  if (size > DEV_CID_MAX_BYTES) return undefined

  const base64 = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  return b4a.from(base64, 'base64')
}

function getCoreStoragePath() {
  const baseUri =
    FileSystem.documentDirectory || FileSystem.cacheDirectory || ''
  const storageUri = `${baseUri.replace(/\/$/, '')}/mostbox-core`
  if (storageUri.startsWith('file://')) {
    return decodeURIComponent(storageUri.slice('file://'.length))
  }
  return storageUri
}

function getMimeType(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

function getAttachmentKind(
  fileName: string,
  mimeType?: string
): MobileChannelAttachment['kind'] {
  const normalizedMimeType = mimeType?.toLowerCase() || ''
  const extension = fileName.split('.').pop()?.toLowerCase() || ''

  if (normalizedMimeType.startsWith('image/')) return 'image'
  if (normalizedMimeType.startsWith('video/')) return 'video'
  if (normalizedMimeType.startsWith('audio/')) return 'audio'
  if (normalizedMimeType.startsWith('text/')) return 'text'
  if (normalizedMimeType === 'application/pdf' || extension === 'pdf') {
    return 'file'
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'file'

  return 'file'
}

function toFileUri(filePath: string) {
  const value = filePath.trim()
  if (value.startsWith('file://') || value.startsWith('content://'))
    return value
  const normalized = value.replace(/\\/g, '/')
  const encoded = normalized
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return `file://${encoded.startsWith('/') ? encoded : `/${encoded}`}`
}

function getSafeSaveFileName(fileName: string, cid: string) {
  const safeName = fileName
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
  return safeName || `${cid}.bin`
}

async function writeSafFileFromLocalFile(
  sourceFileUri: string,
  targetUri: string
) {
  const base64 = await FileSystem.readAsStringAsync(sourceFileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  await FileSystem.StorageAccessFramework.writeAsStringAsync(
    targetUri,
    base64,
    {
      encoding: FileSystem.EncodingType.Base64,
    }
  )
}

type SmallActionProps = {
  label: string
  icon: ReactNode
  onPress: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
}

function SmallAction({
  label,
  icon,
  onPress,
  disabled = false,
  primary = false,
  danger = false,
}: SmallActionProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.smallAction,
        primary ? styles.smallActionPrimary : null,
        danger ? styles.smallActionDanger : null,
        disabled ? styles.smallActionDisabled : null,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.smallActionText,
          primary ? styles.smallActionPrimaryText : null,
          danger ? styles.smallActionDangerText : null,
          disabled ? styles.disabledText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export default function App() {
  const coreRef = useRef<MostBoxMobileCore | null>(null)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downloadingAttachmentCidRef = useRef<string | null>(null)
  const settingsRemarkChannelKeyRef = useRef('')
  const settingsRemarkBaselineRef = useRef('')
  const channelPresenceSessionRef = useRef(
    `android-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const [snapshot, setSnapshot] = useState<MobileCoreSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<RootTab>('chat')
  const [chatRoute, setChatRoute] = useState<ChatRoute>({ name: 'list' })
  const [exportingCid, setExportingCid] = useState<string | null>(null)
  const [deletingCid, setDeletingCid] = useState<string | null>(null)
  const [copiedCid, setCopiedCid] = useState<string | null>(null)
  const [channelName, setChannelName] = useState('chat-android')
  const [channelSearchInput, setChannelSearchInput] = useState('')
  const [channelInput, setChannelInput] = useState('chat-android')
  const [channelLastReadAt, setChannelLastReadAt] =
    useState<ChannelLastReadMap>({})
  const [channelDraft, setChannelDraft] = useState('')
  const [settingsRemarkInput, setSettingsRemarkInput] = useState('')
  const [channelBusy, setChannelBusy] = useState(false)
  const [downloadingAttachmentCid, setDownloadingAttachmentCid] = useState<
    string | null
  >(null)

  if (!coreRef.current) {
    coreRef.current = createMostBoxCore({
      storagePath: getCoreStoragePath(),
    })
  }

  const core = coreRef.current
  const currentSnapshot = snapshot ?? core.getSnapshot()
  const nodeStatus = currentSnapshot.node.status
  const isReady = nodeStatus === 'ready'
  const isCoreBusy = nodeStatus === 'starting' || nodeStatus === 'stopping'

  useEffect(() => {
    const unsubscribe = core.subscribe(setSnapshot)
    void core.start().catch(error => {
      Alert.alert(
        'P2P 核心启动失败',
        error instanceof Error ? error.message : '请先运行 npm run bundle:core'
      )
    })
    return () => {
      unsubscribe()
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current)
      }
      void core.stop()
    }
  }, [core])

  const routeChannelKey =
    chatRoute.name === 'room' || chatRoute.name === 'settings'
      ? chatRoute.channelKey
      : ''
  const normalizedChannelName = channelName.trim() || 'chat-android'
  const selectedChannel =
    currentSnapshot.channels.find(channel => {
      const targetChannelKey = routeChannelKey || normalizedChannelName
      return (
        getChannelKey(channel) === targetChannelKey ||
        channel.channelId === targetChannelKey ||
        channel.name === targetChannelKey
      )
    }) || null
  const selectedChannelKey =
    selectedChannel?.channelKey || routeChannelKey || normalizedChannelName
  const activeChannelPresenceKey = selectedChannel?.channelKey || ''
  const channelMessages =
    (currentSnapshot.channelMessages || {})[selectedChannelKey] || []
  const onlineChannelPresence = [
    ...((currentSnapshot.channelPresence || {})[selectedChannelKey] || []),
  ]
    .filter(presence => presence.online)
    .sort((left, right) => {
      if (left.local !== right.local) return left.local ? -1 : 1
      return formatPresenceMember(left).localeCompare(
        formatPresenceMember(right)
      )
    })
  const chatTabAccessibilityLabel =
    chatRoute.name === 'list' ? '聊天' : `聊天 ${chatRoute.channelKey}`
  const chatTabColor = activeTab === 'chat' ? '#0f766e' : '#63716c'
  const nodeTabColor = activeTab === 'node' ? '#0f766e' : '#63716c'

  const handleSelectChatTab = () => {
    setActiveTab('chat')
    setChatRoute(route => (route.name === 'list' ? route : { name: 'list' }))
  }

  const handleSelectNodeTab = () => {
    setActiveTab('node')
  }

  useEffect(() => {
    if (chatRoute.name !== 'settings' || !selectedChannel) return

    const channelKey = getChannelKey(selectedChannel)
    const nextRemark = selectedChannel.remark
    const channelChanged = settingsRemarkChannelKeyRef.current !== channelKey
    const remarkClean =
      settingsRemarkInput === settingsRemarkBaselineRef.current

    if (channelChanged || remarkClean) {
      setSettingsRemarkInput(nextRemark)
      settingsRemarkBaselineRef.current = nextRemark
    }

    settingsRemarkChannelKeyRef.current = channelKey
  }, [chatRoute.name, selectedChannel, settingsRemarkInput])

  useEffect(() => {
    if (!isReady || !activeChannelPresenceKey) return

    let disposed = false
    const sessionId = channelPresenceSessionRef.current
    const basePayload = {
      channelName: activeChannelPresenceKey,
      sessionId,
    }

    void core
      .joinChannelPresence({
        ...basePayload,
        displayName: 'Android',
      })
      .catch(() => {})

    const heartbeatTimer = setInterval(() => {
      if (disposed) return
      void core.heartbeatChannelPresence(basePayload).catch(() => {})
    }, CHANNEL_PRESENCE_HEARTBEAT_MS)

    return () => {
      disposed = true
      clearInterval(heartbeatTimer)
      if (core.getSnapshot().node.status === 'ready') {
        void core.leaveChannelPresence(basePayload).catch(() => {})
      }
    }
  }, [activeChannelPresenceKey, core, isReady])

  const markCopied = (cid: string) => {
    setCopiedCid(cid)
    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current)
    }
    copyResetTimerRef.current = setTimeout(() => {
      setCopiedCid(null)
      copyResetTimerRef.current = null
    }, 1600)
  }

  const handleStartCore = async () => {
    try {
      await core.start()
    } catch (error) {
      Alert.alert(
        'P2P 核心启动失败',
        error instanceof Error ? error.message : '无法启动 P2P 核心'
      )
    }
  }

  const guardReady = () => {
    if (isReady) return true
    Alert.alert('P2P 核心未就绪', '等状态变为“在线”后再执行聊天或附件操作。')
    return false
  }

  const ensureActiveChannel = async () => {
    const requestedName =
      selectedChannel?.channelKey || routeChannelKey || normalizedChannelName
    if (selectedChannel) {
      return {
        channel: selectedChannel,
        channelKey: getChannelKey(selectedChannel) || requestedName,
      }
    }

    const channel = await core.createChannel({
      name: requestedName,
      type: 'public',
    })
    const channelKey = getChannelKey(channel) || requestedName
    setChannelName(channelKey)
    setChannelInput(channel.channelId || channel.name || requestedName)
    if (chatRoute.name !== 'settings') {
      setChatRoute({ name: 'room', channelKey })
    }

    return { channel, channelKey }
  }

  const handlePickFile = async () => {
    if (!guardReady()) return

    setChannelBusy(true)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      })

      if (result.canceled) return
      const file = result.assets[0]
      if (!file) return
      const fileSize = file.size || 0
      const contentBytes = await readDevCidBytes(file)

      const transfer = await core.publishFile({
        uri: file.uri,
        name: file.name,
        size: fileSize,
        mimeType: file.mimeType,
        contentBytes,
      })
      if (transfer.link) {
        const { channel, channelKey } = await ensureActiveChannel()
        const parsed = parseMostLink(transfer.link)
        const attachment: MobileChannelAttachment = {
          kind: getAttachmentKind(file.name, file.mimeType),
          cid: transfer.cid || parsed.cid,
          fileName: file.name,
          link: transfer.link,
          mimeType: file.mimeType,
          size: fileSize,
        }
        await core.sendChannelMessage({
          channelName: channelKey,
          content: attachment.link,
          author: channel.localWriterCoreKey,
          authorName: 'Android',
          attachment,
        })
        await core.getChannelMessages(channelKey)
        setChannelLastReadAt(lastReadAt =>
          markChannelRead(lastReadAt, channelKey)
        )
      }
    } catch (error) {
      Alert.alert(
        '发送附件失败',
        error instanceof Error ? error.message : '请选择可读取的文件'
      )
    } finally {
      setChannelBusy(false)
    }
  }

  const handleDownloadAttachment = async (
    attachment: MobileChannelAttachment
  ) => {
    if (downloadingAttachmentCidRef.current) return
    if (!guardReady()) return

    const channelKey = selectedChannelKey
    downloadingAttachmentCidRef.current = attachment.cid
    setDownloadingAttachmentCid(attachment.cid)

    try {
      try {
        const existingHolding =
          currentSnapshot.holdings.find(
            holding => holding.cid === attachment.cid
          ) || null
        if (existingHolding) {
          Alert.alert('本机已存', '这个附件已经在本机做种列表中。')
          return
        }

        await core.downloadLink({ link: attachment.link })
      } catch (error) {
        Alert.alert(
          '下载附件失败',
          error instanceof Error ? error.message : '请检查链接或等待种子上线'
        )
        return
      }

      try {
        setChannelLastReadAt(lastReadAt =>
          markChannelRead(lastReadAt, channelKey)
        )
        await core.getChannelMessages(channelKey)
      } catch {
        // The attachment is already downloaded; a stale room refresh is non-fatal.
      }
    } finally {
      downloadingAttachmentCidRef.current = null
      setDownloadingAttachmentCid(null)
    }
  }

  const handleJoinChannelFromList = async (name: string) => {
    if (!guardReady()) return
    const requestedName = name.trim()
    if (!requestedName) {
      Alert.alert('无法加入聊天', '请输入要加入的频道名')
      return
    }

    setChannelBusy(true)
    try {
      const channel = await core.createChannel({
        name: requestedName,
        type: 'public',
      })
      const channelKey = getChannelKey(channel) || requestedName
      await core.getChannelMessages(channelKey)
      setChannelName(channelKey)
      setChannelInput(channel.channelId || channel.name || requestedName)
      setChannelDraft('')
      setChatRoute({ name: 'room', channelKey })
      setChannelLastReadAt(lastReadAt =>
        markChannelRead(lastReadAt, channelKey)
      )
    } catch (error) {
      Alert.alert(
        '加入聊天失败',
        error instanceof Error ? error.message : '无法加入这个聊天频道'
      )
    } finally {
      setChannelBusy(false)
    }
  }

  const handleOpenChannelFromList = (channel: MobileChannel) => {
    const channelKey = getChannelKey(channel)
    if (!channelKey) return

    setChannelName(channelKey)
    setChannelInput(channel.channelId || channel.name || channelKey)
    setChannelDraft('')
    setChatRoute({ name: 'room', channelKey })
    setChannelLastReadAt(lastReadAt => markChannelRead(lastReadAt, channelKey))

    if (isReady) {
      void core.getChannelMessages(channelKey).catch(error => {
        Alert.alert(
          '读取聊天失败',
          error instanceof Error ? error.message : '无法读取这个频道的消息'
        )
      })
    }
  }

  const handleToggleChannelPin = async (channel: MobileChannel) => {
    if (!guardReady()) return
    setChannelBusy(true)
    try {
      await core.setChannelPinned({
        channelName: channel.channelKey,
        pinned: !channel.pinned,
      })
    } catch (error) {
      Alert.alert(
        channel.pinned ? '取消置顶失败' : '置顶失败',
        error instanceof Error ? error.message : '无法更新这个频道'
      )
    } finally {
      setChannelBusy(false)
    }
  }

  const handleRenameChannel = async (channel: MobileChannel) => {
    const channelKey = getChannelKey(channel)
    if (!channelKey || !channel.channelKey) return
    if (!guardReady()) {
      throw new Error('P2P core is not ready')
    }

    setChannelBusy(true)
    try {
      await core.setChannelRemark({
        channelName: channel.channelKey,
        remark: channel.remark,
      })
    } catch (error) {
      Alert.alert(
        '保存备注失败',
        error instanceof Error ? error.message : '无法保存这个频道备注'
      )
      throw error
    } finally {
      setChannelBusy(false)
    }
  }

  const handleSaveSettingsRemark = async () => {
    if (!selectedChannel) return

    const remark = settingsRemarkInput.trim()
    await handleRenameChannel({
      ...selectedChannel,
      remark,
    })
    settingsRemarkBaselineRef.current = remark
    setSettingsRemarkInput(remark)
  }

  const handleConfirmLeaveChannel = (channel: MobileChannel) => {
    const channelKey = getChannelKey(channel)
    if (!channelKey) return

    Alert.alert(
      '退出频道',
      `确定退出 ${getChannelTitle(channel)} 吗？本机将不再同步这个频道。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '退出',
          style: 'destructive',
          onPress: () => {
            setChannelBusy(true)
            void core
              .leaveChannel({ channelName: channel.channelKey })
              .then(() => {
                setChannelLastReadAt(lastReadAt => {
                  const nextLastReadAt = { ...lastReadAt }
                  delete nextLastReadAt[channelKey]
                  return nextLastReadAt
                })

                setChatRoute(currentRoute => {
                  if (
                    currentRoute.name === 'list' ||
                    currentRoute.channelKey !== channelKey
                  ) {
                    return currentRoute
                  }

                  setChannelName('chat-android')
                  setChannelInput('chat-android')
                  setChannelDraft('')
                  return { name: 'list' }
                })
              })
              .catch(error => {
                Alert.alert(
                  '退出频道失败',
                  error instanceof Error ? error.message : '无法退出这个频道'
                )
              })
              .finally(() => {
                setChannelBusy(false)
              })
          },
        },
      ]
    )
  }

  const handleBackToChannelList = () => {
    setChatRoute({ name: 'list' })
  }

  const handleBackToChatRoom = () => {
    if (!selectedChannelKey) {
      handleBackToChannelList()
      return
    }

    setChatRoute({ name: 'room', channelKey: selectedChannelKey })
  }

  const handleSendChannelMessage = async () => {
    if (!guardReady()) return
    const content = channelDraft.trim()
    if (!content) {
      Alert.alert('请输入消息', '先写一条要发送到聊天房间的消息。')
      return
    }

    setChannelBusy(true)
    try {
      const { channel, channelKey } = await ensureActiveChannel()
      await core.sendChannelMessage({
        channelName: channelKey,
        content,
        author: channel.localWriterCoreKey,
        authorName: 'Android',
      })
      setChannelDraft('')
      setChannelLastReadAt(lastReadAt =>
        markChannelRead(lastReadAt, channelKey)
      )
      await core.getChannelMessages(channelKey)
    } catch (error) {
      Alert.alert(
        '发送消息失败',
        error instanceof Error ? error.message : '无法发送聊天消息'
      )
    } finally {
      setChannelBusy(false)
    }
  }

  const handleDeleteHolding = (holding: MobileHolding) => {
    if (!guardReady()) return

    Alert.alert(
      '删除本机文件',
      `将从本机 MostBox 中移除 ${holding.fileName}，并停止为这个 CID 做种。已另存到手机目录的副本不会被删除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            setDeletingCid(holding.cid)
            void core
              .deleteHolding({ cid: holding.cid })
              .catch(error => {
                Alert.alert(
                  '删除失败',
                  error instanceof Error ? error.message : '无法删除本机文件'
                )
              })
              .finally(() => {
                setDeletingCid(null)
              })
          },
        },
      ]
    )
  }

  const handleCopyHoldingLink = async (holding: MobileHolding) => {
    await Clipboard.setStringAsync(holding.shareLink)
    markCopied(holding.cid)
  }

  const prepareHoldingFile = async (holding: MobileHolding) => {
    const exported = await core.exportHolding({
      cid: holding.cid,
      fileName: holding.fileName,
    })
    const fileUri = toFileUri(exported.filePath)
    const info = await FileSystem.getInfoAsync(fileUri)
    if (!info.exists) {
      throw new Error('导出的文件不存在，请重新下载后再试')
    }

    return {
      ...exported,
      fileUri,
      mimeType: getMimeType(exported.fileName),
    }
  }

  const handleShareHolding = async (holding: MobileHolding) => {
    if (!guardReady()) return
    setExportingCid(holding.cid)
    try {
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        throw new Error('当前设备不支持系统分享')
      }

      const exported = await prepareHoldingFile(holding)
      await Sharing.shareAsync(exported.fileUri, {
        mimeType: exported.mimeType,
        dialogTitle: `分享 ${exported.fileName}`,
      })
    } catch (error) {
      Alert.alert(
        '打开失败',
        error instanceof Error ? error.message : '无法打开文件'
      )
    } finally {
      setExportingCid(null)
    }
  }

  const handleSaveHolding = async (holding: MobileHolding) => {
    if (!guardReady()) return
    setExportingCid(holding.cid)
    try {
      if (Platform.OS !== 'android') {
        throw new Error('保存到手机目录目前仅支持 Android')
      }

      const exported = await prepareHoldingFile(holding)
      const initialUri =
        FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download')
      const permission =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          initialUri
        )
      if (!permission.granted) return

      const saveFileName = getSafeSaveFileName(exported.fileName, holding.cid)
      const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        saveFileName,
        exported.mimeType
      )
      await writeSafFileFromLocalFile(exported.fileUri, targetUri)
      Alert.alert('保存成功', `已保存 ${saveFileName}`)
    } catch (error) {
      Alert.alert(
        '保存失败',
        error instanceof Error ? error.message : '无法保存文件'
      )
    } finally {
      setExportingCid(null)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0d3b35" />
      {activeTab === 'node' ? (
        <NodeStatusScreen
          snapshot={currentSnapshot}
          copiedCid={copiedCid}
          deletingCid={deletingCid}
          exportingCid={exportingCid}
          onCopyHoldingLink={handleCopyHoldingLink}
          onDeleteHolding={handleDeleteHolding}
          onSaveHolding={handleSaveHolding}
          onShareHolding={handleShareHolding}
          onRetryStartCore={handleStartCore}
          retryStartDisabled={isCoreBusy}
        />
      ) : chatRoute.name === 'list' ? (
        <ChatListScreen
          channels={currentSnapshot.channels}
          messagesByChannel={currentSnapshot.channelMessages || {}}
          lastReadAt={channelLastReadAt}
          searchInput={channelSearchInput}
          joinInput={channelInput}
          busy={channelBusy}
          onSearchInputChange={setChannelSearchInput}
          onJoinInputChange={setChannelInput}
          onOpenChannel={handleOpenChannelFromList}
          onJoinChannel={handleJoinChannelFromList}
          onTogglePin={handleToggleChannelPin}
          onRename={handleRenameChannel}
          onLeave={handleConfirmLeaveChannel}
        />
      ) : chatRoute.name === 'room' && selectedChannel ? (
        <ChatRoomScreen
          channel={selectedChannel}
          messages={channelMessages}
          localWriterCoreKey={selectedChannel.localWriterCoreKey}
          draft={channelDraft}
          busy={!isReady || channelBusy}
          downloadingCid={downloadingAttachmentCid}
          onBack={handleBackToChannelList}
          onOpenSettings={() => {
            const channelKey = getChannelKey(selectedChannel)
            if (channelKey) {
              setSettingsRemarkInput(selectedChannel.remark)
              settingsRemarkBaselineRef.current = selectedChannel.remark
              settingsRemarkChannelKeyRef.current = channelKey
              setChatRoute({ name: 'settings', channelKey })
            }
          }}
          onDraftChange={setChannelDraft}
          onSend={handleSendChannelMessage}
          onPickAttachment={handlePickFile}
          onDownloadAttachment={handleDownloadAttachment}
        />
      ) : chatRoute.name === 'settings' && selectedChannel ? (
        <ChatSettingsScreen
          channel={selectedChannel}
          presence={onlineChannelPresence}
          remarkInput={settingsRemarkInput}
          busy={!isReady || channelBusy}
          onBack={handleBackToChatRoom}
          onRemarkChange={setSettingsRemarkInput}
          onSaveRemark={handleSaveSettingsRemark}
          onTogglePin={() => handleToggleChannelPin(selectedChannel)}
          onLeave={() => handleConfirmLeaveChannel(selectedChannel)}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.fallbackContent}>
          <View style={styles.fallbackPanel}>
            <View style={styles.fallbackIcon}>
              <ListChecks size={22} color="#0f766e" />
            </View>
            <Text style={styles.fallbackTitle}>
              {chatRoute.name === 'settings'
                ? '频道设置不可用'
                : '聊天室不可用'}
            </Text>
            <Text style={styles.fallbackBody}>
              返回聊天列表后重新选择频道。
            </Text>
            <SmallAction
              label="返回频道列表"
              onPress={handleBackToChannelList}
              icon={<ListChecks size={15} color="#0f766e" />}
            />
          </View>
        </ScrollView>
      )}

      <View style={styles.tabBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={chatTabAccessibilityLabel}
          accessibilityState={{ selected: activeTab === 'chat' }}
          onPress={handleSelectChatTab}
          style={[
            styles.tabButton,
            activeTab === 'chat' ? styles.tabButtonActive : null,
          ]}
        >
          <MessageCircle size={20} color={chatTabColor} />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'chat' ? styles.tabButtonTextActive : null,
            ]}
          >
            聊天
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="节点"
          accessibilityState={{ selected: activeTab === 'node' }}
          onPress={handleSelectNodeTab}
          style={[
            styles.tabButton,
            activeTab === 'node' ? styles.tabButtonActive : null,
          ]}
        >
          <ShieldCheck size={20} color={nodeTabColor} />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'node' ? styles.tabButtonTextActive : null,
            ]}
          >
            节点
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7f5',
  },
  fallbackContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 104,
  },
  fallbackPanel: {
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  fallbackIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
  },
  fallbackTitle: {
    color: '#13231f',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  fallbackBody: {
    maxWidth: 260,
    color: '#63716c',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  smallAction: {
    alignSelf: 'stretch',
    minWidth: 128,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5e3dd',
    backgroundColor: '#f8fbf9',
  },
  smallActionPrimary: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  smallActionDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  smallActionDisabled: {
    borderColor: '#d9e2de',
    backgroundColor: '#edf2ef',
  },
  smallActionText: {
    color: '#13231f',
    fontSize: 12,
    fontWeight: '900',
  },
  smallActionPrimaryText: {
    color: '#ffffff',
  },
  smallActionDangerText: {
    color: '#b91c1c',
  },
  disabledText: {
    color: '#94a3a0',
  },
  tabBar: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: '#f8fbf9',
  },
  tabButtonActive: {
    backgroundColor: '#ecfdf5',
  },
  tabButtonText: {
    color: '#63716c',
    fontSize: 13,
    fontWeight: '900',
  },
  tabButtonTextActive: {
    color: '#0f766e',
  },
})
