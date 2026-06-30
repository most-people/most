import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageSquare,
  Plus,
  X,
  Edit2,
  ExternalLink,
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
import { AppTop } from '~/components/AppTop'
import { LogoIcon } from '~/components/icons/LogoIcon'
import {
  api,
  getApiErrorMessage,
} from '~server/src/utils/api'
import { generateAvatar } from '~server/src/utils/avatar.js'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useDisclosure } from '~/hooks'
import { useChannelMessages } from '~/hooks/useChannelMessages'
import {
  channelApi,
  type Channel,
  type ChannelAttachment,
  type ChannelMessage,
  type ChannelPresence,
} from '~/lib/channelApi'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'
import { useI18n } from '~/lib/i18n'
import { getUserChannelProfile } from '~/lib/userProfile'
import {
  createChatNoteDraft,
  getChatNoteDraftHref,
} from '~/lib/chatNoteDraft'
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
const CHANNEL_HISTORY_SYNC_DEBOUNCE_MS = 800

function getChannelKey(channel?: Pick<Channel, 'channelKey' | 'name'> | null) {
  return channel?.channelKey || channel?.name || ''
}

function getChannelId(channel?: Pick<Channel, 'channelId' | 'name'> | null) {
  return channel?.channelId || channel?.name || ''
}

function getObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function getSocketEventChannelKeys(data: unknown) {
  const record = getObjectRecord(data)
  const keys = new Set<string>()
  const addKey = (value: unknown) => {
    const key = String(value || '').trim()
    if (key) keys.add(key)
  }

  addKey(record.channelKey)
  addKey(record.channel)
  if (Array.isArray(record.channels)) {
    record.channels.forEach(channel => {
      const channelRecord = getObjectRecord(channel)
      addKey(channelRecord.channelKey)
      addKey(channelRecord.channel)
      addKey(channelRecord.name)
    })
  }

  return [...keys]
}

function getChannelTitle(channel?: Pick<Channel, 'remark' | 'channelId' | 'name'> | null) {
  return channel?.remark || getChannelId(channel)
}

function getRequestedChannelNameFromLocation() {
  if (typeof window === 'undefined') return ''
  return (
    new URLSearchParams(window.location.search).get('channel') || ''
  ).trim()
}

function getNoteDraftTimeLabel(timestamp?: number) {
  const date = new Date(timestamp || Date.now())
  if (Number.isNaN(date.getTime())) return String(Date.now())
  return date.toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')
}

