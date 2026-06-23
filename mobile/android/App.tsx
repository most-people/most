import './src/polyfills/eventTarget'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import b4a from 'b4a'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  ClipboardPaste,
  Copy,
  Download,
  FileCheck,
  FileUp,
  HardDrive,
  Link2,
  ListChecks,
  Loader,
  Radio,
  Save,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react-native'
import { createMostBoxCore } from './src/mobileCore/createMostBoxCore'
import { parseMostLink } from './src/mobileCore/protocol'
import type { DocumentPickerAsset } from 'expo-document-picker'
import type {
  LogLevel,
  MobileCoreSnapshot,
  MobileChannelMessage,
  MobileHolding,
  MobileTransfer,
  MostBoxMobileCore,
  NodeRuntimeStatus,
  SeedStatus,
  TransferStatus,
} from './src/mobileCore/types'

const DEV_CID_MAX_BYTES = 20 * 1024 * 1024
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

const NODE_STATUS_LABELS: Record<NodeRuntimeStatus, string> = {
  idle: '未启动',
  starting: '启动中',
  ready: '在线',
  stopping: '停止中',
  error: '异常',
}

const SEED_STATUS_LABELS: Record<SeedStatus, string> = {
  queued: '排队中',
  joining: '加入中',
  active: '做种中',
  paused: '已暂停',
  error: '异常',
}

const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  queued: '排队中',
  running: '传输中',
  completed: '已完成',
  failed: '失败',
  waitingCore: '等待核心',
}

const TRANSFER_KIND_LABELS: Record<MobileTransfer['kind'], string> = {
  publish: '发布',
  download: '下载',
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  info: '信息',
  warn: '提醒',
  error: '错误',
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatLogTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatChannelMessageTime(message: MobileChannelMessage) {
  return formatLogTime(new Date(message.timestamp).toISOString())
}

function shortCid(cid: string, head = 12, tail = 8) {
  if (cid.length <= head + tail + 1) return cid
  return `${cid.slice(0, head)}...${cid.slice(-tail)}`
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

function getNodeTone(status: NodeRuntimeStatus) {
  if (status === 'ready') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'starting' || status === 'stopping') return 'pending'
  return 'muted'
}

function getSeedTone(status: SeedStatus) {
  if (status === 'active') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'joining' || status === 'queued') return 'pending'
  return 'muted'
}

function getTransferTone(status: TransferStatus) {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'pending'
  return 'muted'
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

type Tone = 'success' | 'danger' | 'pending' | 'muted'

type MetricProps = {
  icon: ReactNode
  label: string
  value: string
}

function Metric({ icon, label, value }: MetricProps) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

type StatusBadgeProps = {
  label: string
  tone: Tone
}

function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, styles[`${tone}Badge`]]}>
      <Text style={[styles.badgeText, styles[`${tone}BadgeText`]]}>
        {label}
      </Text>
    </View>
  )
}

type CommandButtonProps = {
  label: string
  helper?: string
  icon: ReactNode
  onPress: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

function CommandButton({
  label,
  helper,
  icon,
  onPress,
  variant = 'secondary',
  disabled = false,
}: CommandButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.commandButton,
        variant === 'primary' ? styles.commandButtonPrimary : null,
        disabled ? styles.commandButtonDisabled : null,
      ]}
    >
      <View
        style={[
          styles.commandIcon,
          variant === 'primary' ? styles.commandIconPrimary : null,
          disabled ? styles.commandIconDisabled : null,
        ]}
      >
        {icon}
      </View>
      <View style={styles.commandTextGroup}>
        <Text
          style={[
            styles.commandLabel,
            variant === 'primary' ? styles.commandLabelPrimary : null,
            disabled ? styles.disabledText : null,
          ]}
        >
          {label}
        </Text>
        {helper ? (
          <Text
            style={[
              styles.commandHelper,
              variant === 'primary' ? styles.commandHelperPrimary : null,
              disabled ? styles.disabledText : null,
            ]}
          >
            {helper}
          </Text>
        ) : null}
      </View>
    </Pressable>
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

