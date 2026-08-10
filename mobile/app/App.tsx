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
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Sharing from 'expo-sharing'
import b4a from 'b4a'
import {
  ArrowLeftRight,
  BookOpen,
  Files,
  Languages,
  ListChecks,
  Radio,
  ShieldCheck,
  X,
} from 'lucide-react-native'
import { KnowledgeBaseScreen } from './src/features/knowledge/KnowledgeBaseScreen'
import { createExpoKnowledgeRepository } from './src/features/knowledge/expoKnowledgeRepository'
import { validateKnowledgeSnapshot } from './src/features/knowledge/knowledgeModel'
import { NodeStatusScreen } from './src/features/node/NodeStatusScreen'
import { P2PPingScreen } from './src/features/node/P2PPingScreen'
import {
  I18nProvider,
  LOCALES,
  localeNames,
  useI18n,
  type MessageKey,
} from './src/i18n'
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
import {
  getFriendlyCoreError,
  usesAccessibilityLayout,
} from './src/ui/presentation'
import type { DocumentPickerAsset } from 'expo-document-picker'
import type {
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
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

type RootTab = 'files' | 'knowledge' | 'transfers' | 'node'

const TAB_LABEL_KEYS: Record<RootTab, MessageKey> = {
  files: 'nav.files',
  knowledge: 'nav.knowledge',
  transfers: 'nav.transfers',
  node: 'nav.node',
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
  return (
    <I18nProvider>
      <MostBoxApp />
    </I18nProvider>
  )
}

function MostBoxApp() {
  const { locale, setLocale, t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = appStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const coreRef = useRef<MostBoxMobileCore | null>(null)
  const knowledgeRepositoryRef = useRef<ReturnType<
    typeof createExpoKnowledgeRepository
  > | null>(null)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [snapshot, setSnapshot] = useState<MobileCoreSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<RootTab>('files')
  const [nodeRoute, setNodeRoute] = useState<'status' | 'p2pPing'>('status')
  const [publishing, setPublishing] = useState(false)
  const [knowledgeDirty, setKnowledgeDirty] = useState(false)
  const [knowledgeBackupWorking, setKnowledgeBackupWorking] = useState(false)
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
  const [cancellingDownload, setCancellingDownload] = useState(false)
  const [openDownloadAfterComplete, setOpenDownloadAfterComplete] =
    useState(false)
  const [retryingTransferId, setRetryingTransferId] = useState<string | null>(
    null
  )

  if (!coreRef.current) {
    coreRef.current = createMostBoxCore({ storagePath: getCoreStoragePath() })
  }
  if (!knowledgeRepositoryRef.current) {
    knowledgeRepositoryRef.current = createExpoKnowledgeRepository()
  }

  const core = coreRef.current
  const knowledgeRepository = knowledgeRepositoryRef.current
  const currentSnapshot = snapshot ?? core.getSnapshot()
  const nodeStatus = currentSnapshot.node.status
  const isReady = nodeStatus === 'ready'
  const isCoreBusy = nodeStatus === 'starting' || nodeStatus === 'stopping'

  useEffect(() => {
    const unsubscribe = core.subscribe(setSnapshot)
    void core.start().catch(error => {
      Alert.alert(
        t('app.core.startFailed'),
        getFriendlyCoreError(error, locale)
      )
    })

    return () => {
      unsubscribe()
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      void core.stop()
    }
  }, [core, locale, t])

  const openDownloadIntent = useCallback(
    (intent: IncomingMostLink, openAfterComplete = false) => {
      const policyError = getStoreDownloadPolicyError(
        intent.fileName,
        hasExplicitMostLinkFilename(intent.link)
      )
      setDownloadModalOpen(true)
      setDownloadLinkInput(intent.link)
      setDownloadIntent(policyError ? null : intent)
      setDownloadLinkError(policyError || '')
      setOpenDownloadAfterComplete(openAfterComplete && !policyError)
    },
    []
  )

  useEffect(() => {
    let active = true
    const handleUrl = (url: string) => {
      try {
        const intent = parseIncomingMostLink(url)
        if (intent) openDownloadIntent(intent)
      } catch (error) {
        Alert.alert(
          t('app.link.invalidTitle'),
          error instanceof Error ? error.message : t('app.link.invalid')
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
  }, [openDownloadIntent, t])

  const guardReady = () => {
    if (isReady) return true
    Alert.alert(t('app.core.notReadyTitle'), t('app.core.notReadyBody'))
    return false
  }

  const handleKnowledgeDirtyChange = useCallback((dirty: boolean) => {
    setKnowledgeDirty(dirty)
  }, [])

  const changeTab = (nextTab: RootTab) => {
    if (nextTab === activeTab) return
    if (activeTab === 'knowledge' && knowledgeDirty) {
      Alert.alert(t('app.discard.title'), t('app.discard.body'), [
        { text: t('app.discard.continue'), style: 'cancel' },
        {
          text: t('app.discard.confirm'),
          style: 'destructive',
          onPress: () => setActiveTab(nextTab),
        },
      ])
      return
    }
    if (nextTab !== 'node') setNodeRoute('status')
    setActiveTab(nextTab)
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
        t('app.core.startFailed'),
        getFriendlyCoreError(error, locale)
      )
    }
  }

  const handleStartP2PPing = (role: 'host' | 'join', code?: string) => {
    if (!isReady) return Promise.reject(new Error(t('app.core.notReadyBody')))
    return core.startP2PPing({ role, code })
  }

  const handleCancelP2PPing = (id?: string) => core.cancelP2PPing({ id })

  const publishPickedFile = async () => {
    if (!guardReady()) return

    setPublishing(true)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      })
      if (result.canceled) return null

      const file = result.assets[0]
      if (!file) return null
      const policyError = getStoreFilePolicyError(file.name, file.mimeType)
      if (policyError) {
        Alert.alert(t('app.file.unsupported'), policyError)
        return null
      }

      const transfer = await core.publishFile({
        uri: file.uri,
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType,
        contentBytes: await readDevCidBytes(file),
      })

      if (!transfer.link) throw new Error(t('app.file.linkMissing'))
      return { file, link: transfer.link, transfer }
    } finally {
      setPublishing(false)
    }
  }

  const handlePublishFile = async () => {
    try {
      const result = await publishPickedFile()
      if (!result) return
      await Clipboard.setStringAsync(result.link)
      Alert.alert(t('app.publish.completeTitle'), t('app.publish.completeBody'))
    } catch (error) {
      Alert.alert(
        t('app.publish.failedTitle'),
        error instanceof Error ? error.message : t('app.publish.failedBody')
      )
    }
  }

  const handlePublishKnowledgeAttachment = async () => {
    const result = await publishPickedFile()
    if (!result) return null
    return {
      fileName: result.file.name,
      link: result.link,
      mimeType: result.file.mimeType,
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
    setOpenDownloadAfterComplete(false)
  }

  const handleCancelDownload = async () => {
    if (!downloadingCid) {
      closeDownloadModal()
      return
    }

    setCancellingDownload(true)
    try {
      await core.cancelDownload({ cid: downloadingCid })
      setDownloadModalOpen(false)
      setDownloadIntent(null)
      setDownloadLinkError('')
      setOpenDownloadAfterComplete(false)
    } catch (error) {
      setDownloadLinkError(getFriendlyCoreError(error, locale))
    } finally {
      setCancellingDownload(false)
    }
  }

  const handleDownloadLinkChange = (value: string) => {
    setDownloadLinkInput(value)
    setDownloadIntent(null)
    setDownloadLinkError('')
    setOpenDownloadAfterComplete(false)
  }

  const handlePasteDownloadLink = async () => {
    try {
      const value = await Clipboard.getStringAsync()
      handleDownloadLinkChange(value.trim())
    } catch {
      setDownloadLinkError(t('app.clipboard.failed'))
    }
  }

  const handleEditDownloadLink = () => {
    if (downloadingCid) return
    setDownloadIntent(null)
    setDownloadLinkError('')
    setOpenDownloadAfterComplete(false)
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
        error instanceof Error ? error.message : t('app.link.invalid')
      )
    }
  }

  const handleConfirmDownload = async () => {
    if (!downloadIntent || !guardReady()) return

    setDownloadingCid(downloadIntent.cid)
    try {
      await core.downloadLink({ link: downloadIntent.link })
      const completedCid = downloadIntent.cid
      const shouldOpen = openDownloadAfterComplete
      setDownloadModalOpen(false)
      setDownloadIntent(null)
      setDownloadLinkError('')
      setOpenDownloadAfterComplete(false)
      const holding = core
        .getSnapshot()
        .holdings.find(item => item.cid === completedCid)
      if (shouldOpen && holding) {
        Alert.alert(
          t('app.download.completeTitle'),
          t('app.download.completeBody'),
          [
            { text: t('app.download.later') },
            {
              text: t('app.download.openOther'),
              onPress: () => {
                void handleOpenHolding(holding)
              },
            },
          ]
        )
      } else {
        Alert.alert(
          t('app.download.completeTitle'),
          t('app.download.completeBody')
        )
      }
    } catch (error) {
      setDownloadLinkError(getFriendlyCoreError(error, locale))
    } finally {
      setDownloadingCid(null)
    }
  }

  const handleRetryTransfer = async (transfer: MobileTransfer) => {
    if (!guardReady()) return
    if (transfer.kind === 'publish') {
      await handlePublishFile()
      return
    }
    if (!transfer.link) {
      Alert.alert(
        t('app.download.retryUnavailableTitle'),
        t('app.download.retryUnavailableBody')
      )
      return
    }

    setRetryingTransferId(transfer.id)
    try {
      await core.downloadLink({ link: transfer.link })
      Alert.alert(
        t('app.download.completeTitle'),
        t('app.download.completeBody')
      )
    } catch (error) {
      Alert.alert(
        t('app.download.retryFailed'),
        getFriendlyCoreError(error, locale)
      )
    } finally {
      setRetryingTransferId(null)
    }
  }

  const handleShowTransferDetails = (transfer: MobileTransfer) => {
    Alert.alert(
      t('app.transfer.errorTitle'),
      transfer.message || t('app.transfer.noDetails')
    )
  }

  const handleDeleteHolding = (holding: MobileHolding) => {
    if (!guardReady()) return
    Alert.alert(
      t('app.holding.deleteTitle'),
      t('app.holding.deleteBody', { fileName: holding.fileName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setDeletingCid(holding.cid)
            void core
              .deleteHolding({ cid: holding.cid })
              .catch(error => {
                Alert.alert(
                  t('app.holding.deleteFailedTitle'),
                  error instanceof Error
                    ? error.message
                    : t('app.holding.deleteFailedBody')
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
    if (!info.exists) throw new Error(t('app.file.exportMissing'))

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
        throw new Error(t('app.device.shareUnavailable'))
      }
      const exported = await prepareHoldingFile(holding)
      await Sharing.shareAsync(exported.fileUri, {
        mimeType: exported.mimeType,
        dialogTitle: t('app.file.shareDialog', {
          fileName: exported.fileName,
        }),
      })
    } catch (error) {
      Alert.alert(
        t('app.file.shareFailedTitle'),
        error instanceof Error ? error.message : t('app.file.shareFailedBody')
      )
    } finally {
      setExportingCid(null)
    }
  }

  const handleOpenHolding = async (holding: MobileHolding) => {
    if (!guardReady()) return
    setExportingCid(holding.cid)
    try {
      const exported = await prepareHoldingFile(holding)
      if (Platform.OS === 'android') {
        const contentUri = exported.fileUri.startsWith('content://')
          ? exported.fileUri
          : await FileSystem.getContentUriAsync(exported.fileUri)
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: exported.mimeType,
        })
        return
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error(t('app.device.openUnavailable'))
      }
      await Sharing.shareAsync(exported.fileUri, {
        mimeType: exported.mimeType,
        dialogTitle: t('app.file.openDialog', {
          fileName: exported.fileName,
        }),
      })
    } catch (error) {
      Alert.alert(
        t('app.file.openFailedTitle'),
        error instanceof Error ? error.message : t('app.file.openFailedBody')
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
          throw new Error(t('app.device.exportUnavailable'))
        }
        await Sharing.shareAsync(exported.fileUri, {
          mimeType: exported.mimeType,
          dialogTitle: t('app.file.saveDialog', {
            fileName: exported.fileName,
          }),
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
      Alert.alert(
        t('app.file.saveSuccessTitle'),
        t('app.file.saveSuccessBody', { fileName: saveFileName })
      )
    } catch (error) {
      Alert.alert(
        t('app.file.saveFailedTitle'),
        error instanceof Error ? error.message : t('app.file.saveFailedBody')
      )
    } finally {
      setExportingCid(null)
    }
  }

  const handleOpenKnowledgeLink = async (link: string) => {
    if (!isReady) throw new Error(t('app.core.notReadyTitle'))
    const parsed = parseMostLink(link)
    const policyError = getStoreDownloadPolicyError(
      parsed.fileName,
      hasExplicitMostLinkFilename(link)
    )
    if (policyError) throw new Error(policyError)

    const holding = core
      .getSnapshot()
      .holdings.find(item => item.cid === parsed.cid)
    if (holding) {
      await handleOpenHolding(holding)
      return
    }
    openDownloadIntent({ link, ...parsed }, true)
  }

  const openExternalUrl = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert(t('app.link.openFailed'), url)
    }
  }

  const handleBackupKnowledge = async () => {
    if (!FileSystem.cacheDirectory) {
      Alert.alert(
        t('app.knowledge.backupFailedTitle'),
        t('app.knowledge.tempUnavailable')
      )
      return
    }

    setKnowledgeBackupWorking(true)
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error(t('app.device.shareUnavailable'))
      }
      const backup = await knowledgeRepository.exportSnapshot()
      const stamp = backup.exportedAt.replace(/[:.]/g, '-').replace('T', '_')
      const fileName = `mostbox-knowledge-${stamp}.json`
      const target = `${FileSystem.cacheDirectory}${fileName}`
      await FileSystem.writeAsStringAsync(
        target,
        JSON.stringify(backup, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      )
      await Sharing.shareAsync(target, {
        dialogTitle: t('app.knowledge.backupDialog'),
        mimeType: 'application/json',
      })
    } catch (error) {
      Alert.alert(
        t('app.knowledge.backupFailedTitle'),
        error instanceof Error
          ? error.message
          : t('app.knowledge.backupFailedBody')
      )
    } finally {
      setKnowledgeBackupWorking(false)
    }
  }

  const handleRestoreKnowledge = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'application/json',
      })
      if (result.canceled) return
      const file = result.assets[0]
      if (!file) return
      const raw = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      const backup = validateKnowledgeSnapshot(JSON.parse(raw) as unknown)
      Alert.alert(
        t('app.knowledge.restoreTitle'),
        t('app.knowledge.restoreBody', { count: backup.files.length }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('app.knowledge.restoreAction'),
            style: 'destructive',
            onPress: () => {
              setKnowledgeBackupWorking(true)
              void knowledgeRepository
                .restoreSnapshot(backup)
                .then(() => {
                  Alert.alert(
                    t('app.knowledge.restoreCompleteTitle'),
                    t('app.knowledge.restoreCompleteBody')
                  )
                })
                .catch(error => {
                  Alert.alert(
                    t('app.knowledge.restoreFailedTitle'),
                    error instanceof Error
                      ? error.message
                      : t('app.knowledge.restoreFailedBody')
                  )
                })
                .finally(() => setKnowledgeBackupWorking(false))
            },
          },
        ]
      )
    } catch (error) {
      Alert.alert(
        t('app.knowledge.invalidBackupTitle'),
        error instanceof Error
          ? error.message
          : t('app.knowledge.invalidBackupBody')
      )
    }
  }

  const openLanguageMenu = () => {
    Alert.alert(
      t('common.language.choose'),
      undefined,
      LOCALES.map(item => ({
        text:
          item === locale
            ? t('common.language.current', { language: localeNames[item] })
            : localeNames[item],
        onPress: () => setLocale(item),
      })),
      { cancelable: true }
    )
  }

  const statusLabel =
    nodeStatus === 'ready'
      ? t('app.node.online')
      : nodeStatus === 'error'
        ? t('app.node.error')
        : nodeStatus === 'starting'
          ? t('app.node.starting')
          : t('app.node.offline')
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
        <View
          style={[
            styles.header,
            accessibilityLayout ? styles.headerAccessibility : null,
          ]}
        >
          <View
            style={[
              styles.brandRow,
              accessibilityLayout ? styles.brandRowAccessibility : null,
            ]}
          >
            <View style={styles.brandMark}>
              <ShieldCheck size={19} color={theme.colors.accent} />
            </View>
            <View style={styles.brandTextGroup}>
              <Text maxFontSizeMultiplier={1.4} style={styles.brandName}>
                MostBox
              </Text>
              <Text maxFontSizeMultiplier={1.8} style={styles.pageTitle}>
                {activeTab === 'node' && nodeRoute === 'p2pPing'
                  ? t('p2pPing.title')
                  : t(TAB_LABEL_KEYS[activeTab])}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.headerActions,
              accessibilityLayout ? styles.headerActionsAccessibility : null,
            ]}
          >
            <Pressable
              accessibilityLabel={t('common.language.choose')}
              accessibilityRole="button"
              onPress={openLanguageMenu}
              style={({ pressed }) => [
                styles.languageButton,
                pressed ? styles.pressablePressed : null,
              ]}
            >
              <Languages size={18} color={theme.colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityLabel={t('app.node.openStatus', {
                status: statusLabel,
              })}
              accessibilityRole="button"
              onPress={() => changeTab('node')}
              style={({ pressed }) => [
                styles.statusPill,
                accessibilityLayout ? styles.statusPillAccessibility : null,
                pressed ? styles.pressablePressed : null,
              ]}
            >
              <Radio size={16} color={theme.colors.accent} />
              <Text
                maxFontSizeMultiplier={1.6}
                style={[
                  styles.statusText,
                  accessibilityLayout ? styles.statusTextAccessibility : null,
                  statusTextStyle,
                ]}
              >
                {statusLabel}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          {activeTab === 'knowledge' ? (
            <KnowledgeBaseScreen
              isCoreReady={isReady}
              onDirtyChange={handleKnowledgeDirtyChange}
              onOpenMostLink={handleOpenKnowledgeLink}
              onPublishAttachment={handlePublishKnowledgeAttachment}
            />
          ) : activeTab === 'node' && nodeRoute === 'p2pPing' ? (
            <P2PPingScreen
              ping={currentSnapshot.p2pPing}
              ready={isReady}
              onBack={() => setNodeRoute('status')}
              onStart={handleStartP2PPing}
              onCancel={handleCancelP2PPing}
            />
          ) : (
            <NodeStatusScreen
              section={activeTab}
              snapshot={currentSnapshot}
              copiedCid={copiedCid}
              deletingCid={deletingCid}
              exportingCid={exportingCid}
              retryingTransferId={retryingTransferId}
              actionDisabled={!isReady || publishing}
              knowledgeBackupWorking={knowledgeBackupWorking}
              onPublishFile={handlePublishFile}
              onReceiveLink={openDownloadModal}
              onBackupKnowledge={handleBackupKnowledge}
              onRestoreKnowledge={handleRestoreKnowledge}
              onCopyHoldingLink={handleCopyHoldingLink}
              onDeleteHolding={handleDeleteHolding}
              onSaveHolding={handleSaveHolding}
              onShareHolding={handleShareHolding}
              onOpenPrivacy={() => openExternalUrl(PRIVACY_URL)}
              onOpenTerms={() => openExternalUrl(TERMS_URL)}
              onOpenSupport={() => openExternalUrl(SUPPORT_URL)}
              onRetryTransfer={handleRetryTransfer}
              onShowTransferDetails={handleShowTransferDetails}
              onRetryStartCore={handleStartCore}
              onOpenP2PPing={() => setNodeRoute('p2pPing')}
              retryStartDisabled={isCoreBusy}
            />
          )}
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
            label={t('nav.files')}
            onPress={() => changeTab('files')}
          />
          <TabButton
            active={activeTab === 'knowledge'}
            icon={
              <BookOpen
                size={21}
                color={
                  activeTab === 'knowledge'
                    ? theme.colors.accent
                    : theme.colors.textSecondary
                }
              />
            }
            label={t('nav.knowledge')}
            onPress={() => changeTab('knowledge')}
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
            label={t('nav.transfers')}
            onPress={() => changeTab('transfers')}
          />
        </View>

        <Modal
          animationType="slide"
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
                <View
                  style={[
                    styles.modalCard,
                    accessibilityLayout ? styles.modalCardAccessibility : null,
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleGroup}>
                      <ListChecks size={20} color={theme.colors.accent} />
                      <Text
                        maxFontSizeMultiplier={1.5}
                        numberOfLines={2}
                        style={styles.modalTitle}
                      >
                        {downloadIntent
                          ? t('app.receive.confirmTitle')
                          : t('app.receive.title')}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel={t('common.close')}
                      accessibilityRole="button"
                      disabled={cancellingDownload}
                      hitSlop={8}
                      onPress={() => void handleCancelDownload()}
                      style={({ pressed }) => [
                        styles.closeButton,
                        pressed ? styles.pressablePressed : null,
                      ]}
                    >
                      <X size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                  </View>

                  {downloadIntent ? (
                    <View style={styles.downloadPreview}>
                      <View
                        style={[
                          styles.previewTopRow,
                          accessibilityLayout
                            ? styles.previewTopRowAccessibility
                            : null,
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={2}
                          numberOfLines={2}
                          style={styles.previewFileName}
                        >
                          {downloadIntent.fileName}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          disabled={Boolean(downloadingCid)}
                          onPress={handleEditDownloadLink}
                          style={({ pressed }) => [
                            styles.editLinkButton,
                            accessibilityLayout
                              ? styles.editLinkButtonAccessibility
                              : null,
                            pressed ? styles.pressablePressed : null,
                          ]}
                        >
                          <Text
                            maxFontSizeMultiplier={1.6}
                            style={styles.editLinkText}
                          >
                            {t('app.receive.changeLink')}
                          </Text>
                        </Pressable>
                      </View>
                      <Text
                        maxFontSizeMultiplier={1.6}
                        style={styles.previewLabel}
                      >
                        CID
                      </Text>
                      <Text
                        maxFontSizeMultiplier={1.4}
                        selectable
                        style={styles.previewCid}
                      >
                        {shortCid(downloadIntent.cid)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.linkInputGroup}>
                      <View style={styles.inputLabelRow}>
                        <Text
                          maxFontSizeMultiplier={1.8}
                          style={styles.inputLabel}
                        >
                          {t('app.receive.shareLink')}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={handlePasteDownloadLink}
                          style={({ pressed }) => [
                            styles.pasteButton,
                            pressed ? styles.pressablePressed : null,
                          ]}
                        >
                          <Text
                            maxFontSizeMultiplier={1.6}
                            style={styles.pasteButtonText}
                          >
                            {t('app.receive.paste')}
                          </Text>
                        </Pressable>
                      </View>
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!downloadingCid}
                        maxFontSizeMultiplier={1.5}
                        multiline
                        onChangeText={handleDownloadLinkChange}
                        placeholder="most://CID?filename=..."
                        placeholderTextColor={theme.colors.textMuted}
                        selectionColor={theme.colors.accent}
                        style={styles.linkInput}
                        value={downloadLinkInput}
                      />
                    </View>
                  )}

                  {downloadLinkError ? (
                    <Text
                      accessibilityRole="alert"
                      maxFontSizeMultiplier={1.6}
                      style={styles.errorText}
                    >
                      {downloadLinkError}
                    </Text>
                  ) : null}

                  {downloadIntent ? (
                    <Text
                      maxFontSizeMultiplier={1.6}
                      style={styles.consentText}
                    >
                      {t('app.receive.trustHint')}
                    </Text>
                  ) : null}

                  <View
                    style={[
                      styles.modalActions,
                      accessibilityLayout
                        ? styles.modalActionsAccessibility
                        : null,
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      disabled={cancellingDownload}
                      onPress={() => void handleCancelDownload()}
                      style={({ pressed }) => [
                        styles.cancelButton,
                        accessibilityLayout
                          ? styles.modalButtonAccessibility
                          : null,
                        pressed ? styles.pressablePressed : null,
                      ]}
                    >
                      <Text
                        maxFontSizeMultiplier={1.5}
                        style={styles.cancelButtonText}
                      >
                        {cancellingDownload
                          ? t('app.receive.cancelling')
                          : t('common.cancel')}
                      </Text>
                    </Pressable>
                    {downloadIntent ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={!isReady || Boolean(downloadingCid)}
                        onPress={handleConfirmDownload}
                        style={({ pressed }) => [
                          styles.confirmButton,
                          accessibilityLayout
                            ? styles.modalButtonAccessibility
                            : null,
                          !isReady || downloadingCid
                            ? styles.confirmButtonDisabled
                            : null,
                          pressed ? styles.confirmButtonPressed : null,
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={1.5}
                          style={[
                            styles.confirmButtonText,
                            !isReady || downloadingCid
                              ? styles.confirmButtonTextDisabled
                              : null,
                          ]}
                        >
                          {downloadingCid
                            ? t('app.receive.downloading')
                            : t('app.receive.confirmDownload')}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        disabled={!downloadLinkInput.trim()}
                        onPress={handleInspectDownload}
                        style={({ pressed }) => [
                          styles.confirmButton,
                          accessibilityLayout
                            ? styles.modalButtonAccessibility
                            : null,
                          !downloadLinkInput.trim()
                            ? styles.confirmButtonDisabled
                            : null,
                          pressed ? styles.confirmButtonPressed : null,
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={1.5}
                          style={[
                            styles.confirmButtonText,
                            !downloadLinkInput.trim()
                              ? styles.confirmButtonTextDisabled
                              : null,
                          ]}
                        >
                          {t('app.receive.checkLink')}
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
      <Text
        maxFontSizeMultiplier={1.6}
        numberOfLines={1}
        style={[styles.tabText, active ? styles.tabTextActive : null]}
      >
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
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerAccessibility: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 4,
      paddingVertical: 10,
    },
    brandRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    brandRowAccessibility: {
      flex: 0,
    },
    brandMark: {
      width: 24,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandTextGroup: {
      flex: 1,
      gap: 0,
    },
    brandName: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '600',
    },
    pageTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerActionsAccessibility: {
      alignSelf: 'stretch',
      marginLeft: 32,
    },
    languageButton: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.medium,
      backgroundColor: colors.surface,
    },
    statusPill: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.medium,
      backgroundColor: colors.surface,
    },
    statusPillAccessibility: {
      flex: 1,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    statusTextAccessibility: {
      flex: 1,
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
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    tabButton: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderTopWidth: 2,
      borderTopColor: 'transparent',
    },
    tabButtonActive: {
      borderTopColor: colors.accent,
    },
    tabText: {
      alignSelf: 'stretch',
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '500',
      textAlign: 'center',
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
      backgroundColor: colors.overlay,
    },
    modalKeyboard: {
      flex: 1,
    },
    modalScrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    modalCard: {
      width: '100%',
      maxWidth: 520,
      gap: 18,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 24,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
      backgroundColor: colors.surfaceSolid,
    },
    modalCardAccessibility: {
      gap: 14,
      paddingBottom: 16,
    },
    modalHeader: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitleGroup: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalTitle: {
      flexShrink: 1,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkInputGroup: {
      gap: 8,
    },
    inputLabelRow: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    inputLabel: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    pasteButton: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: radii.small,
      backgroundColor: colors.accentSoft,
    },
    pasteButtonText: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: '600',
    },
    linkInput: {
      minHeight: 96,
      maxHeight: 164,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: colors.borderStrong,
      color: colors.text,
      backgroundColor: colors.surfaceSubtle,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    downloadPreview: {
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      backgroundColor: colors.surfaceSubtle,
    },
    previewTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    previewTopRowAccessibility: {
      flexDirection: 'column',
      gap: 4,
    },
    previewFileName: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    editLinkButton: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    editLinkButtonAccessibility: {
      alignSelf: 'flex-start',
    },
    editLinkText: {
      color: colors.accent,
      fontSize: 12,
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
    modalActionsAccessibility: {
      flexDirection: 'column-reverse',
    },
    modalButtonAccessibility: {
      flex: 0,
      width: '100%',
      minHeight: 56,
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
      backgroundColor: 'transparent',
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
