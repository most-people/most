import './src/polyfills/eventTarget'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import b4a from 'b4a'
import {
  ArrowLeftRight,
  Files,
  ListChecks,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react-native'
import { NodeStatusScreen } from './src/features/node/NodeStatusScreen'
import { createMostBoxCore } from './src/mobileCore/createMostBoxCore'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from './src/ui/theme'
import {
  hasExplicitMostLinkFilename,
  parseIncomingMostLink,
  parseMostLink,
  type IncomingMostLink,
} from './src/mobileCore/protocol'
import {
  getStoreDownloadPolicyError,
  getStoreFilePolicyError,
} from './src/mobileCore/storeFilePolicy'
import type { DocumentPickerAsset } from 'expo-document-picker'
import type {
  MobileCoreSnapshot,
  MobileHolding,
  MostBoxMobileCore,
} from './src/mobileCore/types'

const DEV_CID_MAX_BYTES = 20 * 1024 * 1024
const PRIVACY_URL = 'https://most.box/privacy/'
const TERMS_URL = 'https://most.box/terms/'
const SUPPORT_URL = 'https://github.com/most-people/most/issues'
const MIME_BY_EXTENSION: Record<string, string> = {
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

type RootTab = 'files' | 'transfers' | 'settings'

const TAB_LABELS: Record<RootTab, string> = {
  files: '文件',
  transfers: '传输',
  settings: '设置',
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
  if (value.startsWith('file://') || value.startsWith('content://')) {
    return value
  }
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
    { encoding: FileSystem.EncodingType.Base64 }
  )
}

function shortCid(cid: string) {
  if (cid.length <= 34) return cid
  return `${cid.slice(0, 20)}...${cid.slice(-10)}`
}

export default function App() {
  const theme = useMostBoxTheme()
  const styles = appStyles[theme.mode]
  const coreRef = useRef<MostBoxMobileCore | null>(null)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [snapshot, setSnapshot] = useState<MobileCoreSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<RootTab>('files')
  const [publishing, setPublishing] = useState(false)
  const [exportingCid, setExportingCid] = useState<string | null>(null)
  const [deletingCid, setDeletingCid] = useState<string | null>(null)
  const [copiedCid, setCopiedCid] = useState<string | null>(null)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [downloadLinkInput, setDownloadLinkInput] = useState('')
  const [downloadIntent, setDownloadIntent] = useState<IncomingMostLink | null>(
    null
  )
  const [downloadLinkError, setDownloadLinkError] = useState('')
  const [downloadingCid, setDownloadingCid] = useState<string | null>(null)

  if (!coreRef.current) {
    coreRef.current = createMostBoxCore({ storagePath: getCoreStoragePath() })
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
        error instanceof Error ? error.message : '无法启动 P2P 核心'
      )
    })

    return () => {
      unsubscribe()
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      void core.stop()
    }
  }, [core])

  const openDownloadIntent = useCallback((intent: IncomingMostLink) => {
    const policyError = getStoreDownloadPolicyError(
      intent.fileName,
      hasExplicitMostLinkFilename(intent.link)
    )
    setActiveTab('files')
    setDownloadModalOpen(true)
    setDownloadLinkInput(intent.link)
    setDownloadIntent(policyError ? null : intent)
    setDownloadLinkError(policyError || '')
  }, [])

  useEffect(() => {
    let active = true
    const handleUrl = (url: string) => {
      try {
        const intent = parseIncomingMostLink(url)
        if (intent) openDownloadIntent(intent)
      } catch (error) {
        Alert.alert(
          '分享链接无效',
          error instanceof Error ? error.message : '请输入有效的 most:// 链接'
        )
      }
    }
    const subscription = Linking.addEventListener('url', event => {
      handleUrl(event.url)
    })

    void Linking.getInitialURL()
      .then(url => {
        if (active && url) handleUrl(url)
      })
      .catch(() => {})

    return () => {
      active = false
      subscription.remove()
    }
  }, [openDownloadIntent])

  const guardReady = () => {
    if (isReady) return true
    Alert.alert('P2P 核心未就绪', '请等待状态变为“在线”后再继续。')
    return false
  }

  const markCopied = (cid: string) => {
    setCopiedCid(cid)
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
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

  const handlePublishFile = async () => {
    if (!guardReady()) return

    setPublishing(true)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      })
      if (result.canceled) return

      const file = result.assets[0]
      if (!file) return
      const policyError = getStoreFilePolicyError(file.name, file.mimeType)
      if (policyError) {
        Alert.alert('不支持此文件', policyError)
        return
      }

      const transfer = await core.publishFile({
        uri: file.uri,
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType,
        contentBytes: await readDevCidBytes(file),
      })

      if (!transfer.link) throw new Error('未生成分享链接')
      await Clipboard.setStringAsync(transfer.link)
      Alert.alert('发布完成', '分享链接已复制，文件正在前台做种。')
    } catch (error) {
      Alert.alert(
        '发布失败',
        error instanceof Error ? error.message : '请选择可读取的文件'
      )
    } finally {
      setPublishing(false)
    }
  }

  const openDownloadModal = () => {
    setDownloadLinkInput('')
    setDownloadIntent(null)
    setDownloadLinkError('')
    setDownloadModalOpen(true)
  }

  const closeDownloadModal = () => {
    if (downloadingCid) return
    setDownloadModalOpen(false)
    setDownloadIntent(null)
    setDownloadLinkError('')
  }

  const handleDownloadLinkChange = (value: string) => {
    setDownloadLinkInput(value)
    setDownloadIntent(null)
    setDownloadLinkError('')
  }

  const handleInspectDownload = () => {
    try {
      const link = downloadLinkInput.trim()
      const parsed = parseMostLink(link)
      const policyError = getStoreDownloadPolicyError(
        parsed.fileName,
        hasExplicitMostLinkFilename(link)
      )
      if (policyError) {
        setDownloadLinkError(policyError)
        return
      }
      setDownloadIntent({ link, ...parsed })
      setDownloadLinkError('')
    } catch (error) {
      setDownloadIntent(null)
      setDownloadLinkError(
        error instanceof Error ? error.message : '请输入有效的 most:// 链接'
      )
    }
  }

  const handleConfirmDownload = async () => {
    if (!downloadIntent || !guardReady()) return

    setDownloadingCid(downloadIntent.cid)
    try {
      await core.downloadLink({ link: downloadIntent.link })
      setDownloadModalOpen(false)
      setDownloadIntent(null)
      setDownloadLinkError('')
      Alert.alert('下载完成', '文件已通过 CID 校验并开始前台做种。')
    } catch (error) {
      setDownloadLinkError(
        error instanceof Error ? error.message : '请检查链接或等待种子上线'
      )
    } finally {
      setDownloadingCid(null)
    }
  }

  const handleDeleteHolding = (holding: MobileHolding) => {
    if (!guardReady()) return
    Alert.alert(
      '删除本机文件',
      `将移除 ${holding.fileName} 并停止为这个 CID 做种。已另存的副本不会被删除。`,
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
              .finally(() => setDeletingCid(null))
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
    if (!info.exists) throw new Error('导出的文件不存在，请重新下载后再试')

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
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('当前设备不支持系统分享')
      }
      const exported = await prepareHoldingFile(holding)
      await Sharing.shareAsync(exported.fileUri, {
        mimeType: exported.mimeType,
        dialogTitle: `分享 ${exported.fileName}`,
      })
    } catch (error) {
      Alert.alert(
        '分享失败',
        error instanceof Error ? error.message : '无法分享文件'
      )
    } finally {
      setExportingCid(null)
    }
  }

  const handleSaveHolding = async (holding: MobileHolding) => {
    if (!guardReady()) return
    setExportingCid(holding.cid)
    try {
      const exported = await prepareHoldingFile(holding)
      if (Platform.OS !== 'android') {
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error('当前设备不支持导出文件')
        }
        await Sharing.shareAsync(exported.fileUri, {
          mimeType: exported.mimeType,
          dialogTitle: `存储 ${exported.fileName}`,
        })
        return
      }

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

  const openExternalUrl = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('无法打开链接', url)
    }
  }

  const statusLabel =
    nodeStatus === 'ready'
      ? '在线'
      : nodeStatus === 'error'
        ? '异常'
        : nodeStatus === 'starting'
          ? '启动中'
          : '离线'
  const statusPillStyle =
    nodeStatus === 'ready'
      ? styles.statusPillReady
      : nodeStatus === 'error'
        ? styles.statusPillError
        : styles.statusPillPending
  const statusDotStyle =
    nodeStatus === 'ready'
      ? styles.statusDotReady
      : nodeStatus === 'error'
        ? styles.statusDotError
        : styles.statusDotPending
  const statusTextStyle =
    nodeStatus === 'ready'
      ? styles.statusTextReady
      : nodeStatus === 'error'
        ? styles.statusTextError
        : styles.statusTextPending

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top', 'right', 'bottom', 'left']}
        style={styles.screen}
      >
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.colors.background}
        />
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <ShieldCheck size={19} color={theme.colors.accent} />
            </View>
            <View style={styles.brandTextGroup}>
              <Text style={styles.brandName}>MostBox</Text>
              <Text style={styles.pageTitle}>{TAB_LABELS[activeTab]}</Text>
            </View>
          </View>
          <View style={[styles.statusPill, statusPillStyle]}>
            <View style={[styles.statusDot, statusDotStyle]} />
            <Text style={[styles.statusText, statusTextStyle]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <NodeStatusScreen
            section={activeTab}
            snapshot={currentSnapshot}
            copiedCid={copiedCid}
            deletingCid={deletingCid}
            exportingCid={exportingCid}
            actionDisabled={!isReady || publishing}
            onPublishFile={handlePublishFile}
            onReceiveLink={openDownloadModal}
            onCopyHoldingLink={handleCopyHoldingLink}
            onDeleteHolding={handleDeleteHolding}
            onSaveHolding={handleSaveHolding}
            onShareHolding={handleShareHolding}
            onOpenPrivacy={() => openExternalUrl(PRIVACY_URL)}
            onOpenTerms={() => openExternalUrl(TERMS_URL)}
            onOpenSupport={() => openExternalUrl(SUPPORT_URL)}
            onRetryStartCore={handleStartCore}
            retryStartDisabled={isCoreBusy}
          />
        </View>

        <View style={styles.tabBar}>
          <TabButton
            active={activeTab === 'files'}
            icon={
              <Files
                size={21}
                color={
                  activeTab === 'files'
                    ? theme.colors.accent
                    : theme.colors.textSecondary
                }
              />
            }
            label="文件"
            onPress={() => setActiveTab('files')}
          />
          <TabButton
            active={activeTab === 'transfers'}
            icon={
              <ArrowLeftRight
                size={21}
                color={
                  activeTab === 'transfers'
                    ? theme.colors.accent
                    : theme.colors.textSecondary
                }
              />
            }
            label="传输"
            onPress={() => setActiveTab('transfers')}
          />
          <TabButton
            active={activeTab === 'settings'}
            icon={
              <Settings
                size={21}
                color={
                  activeTab === 'settings'
                    ? theme.colors.accent
                    : theme.colors.textSecondary
                }
              />
            }
            label="设置"
            onPress={() => setActiveTab('settings')}
          />
        </View>

        <Modal
          animationType="fade"
          onRequestClose={closeDownloadModal}
          transparent
          visible={downloadModalOpen}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboard}
            >
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleGroup}>
                      <ListChecks size={20} color={theme.colors.accent} />
                      <Text style={styles.modalTitle}>接收文件</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="关闭"
                      accessibilityRole="button"
                      disabled={Boolean(downloadingCid)}
                      hitSlop={8}
                      onPress={closeDownloadModal}
                      style={({ pressed }) => [
                        styles.closeButton,
                        pressed ? styles.pressablePressed : null,
                      ]}
                    >
                      <X size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                  </View>

                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!downloadingCid}
                    multiline
                    onChangeText={handleDownloadLinkChange}
                    placeholder="most://CID?filename=..."
                    placeholderTextColor={theme.colors.textMuted}
                    selectionColor={theme.colors.accent}
                    style={styles.linkInput}
                    value={downloadLinkInput}
                  />

                  {downloadIntent ? (
                    <View style={styles.downloadPreview}>
                      <Text numberOfLines={2} style={styles.previewFileName}>
                        {downloadIntent.fileName}
                      </Text>
                      <Text style={styles.previewLabel}>CID</Text>
                      <Text selectable style={styles.previewCid}>
                        {shortCid(downloadIntent.cid)}
                      </Text>
                    </View>
                  ) : null}

                  {downloadLinkError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {downloadLinkError}
                    </Text>
                  ) : null}

                  <Text style={styles.consentText}>
                    仅接收你信任且有权下载的文件。下载完成后将校验
                    CID，并在应用前台继续做种。
                  </Text>

                  <View style={styles.modalActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(downloadingCid)}
                      onPress={closeDownloadModal}
                      style={({ pressed }) => [
                        styles.cancelButton,
                        pressed ? styles.pressablePressed : null,
                      ]}
                    >
                      <Text style={styles.cancelButtonText}>取消</Text>
                    </Pressable>
                    {downloadIntent ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={!isReady || Boolean(downloadingCid)}
                        onPress={handleConfirmDownload}
                        style={({ pressed }) => [
                          styles.confirmButton,
                          !isReady || downloadingCid
                            ? styles.confirmButtonDisabled
                            : null,
                          pressed ? styles.confirmButtonPressed : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.confirmButtonText,
                            !isReady || downloadingCid
                              ? styles.confirmButtonTextDisabled
                              : null,
                          ]}
                        >
                          {downloadingCid ? '下载并校验中' : '确认下载'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        disabled={!downloadLinkInput.trim()}
                        onPress={handleInspectDownload}
                        style={({ pressed }) => [
                          styles.confirmButton,
                          !downloadLinkInput.trim()
                            ? styles.confirmButtonDisabled
                            : null,
                          pressed ? styles.confirmButtonPressed : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.confirmButtonText,
                            !downloadLinkInput.trim()
                              ? styles.confirmButtonTextDisabled
                              : null,
                          ]}
                        >
                          检查链接
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

type TabButtonProps = {
  active: boolean
  icon: React.ReactNode
  label: string
  onPress: () => void
}

function TabButton({ active, icon, label, onPress }: TabButtonProps) {
  const theme = useMostBoxTheme()
  const styles = appStyles[theme.mode]

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active ? styles.tabButtonActive : null,
        pressed ? styles.pressablePressed : null,
      ]}
    >
      {icon}
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

function createStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    brandRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandMark: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.accentSoft,
    },
    brandTextGroup: {
      flex: 1,
      gap: 1,
    },
    brandName: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: '600',
    },
    pageTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
    },
    statusPill: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusPillReady: {
      backgroundColor: colors.successSoft,
    },
    statusPillPending: {
      backgroundColor: colors.warningSoft,
    },
    statusPillError: {
      backgroundColor: colors.dangerSoft,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusDotReady: {
      backgroundColor: colors.success,
    },
    statusDotPending: {
      backgroundColor: colors.warning,
    },
    statusDotError: {
      backgroundColor: colors.danger,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
    },
    statusTextReady: {
      color: colors.success,
    },
    statusTextPending: {
      color: colors.warning,
    },
    statusTextError: {
      color: colors.danger,
    },
    content: {
      flex: 1,
    },
    tabBar: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    tabButton: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      borderRadius: radii.medium,
    },
    tabButtonActive: {
      backgroundColor: colors.accentSoft,
    },
    tabText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '500',
    },
    tabTextActive: {
      color: colors.accent,
      fontWeight: '600',
    },
    pressablePressed: {
      opacity: 0.68,
    },
    modalOverlay: {
      flex: 1,
      padding: 16,
      backgroundColor: colors.overlay,
    },
    modalKeyboard: {
      flex: 1,
    },
    modalScrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
    },
    modalCard: {
      width: '100%',
      maxWidth: 520,
      gap: 16,
      padding: 20,
      borderRadius: radii.large,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceSolid,
      ...(Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.mode === 'dark' ? 0.5 : 0.16,
          shadowRadius: 30,
        },
        android: {
          elevation: 8,
          shadowColor: colors.shadow,
        },
      }) ?? {}),
    },
    modalHeader: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
    },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    linkInput: {
      minHeight: 96,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    downloadPreview: {
      gap: 5,
      padding: 14,
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.accentSoft,
    },
    previewFileName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    previewLabel: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    previewCid: {
      color: colors.textSecondary,
      fontFamily: Platform.select({
        ios: 'Menlo',
        android: 'monospace',
      }),
      fontSize: 12,
      fontWeight: '500',
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    consentText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    cancelButton: {
      flex: 1,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceSubtle,
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    confirmButton: {
      flex: 1.35,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radii.medium,
      backgroundColor: colors.accent,
    },
    confirmButtonPressed: {
      backgroundColor: colors.accentPressed,
    },
    confirmButtonDisabled: {
      backgroundColor: colors.surfaceMuted,
    },
    confirmButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: '600',
    },
    confirmButtonTextDisabled: {
      color: colors.textMuted,
    },
  })
}

const appStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
} as const
