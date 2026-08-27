import './src/polyfills/eventTarget'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
  Check,
  Files,
  ListChecks,
  Loader,
  Radio,
  ShieldCheck,
  X,
} from 'lucide-react-native'
import { FilesScreen } from './src/features/files/FilesScreen'
import { KnowledgeBaseScreen } from './src/features/knowledge/KnowledgeBaseScreen'
import { createExpoKnowledgeRepository } from './src/features/knowledge/expoKnowledgeRepository'
import { validateKnowledgeSnapshot } from './src/features/knowledge/knowledgeModel'
import {
  getRootBackAction,
  getTabPressAction,
  type RootTab,
} from './src/navigation/rootNavigation'
import { NodeScreen } from './src/features/node/NodeScreen'
import { NodeConnectionPanel } from './src/features/node/NodeConnectionPanel'
import { P2PPingScreen } from './src/features/node/P2PPingScreen'
import { TransfersScreen } from './src/features/transfers/TransfersScreen'
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
  parseIncomingMostLink,
  parseMostLink,
  type IncomingMostLink,
} from './src/mobileCore/protocol'
import { inspectReceiveLink } from './src/mobileCore/receiveFlow'
import {
  getStoreDownloadPolicyErrorKey,
  getStoreFilePolicyErrorKey,
} from './src/mobileCore/storeFilePolicy'
import {
  getFriendlyCoreError,
  getMostLinkErrorMessage,
  usesAccessibilityLayout,
} from './src/ui/presentation'
import {
  BottomSheetCard,
  IconButton,
  MostButton,
  MostTextInput,
  getGlassSurfaceStyle,
} from './src/ui/components'
import { FeedbackProvider, useFeedback } from './src/ui/feedback'
import { PrivacyConsentGate } from './src/privacy/PrivacyConsentGate'
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from './src/privacy/legalUrls'
import type { DocumentPickerAsset } from 'expo-document-picker'
import type {
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
  MostBoxMobileCore,
} from './src/mobileCore/types'

const DEV_CID_MAX_BYTES = 20 * 1024 * 1024
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

const TAB_LABEL_KEYS: Record<RootTab, MessageKey> = {
  files: 'nav.files',
  knowledge: 'nav.knowledge',
  transfers: 'nav.transfers',
  node: 'nav.node',
}

