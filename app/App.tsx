import './src/polyfills/eventTarget'
import { useBackgroundService } from './src/mobileCore/backgroundService'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import type { VoiceRecording } from './src/features/chat/voiceRecordingSession'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Sharing from 'expo-sharing'
import { saveFileToDirectory } from './src/files/nativeFileExport'
import b4a from 'b4a'
import {
  Check,
  ChevronLeft,
  Compass,
  HardDrive,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react-native'
import { FilesScreen } from './src/features/files/FilesScreen'
import type { JoinedChannel } from './src/features/chat/conversationModel'
import { ContactsScreen } from './src/features/chat/ContactsScreen'
import { DiscoverScreen } from './src/features/discover/DiscoverScreen'
import {
  WebFilePreview,
  type WebFilePreviewFile,
} from './src/features/files/WebFilePreview'
import {
  getFolderShareState,
  normalizeFileDisplayPath,
  type FileFolder,
} from './src/features/files/filesModel'
import {
  getRootBackAction,
  getRootTabFromPathname,
  getRootTabPath,
  getTabPressAction,
  type RootTab,
} from './src/navigation/rootNavigation'
import { NodeScreen } from './src/features/node/NodeScreen'
import { MeScreen } from './src/features/node/MeScreen'
import { AboutMostBox } from './src/features/node/AboutMostBox'
import { ProfileScreen } from './src/features/node/ProfileScreen'
import { NodeConnectionPanel } from './src/features/node/NodeConnectionPanel'
import { P2PPingScreen } from './src/features/node/P2PPingScreen'
import { TransfersScreen } from './src/features/transfers/TransfersScreen'
import {
  getTransferRuntimePolicy,
  getTransferRuntimeStatus,
  type TransferRuntimePlatform,
} from './src/features/transfers/transferModel'
import { ChatScreen } from './src/features/chat/ChatScreen'
import { useChatNotificationPreference } from './src/features/chat/useChatNotificationPreference'
import { formatAttachmentSize } from './src/features/chat/attachmentModel'
import type { ChatAttachment } from './src/chat/chatProtocol'
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
  ThemeProvider,
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
} from './src/ui/components'
import { FeedbackProvider, useFeedback } from './src/ui/feedback'
import { PrivacyConsentGate } from './src/privacy/PrivacyConsentGate'
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from './src/privacy/legalUrls'
import { PRODUCT_PROFILE } from './src/product/productProfile'
import type { DocumentPickerAsset } from 'expo-document-picker'
import type {
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
  MostBoxMobileClient,
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
  files: 'nav.contacts',
  explore: 'nav.discover',
  chat: 'nav.wechat',
  node: 'nav.me',
}

function isChatDetailRoute() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location.pathname === '/chat' &&
    Boolean(window.location.hash)
  )
}

function getInitialRootTab(fallback: RootTab) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return fallback
  return getRootTabFromPathname(window.location.pathname, fallback)
}

function updateRootTabRoute(tab: RootTab, replace = false) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', getRootTabPath(tab))
  window.dispatchEvent(new Event('most-route-change'))
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
    <ThemeProvider>
      <I18nProvider>
        <FeedbackProvider>
          <PrivacyConsentGate>
            <MostBoxApp />
          </PrivacyConsentGate>
        </FeedbackProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

