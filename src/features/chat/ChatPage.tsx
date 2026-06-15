import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageSquare,
  Plus,
  Sun,
  Moon,
  X,
  ArrowLeft,
  Edit2,
  Calendar,
  Hash,
  Settings,
  Loader,
  Search,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import {
  ChatAttachmentCard,
  getAttachmentBaseFileName,
} from '~/components/ChatAttachmentCard'
import {
  ChannelMemberGrid,
  ChatAttachmentBubble,
  ChatChannelNavItem,
  ChatComposer,
  ChatMessageItem,
  ChatTextBubble,
} from '~/components/ChatUi'
import FilePreviewOverlay from '~/components/FilePreviewOverlay'
import { InputModal, ConfirmModal, ModalOverlay } from '~/components/ui'
import OpenSidebarButton from '~/components/OpenSidebarButton'
import { LogoIcon } from '~/components/icons/LogoIcon'
import {
  api,
  getApiErrorMessage,
} from '~server/src/utils/api'
import { generateAvatar } from '~server/src/utils/avatar.js'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useDisclosure } from '~/hooks'
import { useBack } from '~/hooks/useBack'
import { useChannelMessages } from '~/hooks/useChannelMessages'
import SidebarAccount from '~/components/SidebarAccount'
import {
  channelApi,
  type Channel,
  type ChannelAttachment,
  type ChannelMember,
  type ChannelMessage,
} from '~/lib/channelApi'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'
import { useI18n } from '~/lib/i18n'
import { getUserChannelProfile } from '~/lib/userSync'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import {
  applyIncomingChannelMessageReadState,
  getChannelActivityTime,
  getChatReadStorageKey,
  hasUnreadChannelMessage,
  initializeChannelLastReadAt,
  markChannelReadInMap,
  readStoredChannelLastReadAt,
  writeStoredChannelLastReadAt,
} from '~/lib/chatUnread.js'
import { fileApi, getDownloadCheckErrorMessage } from '~/lib/fileApi'

const CHANNEL_NAME_MIN_LENGTH = 3
const CHANNEL_NAME_MAX_LENGTH = 30
const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/
const ATTACHMENT_CHECK_TIMEOUT_MS = 10000
const ATTACHMENT_CHECK_REQUEST_TIMEOUT_MS = ATTACHMENT_CHECK_TIMEOUT_MS + 2000
const CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS = 1200

function getChannelKey(channel?: Pick<Channel, 'channelKey' | 'name'> | null) {
  return channel?.channelKey || channel?.name || ''
}

function getChannelId(channel?: Pick<Channel, 'channelId' | 'name'> | null) {
  return channel?.channelId || channel?.name || ''
}

function getChannelTitle(channel?: Pick<Channel, 'remark' | 'channelId' | 'name'> | null) {
  return channel?.remark || getChannelId(channel)
}

const CHAT_FILE_ROOT = 'chat-file'

function getAttachmentKind(file: File, fileName: string): FileSubtype {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('text/')) return 'text'
  return getFileSubtype(fileName)
}

function formatAddressShort(address?: string) {
  if (!address) return 'Unknown'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function hasAddressSuffix(name?: string) {
  return /#[a-fA-F0-9]{4}$/.test(String(name || '').trim())
}

type AttachmentDownloadState = {
  status: 'checking' | 'available' | 'error'
  message?: string
}

type ChannelLastReadMap = Record<string, number>
type BrowserAudioContextConstructor = typeof AudioContext

function getBrowserAudioContextConstructor():
  | BrowserAudioContextConstructor
  | undefined {
  if (typeof window === 'undefined') return undefined
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: BrowserAudioContextConstructor
    }
  return audioWindow.AudioContext || audioWindow.webkitAudioContext
}