async function readDevCidBytes(file: DocumentPickerAsset) {
  const size = file.size || 0
  if (size > DEV_CID_MAX_BYTES) return undefined

  if (Platform.OS === 'web' && file.file) {
    return new Uint8Array(await file.file.arrayBuffer())
  }

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
  if (
    value.startsWith('file://') ||
    value.startsWith('content://') ||
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    value.startsWith('https://') ||
    value.startsWith('http://')
  ) {
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

function triggerWebFile(fileUri: string, fileName: string, open = false) {
  if (typeof document === 'undefined') {
    throw new Error('Browser file actions are unavailable')
  }
  const link = document.createElement('a')
  link.href = fileUri
  if (open) {
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
  } else {
    link.download = fileName
  }
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (fileUri.startsWith('blob:')) {
    setTimeout(() => URL.revokeObjectURL(fileUri), open ? 60_000 : 1_000)
  }
}

export default function App() {
  return (
    <I18nProvider>
      <FeedbackProvider>
        <PrivacyConsentGate>
          <MostBoxApp />
        </PrivacyConsentGate>
      </FeedbackProvider>
    </I18nProvider>
  )
}

function MostBoxApp() {
  const { locale, setLocale, t } = useI18n()
  const { alert, toast } = useFeedback()
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
  const [startupComplete, setStartupComplete] = useState(false)
  const [activeTab, setActiveTab] = useState<RootTab>('files')
  const [nodeRoute, setNodeRoute] = useState<'status' | 'p2pPing'>('status')
  const [publishing, setPublishing] = useState(false)
  const [knowledgeDirty, setKnowledgeDirty] = useState(false)
  const [knowledgeBackupWorking, setKnowledgeBackupWorking] = useState(false)
  const [exportingCid, setExportingCid] = useState<string | null>(null)
  const [deletingCid, setDeletingCid] = useState<string | null>(null)
  const [copiedCid, setCopiedCid] = useState<string | null>(null)
  const [holdingDetailRequest, setHoldingDetailRequest] = useState<{
    cid: string
    token: number
  } | null>(null)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [languageModalOpen, setLanguageModalOpen] = useState(false)
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
  const [cancellingTransferCid, setCancellingTransferCid] = useState<
    string | null
  >(null)
  const [knowledgeMode, setKnowledgeMode] = useState<
    'browse' | 'preview' | 'edit'
  >('browse')
  const [knowledgeBackToken, setKnowledgeBackToken] = useState(0)
  const [reselectTokens, setReselectTokens] = useState<Record<RootTab, number>>(
    { files: 0, knowledge: 0, transfers: 0, node: 0 }
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
  const isNodeOnline = nodeStatus === 'ready'
  const isRemote = currentSnapshot.node.mode === 'remote'
  const isReady =
    isNodeOnline && (!isRemote || currentSnapshot.node.authenticated === true)
  const isCoreBusy = nodeStatus === 'starting' || nodeStatus === 'stopping'
  const showCoreStartError = useEffectEvent((error: unknown) => {
    alert(t('app.core.startFailed'), getFriendlyCoreError(error, locale))
  })

  useEffect(() => {
    const unsubscribe = core.subscribe(setSnapshot)
    void core
      .start()
      .catch(showCoreStartError)
      .finally(() => setStartupComplete(true))

    return () => {
      unsubscribe()
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      void core.stop()
    }
  }, [core])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void core.start().catch(showCoreStartError)
      }
    })
    return () => subscription.remove()
  }, [core])

  const openDownloadIntent = useCallback(
    (intent: IncomingMostLink, openAfterComplete = false) => {
      const policyErrorKey = getStoreDownloadPolicyErrorKey(intent.fileName)
      const policyError = policyErrorKey ? t(policyErrorKey) : ''
      setDownloadModalOpen(true)
      setDownloadLinkInput(intent.link)
      setDownloadIntent(policyError ? null : intent)
      setDownloadLinkError(policyError || '')
      setOpenDownloadAfterComplete(openAfterComplete && !policyError)
    },
    [t]
  )

  useEffect(() => {
    let active = true
    const handleUrl = (url: string) => {
      try {
        const intent = parseIncomingMostLink(url)
        if (intent) openDownloadIntent(intent)
      } catch (error) {
        alert(
          t('app.link.invalidTitle'),
          getMostLinkErrorMessage(error, locale)
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
  }, [locale, openDownloadIntent, t])

  const guardReady = () => {
    if (isReady) return true
    if (isNodeOnline && isRemote) {
      alert(t('node.account.title'), t('node.account.required'))
      return false
    }
    alert(t('app.core.notReadyTitle'), t('app.core.notReadyBody'))
    return false
  }

  const handleKnowledgeDirtyChange = useCallback((dirty: boolean) => {
    setKnowledgeDirty(dirty)
  }, [])

  const changeTab = (nextTab: RootTab) => {
    const action = getTabPressAction(activeTab, nextTab, knowledgeDirty)
    if (action === 'scrollTop') {
      setReselectTokens(current => ({
        ...current,
        [nextTab]: current[nextTab] + 1,
      }))
      return
    }
    if (action === 'confirmDiscard') {
      alert(t('app.discard.title'), t('app.discard.body'), [
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

  const showHoldingDetails = (holding: MobileHolding) => {
    setActiveTab('files')
    setHoldingDetailRequest({ cid: holding.cid, token: Date.now() })
  }

  const showHoldingDetailsByCid = (cid: string) => {
    const holding = core.getSnapshot().holdings.find(item => item.cid === cid)
    if (holding) showHoldingDetails(holding)
  }

  const shareMostLink = async (link: string) => {
    try {
      await Share.share({ message: link })
    } catch (error) {
      alert(
        t('app.file.shareFailedTitle'),
        error instanceof Error ? error.message : t('app.file.shareFailedBody')
      )
    }
  }

  const handleStartCore = async () => {
    try {
      await core.start()
    } catch (error) {
      alert(t('app.core.startFailed'), getFriendlyCoreError(error, locale))
    }
  }

  const handleStartP2PPing = (role: 'host' | 'join', code?: string) => {
    if (!isNodeOnline) {
      return Promise.reject(new Error(t('app.core.notReadyBody')))
    }
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
      const policyErrorKey = getStoreFilePolicyErrorKey(
        file.name,
        file.mimeType
      )
      if (policyErrorKey) {
        alert(t('app.file.unsupported'), t(policyErrorKey))
        return null
      }

      const transfer = await core.publishFile({
        uri: file.uri,
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType,
        contentBytes: await readDevCidBytes(file),
        webFile: file.file,
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
      const publishedCid = result.transfer.cid || parseMostLink(result.link).cid
      toast(
        t(
          isRemote
            ? 'app.publish.remoteCompleteBody'
            : 'app.publish.completeBody'
        ),
        'success',
        [
          {
            label: t('app.publish.view'),
            onPress: () => showHoldingDetailsByCid(publishedCid),
          },
          {
            label: t('common.share'),
            onPress: () => void shareMostLink(result.link),
          },
        ]
      )
    } catch (error) {
      alert(
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

  const handleHardwareBack = useEffectEvent(() => {
    const action = getRootBackAction({
      activeTab,
      downloadModalOpen,
      knowledgeMode,
      languageModalOpen,
      nodeRoute,
    })
    if (action === 'closeLanguage') {
      setLanguageModalOpen(false)
      return true
    }
    if (action === 'closeReceive') {
      void handleCancelDownload()
      return true
    }
    if (action === 'closeNodeChild') {
      setNodeRoute('status')
      return true
    }
    if (action === 'closeKnowledgeChild') {
      setKnowledgeBackToken(value => value + 1)
      return true
    }
    return false
  })

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack
    )
    return () => subscription.remove()
  }, [])

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
      const inspection = inspectReceiveLink(downloadLinkInput)
      if (inspection.kind === 'blocked') {
        setDownloadLinkError(t(inspection.errorKey as MessageKey))
        return
      }
      setDownloadIntent(inspection.intent)
      setDownloadLinkError('')
    } catch (error) {
      setDownloadIntent(null)
      setDownloadLinkError(getMostLinkErrorMessage(error, locale))
    }
  }

  const handleConfirmDownload = async () => {
    if (!downloadIntent || !guardReady()) return

    const intent = downloadIntent
    const shouldOpen = openDownloadAfterComplete
    setDownloadingCid(intent.cid)
    setDownloadModalOpen(false)
    setDownloadIntent(null)
    setDownloadLinkError('')
    setOpenDownloadAfterComplete(false)
    try {
      await core.downloadLink({ link: intent.link })
      const holding = core
        .getSnapshot()
        .holdings.find(item => item.cid === intent.cid)
      if (shouldOpen && holding) {
        alert(
          t('app.download.completeTitle'),
          t(
            isRemote
              ? 'app.download.remoteCompleteBody'
              : 'app.download.completeBody'
          ),
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
        toast(
          t(
            isRemote
              ? 'app.download.remoteCompleteBody'
              : 'app.download.completeBody'
          ),
          'success'
        )
      }
    } catch (error) {
      alert(t('app.download.retryFailed'), getFriendlyCoreError(error, locale))
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
      alert(
        t('app.download.retryUnavailableTitle'),
        t('app.download.retryUnavailableBody')
      )
      return
    }

    setRetryingTransferId(transfer.id)
    try {
      await core.downloadLink({ link: transfer.link })
      toast(
        t(
          isRemote
            ? 'app.download.remoteCompleteBody'
            : 'app.download.completeBody'
        ),
        'success'
      )
    } catch (error) {
      alert(t('app.download.retryFailed'), getFriendlyCoreError(error, locale))
    } finally {
      setRetryingTransferId(null)
    }
  }

  const handleShowTransferDetails = (transfer: MobileTransfer) => {
    alert(
      t('app.transfer.errorTitle'),
      transfer.message || t('app.transfer.noDetails')
    )
  }

  const handleDeleteHolding = (holding: MobileHolding) => {
    if (!guardReady()) return
    alert(
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
              .then(() => toast(t('app.holding.deleted'), 'success'))
              .catch(error => {
                alert(
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
    toast(t('node.action.copied'), 'success')
  }

  const handleCancelTransfer = async (transfer: MobileTransfer) => {
    if (!transfer.cid || transfer.kind !== 'download') return
    setCancellingTransferCid(transfer.cid)
    try {
      await core.cancelDownload({ cid: transfer.cid })
      toast(t('core.error.downloadCancelled'))
    } catch (error) {
      alert(t('app.download.retryFailed'), getFriendlyCoreError(error, locale))
    } finally {
      setCancellingTransferCid(null)
    }
  }

  const prepareHoldingFile = async (holding: MobileHolding) => {
    const exported = await core.exportHolding({
      cid: holding.cid,
      fileName: holding.fileName,
    })
    const fileUri = toFileUri(exported.filePath)
    if (Platform.OS === 'web') {
      return {
        ...exported,
        fileUri,
        mimeType: getMimeType(exported.fileName),
      }
    }
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
      alert(
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
      if (Platform.OS === 'web') {
        triggerWebFile(exported.fileUri, exported.fileName, true)
        return
      }
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
      alert(
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
      if (Platform.OS === 'web') {
        triggerWebFile(exported.fileUri, exported.fileName)
        return
      }
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
      alert(
        t('app.file.saveSuccessTitle'),
        t('app.file.saveSuccessBody', { fileName: saveFileName })
      )
    } catch (error) {
      alert(
        t('app.file.saveFailedTitle'),
        error instanceof Error ? error.message : t('app.file.saveFailedBody')
      )
    } finally {
      setExportingCid(null)
    }
  }

  const handleOpenKnowledgeLink = async (link: string) => {
    if (!isReady) {
      throw new Error(
        isNodeOnline && isRemote
          ? t('node.account.required')
          : t('app.core.notReadyTitle')
      )
    }
    let parsed: ReturnType<typeof parseMostLink>
    try {
      parsed = parseMostLink(link)
    } catch (error) {
      throw new Error(getMostLinkErrorMessage(error, locale))
    }
    const policyErrorKey = getStoreDownloadPolicyErrorKey(parsed.fileName)
    if (policyErrorKey) throw new Error(t(policyErrorKey))

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
      alert(t('app.link.openFailed'), url)
    }
  }

  const handleBackupKnowledge = async () => {
    setKnowledgeBackupWorking(true)
    try {
      const backup = await knowledgeRepository.exportSnapshot()
      const stamp = backup.exportedAt.replace(/[:.]/g, '-').replace('T', '_')
      const fileName = `mostbox-knowledge-${stamp}.json`
      if (Platform.OS === 'web') {
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json',
        })
        triggerWebFile(URL.createObjectURL(blob), fileName)
        return
      }
      if (!FileSystem.cacheDirectory) {
        throw new Error(t('app.knowledge.tempUnavailable'))
      }
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error(t('app.device.shareUnavailable'))
      }
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
      alert(
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
      const raw =
        Platform.OS === 'web' && file.file
          ? await file.file.text()
          : await FileSystem.readAsStringAsync(file.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            })
      const backup = validateKnowledgeSnapshot(JSON.parse(raw) as unknown)
      alert(
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
                  alert(
                    t('app.knowledge.restoreCompleteTitle'),
                    t('app.knowledge.restoreCompleteBody')
                  )
                })
                .catch(error => {
                  alert(
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
      alert(
        t('app.knowledge.invalidBackupTitle'),
        error instanceof Error
          ? error.message
          : t('app.knowledge.invalidBackupBody')
      )
    }
  }

  const openLanguageMenu = () => {
    setLanguageModalOpen(true)
  }

  const immersiveRoute =
    (activeTab === 'knowledge' && knowledgeMode === 'edit') ||
    (activeTab === 'node' && nodeRoute === 'p2pPing')

  if (!startupComplete) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'right', 'bottom', 'left']}
          style={styles.startupScreen}
        >
          <Loader size={28} color={theme.colors.accent} />
          <Text style={styles.startupTitle}>{t('app.node.starting')}</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    )
  }

  if (Platform.OS === 'web' && !isReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'right', 'bottom', 'left']}
          style={styles.onboardingScreen}
        >
          <StatusBar
            barStyle={theme.statusBarStyle}
            backgroundColor={theme.colors.background}
          />
          <View style={styles.onboardingHeader}>
            <View style={styles.brandMark}>
              <ShieldCheck size={19} color={theme.colors.accent} />
            </View>
            <View style={styles.brandTextGroup}>
              <Text style={styles.brandName}>MostBox</Text>
              <Text style={styles.pageTitle}>
                {t('node.connection.modalTitle')}
              </Text>
            </View>
          </View>
          <View style={styles.onboardingContent}>
            <NodeConnectionPanel
              autoOpen
              client={core}
              snapshot={currentSnapshot}
            />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    )
  }

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
        {!immersiveRoute ? (
          <View
            style={[
              styles.header,
              accessibilityLayout ? styles.headerAccessibility : null,
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.8}
              numberOfLines={1}
              style={styles.mainHeaderTitle}
            >
              {t(TAB_LABEL_KEYS[activeTab])}
            </Text>
          </View>
        ) : null}

        <View style={styles.content}>
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'files' ? styles.tabPanelHidden : null,
            ]}
          >
            <FilesScreen
              actionDisabled={!isReady || publishing}
              copiedCid={copiedCid}
              deletingCid={deletingCid}
              detailRequest={holdingDetailRequest}
              exportingCid={exportingCid}
              reselectToken={reselectTokens.files}
              snapshot={currentSnapshot}
              onCopyHoldingLink={handleCopyHoldingLink}
              onDeleteHolding={handleDeleteHolding}
              onOpenHolding={handleOpenHolding}
              onPublishFile={handlePublishFile}
              onReceiveLink={openDownloadModal}
              onSaveHolding={handleSaveHolding}
              onShareHolding={handleShareHolding}
            />
          </View>
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'knowledge' ? styles.tabPanelHidden : null,
            ]}
          >
            <KnowledgeBaseScreen
              backupWorking={knowledgeBackupWorking}
              backRequestToken={knowledgeBackToken}
              isCoreReady={isReady}
              reselectToken={reselectTokens.knowledge}
              onBackup={handleBackupKnowledge}
              onDirtyChange={handleKnowledgeDirtyChange}
              onOpenMostLink={handleOpenKnowledgeLink}
              onPresentationChange={setKnowledgeMode}
              onPublishAttachment={handlePublishKnowledgeAttachment}
              onRestore={handleRestoreKnowledge}
            />
          </View>
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'transfers' ? styles.tabPanelHidden : null,
            ]}
          >
            <TransfersScreen
              cancellingCid={cancellingTransferCid}
              reselectToken={reselectTokens.transfers}
              retryingTransferId={retryingTransferId}
              snapshot={currentSnapshot}
              onCancelDownload={handleCancelTransfer}
              onOpenHolding={showHoldingDetails}
              onRetryTransfer={handleRetryTransfer}
              onShowTransferDetails={handleShowTransferDetails}
            />
          </View>
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'node' ? styles.tabPanelHidden : null,
            ]}
          >
            {nodeRoute === 'p2pPing' ? (
              <P2PPingScreen
                ping={currentSnapshot.p2pPing}
                ready={isNodeOnline}
                onBack={() => setNodeRoute('status')}
                onStart={handleStartP2PPing}
                onCancel={handleCancelP2PPing}
              />
            ) : (
              <NodeScreen
                client={core}
                reselectToken={reselectTokens.node}
                retryStartDisabled={isCoreBusy}
                snapshot={currentSnapshot}
                onOpenP2PPing={() => setNodeRoute('p2pPing')}
                onChooseLanguage={openLanguageMenu}
                onOpenPrivacy={() => openExternalUrl(PRIVACY_URL)}
                onOpenSupport={() => openExternalUrl(SUPPORT_URL)}
                onOpenTerms={() => openExternalUrl(TERMS_URL)}
                onRetryStartCore={handleStartCore}
              />
            )}
          </View>
        </View>

        {!immersiveRoute ? (
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
            <TabButton
              active={activeTab === 'node'}
              icon={
                <Radio
                  size={21}
                  color={
                    activeTab === 'node'
                      ? theme.colors.accent
                      : theme.colors.textSecondary
                  }
                />
              }
              label={t('nav.node')}
              onPress={() => changeTab('node')}
            />
          </View>
        ) : null}

        <Modal
          animationType="fade"
          onRequestClose={() => setLanguageModalOpen(false)}
          transparent
          visible={languageModalOpen}
        >
          <View style={styles.languageModalOverlay}>
            <BottomSheetCard style={styles.languageModalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.languageModalTitle}>
                  {t('common.language.choose')}
                </Text>
                <IconButton
                  accessibilityLabel={t('common.close')}
                  onPress={() => setLanguageModalOpen(false)}
                  variant="ghost"
                >
                  <X size={20} color={theme.colors.textSecondary} />
                </IconButton>
              </View>
              <View style={styles.languageOptions}>
                {LOCALES.map(item => {
                  const selected = item === locale
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={item}
                      onPress={() => {
                        setLocale(item)
                        setLanguageModalOpen(false)
                      }}
                      style={({ pressed }) => [
                        styles.languageOption,
                        selected ? styles.languageOptionSelected : null,
                        pressed ? styles.pressablePressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.languageOptionText,
                          selected ? styles.languageOptionTextSelected : null,
                        ]}
                      >
                        {localeNames[item]}
                      </Text>
                      {selected ? (
                        <Check size={18} color={theme.colors.accent} />
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            </BottomSheetCard>
          </View>
        </Modal>

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
                <BottomSheetCard
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
                    <IconButton
                      accessibilityLabel={t('common.close')}
                      disabled={cancellingDownload}
                      hitSlop={8}
                      onPress={() => void handleCancelDownload()}
                      style={styles.closeButton}
                      variant="ghost"
                    >
                      <X size={20} color={theme.colors.textSecondary} />
                    </IconButton>
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
                      <MostTextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!downloadingCid}
                        maxFontSizeMultiplier={1.5}
                        multiline
                        onChangeText={handleDownloadLinkChange}
                        placeholder={t('app.receive.linkPlaceholder')}
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
                    <MostButton
                      disabled={cancellingDownload}
                      onPress={() => void handleCancelDownload()}
                      style={[
                        styles.cancelButton,
                        accessibilityLayout
                          ? styles.modalButtonAccessibility
                          : null,
                      ]}
                      variant="ghost"
                    >
                      {cancellingDownload
                        ? t('app.receive.cancelling')
                        : t('common.cancel')}
                    </MostButton>
                    {downloadIntent ? (
                      <MostButton
                        disabled={!isReady || Boolean(downloadingCid)}
                        onPress={handleConfirmDownload}
                        labelStyle={[
                          !isReady || downloadingCid
                            ? styles.confirmButtonTextDisabled
                            : null,
                        ]}
                        style={[
                          styles.confirmButton,
                          accessibilityLayout
                            ? styles.modalButtonAccessibility
                            : null,
                          !isReady || downloadingCid
                            ? styles.confirmButtonDisabled
                            : null,
                        ]}
                        variant="primary"
                      >
                        {downloadingCid
                          ? t('app.receive.downloading')
                          : t('app.receive.confirmDownload')}
                      </MostButton>
                    ) : (
                      <MostButton
                        disabled={!downloadLinkInput.trim()}
                        onPress={handleInspectDownload}
                        labelStyle={[
                          !downloadLinkInput.trim()
                            ? styles.confirmButtonTextDisabled
                            : null,
                        ]}
                        style={[
                          styles.confirmButton,
                          accessibilityLayout
                            ? styles.modalButtonAccessibility
                            : null,
                          !downloadLinkInput.trim()
                            ? styles.confirmButtonDisabled
                            : null,
                        ]}
                        variant="primary"
                      >
                        {t('app.receive.checkLink')}
                      </MostButton>
                    )}
                  </View>
                </BottomSheetCard>
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
        pressed ? styles.pressablePressed : null,
      ]}
    >
      {active ? <View style={styles.tabActiveIndicator} /> : null}
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
    startupScreen: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flex: 1,
      gap: 10,
      justifyContent: 'center',
    },
    startupTitle: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    onboardingScreen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    onboardingHeader: {
      alignItems: 'center',
      borderBottomColor: colors.borderStrong,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 58,
      paddingHorizontal: 16,
    },
    onboardingContent: {
      flex: 1,
      justifyContent: 'center',
      paddingBottom: 24,
    },
    header: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      paddingHorizontal: 20,
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderStrong,
      backgroundColor: colors.glass,
    },
    headerAccessibility: {
      minHeight: 64,
      paddingVertical: 10,
    },
    mainHeaderTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      width: '100%',
    },
    brandMark: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.accentSoft,
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
    content: {
      flex: 1,
    },
    tabPanel: {
      flex: 1,
    },
    tabPanelHidden: {
      display: 'none',
    },
    tabBar: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 0,
      borderWidth: 0,
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
      backgroundColor: colors.glassSolid,
    },
    tabButton: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    tabActiveIndicator: {
      position: 'absolute',
      top: 0,
      width: 28,
      height: 3,
      borderRadius: radii.full,
      backgroundColor: colors.accent,
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
    languageModalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backgroundColor: colors.overlay,
    },
    languageModalCard: {
      maxWidth: 420,
      gap: 14,
      borderBottomLeftRadius: radii.large,
      borderBottomRightRadius: radii.large,
    },
    languageModalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    languageOptions: {
      gap: 8,
    },
    languageOption: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    languageOptionSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    languageOptionText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
    languageOptionTextSelected: {
      color: colors.accent,
      fontWeight: '600',
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
      borderTopLeftRadius: radii.large,
      borderTopRightRadius: radii.large,
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
      backgroundColor: colors.glassHeavy,
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
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      color: colors.text,
      backgroundColor: colors.glassSubtle,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    downloadPreview: {
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
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