function MostBoxApp() {
  const { locale, setLocale, t } = useI18n()
  const { alert, toast } = useFeedback()
  const theme = useMostBoxTheme()
  const styles = appStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const coreRef = useRef<MostBoxMobileClient | null>(null)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [snapshot, setSnapshot] = useState<MobileCoreSnapshot | null>(null)
  const [startupComplete, setStartupComplete] = useState(false)
  const [appVisibility, setAppVisibility] = useState<
    'active' | 'background' | 'inactive'
  >('active')
  const defaultRootTab = PRODUCT_PROFILE.features.chat ? 'chat' : 'files'
  const [activeTab, setActiveTab] = useState<RootTab>(() =>
    getInitialRootTab(defaultRootTab)
  )
  const [chatDetailRoute, setChatDetailRoute] = useState(isChatDetailRoute)
  const [discoverRoute, setDiscoverRoute] = useState<'home' | 'p2pPing'>('home')
  const [joinedChannels, setJoinedChannels] = useState<JoinedChannel[]>([])
  const [filesView, setFilesView] = useState<'contacts' | 'library'>(
    PRODUCT_PROFILE.features.chat ? 'contacts' : 'library'
  )
  const [joinChannelRequest, setJoinChannelRequest] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const chatNotifications = useChatNotificationPreference()
  const [nodeView, setNodeView] = useState<'me' | 'status' | 'transfers'>(() =>
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location.pathname === '/transfer'
      ? 'transfers'
      : 'me'
  )
  const [openChannelRequest, setOpenChannelRequest] = useState<{
    channel: string
    token: number
  } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [sharingFolderPath, setSharingFolderPath] = useState<string | null>(
    null
  )
  const [exportingCid, setExportingCid] = useState<string | null>(null)
  const [webFilePreview, setWebFilePreview] =
    useState<WebFilePreviewFile | null>(null)
  const [deletingCid, setDeletingCid] = useState<string | null>(null)
  const [copiedCid, setCopiedCid] = useState<string | null>(null)
  const [holdingDetailRequest, setHoldingDetailRequest] = useState<{
    cid: string
    token: number
  } | null>(null)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [languageModalOpen, setLanguageModalOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [downloadLinkInput, setDownloadLinkInput] = useState('')
  const [downloadIntent, setDownloadIntent] = useState<IncomingMostLink | null>(
    null
  )
  const [downloadLinkError, setDownloadLinkError] = useState('')
  const [downloadingCid, setDownloadingCid] = useState<string | null>(null)
  const [openDownloadAfterComplete, setOpenDownloadAfterComplete] =
    useState(false)
  const [retryingTransferId, setRetryingTransferId] = useState<string | null>(
    null
  )
  const [cancellingTransferCid, setCancellingTransferCid] = useState<
    string | null
  >(null)
  const [reselectTokens, setReselectTokens] = useState<Record<RootTab, number>>(
    { files: 0, explore: 0, chat: 0, node: 0 }
  )

  if (!coreRef.current) {
    coreRef.current = createMostBoxCore({ storagePath: getCoreStoragePath() })
  }
  const core = coreRef.current
  const currentSnapshot = snapshot ?? core.getSnapshot()
  const nodeStatus = currentSnapshot.node.status
  const isNodeOnline = nodeStatus === 'ready'
  const isRemote = currentSnapshot.node.mode === 'remote'
  const isReady =
    isNodeOnline && (!isRemote || currentSnapshot.node.authenticated === true)
  const isCoreBusy = nodeStatus === 'starting' || nodeStatus === 'stopping'
  // 曾经连上的远程节点掉线重连时保留主界面，避免用 onboarding 盖住聊天上下文
  const wasReadyRef = useRef(false)
  if (isReady) wasReadyRef.current = true
  const isReconnecting =
    wasReadyRef.current &&
    isRemote &&
    nodeStatus === 'starting' &&
    Boolean(currentSnapshot.node.error)
  const backgroundService = useBackgroundService()
  const transferRuntimePolicy = getTransferRuntimePolicy({
    platform: (Platform.OS === 'android' ||
    Platform.OS === 'ios' ||
    Platform.OS === 'web' ||
    Platform.OS === 'windows' ||
    Platform.OS === 'macos'
      ? Platform.OS
      : 'unknown') as TransferRuntimePlatform,
    backgroundSeedingEnabled: PRODUCT_PROFILE.features.backgroundSeeding,
    // Claim background support only while the native service is running.
    hasNativeForegroundService: backgroundService.running,
    nodeMode: currentSnapshot.node.mode,
    nodeReady: isReady,
  })
  const transferRuntimeStatus = getTransferRuntimeStatus(
    currentSnapshot.transfers,
    appVisibility,
    transferRuntimePolicy
  )
  useEffect(() => {
    const unsubscribe = core.subscribe(setSnapshot)
    void core
      .start()
      .catch(error => console.warn('MostBox node startup failed', error))
      .finally(() => setStartupComplete(true))

    return () => {
      unsubscribe()
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      void core.stop()
    }
  }, [core])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onRouteChange = () => {
      const nextTab = getRootTabFromPathname(
        window.location.pathname,
        defaultRootTab
      )
      setActiveTab(nextTab)
      setNodeView(current =>
        window.location.pathname === '/transfer'
          ? 'transfers'
          : current === 'transfers'
            ? 'me'
            : current
      )
      setDiscoverRoute('home')
      setChatDetailRoute(isChatDetailRoute())
    }
    window.addEventListener('popstate', onRouteChange)
    window.addEventListener('most-route-change', onRouteChange)
    if (
      window.location.pathname !== '/chat' &&
      window.location.pathname !== '/file' &&
      window.location.pathname !== '/transfer' &&
      window.location.pathname !== '/explore' &&
      window.location.pathname !== '/dot'
    ) {
      updateRootTabRoute(defaultRootTab, true)
    }
    return () => {
      window.removeEventListener('popstate', onRouteChange)
      window.removeEventListener('most-route-change', onRouteChange)
    }
  }, [defaultRootTab])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setAppVisibility(
        state === 'active'
          ? 'active'
          : state === 'background'
            ? 'background'
            : 'inactive'
      )
      if (state === 'active') {
        void core
          .start()
          .catch(error => console.warn('MostBox node startup failed', error))
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

  const changeTab = (nextTab: RootTab) => {
    const action = getTabPressAction(activeTab, nextTab)
    if (action === 'scrollTop') {
      setReselectTokens(current => ({
        ...current,
        [nextTab]: current[nextTab] + 1,
      }))
      return
    }
    if (nextTab !== 'explore') setDiscoverRoute('home')
    if (nextTab === 'files')
      setFilesView(PRODUCT_PROFILE.features.chat ? 'contacts' : 'library')
    if (nextTab === 'node') setNodeView('me')
    updateRootTabRoute(nextTab)
    setActiveTab(nextTab)
  }

  const openFileLibrary = () => {
    setFilesView('library')
    updateRootTabRoute('files')
    setActiveTab('files')
  }

  const openTransfers = () => {
    setNodeView('transfers')
    setActiveTab('node')
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({}, '', '/transfer')
      window.dispatchEvent(new Event('most-route-change'))
    }
  }

  const closeTransfers = () => {
    setNodeView('me')
    updateRootTabRoute('node')
  }

  const openNodeStatus = () => {
    setNodeView('status')
    updateRootTabRoute('node')
    setActiveTab('node')
  }

  const openContactChannel = (channel: string) => {
    setOpenChannelRequest({ channel, token: Date.now() })
    setChatDetailRoute(true)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({}, '', `/chat#${encodeURIComponent(channel)}`)
      window.dispatchEvent(new Event('most-route-change'))
    }
    setActiveTab('chat')
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
    openFileLibrary()
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
      toast(getFriendlyCoreError(error, locale), 'error')
    }
  }

  const handleStartP2PPing = (role: 'host' | 'join', code?: string) => {
    if (!isNodeOnline) {
      return Promise.reject(new Error(t('app.core.notReadyBody')))
    }
    return core.startP2PPing({ role, code })
  }

  const handleCancelP2PPing = (id?: string) => core.cancelP2PPing({ id })

  const publishPickedFile = async (
    targetPath = '',
    source: 'file' | 'photos' | 'camera' = 'file'
  ) => {
    if (!guardReady()) return

    setPublishing(true)
    try {
      let file: DocumentPickerAsset | undefined
      if (source === 'file') {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: '*/*',
        })
        if (result.canceled) return null
        file = result.assets[0]
      } else {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync()
          if (!permission.granted) {
            alert(
              t('chat.cameraPermissionTitle'),
              t('chat.cameraPermissionBody')
            )
            return null
          }
        }
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
          exif: false,
        }
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options)
        if (result.canceled || !result.assets[0]) return null
        const asset = result.assets[0]
        const uriName = asset.uri.split('/').pop()?.split('?')[0] || ''
        file = {
          uri: asset.uri,
          name:
            asset.fileName ||
            asset.file?.name ||
            uriName ||
            `photo-${Date.now()}.jpg`,
          size: asset.fileSize,
          lastModified: asset.file?.lastModified || Date.now(),
          mimeType:
            asset.mimeType ||
            asset.file?.type ||
            getMimeType(asset.fileName || uriName),
          file: asset.file,
        }
      }
      if (!file) return null
      return await publishFileAsset(file, targetPath)
    } finally {
      setPublishing(false)
    }
  }

  const publishFileAsset = async (
    file: DocumentPickerAsset,
    targetPath = ''
  ) => {
    const policyErrorKey = getStoreFilePolicyErrorKey(file.name, file.mimeType)
    if (policyErrorKey) {
      alert(t('app.file.unsupported'), t(policyErrorKey))
      return null
    }
    const normalizedTargetPath = normalizeFileDisplayPath(targetPath)
    const publishName = normalizedTargetPath
      ? `${normalizedTargetPath}/${file.name}`
      : file.name

    const transfer = await core.publishFile({
      uri: file.uri,
      name: publishName,
      size: file.size || 0,
      mimeType: file.mimeType,
      contentBytes: await readDevCidBytes(file),
      webFile: file.file,
    })

    if (!transfer.link) throw new Error(t('app.file.linkMissing'))
    return {
      file: { ...file, name: parseMostLink(transfer.link).fileName },
      link: transfer.link,
      transfer,
    }
  }

  const handlePublishFile = async (targetPath = '') => {
    try {
      const result = await publishPickedFile(targetPath)
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

  const handlePublishChatAttachment = async (
    source: 'file' | 'photos' | 'camera' = 'file'
  ): Promise<ChatAttachment | null> => {
    const result = await publishPickedFile('', source)
    if (!result) return null
    const cid = result.transfer.cid || parseMostLink(result.link).cid
    const mimeType = result.file.mimeType || undefined
    return {
      kind: mimeType?.startsWith('image/') ? 'image' : 'file',
      cid,
      fileName: result.file.name,
      link: result.link,
      ...(mimeType ? { mimeType } : {}),
      ...(typeof result.file.size === 'number'
        ? { size: result.file.size }
        : {}),
    }
  }

  const handlePublishVoiceMessage = async (
    recording: VoiceRecording
  ): Promise<ChatAttachment> => {
    if (!isReady)
      throw new Error(
        t(
          isNodeOnline && isRemote
            ? 'node.account.required'
            : 'app.core.notReadyBody'
        )
      )
    setPublishing(true)
    try {
      let file: DocumentPickerAsset
      if (Platform.OS === 'web') {
        const blob = await (await fetch(recording.uri)).blob()
        const extension = blob.type.includes('mp4')
          ? 'm4a'
          : blob.type.includes('ogg')
            ? 'ogg'
            : 'webm'
        const webFile = new File([blob], `voice-${Date.now()}.${extension}`, {
          type: blob.type,
        })
        file = {
          uri: recording.uri,
          name: webFile.name,
          size: webFile.size,
          mimeType: webFile.type,
          lastModified: webFile.lastModified,
          file: webFile,
        }
      } else {
        const info = await FileSystem.getInfoAsync(recording.uri)
        if (!info.exists || info.isDirectory)
          throw new Error(t('chat.voiceRecordingFailed'))
        file = {
          uri: recording.uri,
          name: `voice-${Date.now()}.m4a`,
          size: info.size,
          mimeType: 'audio/mp4',
          lastModified: Date.now(),
        }
      }
      const result = await publishFileAsset(file)
      if (!result) throw new Error(t('chat.attachmentFailed'))
      return {
        kind: 'audio',
        cid: result.transfer.cid || parseMostLink(result.link).cid,
        fileName: result.file.name,
        link: result.link,
        mimeType: file.mimeType,
        size: file.size,
      }
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
    setDownloadModalOpen(false)
    setDownloadIntent(null)
    setDownloadLinkError('')
    setOpenDownloadAfterComplete(false)
  }

  const handleHardwareBack = useEffectEvent(() => {
    const action = getRootBackAction({
      activeTab,
      downloadModalOpen,
      transfersOpen: activeTab === 'node' && nodeView === 'transfers',
      filesLibraryOpen:
        PRODUCT_PROFILE.features.chat &&
        activeTab === 'files' &&
        filesView === 'library',
      languageModalOpen,
      discoverRoute,
    })
    if (action === 'closeLanguage') {
      setLanguageModalOpen(false)
      return true
    }
    if (action === 'closeReceive') {
      closeDownloadModal()
      return true
    }
    if (action === 'closeFilesLibrary') {
      setFilesView('contacts')
      return true
    }
    if (action === 'closeTransfers') {
      closeTransfers()
      return true
    }
    if (action === 'closeDiscoverChild') {
      setDiscoverRoute('home')
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

  const handleDownloadHolding = (holding: MobileHolding) => {
    openDownloadIntent({
      cid: holding.cid,
      fileName: holding.fileName,
      link: holding.shareLink,
    })
  }

  const handleShareFolder = async (folder: FileFolder) => {
    if (!guardReady() || !isRemote) return
    const shareState = getFolderShareState(
      currentSnapshot.holdings,
      folder.path
    )
    if (!shareState.canShare) {
      alert(
        t('files.folder.shareFailedTitle'),
        t(
          shareState.reason === 'missingLocalFiles'
            ? 'files.folder.shareRequiresLocalFiles'
            : 'files.folder.shareEmpty'
        )
      )
      return
    }

    setSharingFolderPath(folder.path)
    try {
      const result = await core.shareFolder({ path: folder.path })
      await Clipboard.setStringAsync(result.link)
      toast(t('files.folder.shared'), 'success', [
        {
          label: t('common.share'),
          onPress: () => void shareMostLink(result.link),
        },
      ])
    } catch (error) {
      alert(
        t('files.folder.shareFailedTitle'),
        error instanceof Error ? error.message : t('app.file.shareFailedBody')
      )
    } finally {
      setSharingFolderPath(null)
    }
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
    const mimeType = getMimeType(holding.fileName)
    const exported = await core.exportHolding({
      cid: holding.cid,
      fileName: holding.fileName,
      mimeType,
    })
    const fileUri = toFileUri(exported.filePath)
    if (Platform.OS === 'web') {
      return {
        ...exported,
        fileUri,
        mimeType,
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
        setWebFilePreview({
          fileName: exported.fileName,
          fileUri: exported.fileUri,
          mimeType: exported.mimeType,
        })
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
      const saved = await saveFileToDirectory(
        exported.fileUri,
        permission.directoryUri,
        saveFileName,
        exported.mimeType,
        exported.size
      )
      alert(
        t('app.file.saveSuccessTitle'),
        t('app.file.saveSuccessBody', { fileName: saved.fileName })
      )
    } catch (error) {
      alert(
        t('app.file.saveFailedTitle'),
        error instanceof Error &&
          'code' in error &&
          error.code === 'ERR_EXPORT_INCOMPLETE'
          ? t('app.file.saveIncompleteBody')
          : t('app.file.saveFailedBody')
      )
    } finally {
      setExportingCid(null)
    }
  }

  const closeWebFilePreview = () => {
    if (webFilePreview?.fileUri.startsWith('blob:')) {
      URL.revokeObjectURL(webFilePreview.fileUri)
    }
    setWebFilePreview(null)
  }

  const openExternalUrl = async (url: string) => {
    try {
      if (Platform.OS === 'web' && url === SUPPORT_URL) {
        window.location.assign(url)
        return
      }
      await Linking.openURL(url)
    } catch {
      alert(t('app.link.openFailed'), url)
    }
  }

  const openLanguageMenu = () => {
    setLanguageModalOpen(true)
  }

  const isDiscoverChild = activeTab === 'explore' && discoverRoute === 'p2pPing'
  const isFilesLibrary =
    PRODUCT_PROFILE.features.chat &&
    activeTab === 'files' &&
    filesView === 'library'
  const isChatDetail = activeTab === 'chat' && chatDetailRoute
  const isTransfersPage = activeTab === 'node' && nodeView === 'transfers'
  const isSecondaryPage = isDiscoverChild || isFilesLibrary || isTransfersPage
  const hideTabBar =
    isDiscoverChild || isChatDetail || isFilesLibrary || isTransfersPage
  const headerTitle = isTransfersPage
    ? t('nav.transfers')
    : isDiscoverChild
      ? t('p2pPing.title')
      : isFilesLibrary
        ? t('nav.files')
        : t(TAB_LABEL_KEYS[activeTab])
  const headerBackLabel = isSecondaryPage ? t('common.back') : ''

  const handleHeaderBack = () => {
    if (isTransfersPage) {
      closeTransfers()
      return
    }
    if (isDiscoverChild) {
      setDiscoverRoute('home')
      return
    }
    if (isFilesLibrary) {
      setFilesView('contacts')
      return
    }
  }

  if (!startupComplete) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'right', 'bottom', 'left']}
          style={styles.startupScreen}
        >
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.startupTitle}>{t('app.node.starting')}</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    )
  }

  if (Platform.OS === 'web' && !isReady && !isReconnecting) {
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
              <Text style={styles.brandName}>
                {PRODUCT_PROFILE.displayName}
              </Text>
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
        <View pointerEvents="none" style={styles.backgroundDecorations}>
          <View style={styles.backgroundGlowPrimary} />
          <View style={styles.backgroundGlowSecondary} />
          <View style={styles.backgroundGlowTertiary} />
        </View>
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.colors.background}
        />
        {isSecondaryPage ? (
          <View
            style={[
              styles.header,
              accessibilityLayout ? styles.headerAccessibility : null,
            ]}
          >
            <View style={styles.headerLeft}>
              {isSecondaryPage ? (
                <IconButton
                  accessibilityLabel={headerBackLabel}
                  onPress={handleHeaderBack}
                  style={styles.headerIconButton}
                  variant="ghost"
                >
                  <ChevronLeft size={22} color={theme.colors.text} />
                </IconButton>
              ) : null}
              <View style={styles.headerTitleStack}>
                <Text maxFontSizeMultiplier={1.4} style={styles.headerEyebrow}>
                  {PRODUCT_PROFILE.displayName}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.8}
                  numberOfLines={1}
                  style={styles.mainHeaderTitle}
                >
                  {headerTitle}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.content}>
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'files' ? styles.tabPanelHidden : null,
            ]}
          >
            {filesView === 'contacts' ? (
              <ContactsScreen
                channels={joinedChannels}
                client={core}
                snapshot={currentSnapshot}
                onChannelsChange={setJoinedChannels}
                onOpenChannel={openContactChannel}
              />
            ) : (
              <FilesScreen
                actionDisabled={!isReady || publishing}
                copiedCid={copiedCid}
                deletingCid={deletingCid}
                detailRequest={holdingDetailRequest}
                exportingCid={exportingCid}
                receiveDisabled={Boolean(downloadingCid)}
                sharingFolderPath={sharingFolderPath}
                reselectToken={reselectTokens.files}
                snapshot={currentSnapshot}
                onCopyHoldingLink={handleCopyHoldingLink}
                onDeleteHolding={handleDeleteHolding}
                onDownloadHolding={handleDownloadHolding}
                onOpenHolding={handleOpenHolding}
                onPublishFile={handlePublishFile}
                onReceiveLink={openDownloadModal}
                onSaveHolding={handleSaveHolding}
                onShareHolding={handleShareHolding}
                onShareFolder={handleShareFolder}
              />
            )}
          </View>
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'explore' ? styles.tabPanelHidden : null,
            ]}
          >
            {discoverRoute === 'p2pPing' ? (
              <P2PPingScreen
                ping={currentSnapshot.p2pPing}
                ready={isNodeOnline}
                onStart={handleStartP2PPing}
                onCancel={handleCancelP2PPing}
              />
            ) : (
              <DiscoverScreen
                reselectToken={reselectTokens.explore}
                onJoinChannel={() => {
                  changeTab('chat')
                  setJoinChannelRequest(current => current + 1)
                }}
                onReceiveFile={openDownloadModal}
                onOpenFiles={openFileLibrary}
                onOpenTransfers={openTransfers}
                onOpenNode={openNodeStatus}
                onOpenP2PPing={() => setDiscoverRoute('p2pPing')}
              />
            )}
          </View>
          {PRODUCT_PROFILE.features.chat ? (
            <View
              style={[
                styles.tabPanel,
                activeTab !== 'chat' ? styles.tabPanelHidden : null,
              ]}
            >
              <ChatScreen
                client={core}
                active={activeTab === 'chat'}
                joinRequest={joinChannelRequest}
                onUnreadChange={setChatUnread}
                notificationsEnabled={
                  chatNotifications.enabled &&
                  chatNotifications.permissionAllowed
                }
                onOpenNotification={openContactChannel}
                onChannelsChange={setJoinedChannels}
                channels={joinedChannels}
                openChannelRequest={openChannelRequest}
                onDetailChange={setChatDetailRoute}
                onOpenNode={openNodeStatus}
                onPublishAttachment={handlePublishChatAttachment}
                onPublishVoiceMessage={handlePublishVoiceMessage}
                onSaveAttachment={handleSaveHolding}
                onReceiveAttachment={attachment => {
                  const inspection = inspectReceiveLink(attachment.link)
                  if (inspection.kind === 'blocked') {
                    alert(
                      t('app.download.retryFailed'),
                      t(inspection.errorKey as MessageKey)
                    )
                    return
                  }
                  openDownloadIntent(
                    { ...inspection.intent, size: attachment.size },
                    true
                  )
                }}
                onOpenAttachment={handleOpenHolding}
                snapshot={currentSnapshot}
              />
            </View>
          ) : null}
          <View
            style={[
              styles.tabPanel,
              activeTab !== 'node' ? styles.tabPanelHidden : null,
            ]}
          >
            {nodeView === 'me' ? (
              <MeScreen
                snapshot={currentSnapshot}
                username={currentSnapshot.node.username}
                onOpenProfile={() => setProfileOpen(true)}
                onOpenFiles={openFileLibrary}
                onOpenNode={openNodeStatus}
                onOpenTransfers={openTransfers}
                onOpenLanguage={openLanguageMenu}
                onOpenAbout={() => setAboutOpen(true)}
                notificationsEnabled={chatNotifications.enabled}
                notificationPermissionAllowed={
                  chatNotifications.permissionAllowed
                }
                notificationsDisabled={
                  !chatNotifications.ready || chatNotifications.working
                }
                onToggleNotifications={() => {
                  if (chatNotifications.enabled) {
                    void chatNotifications.toggle()
                  } else {
                    alert(
                      t('chat.notifications.title'),
                      t('chat.notifications.hint'),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('chat.notifications.enable'),
                          onPress: () => {
                            void chatNotifications.toggle()
                          },
                        },
                      ]
                    )
                  }
                }}
              />
            ) : nodeView === 'transfers' ? (
              <TransfersScreen
                cancellingCid={cancellingTransferCid}
                isReady={isReady}
                reselectToken={reselectTokens.node}
                retryingTransferId={retryingTransferId}
                snapshot={currentSnapshot}
                runtimeStatus={transferRuntimeStatus}
                onCancelDownload={handleCancelTransfer}
                onOpenHolding={showHoldingDetails}
                onRetryTransfer={handleRetryTransfer}
                onShowTransferDetails={handleShowTransferDetails}
              />
            ) : (
              <NodeScreen
                client={core}
                reselectToken={reselectTokens.node}
                retryStartDisabled={isCoreBusy}
                snapshot={currentSnapshot}
                onOpenPrivacy={() => openExternalUrl(PRIVACY_URL)}
                onOpenSupport={() => openExternalUrl(SUPPORT_URL)}
                onOpenTerms={() => openExternalUrl(TERMS_URL)}
                onRetryStartCore={handleStartCore}
              />
            )}
          </View>
        </View>

        <ProfileScreen
          visible={profileOpen}
          onClose={() => setProfileOpen(false)}
          username={currentSnapshot.node.username}
          address={currentSnapshot.node.userAddress || ''}
        />
        <AboutMostBox
          visible={aboutOpen}
          onClose={() => setAboutOpen(false)}
          onOpenPrivacy={() => openExternalUrl(PRIVACY_URL)}
          onOpenTerms={() => openExternalUrl(TERMS_URL)}
          onOpenSupport={() => openExternalUrl(SUPPORT_URL)}
        />

        {!hideTabBar ? (
          <View style={styles.tabBar}>
            {PRODUCT_PROFILE.features.chat ? (
              <TabButton
                active={activeTab === 'chat'}
                unread={chatUnread}
                icon={
                  <MessageCircle
                    size={21}
                    color={
                      activeTab === 'chat'
                        ? theme.colors.accent
                        : theme.colors.textSecondary
                    }
                  />
                }
                label={t('nav.chat')}
                onPress={() => changeTab('chat')}
              />
            ) : null}
            <TabButton
              active={activeTab === 'files'}
              icon={
                PRODUCT_PROFILE.features.chat ? (
                  <Users
                    size={21}
                    color={
                      activeTab === 'files'
                        ? theme.colors.accent
                        : theme.colors.textSecondary
                    }
                  />
                ) : (
                  <HardDrive
                    size={21}
                    color={
                      activeTab === 'files'
                        ? theme.colors.accent
                        : theme.colors.textSecondary
                    }
                  />
                )
              }
              label={t(
                PRODUCT_PROFILE.features.chat ? 'nav.contacts' : 'nav.files'
              )}
              onPress={() => changeTab('files')}
            />
            <TabButton
              active={activeTab === 'explore'}
              icon={
                <Compass
                  size={21}
                  color={
                    activeTab === 'explore'
                      ? theme.colors.accent
                      : theme.colors.textSecondary
                  }
                />
              }
              label={t('nav.discover')}
              onPress={() => changeTab('explore')}
            />
            <TabButton
              active={activeTab === 'node'}
              icon={
                <UserRound
                  size={21}
                  color={
                    activeTab === 'node'
                      ? theme.colors.accent
                      : theme.colors.textSecondary
                  }
                />
              }
              label={t('nav.me')}
              onPress={() => changeTab('node')}
            />
          </View>
        ) : null}

        <WebFilePreview file={webFilePreview} onClose={closeWebFilePreview} />

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
                      hitSlop={8}
                      onPress={closeDownloadModal}
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
                      {typeof downloadIntent.size === 'number' ? (
                        <Text style={styles.previewLabel}>
                          {formatAttachmentSize(downloadIntent.size)}
                        </Text>
                      ) : null}
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
                      onPress={closeDownloadModal}
                      style={[
                        styles.cancelButton,
                        accessibilityLayout
                          ? styles.modalButtonAccessibility
                          : null,
                      ]}
                      variant="ghost"
                    >
                      {t('common.cancel')}
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
  unread?: number
  icon: React.ReactNode
  label: string
  onPress: () => void
}