function ChatPage() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const back = useBack()
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [requestedChannelName, setRequestedChannelName] = useState('')
  const [channelSearchInput, setChannelSearchInput] = useState('')
  const [channelInput, setChannelInput] = useState('')
  const [showJoinChannel, joinChannelModal] = useDisclosure(false)
  const [myPeerId, setMyPeerId] = useState('')
  const [isJoiningChannel, setIsJoiningChannel] = useState(false)
  const [isLeavingChannel, setIsLeavingChannel] = useState(false)
  const [showLeaveChannelConfirm, leaveChannelModal] = useDisclosure(false)
  const [channelToLeave, setChannelToLeave] = useState<Channel | null>(null)
  const [channelToRename, setChannelToRename] = useState<Channel | null>(null)
  const [showChannelDetail, setShowChannelDetail] = useState(false)
  const [remarkInput, setRemarkInput] = useState('')
  const [isRenamingChannel, setIsRenamingChannel] = useState(false)
  const [previewItem, setPreviewItem] = useState<{
    cid: string
    fileName: string
    subtype: FileSubtype
  } | null>(null)
  const [isPublishingAttachment, setIsPublishingAttachment] = useState(false)
  const [attachmentDownloadStatus, setAttachmentDownloadStatus] = useState<
    Record<string, AttachmentDownloadState>
  >({})
  const [failedAttachment, setFailedAttachment] =
    useState<ChannelAttachment | null>(null)
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([])
  const [isLoadingChannelMembers, setIsLoadingChannelMembers] = useState(false)
  const [showAddressSuffix, setShowAddressSuffix] = useState(false)
  const [hasInviteLogoError, setHasInviteLogoError] = useState(false)
  const [channelLastReadAt, setChannelLastReadAt] =
    useState<ChannelLastReadMap>({})
  const isInviteUser = userIdentity?.identity === 'user'
  const inviteLogo =
    isInviteUser && !hasInviteLogoError ? userIdentity.logo : ''

  const channelMessagesEndRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const activeChannelNameRef = useRef('')
  const notificationAudioContextRef = useRef<AudioContext | null>(null)
  const notificationAudioUnlockedRef = useRef(false)
  const lastNotificationSoundAtRef = useRef(0)
  const pendingAttachmentPreviewsRef = useRef(
    new Map<string, ChannelAttachment>()
  )
  const activeAttachmentDownloadsRef = useRef(new Set<string>())
  const isBackendReady = hasBackend === true
  const { t, compareStrings, formatDate, formatTime } = useI18n()

  const showApiError = useCallback(
    async (err: unknown, fallback: string) => {
      addToast(await getApiErrorMessage(err, fallback), 'error')
    },
    [addToast]
  )

  const channelReadStorageKey = useMemo(
    () => getChatReadStorageKey(userIdentity?.address),
    [userIdentity?.address]
  )

  const markChannelRead = useCallback(
    (channelKey: string, timestamp = Date.now()) => {
      if (!channelKey) return
      setChannelLastReadAt(prev => {
        const result = markChannelReadInMap(prev, channelKey, timestamp)
        if (!result.changed) return prev
        writeStoredChannelLastReadAt(channelReadStorageKey, result.value)
        return result.value
      })
    },
    [channelReadStorageKey]
  )

  const ensureNotificationAudioUnlocked = useCallback(() => {
    if (notificationAudioUnlockedRef.current) return
    if (typeof window === 'undefined') return
    const AudioContextConstructor = getBrowserAudioContextConstructor()
    if (!AudioContextConstructor) return

    try {
      const audioContext =
        notificationAudioContextRef.current || new AudioContextConstructor()
      notificationAudioContextRef.current = audioContext
      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => {})
      }
      notificationAudioUnlockedRef.current = true
    } catch {}
  }, [])

  const playChannelNotificationSound = useCallback(() => {
    if (!notificationAudioUnlockedRef.current) return
    const now = Date.now()
    if (
      now - lastNotificationSoundAtRef.current <
      CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS
    ) {
      return
    }
    lastNotificationSoundAtRef.current = now

    const AudioContextConstructor = getBrowserAudioContextConstructor()
    if (!AudioContextConstructor) return

    try {
      const audioContext =
        notificationAudioContextRef.current || new AudioContextConstructor()
      notificationAudioContextRef.current = audioContext
      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => {})
        return
      }

      const gain = audioContext.createGain()
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(
        0.08,
        audioContext.currentTime + 0.015
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + 0.18
      )
      gain.connect(audioContext.destination)
      ;[740, 980].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
        oscillator.connect(gain)
        oscillator.start(audioContext.currentTime + index * 0.035)
        oscillator.stop(audioContext.currentTime + 0.16 + index * 0.035)
      })
    } catch {}
  }, [])

  const refreshChannelMembers = useCallback(
    async (channelKey = getChannelKey(activeChannel)) => {
      if (!channelKey || !isBackendReady || !userIdentity) {
        setChannelMembers([])
        return
      }
      setIsLoadingChannelMembers(true)
      try {
        setChannelMembers(await channelApi.getChannelMembers(channelKey))
      } catch (err) {
        setChannelMembers([])
        await showApiError(err, t('chat.error.members'))
      } finally {
        setIsLoadingChannelMembers(false)
      }
    },
    [activeChannel, isBackendReady, showApiError, t, userIdentity]
  )

  function handleChannelSocketEvent(event: string, data: any) {
    switch (event) {
      case 'channel:message': {
        const channelKey = data?.channelKey || data?.channel
        const message = data?.message as ChannelMessage | undefined
        const messageTime = Number(message?.timestamp) || Date.now()
        if (channelKey) {
          setChannels(prev =>
            prev.map(channel =>
              getChannelKey(channel) === channelKey
                ? {
                    ...channel,
                    lastMessageAt: new Date(messageTime).toISOString(),
                  }
                : channel
              )
          )
          const isActiveChannel = channelKey === activeChannelNameRef.current
          setChannelLastReadAt(prev => {
            const result = applyIncomingChannelMessageReadState(prev, {
              channelName: channelKey,
              messageTime,
              activeChannelName: isActiveChannel ? channelKey : '',
              messageAuthor: message?.author,
              userAddress: userIdentity?.address,
            })
            if (result.changed) {
              writeStoredChannelLastReadAt(channelReadStorageKey, result.value)
            }
            if (result.notify) {
              playChannelNotificationSound()
            }
            return result.changed ? result.value : prev
          })
        }
        break
      }

      case 'channel:peer:online':
      case 'channel:peer:offline':
        if (activeChannel) {
          channelApi.getChannelPeers(getChannelKey(activeChannel)).catch(err => {
            console.warn('[Chat] Failed to fetch peers on event:', err.message)
          })
        }
        break

      case 'channel:joined':
      case 'channel:left':
        void refreshChannels()
        void refreshChannelMembers()
        break

      case 'user:metadata:updated':
        if (data?.scope === 'channels') {
          void refreshChannels()
          void refreshChannelMembers(activeChannelNameRef.current)
        }
        break

      case 'download:success': {
        const attachment = pendingAttachmentPreviewsRef.current.get(data.taskId)
        if (attachment) {
          pendingAttachmentPreviewsRef.current.delete(data.taskId)
          activeAttachmentDownloadsRef.current.delete(attachment.cid)
          setAttachmentDownloadStatus(prev => ({
            ...prev,
            [attachment.cid]: { status: 'available' },
          }))
          addToast(
            t('chat.attachment.downloadCompleted', {
              fileName:
                data.fileName || getAttachmentBaseFileName(attachment.fileName),
            }),
            'success'
          )
          openAttachmentPreview(
            attachment,
            data.fileName || attachment.fileName
          )
        }
        break
      }

      case 'download:error':
      case 'download:cancelled': {
        const attachment = pendingAttachmentPreviewsRef.current.get(data.taskId)
        if (attachment) {
          pendingAttachmentPreviewsRef.current.delete(data.taskId)
          activeAttachmentDownloadsRef.current.delete(attachment.cid)
          setAttachmentDownloadStatus(prev => ({
            ...prev,
            [attachment.cid]: {
              status: 'error',
              message:
                event === 'download:cancelled'
                  ? t('chat.attachment.downloadCancelled')
                  : data.error || t('chat.attachment.downloadFailed'),
            },
          }))
          addToast(
            event === 'download:cancelled'
              ? t('chat.attachment.downloadCancelled')
              : data.error || t('chat.attachment.downloadFailed'),
            'error'
          )
        }
        break
      }
    }
  }

  const subscribedChannelNames = useMemo(
    () => channels.map(channel => getChannelKey(channel)),
    [channels]
  )

  const {
    clearMessages: clearChannelMessages,
    messages: channelMessages,
    sendMessage: sendSharedChannelMessage,
    syncMessages,
  } = useChannelMessages({
    isReady: isBackendReady,
    enabled: Boolean(userIdentity),
    channelName: getChannelKey(activeChannel),
    extraSubscribedChannelNames: subscribedChannelNames,
    peerId: myPeerId,
    waitForPeerId: true,
    onSyncError: err => showApiError(err, t('chat.error.messages')),
    onSocketEvent: handleChannelSocketEvent,
    onReconnect: refreshChannels,
  })

  function requireBackendReady() {
    if (isBackendReady) return true
    openConnectModal()
    return false
  }

  function requireLogin() {
    if (userIdentity) return true
    openLoginModal()
    return false
  }

  useEffect(() => {
    const updateRequestedChannelName = () => {
      setRequestedChannelName(
        new URLSearchParams(window.location.search).get('channel') || ''
      )
    }

    updateRequestedChannelName()
    window.addEventListener('popstate', updateRequestedChannelName)
    return () =>
      window.removeEventListener('popstate', updateRequestedChannelName)
  }, [])

  useEffect(() => {
    if (!userIdentity) return
    setRequestedChannelName(
      new URLSearchParams(window.location.search).get('channel') || ''
    )
  }, [userIdentity?.address])

  useEffect(() => {
    setHasInviteLogoError(false)
  }, [userIdentity?.logo])

  useEffect(() => {
    activeChannelNameRef.current = getChannelKey(activeChannel)
  }, [activeChannel])

  useEffect(() => {
    setChannelLastReadAt(readStoredChannelLastReadAt(channelReadStorageKey))
  }, [channelReadStorageKey])

  useEffect(() => {
    if (!channelReadStorageKey || channels.length === 0) return
    setChannelLastReadAt(prev => {
      const result = initializeChannelLastReadAt(prev, channels)
      if (result.changed) {
        writeStoredChannelLastReadAt(channelReadStorageKey, result.value)
      }
      return result.changed ? result.value : prev
    })
  }, [channelReadStorageKey, channels])

  useEffect(() => {
    window.addEventListener('pointerdown', ensureNotificationAudioUnlocked, {
      passive: true,
    })
    window.addEventListener('keydown', ensureNotificationAudioUnlocked)
    return () => {
      window.removeEventListener('pointerdown', ensureNotificationAudioUnlocked)
      window.removeEventListener('keydown', ensureNotificationAudioUnlocked)
    }
  }, [ensureNotificationAudioUnlocked])

  useEffect(() => {
    return () => {
      void notificationAudioContextRef.current?.close().catch(() => {})
      notificationAudioContextRef.current = null
      notificationAudioUnlockedRef.current = false
    }
  }, [])

  useEffect(() => {
    channelMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages])

  useEffect(() => {
    if (!isBackendReady) {
      setMyPeerId('')
      return
    }

    api
      .get('/api/node-id')
      .json<{ id: string }>()
      .then(d => setMyPeerId(d.id))
      .catch(err => {
        console.warn('[Chat] Failed to fetch node ID:', err.message)
        void showApiError(err, t('chat.error.nodeId'))
      })
  }, [isBackendReady, showApiError, t])

  useEffect(() => {
    if (isBackendReady && userIdentity) {
      refreshChannels()
    }
  }, [hasBackend, isBackendReady, userIdentity?.address])

  useEffect(() => {
    if (activeChannel) {
      if (isBackendReady) {
        const activeChannelKey = getChannelKey(activeChannel)
        void syncMessages(activeChannelKey, { replace: true })
        channelApi.getChannelPeers(activeChannelKey).catch(() => {})
        void refreshChannelMembers(activeChannelKey)
      }
    }
  }, [
    activeChannel,
    hasBackend,
    isBackendReady,
    refreshChannelMembers,
    syncMessages,
  ])

  useEffect(() => {
    if (!showChannelDetail || !activeChannel) return
    void refreshChannelMembers(getChannelKey(activeChannel))
  }, [activeChannel, refreshChannelMembers, showChannelDetail])

  useEffect(() => {
    if (requestedChannelName && channels.length > 0) {
      const found =
        channels.find(c => getChannelKey(c) === requestedChannelName) ||
        channels.find(c => getChannelId(c) === requestedChannelName)
      if (
        found &&
        (!activeChannel || getChannelKey(activeChannel) !== getChannelKey(found))
      ) {
        handleOpenChannel(found)
      } else if (
        found &&
        activeChannel &&
        getChannelKey(activeChannel) === getChannelKey(found) &&
        (activeChannel.createdAt !== found.createdAt ||
          activeChannel.coreKey !== found.coreKey ||
          activeChannel.lastMessageAt !== found.lastMessageAt ||
          activeChannel.pinned !== found.pinned ||
          activeChannel.remark !== found.remark ||
          activeChannel.type !== found.type)
      ) {
        setActiveChannel(found)
      }
    }
  }, [channels, activeChannel, requestedChannelName])

  useEffect(() => {
    if (userIdentity) return
    setChannels([])
    setActiveChannel(null)
    setRequestedChannelName('')
    setChannelToRename(null)
    clearChannelMessages()
    setChannelInput('')
    setMyPeerId('')
    setShowChannelDetail(false)
    setPreviewItem(null)
    setChannelMembers([])
    setAttachmentDownloadStatus({})
    setChannelLastReadAt({})
    activeAttachmentDownloadsRef.current.clear()
    pendingAttachmentPreviewsRef.current.clear()
  }, [clearChannelMessages, userIdentity?.address])

  function getChannelNameValidationError(name) {
    if (name.length < CHANNEL_NAME_MIN_LENGTH) {
      return t('chat.validation.nameMin', {
        count: CHANNEL_NAME_MIN_LENGTH,
      })
    }
    if (name.length > CHANNEL_NAME_MAX_LENGTH) {
      return t('chat.validation.nameMax', {
        count: CHANNEL_NAME_MAX_LENGTH,
      })
    }
    if (name.includes('.')) {
      return t('chat.validation.dotReserved')
    }
    if (!CHANNEL_NAME_REGEX.test(name)) {
      return t('chat.validation.allowedChars')
    }
    return ''
  }

  async function refreshChannels() {
    if (!isBackendReady) return
    try {
      const result = await channelApi.getChannels({ excludeType: 'game' })
      setChannels(result)
    } catch (err) {
      setChannels([])
      await showApiError(err, t('chat.error.channelList'))
    }
  }

  function openAttachmentPreview(
    attachment: ChannelAttachment,
    fileName = attachment.fileName
  ) {
    const subtype = getFileSubtype(fileName)
    setPreviewItem({
      cid: attachment.cid,
      fileName,
      subtype: subtype === 'file' ? attachment.kind : subtype,
    })
  }

  async function checkAttachmentAvailability(attachment: ChannelAttachment) {
    const validationMessage = getLocalizedDownloadLinkValidationMessage(
      attachment.link,
      t
    )
    if (validationMessage) {
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: { status: 'error', message: validationMessage },
      }))
      return false
    }

    try {
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: { status: 'checking' },
      }))
      const checkResult = await fileApi.checkDownload(attachment.link, {
        timeout: ATTACHMENT_CHECK_TIMEOUT_MS,
        requestTimeout: ATTACHMENT_CHECK_REQUEST_TIMEOUT_MS,
      })
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: {
          status: 'available',
          message: checkResult.alreadyExists
            ? t('chat.attachment.localAvailable')
            : t('chat.attachment.previewAvailable'),
        },
      }))
      return true
    } catch (err) {
      const message = await getDownloadCheckErrorMessage(err)
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: { status: 'error', message },
      }))
      return false
    }
  }

  async function handleRetryAttachmentCheck(attachment: ChannelAttachment) {
    setFailedAttachment(null)
    const ok = await checkAttachmentAvailability(attachment)
    if (ok) {
      await startAttachmentDownload(attachment)
    }
  }

  async function startAttachmentDownload(attachment: ChannelAttachment) {
    if (activeAttachmentDownloadsRef.current.has(attachment.cid)) return
    activeAttachmentDownloadsRef.current.add(attachment.cid)
    setAttachmentDownloadStatus(prev => ({
      ...prev,
      [attachment.cid]: { status: 'available' },
    }))
    try {
      const result = await fileApi.downloadFile(attachment.link)
      if (result.alreadyExists || result.fileName) {
        activeAttachmentDownloadsRef.current.delete(attachment.cid)
        setAttachmentDownloadStatus(prev => ({
          ...prev,
          [attachment.cid]: { status: 'available' },
        }))
        openAttachmentPreview(
          { ...attachment, fileName: result.fileName || attachment.fileName },
          result.fileName || attachment.fileName
        )
        return
      }

      if (result.taskId) {
        pendingAttachmentPreviewsRef.current.set(result.taskId, attachment)
        addToast(t('chat.attachment.downloadStarted'), 'success')
      }
    } catch (err) {
      const message = await getDownloadCheckErrorMessage(err)
      activeAttachmentDownloadsRef.current.delete(attachment.cid)
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: { status: 'error', message },
      }))
    }
  }

  async function handleOpenChannel(channel: Channel) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    const channelKey = getChannelKey(channel)
    markChannelRead(
      channelKey,
      Math.max(getChannelActivityTime(channel), Date.now())
    )
    setActiveChannel(channel)
    setRequestedChannelName(channelKey)
    window.history.pushState(
      {},
      '',
      `?channel=${encodeURIComponent(channelKey)}`
    )
  }

  async function handleLeaveChannel(
    channelKey: string,
    e?: React.MouseEvent<HTMLButtonElement>
  ) {
    if (e) e.stopPropagation()
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (isLeavingChannel) return
    setIsLeavingChannel(true)
    try {
      await channelApi.leaveChannel(channelKey)
      if (getChannelKey(activeChannel) === channelKey) {
        setActiveChannel(null)
        setRequestedChannelName('')
        clearChannelMessages()
        const url = new URL(window.location.href)
        url.searchParams.delete('channel')
        window.history.pushState({}, '', url.pathname)
      }
      refreshChannels()
      leaveChannelModal.close()
      setChannelToLeave(null)
    } catch (err) {
      await showApiError(err, t('chat.error.leave'))
    } finally {
      setIsLeavingChannel(false)
    }
  }

  async function handleToggleChannelPin(channel: Channel) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    const nextPinned = !channel.pinned
    const channelKey = getChannelKey(channel)
    try {
      const result = await channelApi.setChannelPinned(channelKey, nextPinned)
      setChannels(prev =>
        prev.map(item =>
          getChannelKey(item) === channelKey
            ? { ...item, pinned: result.pinned }
            : item
        )
      )
      setActiveChannel(prev =>
        prev && getChannelKey(prev) === channelKey
          ? { ...prev, pinned: result.pinned }
          : prev
      )
    } catch (err) {
      await showApiError(
        err,
        nextPinned ? t('chat.error.pin') : t('chat.error.unpin')
      )
    }
  }

  async function handleJoinChannel(channelName: string) {
    const name = channelName.trim()
    if (!name || isJoiningChannel) return
    const validationError = getChannelNameValidationError(name)
    if (validationError) {
      addToast(validationError, 'error')
      return
    }
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    setIsJoiningChannel(true)
    try {
      const result = await channelApi.createChannel(
        name,
        'public',
        getUserChannelProfile(userIdentity)
      )
      const resultKey = result.channelKey || result.key || result.name || name
      const existingChannel = channels.find(
        channel => getChannelKey(channel) === resultKey
      )
      const joinedChannel: Channel = {
        ...existingChannel,
        name: result.name || name,
        channelId: result.channelId || result.name || name,
        channelKey: result.channelKey || result.key || existingChannel?.channelKey,
        type: result.type || existingChannel?.type || 'public',
        createdAt: result.createdAt || existingChannel?.createdAt,
        coreKey: result.coreKey || result.key || existingChannel?.coreKey,
        localWriterCoreKey:
          result.localWriterCoreKey || existingChannel?.localWriterCoreKey,
        writerCoreKeys: result.writerCoreKeys || existingChannel?.writerCoreKeys,
        remark: result.remark || existingChannel?.remark,
      }
      const joinedChannelKey = getChannelKey(joinedChannel)
      setChannels(prev =>
        prev.some(channel => getChannelKey(channel) === joinedChannelKey)
          ? prev.map(channel =>
              getChannelKey(channel) === joinedChannelKey
                ? { ...channel, ...joinedChannel }
                : channel
            )
          : [...prev, joinedChannel]
      )
      joinChannelModal.close()
      await handleOpenChannel(joinedChannel)
      void refreshChannelMembers(joinedChannelKey)
      refreshChannels()
    } catch (err) {
      await showApiError(err, t('chat.error.join'))
    } finally {
      setIsJoiningChannel(false)
    }
  }

  async function sendChannelMessage(
    content: string,
    attachment?: ChannelAttachment
  ) {
    if (!content.trim() || !activeChannel) return false
    if (!requireLogin()) return false
    if (!requireBackendReady()) return false
    const trimmedContent = content.trim()
    const activeChannelKey = getChannelKey(activeChannel)

    try {
      const sentMessage = await sendSharedChannelMessage({
        channelName: activeChannelKey,
        content: trimmedContent,
        attachment,
      })
      setChannels(prev =>
        prev.map(channel =>
          getChannelKey(channel) === activeChannelKey
            ? {
                ...channel,
                lastMessageAt: new Date(
                  Number(sentMessage?.timestamp) || Date.now()
                ).toISOString(),
              }
            : channel
        )
      )
      if (sentMessage) {
        markChannelRead(
          activeChannelKey,
          Number(sentMessage.timestamp) || Date.now()
        )
      }
      void refreshChannelMembers(activeChannelKey)
      return true
    } catch (err) {
      await showApiError(err, t('chat.error.send'))
      return false
    }
  }

  async function handleSendChannelMessage() {
    if (!channelInput.trim()) return
    const content = channelInput.trim()
    setChannelInput('')
    await sendChannelMessage(content)
  }

  function getChatAttachmentFileName(channelName: string, fileName: string) {
    return `${CHAT_FILE_ROOT}/${channelName}/${fileName}`
  }

  async function handleSelectAttachmentFiles(files: FileList | null) {
    if (!files || files.length === 0 || !activeChannel) return
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (isPublishingAttachment) return

    setIsPublishingAttachment(true)
    try {
      for (const file of Array.from(files)) {
        const targetFileName = getChatAttachmentFileName(
          getChannelId(activeChannel),
          file.name
        )
        const result = await fileApi.publishFile(file, targetFileName)
        const fileName = result.fileName || targetFileName
        const link =
          result.link ||
          `most://${result.cid}?filename=${encodeURIComponent(fileName)}`
        const attachment: ChannelAttachment = {
          kind: getAttachmentKind(file, fileName),
          cid: result.cid,
          fileName,
          link,
          mimeType: file.type || undefined,
          size: file.size,
        }
        const sent = await sendChannelMessage(link, attachment)
        if (sent) {
          addToast(
            t('chat.attachment.published', {
              fileName: getAttachmentBaseFileName(fileName),
            }),
            'success'
          )
        }
      }
    } catch (err) {
      await showApiError(err, t('chat.error.attachmentSend'))
    } finally {
      setIsPublishingAttachment(false)
    }
  }

  async function handleOpenAttachment(attachment: ChannelAttachment) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    const currentState = attachmentDownloadStatus[attachment.cid]
    if (currentState?.status === 'checking') return

    if (currentState?.status === 'error') {
      setFailedAttachment(attachment)
      return
    }

    if (currentState?.status !== 'available') {
      const ok = await checkAttachmentAvailability(attachment)
      if (ok) {
        await startAttachmentDownload(attachment)
      }
      return
    }

    await startAttachmentDownload(attachment)
  }

  async function updateChannelRemark(channel: Channel, nextRemark: string) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return

    const channelKey = getChannelKey(channel)
    const result = await channelApi.setChannelRemark(channelKey, nextRemark)
    setChannels(prev =>
      prev.map(c =>
        getChannelKey(c) === channelKey ? { ...c, remark: result.remark } : c
      )
    )
    setActiveChannel(prev =>
      prev && getChannelKey(prev) === channelKey
        ? { ...prev, remark: result.remark }
        : prev
    )
    return result.remark
  }

  async function handleSetRemark() {
    if (!activeChannel) return
    try {
      await updateChannelRemark(activeChannel, remarkInput)
    } catch (err) {
      await showApiError(err, t('chat.error.remark'))
    }
  }

  async function handleRenameChannel(value: string) {
    if (!channelToRename || isRenamingChannel) return
    setIsRenamingChannel(true)
    try {
      await updateChannelRemark(channelToRename, value)
      setChannelToRename(null)
    } catch (err) {
      await showApiError(err, t('chat.error.rename'))
    } finally {
      setIsRenamingChannel(false)
    }
  }

  function renderMessageBubble(msg: ChannelMessage) {
    if (!msg.attachment) {
      return <ChatTextBubble>{msg.content}</ChatTextBubble>
    }

    const attachment = msg.attachment
    const downloadState = attachmentDownloadStatus[attachment.cid]
    const downloadStatus = downloadState?.status

    return (
      <ChatAttachmentBubble>
        <ChatAttachmentCard
          attachment={attachment}
          status={downloadStatus}
          pending={msg.pending}
          onOpen={handleOpenAttachment}
        />
      </ChatAttachmentBubble>
    )
  }

  function formatDisplayName(name?: string, address?: string) {
    const displayName = String(name || '').trim()
    if (!displayName) return formatAddressShort(address)
    if (!showAddressSuffix) return displayName.replace(/#[a-fA-F0-9]{4}$/, '')
    if (hasAddressSuffix(displayName)) return displayName
    return address
      ? `${displayName}#${address.slice(-4).toUpperCase()}`
      : displayName
  }

  function renderChannelMembers() {
    return (
      <ChannelMemberGrid
        isLoading={isLoadingChannelMembers}
        members={channelMembers.map(member => ({
          id: member.address,
          name: formatDisplayName(member.displayName, member.address),
          avatarSrc: generateAvatar(member.address, member.avatar),
        }))}
      />
    )
  }

  const isRestoringInviteChannel =
    isInviteUser && Boolean(requestedChannelName) && !activeChannel

  const chatHeaderTitle = activeChannel ? (
    <h2 className="header-title" translate="no">
      {getChannelTitle(activeChannel)}
    </h2>
  ) : (
    <h2 className="header-title">{t('chat.title')}</h2>
  )
  const channelSearchQuery = channelSearchInput.trim().toLowerCase()
  const sortedChannels = useMemo(
    () =>
      [...channels].sort((a, b) => {
        const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        if (pinnedDiff !== 0) return pinnedDiff

        const activityDiff =
          getChannelActivityTime(b) - getChannelActivityTime(a)
        if (activityDiff !== 0) return activityDiff

        return compareStrings(getChannelTitle(a), getChannelTitle(b))
      }),
    [channels, compareStrings]
  )
  const filteredChannels = channelSearchQuery
    ? sortedChannels.filter(channel => {
        const displayName = getChannelTitle(channel)
        return [displayName, getChannelId(channel), getChannelKey(channel)].some(value =>
          value.toLowerCase().includes(channelSearchQuery)
        )
      })
    : sortedChannels

  return (
    <AppShell
      className="chat-app-layout"
      defaultHide={isInviteUser}
      sidebar={({ closeSidebar }) => (
        <>
          <button
            type="button"
            className="sidebar-header sidebar-header-link"
            onClick={back}
          >
            <ArrowLeft size={18} />
            <h1>MOST PEOPLE</h1>
          </button>

          <div className="chat-channel-search">
            <div className="ui-input-control">
              <Search className="ui-input-icon" size={15} />
              <input
                type="search"
                className="input input-compact"
                placeholder={t('chat.search.placeholder')}
                value={channelSearchInput}
                onChange={e => setChannelSearchInput(e.target.value)}
                aria-label={t('chat.search.placeholder')}
              />
            </div>
          </div>

          <nav className="sidebar-nav">
            {channels.length === 0 ? (
              <div className="sidebar-empty-state">
                <p>{t('chat.empty.noChannels')}</p>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="sidebar-empty-state">
                <p>{t('chat.empty.noMatches')}</p>
              </div>
            ) : (
              filteredChannels.map(channel => (
                <ChatChannelNavItem
                  key={getChannelKey(channel)}
                  active={getChannelKey(activeChannel) === getChannelKey(channel)}
                  pinned={Boolean(channel.pinned)}
                  unread={hasUnreadChannelMessage(channel, channelLastReadAt)}
                  title={getChannelTitle(channel)}
                  onSelect={() => {
                    handleOpenChannel(channel)
                    closeSidebar()
                  }}
                  onTogglePin={() => void handleToggleChannelPin(channel)}
                  onRename={() => setChannelToRename(channel)}
                  onLeave={() => {
                    setChannelToLeave(channel)
                    leaveChannelModal.open()
                  }}
                />
              ))
            )}
          </nav>

          <button
            className="ui-action-dashed create-channel-btn"
            onClick={() => {
              if (!requireLogin() || !requireBackendReady()) return
              joinChannelModal.open()
            }}
          >
            <Plus size={16} />
            {t('chat.joinChannel')}
          </button>

          <SidebarAccount />
        </>
      )}
      headerTitle={chatHeaderTitle}
      sidebarToggleReplacement={
        isInviteUser ? (
          <span className="sidebar-toggle-static-logo" aria-hidden="true">
            {inviteLogo ? (
              <img
                className="sidebar-toggle-static-logo-img"
                src={inviteLogo}
                alt=""
                onError={() => setHasInviteLogoError(true)}
              />
            ) : (
              <LogoIcon size={18} />
            )}
          </span>
        ) : undefined
      }
      headerRight={
        <div className="header-right-actions">
          <button
            className="btn btn-icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={t('common.theme.toggle')}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {activeChannel && (
            <button
              className="btn btn-icon"
              onClick={() => setShowChannelDetail(true)}
              title={t('chat.channelSettings')}
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      }
    >
      {activeChannel ? (
        <>
          <div className="chat-messages">
            {channelMessages.length === 0 ? (
              <div className="ui-empty-state chat-messages-empty">
                <div className="ui-empty-icon empty-icon">
                  <MessageSquare size={28} />
                </div>
                <p>{t('chat.empty.noMessages')}</p>
              </div>
            ) : (
              channelMessages.map(msg => {
                const isSelf =
                  msg.author?.toLowerCase() ===
                  userIdentity?.address.toLowerCase()

                return (
                  <ChatMessageItem
                    key={msg.id || `${msg.author}-${msg.timestamp}`}
                    variant={isSelf ? 'self' : 'other'}
                    pending={msg.pending}
                    avatarSrc={generateAvatar(
                      msg.author,
                      msg.avatar || (isSelf ? userIdentity.avatar : undefined)
                    )}
                    author={formatDisplayName(msg.authorName, msg.author)}
                    time={formatTime(msg.timestamp)}
                  >
                    {renderMessageBubble(msg)}
                  </ChatMessageItem>
                )
              })
            )}
            <div ref={channelMessagesEndRef} />
          </div>

          <ChatComposer
            message={channelInput}
            placeholder={
              userIdentity
                ? t('chat.composer.placeholder')
                : t('chat.composer.signInPlaceholder')
            }
            disabled={!userIdentity}
            isPublishingAttachment={isPublishingAttachment}
            attachmentInputRef={attachmentInputRef}
            onMessageChange={setChannelInput}
            onSend={handleSendChannelMessage}
            onSelectAttachmentFiles={files => {
              void handleSelectAttachmentFiles(files)
            }}
          />
        </>
      ) : isRestoringInviteChannel ? (
        <div className="ui-empty-state chat-welcome">
          <div className="ui-empty-icon ui-empty-icon-lg welcome-icon">
            <Loader size={36} className="ui-spinner" />
          </div>
          <h2 className="ui-empty-title">{t('chat.restoring.title')}</h2>
          <p className="ui-empty-desc">{t('chat.restoring.desc')}</p>
        </div>
      ) : (
        <>
          <div className="ui-empty-state chat-welcome">
            <div className="ui-empty-icon ui-empty-icon-lg welcome-icon">
              <MessageSquare size={36} />
            </div>
            <h2 className="ui-empty-title">{t('chat.select.title')}</h2>
            <p className="ui-empty-desc">
              {t('chat.select.desc')}
            </p>
            <OpenSidebarButton label={t('chat.openChannelList')} />
          </div>
        </>
      )}

      {showJoinChannel && (
        <InputModal
          title={t('chat.joinChannel')}
          placeholder={t('chat.join.placeholder')}
          confirmText={t('chat.join.confirm')}
          validate={getChannelNameValidationError}
          onConfirm={handleJoinChannel}
          onClose={() => joinChannelModal.close()}
          isLoading={isJoiningChannel}
          loadingText={t('chat.join.joining')}
        />
      )}

      {channelToRename && (
        <InputModal
          title={t('chat.renameChannel')}
          placeholder={t('chat.remark.placeholder')}
          defaultValue={channelToRename.remark || ''}
          confirmText={t('chat.remark.save')}
          onConfirm={handleRenameChannel}
          onClose={() => {
            if (isRenamingChannel) return
            setChannelToRename(null)
          }}
          isLoading={isRenamingChannel}
          loadingText={t('chat.remark.saving')}
          allowEmpty
          validate={value =>
            value.length > 50 ? t('chat.remark.tooLong') : ''
          }
        />
      )}

      {showLeaveChannelConfirm && channelToLeave && (
        <ConfirmModal
          title={t('chat.leaveChannel')}
          message={t('chat.leaveConfirm', {
            channel: getChannelTitle(channelToLeave),
          })}
          confirmText={
            isLeavingChannel ? t('chat.leaving') : t('chat.leaveChannel')
          }
          onConfirm={() =>
            handleLeaveChannel(getChannelKey(channelToLeave), undefined)
          }
          danger
          onClose={() => {
            leaveChannelModal.close()
            setChannelToLeave(null)
          }}
        />
      )}

      {failedAttachment && (
        <ModalOverlay onClose={() => setFailedAttachment(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('chat.attachment.noSeedsTitle')}</h3>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setFailedAttachment(null)}
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              {attachmentDownloadStatus[failedAttachment.cid]?.message ||
                t('chat.attachment.noSeedsFallback')}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFailedAttachment(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleRetryAttachmentCheck(failedAttachment)}
                disabled={
                  attachmentDownloadStatus[failedAttachment.cid]?.status ===
                  'checking'
                }
              >
                {attachmentDownloadStatus[failedAttachment.cid]?.status ===
                'checking'
                  ? t('app.checking')
                  : t('chat.attachment.retryCheck')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {previewItem && (
        <FilePreviewOverlay
          item={previewItem}
          isBackendReady={isBackendReady}
          getFileDownloadUrl={fileApi.getFileDownloadUrl}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {showChannelDetail && activeChannel && (
        <div
          className="channel-detail-overlay"
          onClick={() => setShowChannelDetail(false)}
        >
          <div
            className="channel-detail-drawer"
            onClick={e => e.stopPropagation()}
          >
            <div className="channel-detail-header">
              <h3>{t('chat.details.title')}</h3>
              <button
                className="btn btn-icon"
                onClick={() => setShowChannelDetail(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="channel-detail-body">
              <div className="channel-detail-section channel-members-section">
                <div className="channel-detail-label">
                  <span>
                    {t('chat.details.members', {
                      count: channelMembers.length,
                    })}
                  </span>
                </div>
                {renderChannelMembers()}
              </div>

              {!isInviteUser && (
                <div className="channel-detail-section">
                  <label className="setting-switch">
                    <span>{t('chat.details.showAddressSuffix')}</span>
                    <input
                      type="checkbox"
                      checked={showAddressSuffix}
                      onChange={e => setShowAddressSuffix(e.target.checked)}
                    />
                  </label>
                </div>
              )}

              {!isInviteUser && (
                <div className="channel-detail-section">
                  <div className="channel-detail-label">
                    <Hash size={14} />
                    <span>{t('chat.details.channelId')}</span>
                  </div>
                  <div
                    className="ui-meta-box channel-detail-value channel-detail-mono"
                    translate="no"
                  >
                    {getChannelId(activeChannel)}
                  </div>
                </div>
              )}

              <div className="channel-detail-section">
                <div className="channel-detail-label">
                  <Edit2 size={14} />
                  <span>{t('chat.remark.placeholder')}</span>
                </div>
                <input
                  type="text"
                  className="input input-compact"
                  placeholder={t('chat.remark.placeholder')}
                  value={remarkInput}
                  onChange={e => setRemarkInput(e.target.value)}
                  onFocus={() => setRemarkInput(activeChannel.remark || '')}
                  onBlur={() => handleSetRemark()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    }
                  }}
                  maxLength={50}
                />
              </div>

              <div className="channel-detail-section">
                <div className="channel-detail-label">
                  <Calendar size={14} />
                  <span>{t('chat.channel.createdAt')}</span>
                </div>
                <div className="ui-meta-box channel-detail-value">
                  {activeChannel.createdAt
                    ? formatDate(activeChannel.createdAt)
                    : '-'}
                </div>
              </div>
            </div>

            {!isInviteUser && (
              <div className="channel-detail-footer">
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => {
                    setShowChannelDetail(false)
                    setChannelToLeave(activeChannel)
                    leaveChannelModal.open()
                  }}
                >
                  {t('chat.leaveChannel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default ChatPage