type SectionHeaderProps = {
  icon: ReactNode
  title: string
  meta?: string
}

function SectionHeader({ icon, title, meta }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  )
}

type EmptyStateProps = {
  title: string
  body: string
}

function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
}

export default function App() {
  const coreRef = useRef<MostBoxMobileCore | null>(null)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [snapshot, setSnapshot] = useState<MobileCoreSnapshot | null>(null)
  const [downloadLink, setDownloadLink] = useState('')
  const [exportingCid, setExportingCid] = useState<string | null>(null)
  const [deletingCid, setDeletingCid] = useState<string | null>(null)
  const [copiedCid, setCopiedCid] = useState<string | null>(null)
  const [channelName, setChannelName] = useState('android-smoke')
  const [channelDraft, setChannelDraft] = useState('from android')
  const [channelBusy, setChannelBusy] = useState(false)

  if (!coreRef.current) {
    coreRef.current = createMostBoxCore({
      storagePath: getCoreStoragePath(),
    })
  }

  const core = coreRef.current
  const currentSnapshot = snapshot ?? core.getSnapshot()
  const nodeStatus = currentSnapshot.node.status
  const nodeStatusLabel = NODE_STATUS_LABELS[nodeStatus]
  const nodeTone = getNodeTone(nodeStatus)
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

  const downloadValidation = useMemo(() => {
    const link = downloadLink.trim()
    if (!link) return { state: 'empty' as const }
    try {
      return {
        state: 'valid' as const,
        parsed: parseMostLink(link),
      }
    } catch (error) {
      return {
        state: 'invalid' as const,
        message: error instanceof Error ? error.message : '链接格式不可用',
      }
    }
  }, [downloadLink])

  const latestTransfers = currentSnapshot.transfers.slice(0, 4)
  const recentLogs = currentSnapshot.logs.slice(0, 6)
  const activeTransfers = currentSnapshot.transfers.filter(
    transfer =>
      transfer.status === 'queued' ||
      transfer.status === 'running' ||
      transfer.status === 'waitingCore'
  )
  const existingDownloadHolding =
    downloadValidation.state === 'valid'
      ? currentSnapshot.holdings.find(
          holding => holding.cid === downloadValidation.parsed.cid
        ) || null
      : null
  const normalizedChannelName = channelName.trim() || 'android-smoke'
  const selectedChannel =
    currentSnapshot.channels.find(
      channel =>
        channel.channelId === normalizedChannelName ||
        channel.channelKey === normalizedChannelName
    ) || null
  const selectedChannelKey =
    selectedChannel?.channelKey || normalizedChannelName
  const channelMessages =
    (currentSnapshot.channelMessages || {})[selectedChannelKey]?.slice(-6) || []

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
    Alert.alert('P2P 核心未就绪', '等状态变为“在线”后再执行文件操作。')
    return false
  }

  const handlePickFile = async () => {
    if (!guardReady()) return

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

      await core.publishFile({
        uri: file.uri,
        name: file.name,
        size: fileSize,
        mimeType: file.mimeType,
        contentBytes,
      })
    } catch (error) {
      Alert.alert(
        '发布失败',
        error instanceof Error ? error.message : '请选择可读取的文件'
      )
    }
  }

  const handlePasteLink = async () => {
    const text = (await Clipboard.getStringAsync()).trim()
    if (!text) {
      Alert.alert('剪贴板为空', '复制 most:// 分享链接后再粘贴。')
      return
    }
    setDownloadLink(text)
  }

  const handleDownload = async () => {
    if (!guardReady()) return

    if (downloadValidation.state !== 'valid') {
      Alert.alert(
        '链接不可用',
        downloadValidation.state === 'invalid'
          ? downloadValidation.message
          : '请输入 most:// 分享链接'
      )
      return
    }

    if (existingDownloadHolding) {
      Alert.alert('本机已存', '这个 CID 已经在本机做种列表中。')
      return
    }

    try {
      await core.downloadLink({ link: downloadLink.trim() })
      setDownloadLink('')
    } catch (error) {
      Alert.alert(
        '下载失败',
        error instanceof Error ? error.message : '请检查链接或等待种子上线'
      )
    }
  }

  const handleCreateChannel = async () => {
    if (!guardReady()) return
    setChannelBusy(true)
    try {
      await core.createChannel({ name: normalizedChannelName, type: 'public' })
      await core.getChannelMessages(normalizedChannelName)
    } catch (error) {
      Alert.alert(
        'Channel probe failed',
        error instanceof Error ? error.message : 'Unable to join channel'
      )
    } finally {
      setChannelBusy(false)
    }
  }

  const handleRefreshChannel = async () => {
    if (!guardReady()) return
    setChannelBusy(true)
    try {
      if (!selectedChannel) {
        await core.createChannel({ name: normalizedChannelName, type: 'public' })
      }
      await core.getChannelMessages(normalizedChannelName)
      await core.listChannels()
    } catch (error) {
      Alert.alert(
        'Channel refresh failed',
        error instanceof Error ? error.message : 'Unable to refresh channel'
      )
    } finally {
      setChannelBusy(false)
    }
  }

  const handleSendChannelMessage = async () => {
    if (!guardReady()) return
    const content = channelDraft.trim()
    if (!content) {
      Alert.alert('Message required', 'Enter a diagnostic message first.')
      return
    }

    setChannelBusy(true)
    try {
      if (!selectedChannel) {
        await core.createChannel({ name: normalizedChannelName, type: 'public' })
      }
      await core.sendChannelMessage({
        channelName: normalizedChannelName,
        content,
        authorName: 'Android',
      })
      await core.getChannelMessages(normalizedChannelName)
    } catch (error) {
      Alert.alert(
        'Channel send failed',
        error instanceof Error ? error.message : 'Unable to send channel message'
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Text style={styles.brand}>MostBox</Text>
              <Text style={styles.title}>移动做种节点</Text>
            </View>
            <View style={[styles.nodePill, styles[`${nodeTone}Pill`]]}>
              <Radio
                size={15}
                color={nodeTone === 'success' ? '#116149' : '#5b6b66'}
              />
              <Text
                style={[styles.nodePillText, styles[`${nodeTone}PillText`]]}
              >
                {nodeStatusLabel}
              </Text>
            </View>
          </View>

          {currentSnapshot.node.error ? (
            <View style={styles.errorBanner}>
              <CircleAlert size={18} color="#991b1b" />
              <Text style={styles.errorText}>{currentSnapshot.node.error}</Text>
              <Pressable
                disabled={isCoreBusy}
                onPress={handleStartCore}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>重试</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.metricsRow}>
            <Metric
              icon={<Activity size={17} color="#0f766e" />}
              label="在线 Peer"
              value={String(currentSnapshot.node.peerCount)}
            />
            <Metric
              icon={<HardDrive size={17} color="#2563eb" />}
              label="做种文件"
              value={String(currentSnapshot.holdings.length)}
            />
            <Metric
              icon={<ShieldCheck size={17} color="#b45309" />}
              label="CID 校验"
              value="开启"
            />
          </View>
        </View>

        <View style={styles.quickActions}>
          <CommandButton
            variant="primary"
            label={isReady ? '发布文件' : '等待核心'}
            helper="生成 most:// 链接"
            disabled={!isReady}
            onPress={handlePickFile}
            icon={<FileUp size={22} color={isReady ? '#f8fafc' : '#94a3b8'} />}
          />
        </View>

        {__DEV__ ? (
          <View style={styles.panel}>
            <SectionHeader
              icon={<Radio size={18} color="#6d5dfc" />}
              title="Channel Probe"
              meta={selectedChannel ? `${selectedChannel.peerCount} peer` : 'dev'}
            />

            <View style={styles.compactInputShell}>
              <TextInput
                value={channelName}
                onChangeText={setChannelName}
                placeholder="android-smoke"
                placeholderTextColor="#8a9a95"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.compactInput}
              />
            </View>

            <View style={styles.channelActions}>
              <SmallAction
                label={selectedChannel ? 'Joined' : 'Join'}
                disabled={!isReady || channelBusy}
                onPress={handleCreateChannel}
                icon={
                  channelBusy ? (
                    <Loader size={15} color="#94a3b8" />
                  ) : (
                    <CircleCheck size={15} color="#0f766e" />
                  )
                }
              />
              <SmallAction
                label="Refresh"
                disabled={!isReady || channelBusy}
                onPress={handleRefreshChannel}
                icon={<ListChecks size={15} color="#0f766e" />}
              />
            </View>

            {selectedChannel ? (
              <View style={styles.channelStats}>
                <Text style={styles.channelStatText}>
                  key {selectedChannel.channelKey}
                </Text>
                <Text style={styles.channelStatText}>
                  writers {selectedChannel.writerCoreKeys.length}
                </Text>
              </View>
            ) : null}

            <View style={styles.compactInputShell}>
              <TextInput
                value={channelDraft}
                onChangeText={setChannelDraft}
                placeholder="from android"
                placeholderTextColor="#8a9a95"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.compactInput}
              />
            </View>

            <SmallAction
              primary
              label="Send Probe Message"
              disabled={!isReady || channelBusy}
              onPress={handleSendChannelMessage}
              icon={<Send size={16} color={isReady ? '#ffffff' : '#94a3b8'} />}
            />

            {channelMessages.length ? (
              <View style={styles.channelMessageList}>
                {channelMessages.map(message => (
                  <View
                    key={`${message.author}:${message.timestamp}:${message.content}`}
                    style={styles.channelMessageItem}
                  >
                    <Text style={styles.channelMessageMeta}>
                      {message.authorName} - {formatChannelMessageTime(message)}
                    </Text>
                    <Text style={styles.channelMessageText}>
                      {message.content}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                title="No channel messages"
                body="Join a channel, send a probe, or refresh after a desktop peer sends one."
              />
            )}
          </View>
        ) : null}

        <View style={styles.panel}>
          <SectionHeader
            icon={<Link2 size={18} color="#2563eb" />}
            title="接收文件"
            meta={
              existingDownloadHolding
                ? '本机已存'
                : downloadValidation.state === 'valid'
                  ? '链接有效'
                  : downloadLink.trim()
                    ? '待检查'
                    : undefined
            }
          />

          <View style={styles.inputShell}>
            <TextInput
              value={downloadLink}
              onChangeText={setDownloadLink}
              placeholder="most://<cid>?filename=..."
              placeholderTextColor="#8a9a95"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={styles.input}
            />
          </View>

          {downloadValidation.state === 'valid' ? (
            <View style={styles.linkPreview}>
              <CircleCheck size={17} color="#0f766e" />
              <View style={styles.previewTextGroup}>
                <Text style={styles.previewTitle}>
                  {existingDownloadHolding?.fileName ||
                    downloadValidation.parsed.fileName}
                </Text>
                <Text style={styles.previewMeta}>
                  {existingDownloadHolding
                    ? `本机已存 · ${shortCid(downloadValidation.parsed.cid)}`
                    : shortCid(downloadValidation.parsed.cid)}
                </Text>
              </View>
            </View>
          ) : downloadValidation.state === 'invalid' ? (
            <View style={styles.linkPreviewError}>
              <CircleAlert size={17} color="#b91c1c" />
              <Text style={styles.previewErrorText}>
                {downloadValidation.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.downloadActions}>
            <SmallAction
              label="粘贴"
              onPress={handlePasteLink}
              icon={<ClipboardPaste size={16} color="#0f766e" />}
            />
            <SmallAction
              primary
              label={
                existingDownloadHolding
                  ? '已存'
                  : isReady
                    ? '开始下载'
                    : '核心启动中'
              }
              disabled={
                !isReady ||
                downloadValidation.state !== 'valid' ||
                Boolean(existingDownloadHolding)
              }
              onPress={handleDownload}
              icon={
                <Download
                  size={16}
                  color={
                    isReady &&
                    downloadValidation.state === 'valid' &&
                    !existingDownloadHolding
                      ? '#ffffff'
                      : '#94a3b8'
                  }
                />
              }
            />
          </View>
        </View>

        <View style={styles.panel}>
          <SectionHeader
            icon={<Wifi size={18} color="#0f766e" />}
            title="正在做种"
            meta={`${currentSnapshot.holdings.length} 个文件`}
          />

          {currentSnapshot.holdings.length ? (
            <View style={styles.holdingList}>
              {currentSnapshot.holdings.map(holding => {
                const isExporting = exportingCid === holding.cid
                const isDeleting = deletingCid === holding.cid
                const isCopied = copiedCid === holding.cid
                const seedTone = getSeedTone(holding.status)

                return (
                  <View key={holding.cid} style={styles.holdingItem}>
                    <View style={styles.holdingTopRow}>
                      <View style={styles.fileIcon}>
                        <FileCheck size={20} color="#0f766e" />
                      </View>
                      <View style={styles.holdingMain}>
                        <Text style={styles.fileName} numberOfLines={2}>
                          {holding.fileName}
                        </Text>
                        <Text style={styles.fileMeta}>
                          {formatBytes(holding.size)} ·{' '}
                          {holding.source === 'published' ? '已发布' : '已下载'}
                        </Text>
                      </View>
                      <StatusBadge
                        label={SEED_STATUS_LABELS[holding.status]}
                        tone={seedTone}
                      />
                    </View>

                    <View style={styles.cidBlock}>
                      <Text style={styles.cidLabel}>CID</Text>
                      <Text style={styles.cidText}>
                        {shortCid(holding.cid, 16, 10)}
                      </Text>
                    </View>

                    <View style={styles.topicRow}>
                      <Text style={styles.topicText}>
                        {holding.topicJoined
                          ? 'Topic 已加入'
                          : '等待加入 topic'}
                      </Text>
                      <Text style={styles.topicText}>
                        {holding.peerCount} peer
                      </Text>
                    </View>

                    <View style={styles.holdingActions}>
                      <SmallAction
                        label={isCopied ? '已复制' : '复制链接'}
                        onPress={() => handleCopyHoldingLink(holding)}
                        icon={
                          isCopied ? (
                            <CircleCheck size={15} color="#0f766e" />
                          ) : (
                            <Copy size={15} color="#0f766e" />
                          )
                        }
                      />
                      <SmallAction
                        label={isExporting ? '处理中' : '分享'}
                        disabled={isExporting || isDeleting || !isReady}
                        onPress={() => handleShareHolding(holding)}
                        icon={
                          isExporting ? (
                            <Loader size={15} color="#94a3b8" />
                          ) : (
                            <Share2 size={15} color="#0f766e" />
                          )
                        }
                      />
                      <SmallAction
                        label="保存"
                        disabled={isExporting || isDeleting || !isReady}
                        onPress={() => handleSaveHolding(holding)}
                        icon={
                          <Save
                            size={15}
                            color={isReady ? '#0f766e' : '#94a3b8'}
                          />
                        }
                      />
                      <SmallAction
                        danger
                        label={isDeleting ? '删除中' : '删除'}
                        disabled={isDeleting || isExporting || !isReady}
                        onPress={() => handleDeleteHolding(holding)}
                        icon={
                          isDeleting ? (
                            <Loader size={15} color="#94a3b8" />
                          ) : (
                            <Trash2 size={15} color="#b91c1c" />
                          )
                        }
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          ) : (
            <EmptyState
              title="还没有本机持有文件"
              body="发布或下载完成后，文件会自动加入做种列表。"
            />
          )}
        </View>

        <View style={styles.panel}>
          <SectionHeader
            icon={<ListChecks size={18} color="#b45309" />}
            title="传输活动"
            meta={
              activeTransfers.length
                ? `${activeTransfers.length} 个进行中`
                : '空闲'
            }
          />

          {latestTransfers.length ? (
            <View style={styles.transferList}>
              {latestTransfers.map(transfer => {
                const progress = clampProgress(transfer.progress)
                const filler = Math.max(0, 100 - progress)
                return (
                  <View key={transfer.id} style={styles.transferItem}>
                    <View style={styles.transferTopRow}>
                      <View style={styles.transferTitleGroup}>
                        <Text style={styles.transferName} numberOfLines={1}>
                          {transfer.fileName ||
                            TRANSFER_KIND_LABELS[transfer.kind]}
                        </Text>
                        <Text style={styles.transferMeta}>
                          {TRANSFER_KIND_LABELS[transfer.kind]} ·{' '}
                          {transfer.message}
                        </Text>
                      </View>
                      <StatusBadge
                        label={TRANSFER_STATUS_LABELS[transfer.status]}
                        tone={getTransferTone(transfer.status)}
                      />
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { flex: progress }]} />
                      <View style={{ flex: filler }} />
                    </View>
                  </View>
                )
              })}
            </View>
          ) : (
            <EmptyState title="暂无传输" body="发布和下载进度会显示在这里。" />
          )}
        </View>

        <View style={styles.panel}>
          <SectionHeader
            icon={<Radio size={18} color="#6d5dfc" />}
            title="节点日志"
            meta={recentLogs.length ? `最近 ${recentLogs.length} 条` : '暂无'}
          />

          {recentLogs.length ? (
            <View style={styles.logList}>
              {recentLogs.map(log => (
                <View key={log.id} style={styles.logItem}>
                  <Text style={styles.logTime}>{formatLogTime(log.time)}</Text>
                  <View style={styles.logBody}>
                    <Text
                      style={[
                        styles.logLevel,
                        log.level === 'error' ? styles.logLevelError : null,
                        log.level === 'warn' ? styles.logLevelWarn : null,
                      ]}
                    >
                      {LOG_LEVEL_LABELS[log.level]}
                    </Text>
                    <Text style={styles.logMessage}>{log.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="日志为空"
              body="核心状态变化和传输事件会记录在这里。"
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7f5',
  },
  content: {
    paddingBottom: 32,
    gap: 14,
  },
  hero: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: '#0d3b35',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  brandGroup: {
    flex: 1,
    gap: 3,
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
  nodePill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#e7ece9',
  },
  successPill: {
    backgroundColor: '#d1fae5',
  },
  dangerPill: {
    backgroundColor: '#fee2e2',
  },
  pendingPill: {
    backgroundColor: '#fef3c7',
  },
  mutedPill: {
    backgroundColor: '#e7ece9',
  },
  nodePillText: {
    color: '#5b6b66',
    fontSize: 12,
    fontWeight: '900',
  },
  successPillText: {
    color: '#116149',
  },
  dangerPillText: {
    color: '#991b1b',
  },
  pendingPillText: {
    color: '#92400e',
  },
  mutedPillText: {
    color: '#5b6b66',
  },
  errorBanner: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  errorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  retryButton: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#991b1b',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'center',
    gap: 5,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  metricIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edf6f2',
  },
  metricValue: {
    color: '#12211d',
    fontSize: 23,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#63716c',
    fontSize: 11,
    fontWeight: '800',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  commandButton: {
    flex: 1,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  commandButtonPrimary: {
    borderColor: '#0f766e',
    backgroundColor: '#0f766e',
  },
  commandButtonDisabled: {
    borderColor: '#d5ded9',
    backgroundColor: '#edf2ef',
  },
  commandIcon: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edf6f2',
  },
  commandIconPrimary: {
    backgroundColor: '#17877d',
  },
  commandIconDisabled: {
    backgroundColor: '#e3ebe7',
  },
  commandTextGroup: {
    flex: 1,
    gap: 3,
  },
  commandLabel: {
    color: '#13231f',
    fontSize: 15,
    fontWeight: '900',
  },
  commandLabelPrimary: {
    color: '#ffffff',
  },
  commandHelper: {
    color: '#63716c',
    fontSize: 11,
    fontWeight: '700',
  },
  commandHelperPrimary: {
    color: '#d5f5ec',
  },
  panel: {
    gap: 13,
    marginHorizontal: 16,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#13231f',
    fontSize: 17,
    fontWeight: '900',
  },
  sectionMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '800',
  },
  inputShell: {
    minHeight: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cddbd5',
    backgroundColor: '#f8fbf9',
  },
  input: {
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#13231f',
    fontSize: 14,
    fontWeight: '700',
  },
  compactInputShell: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cddbd5',
    backgroundColor: '#f8fbf9',
  },
  compactInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#13231f',
    fontSize: 14,
    fontWeight: '700',
  },
  channelActions: {
    flexDirection: 'row',
    gap: 9,
  },
  channelStats: {
    gap: 5,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f3f0ff',
  },
  channelStatText: {
    color: '#4c3fb0',
    fontSize: 12,
    fontWeight: '800',
  },
  channelMessageList: {
    gap: 9,
  },
  channelMessageItem: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fbf9',
  },
  channelMessageMeta: {
    color: '#6d5dfc',
    fontSize: 11,
    fontWeight: '900',
  },
  channelMessageText: {
    color: '#13231f',
    fontSize: 13,
    fontWeight: '700',
  },
  linkPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#edfdf7',
  },
  linkPreviewError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#fff1f2',
  },
  previewTextGroup: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  previewMeta: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
  },
  previewErrorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
  },
  downloadActions: {
    flexDirection: 'row',
    gap: 9,
  },
  smallAction: {
    flex: 1,
    minWidth: 128,
    minHeight: 40,
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
  holdingList: {
    gap: 12,
  },
  holdingItem: {
    gap: 11,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#fbfdfc',
  },
  holdingTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  fileIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edfdf7',
  },
  holdingMain: {
    flex: 1,
    gap: 3,
  },
  fileName: {
    color: '#13231f',
    fontSize: 15,
    fontWeight: '900',
  },
  fileMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    minHeight: 27,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#e7ece9',
  },
  badgeText: {
    color: '#5b6b66',
    fontSize: 11,
    fontWeight: '900',
  },
  successBadge: {
    backgroundColor: '#dff8ec',
  },
  dangerBadge: {
    backgroundColor: '#fee2e2',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
  },
  mutedBadge: {
    backgroundColor: '#e7ece9',
  },
  successBadgeText: {
    color: '#116149',
  },
  dangerBadgeText: {
    color: '#991b1b',
  },
  pendingBadgeText: {
    color: '#92400e',
  },
  mutedBadgeText: {
    color: '#5b6b66',
  },
  cidBlock: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#eef4f1',
  },
  cidLabel: {
    color: '#63716c',
    fontSize: 10,
    fontWeight: '900',
  },
  cidText: {
    color: '#13231f',
    fontSize: 12,
    fontWeight: '800',
  },
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  topicText: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '800',
  },
  holdingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  transferList: {
    gap: 10,
  },
  transferItem: {
    gap: 10,
    paddingVertical: 2,
  },
  transferTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transferTitleGroup: {
    flex: 1,
    gap: 3,
  },
  transferName: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  transferMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 7,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#e6eee9',
  },
  progressFill: {
    minWidth: 3,
    backgroundColor: '#2563eb',
  },
  logList: {
    gap: 11,
  },
  logItem: {
    flexDirection: 'row',
    gap: 10,
  },
  logTime: {
    width: 42,
    color: '#63716c',
    fontSize: 11,
    fontWeight: '800',
  },
  logBody: {
    flex: 1,
    gap: 2,
  },
  logLevel: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
  },
  logLevelWarn: {
    color: '#b45309',
  },
  logLevelError: {
    color: '#b91c1c',
  },
  logMessage: {
    color: '#44514d',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    gap: 4,
    paddingVertical: 14,
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
  },
})