function TabButton({
  active,
  icon,
  label,
  unread = 0,
  onPress,
}: TabButtonProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = appStyles[theme.mode]

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={
        unread
          ? `${label}, ${t('chat.unreadCount', { count: unread > 99 ? '99+' : unread })}`
          : label
      }
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active ? styles.tabButtonActive : null,
        pressed ? styles.pressablePressed : null,
      ]}
    >
      <View style={styles.tabIcon}>
        {icon}
        {unread > 0 ? (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        ) : null}
      </View>
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
    backgroundDecorations: {
      display: 'none',
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: 'hidden',
    },
    backgroundGlowPrimary: {
      position: 'absolute',
      width: 360,
      height: 360,
      top: -180,
      right: -120,
      borderRadius: 180,
      backgroundColor: colors.backgroundGlowPrimary,
    },
    backgroundGlowSecondary: {
      position: 'absolute',
      width: 300,
      height: 300,
      top: 220,
      left: -180,
      borderRadius: 150,
      backgroundColor: colors.backgroundGlowSecondary,
    },
    backgroundGlowTertiary: {
      position: 'absolute',
      width: 260,
      height: 260,
      bottom: -160,
      right: -100,
      borderRadius: 130,
      backgroundColor: colors.backgroundGlowTertiary,
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
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 56,
      paddingHorizontal: 16,
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderStrong,
      backgroundColor: colors.background,
    },
    headerAccessibility: {
      minHeight: 64,
      paddingVertical: 10,
    },
    headerLeft: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: 0,
    },
    headerTitleStack: {
      flex: 1,
      gap: 1,
      minWidth: 0,
    },
    headerEyebrow: {
      display: 'none',
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    headerIconButton: {
      height: 40,
      width: 40,
    },
    headerActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    mainHeaderTitle: {
      color: colors.text,
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
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
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingHorizontal: 2,
      paddingVertical: 2,
      borderRadius: 0,
      borderWidth: 0,
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    tabButton: {
      flex: 1,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: 0,
      marginHorizontal: 0,
    },
    tabButtonActive: {
      backgroundColor: 'transparent',
    },
    tabIcon: { position: 'relative' },
    tabBadge: {
      position: 'absolute',
      top: -7,
      left: 15,
      minWidth: 17,
      height: 17,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
    },
    tabBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
    tabText: {
      alignSelf: 'stretch',
      color: colors.textSecondary,
      fontSize: 11,
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