function escapeMarkdownLinkLabel(label: string) {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

function formatMarkdownLink(label: string, href: string) {
  return `[${escapeMarkdownLinkLabel(label)}](<${href.replace(/>/g, '%3E')}>)`
}

function formatMarkdownQuote(content: string) {
  const lines = String(content || '').trim().split(/\r?\n/)
  return lines.length > 0 ? lines.map(line => `> ${line}`).join('\n') : '> '
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

function normalizeMemberAddress(address?: string) {
  return String(address || '').trim().toLowerCase()
}

type AttachmentDownloadState = {
  status: 'checking' | 'ready' | 'downloading' | 'available' | 'error'
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
  const hasBackend = useAppStore(s => s.hasBackend)
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [requestedChannelName, setRequestedChannelName] = useState('')
  const [hasLoadedChannels, setHasLoadedChannels] = useState(false)
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
  const [showAddressSuffix, setShowAddressSuffix] = useState(false)
  const [hasInviteLogoError, setHasInviteLogoError] = useState(false)
  const [hasInviteFallbackLogoError, setHasInviteFallbackLogoError] =
    useState(false)
  const [channelLastReadAt, setChannelLastReadAt] =
    useState<ChannelLastReadMap>({})
  const [channelPresence, setChannelPresence] = useState<ChannelPresence[]>([])
  const isInviteUser = userIdentity?.theme === 'sparkbit'
  const inviteTicketUrl =
    isInviteUser && userIdentity?.data ? userIdentity.data : ''
  const inviteBaseLogo = isInviteUser ? userIdentity?.logo || '' : ''
  const inviteDarkLogo =
    isInviteUser && isDarkMode ? userIdentity?.logo_dark || '' : ''
  const invitePreferredLogo = inviteDarkLogo || inviteBaseLogo
  const inviteFallbackLogo =
    inviteDarkLogo && inviteBaseLogo && inviteDarkLogo !== inviteBaseLogo
      ? inviteBaseLogo
      : ''
  const inviteLogo =
    invitePreferredLogo && !hasInviteLogoError
      ? invitePreferredLogo
      : inviteFallbackLogo && !hasInviteFallbackLogoError
        ? inviteFallbackLogo
        : ''

  const channelMessagesEndRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const activeChannelNameRef = useRef('')
  const autoJoinChannelAttemptsRef = useRef(new Set<string>())
  const autoLoginPromptedChannelsRef = useRef(new Set<string>())
  const notificationAudioContextRef = useRef<AudioContext | null>(null)
  const notificationAudioUnlockedRef = useRef(false)
  const lastNotificationSoundAtRef = useRef(0)
  const syncMessagesRef = useRef<
    (name?: string, options?: { replace?: boolean }) => Promise<ChannelMessage[]>
  >(async () => [])
  const channelHistorySyncTimersRef = useRef(new Map<string, number>())
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

  const refreshChannelPresence = useCallback(
    async (channel = activeChannel) => {
      const channelKey = getChannelKey(channel)
      if (!channelKey || !isBackendReady) {
        setChannelPresence([])
        return
      }

      try {
        const presence = await channelApi.getChannelPresence(channelKey)
        if (activeChannelNameRef.current !== channelKey) return
        setChannelPresence(presence)
      } catch (err) {
        console.warn(
          '[Chat] Failed to fetch channel presence:',
          err instanceof Error ? err.message : err
        )
      }
    },
    [activeChannel, isBackendReady]
  )

  const scheduleChannelHistorySync = useCallback(
    (channelKey = '') => {
      const activeChannelKey = activeChannelNameRef.current
      if (!channelKey || channelKey !== activeChannelKey || !isBackendReady) {
        return
      }

      const timers = channelHistorySyncTimersRef.current
      const existingTimer = timers.get(channelKey)
      if (existingTimer) {
        window.clearTimeout(existingTimer)
      }

      const timer = window.setTimeout(() => {
        timers.delete(channelKey)
        void syncMessagesRef.current(channelKey)
      }, CHANNEL_HISTORY_SYNC_DEBOUNCE_MS)
      timers.set(channelKey, timer)
    },
    [isBackendReady]
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
      case 'channel:sync:available': {
        const channelKeys = getSocketEventChannelKeys(data)
        const activeChannelKey = activeChannelNameRef.current
        void refreshChannels()
        if (channelKeys.includes(activeChannelKey)) {
          scheduleChannelHistorySync(activeChannelKey)
          if (activeChannel) {
            void refreshChannelPresence(activeChannel)
          }
        }
        break
      }

      case 'channel:presence': {
        const channelKey = data?.channelKey || data?.channel
        if (
          activeChannel &&
          (!channelKey || channelKey === getChannelKey(activeChannel))
        ) {
          void refreshChannelPresence(activeChannel)
        }
        break
      }

      case 'channel:joined':
      case 'channel:left':
        void refreshChannels()
        break

      case 'user:metadata:updated':
        if (data?.scope === 'channels') {
          void refreshChannels()
        }
        break

      case 'download:success': {
        const attachment = pendingAttachmentPreviewsRef.current.get(data.taskId)
        if (attachment) {
          pendingAttachmentPreviewsRef.current.delete(data.taskId)
          activeAttachmentDownloadsRef.current.delete(attachment.cid)
          setAttachmentDownloadStatus(prev => ({
            ...prev,
            [attachment.cid]: {
              status: 'available',
              message: t('chat.attachment.previewAvailable'),
            },
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
  const presenceProfile = useMemo(() => {
    if (!userIdentity) return {}
    return {
      ...getUserChannelProfile(userIdentity),
      profileUpdatedAt: userIdentity.profileUpdatedAt,
    }
  }, [
    userIdentity?.avatar,
    userIdentity?.displayName,
    userIdentity?.profileUpdatedAt,
    userIdentity?.username,
  ])

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
    onReconnect: () => {
      refreshChannels()
      if (activeChannel) {
        void refreshChannelPresence(activeChannel)
      }
    },
    presenceEnabled: Boolean(activeChannel && userIdentity),
    presenceProfile,
  })

  useEffect(() => {
    syncMessagesRef.current = syncMessages
  }, [syncMessages])

  useEffect(() => {
    const timers = channelHistorySyncTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const channelMembers = useMemo(() => {
    const membersByAuthor = new Map<
      string,
      {
        address: string
        displayName: string
        avatar?: string
        firstSeenAt: number
        lastSeenAt: number
        index: number
      }
    >()

    channelMessages.forEach((message, index) => {
      const address = String(message.author || '').trim()
      if (!address) return
      const key = address.toLowerCase()
      const timestamp = Number(message.timestamp) || 0
      const displayName = String(message.authorName || '').trim()
      const avatar = String(message.avatar || '').trim()
      const existing = membersByAuthor.get(key)

      if (!existing) {
        membersByAuthor.set(key, {
          address,
          displayName,
          ...(avatar ? { avatar } : {}),
          firstSeenAt: timestamp,
          lastSeenAt: timestamp,
          index,
        })
        return
      }

      if (timestamp >= existing.lastSeenAt) {
        existing.lastSeenAt = timestamp
        if (displayName) existing.displayName = displayName
        if (avatar) existing.avatar = avatar
      }
    })

    return [...membersByAuthor.values()].sort((a, b) => {
      const timeDiff = a.firstSeenAt - b.firstSeenAt
      return timeDiff || a.index - b.index
    })
  }, [channelMessages])

  const messageProfileByAddress = useMemo(() => {
    return new Map(
      channelMembers.map(member => [
        normalizeMemberAddress(member.address),
        member,
      ])
    )
  }, [channelMembers])

  const presenceByAddress = useMemo(() => {
    const map = new Map<string, ChannelPresence>()
    channelPresence.forEach(presence => {
      const address = normalizeMemberAddress(presence.address)
      if (!address || !presence.online) return
      map.set(address, presence)
    })
    return map
  }, [channelPresence])

  const displayedChannelMembers = useMemo(() => {
    const membersByAddress = new Map(messageProfileByAddress)
    channelPresence.forEach((presence, index) => {
      const address = normalizeMemberAddress(presence.address)
      if (!address || membersByAddress.has(address)) return
      membersByAddress.set(address, {
        address: presence.address,
        displayName: presence.displayName || '',
        ...(presence.avatar ? { avatar: presence.avatar } : {}),
        firstSeenAt: presence.lastSeen || Date.now(),
        lastSeenAt: presence.lastSeen || Date.now(),
        index: channelMembers.length + index,
      })
    })
    return [...membersByAddress.values()]
  }, [channelMembers, channelPresence, messageProfileByAddress])

  const onlineMemberAddressSet = useMemo(() => {
    return new Set(presenceByAddress.keys())
  }, [presenceByAddress])

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
      setRequestedChannelName(getRequestedChannelNameFromLocation())
    }

    updateRequestedChannelName()
    window.addEventListener('popstate', updateRequestedChannelName)
    return () =>
      window.removeEventListener('popstate', updateRequestedChannelName)
  }, [])

  useEffect(() => {
    if (!userIdentity) return
    setRequestedChannelName(getRequestedChannelNameFromLocation())
  }, [userIdentity?.address])

  useEffect(() => {
    setHasInviteLogoError(false)
    setHasInviteFallbackLogoError(false)
  }, [invitePreferredLogo, inviteFallbackLogo])

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
      setHasLoadedChannels(false)
      refreshChannels()
    } else {
      setHasLoadedChannels(false)
    }
  }, [hasBackend, isBackendReady, userIdentity?.address])

  useEffect(() => {
    if (activeChannel) {
      if (isBackendReady) {
        const activeChannelKey = getChannelKey(activeChannel)
        setChannelPresence([])
        void syncMessages(activeChannelKey, { replace: true })
        void refreshChannelPresence(activeChannel)
      }
    } else {
      setChannelPresence([])
    }
  }, [activeChannel, isBackendReady, refreshChannelPresence, syncMessages])

  useEffect(() => {
    if (!requestedChannelName) return

    if (!userIdentity) {
      if (!autoLoginPromptedChannelsRef.current.has(requestedChannelName)) {
        autoLoginPromptedChannelsRef.current.add(requestedChannelName)
        openLoginModal()
      }
      return
    }

    if (!isBackendReady || !hasLoadedChannels) return

    const found =
      channels.find(c => getChannelKey(c) === requestedChannelName) ||
      channels.find(c => getChannelId(c) === requestedChannelName)
    if (
      found &&
      (!activeChannel || getChannelKey(activeChannel) !== getChannelKey(found))
    ) {
      handleOpenChannel(found)
      return
    }

    if (
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
      return
    }

    if (found) return

    const attemptKey = `${userIdentity.address}:${requestedChannelName}`
    if (autoJoinChannelAttemptsRef.current.has(attemptKey)) return
    if (isJoiningChannel) return

    const validationError = getChannelNameValidationError(requestedChannelName)
    autoJoinChannelAttemptsRef.current.add(attemptKey)
    if (validationError) {
      addToast(validationError, 'error')
      return
    }

    void handleJoinChannel(requestedChannelName)
  }, [
    channels,
    activeChannel,
    requestedChannelName,
    hasLoadedChannels,
    isBackendReady,
    isJoiningChannel,
    userIdentity?.address,
  ])

  useEffect(() => {
    if (userIdentity) return
    setChannels([])
    setHasLoadedChannels(false)
    setActiveChannel(null)
    setRequestedChannelName(getRequestedChannelNameFromLocation())
    setChannelToRename(null)
    clearChannelMessages()
    setChannelInput('')
    setMyPeerId('')
    setShowChannelDetail(false)
    setPreviewItem(null)
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
    if (!isBackendReady) {
      setHasLoadedChannels(false)
      return
    }
    try {
      const result = await channelApi.getChannels()
      setChannels(result)
      setHasLoadedChannels(true)
    } catch (err) {
      setChannels([])
      setHasLoadedChannels(false)
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
          status: checkResult.alreadyExists ? 'available' : 'ready',
          message: checkResult.alreadyExists
            ? t('chat.attachment.localAvailable')
            : t('chat.attachment.downloadAvailable'),
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
      [attachment.cid]: {
        status: 'downloading',
        message: t('chat.attachment.downloading'),
      },
    }))
    try {
      const result = await fileApi.downloadFile(attachment.link)
      if (result.alreadyExists || result.fileName) {
        activeAttachmentDownloadsRef.current.delete(attachment.cid)
        setAttachmentDownloadStatus(prev => ({
          ...prev,
          [attachment.cid]: {
            status: 'available',
            message: t('chat.attachment.previewAvailable'),
          },
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
    if (
      currentState?.status === 'checking' ||
      currentState?.status === 'downloading'
    ) {
      return
    }

    if (currentState?.status === 'error') {
      setFailedAttachment(attachment)
      return
    }

    if (
      currentState?.status === 'ready' ||
      currentState?.status === 'available'
    ) {
      await startAttachmentDownload(attachment)
      return
    }

    if (!currentState) {
      const ok = await checkAttachmentAvailability(attachment)
      if (ok) {
        await startAttachmentDownload(attachment)
      }
      return
    }
  }

  function getMessageDisplayAuthor(msg: ChannelMessage) {
    const address = normalizeMemberAddress(msg.author)
    const presence = presenceByAddress.get(address)
    const messageProfile = messageProfileByAddress.get(address)
    const authorName =
      presence?.displayName || messageProfile?.displayName || msg.authorName
    return formatDisplayName(authorName, msg.author)
  }

  function isSaveableChannelMessage(msg: ChannelMessage) {
    return (
      !msg.pending &&
      (Boolean(msg.attachment) || Boolean(msg.content.trim()))
    )
  }

  function appendChatMessageMarkdown(
    lines: string[],
    msg: ChannelMessage
  ) {
    const author = getMessageDisplayAuthor(msg)
    const timestamp = `${formatDate(msg.timestamp)} ${formatTime(msg.timestamp)}`
    const content = msg.content.trim()

    lines.push(`## ${timestamp} ${author}`, '')

    if (content && (!msg.attachment || content !== msg.attachment.link)) {
      lines.push(formatMarkdownQuote(content), '')
    }

    if (msg.attachment) {
      lines.push(
        `**${t('chat.noteDraft.attachment')}**`,
        '',
        `- ${t('chat.noteDraft.file')}: ${formatMarkdownLink(
          getAttachmentBaseFileName(msg.attachment.fileName),
          msg.attachment.link
        )}`,
        `- CID: \`${msg.attachment.cid}\``,
        ''
      )
    }
  }

  function getChatHistoryNoteDraftContent(messages: ChannelMessage[]) {
    const roomTitle = activeChannel ? getChannelTitle(activeChannel) : ''
    const exportedAt = `${formatDate(Date.now())} ${formatTime(Date.now())}`
    const lines = [
      `# ${t('chat.noteDraft.heading')}`,
      '',
      `- ${t('chat.noteDraft.room')}: ${roomTitle}`,
      `- ${t('chat.noteDraft.exportedAt')}: ${exportedAt}`,
      `- ${t('chat.noteDraft.messageCount')}: ${messages.length}`,
      '',
    ]

    messages.forEach(msg => appendChatMessageMarkdown(lines, msg))
    return `${lines.join('\n').trimEnd()}\n`
  }

  function handleSaveChannelToNote() {
    const messages = channelMessages.filter(isSaveableChannelMessage)

    if (messages.length === 0) {
      addToast(t('chat.noteDraft.empty'), 'warning')
      return
    }

    const roomTitle = activeChannel
      ? getChannelTitle(activeChannel)
      : t('chat.title')
    const title = t('chat.noteDraft.historyTitle', {
      room: roomTitle,
      time: getNoteDraftTimeLabel(),
    })
    const draft = createChatNoteDraft({
      title,
      content: getChatHistoryNoteDraftContent(messages),
    })

    if (!draft) {
      addToast(t('chat.noteDraft.saveFailed'), 'error')
      return
    }

    setShowChannelDetail(false)
    window.location.assign(getChatNoteDraftHref(draft.id))
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
          message={downloadState?.message}
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
        members={displayedChannelMembers.map(member => {
          const presence = presenceByAddress.get(
            normalizeMemberAddress(member.address)
          )
          const displayName = presence?.displayName || member.displayName
          const avatar = presence?.avatar || member.avatar
          return {
            id: member.address,
            name: formatDisplayName(displayName, member.address),
            avatarSrc: generateAvatar(member.address, avatar),
            online: onlineMemberAddressSet.has(
              normalizeMemberAddress(member.address)
            ),
          }
        })}
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
      hideAccountMenu={isInviteUser}
      sidebar={({ closeSidebar }) => (
        <>
          <AppTop onNavigate={closeSidebar} />

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
                onError={() => {
                  if (inviteLogo === inviteFallbackLogo) {
                    setHasInviteFallbackLogoError(true)
                    return
                  }
                  setHasInviteLogoError(true)
                }}
              />
            ) : (
              <LogoIcon size={18} />
            )}
          </span>
        ) : undefined
      }
      headerRight={
        <div className="header-right-actions">
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
                const presence = presenceByAddress.get(
                  normalizeMemberAddress(msg.author)
                )
                const messageProfile = messageProfileByAddress.get(
                  normalizeMemberAddress(msg.author)
                )
                const isOnline = onlineMemberAddressSet.has(
                  normalizeMemberAddress(msg.author)
                )
                const avatar =
                  presence?.avatar ||
                  messageProfile?.avatar ||
                  msg.avatar ||
                  (isSelf ? userIdentity.avatar : undefined)
                const displayAuthor = getMessageDisplayAuthor(msg)

                return (
                  <ChatMessageItem
                    key={msg.id || `${msg.author}-${msg.timestamp}`}
                    variant={isSelf ? 'self' : 'other'}
                    pending={msg.pending}
                    isOnline={isOnline}
                    avatarSrc={generateAvatar(msg.author, avatar)}
                    author={displayAuthor}
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
                      count: displayedChannelMembers.length,
                    })}
                  </span>
                </div>
                {renderChannelMembers()}
              </div>

              {inviteTicketUrl && (
                <div className="channel-detail-section">
                  <a
                    className="btn btn-primary btn-block"
                    href={inviteTicketUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                    {t('chat.ticket.create')}
                  </a>
                </div>
              )}

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

              {!isInviteUser && (
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
              )}

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

              {!isInviteUser && (
                <div className="channel-detail-section">
                  <div className="channel-detail-label">
                    <span>{t('chat.noteDraft.settingsTitle')}</span>
                  </div>
                  <p className="channel-detail-hint">
                    {t('chat.noteDraft.saveAllDesc')}
                  </p>
                  <button
                    className="btn btn-secondary btn-block"
                    onClick={handleSaveChannelToNote}
                  >
                    {t('chat.noteDraft.saveAll')}
                  </button>
                </div>
              )}
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
