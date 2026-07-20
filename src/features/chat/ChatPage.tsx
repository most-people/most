import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  MessagesSquare,
  PhoneCall,
  Plus,
  X,
  Edit2,
  ExternalLink,
  Calendar,
  Hash,
  Settings,
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
  ChatSystemMessageItem,
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
  getApiRequestHeaders,
} from '~server/src/utils/api'
import { buildMostLink } from '~server/src/core/mostLink.js'
import { generateAvatar } from '~server/src/utils/avatar.js'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useDisclosure } from '~/hooks'
import { useChannelMessages } from '~/hooks/useChannelMessages'
import {
  channelApi,
  type Channel,
  type ChannelAttachment,
  type ChannelMemberProfile as PersistedChannelMemberProfile,
  type ChannelMention,
  type ChannelMessage,
  type ChannelPresence,
} from '~/lib/channelApi'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'
import { useI18n } from '~/lib/i18n'
import {
  getUserChannelProfile,
  getUserPresenceProfile,
} from '~/lib/userProfile'
import { selectLocalizedTag, type MemberTag } from '~/lib/localizedTag'
import { isChannelMemberJoinedSystemMessage } from '~/lib/channelMessages.js'
import { useGlobalVoiceRoom } from '~/features/chat/GlobalVoiceRoom'
import { ChatRestoringIndicator } from '~/features/chat/ChatRestoringIndicator'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import { shortAddress } from '~/lib/format'
import { saveFileToLocal } from '~/lib/saveLocalFile'
import {
  applyHistoricalChannelMentionUnreadState,
  applyIncomingChannelMentionUnreadState,
  applyIncomingChannelMessageReadState,
  clearChannelMentionUnreadInMap,
  getChannelActivityTime,
  getChatReadStorageKey,
  hasUnreadChannelMention,
  hasUnreadChannelMessage,
  initializeChannelLastReadAt,
  markChannelReadInMap,
  readStoredChannelLastReadAt,
  writeStoredChannelLastReadAt,
} from '~/lib/chatUnread.js'
import {
  completeMentionDraftFromTargets,
  finalizeMentionDraftForSend,
  getMentionTrigger,
  insertMentionIntoDraft,
  messageMentionsAddress,
  updateMentionDraft,
} from '~/lib/chatMentions.js'
import {
  fileApi,
  getPublishFileErrorMessage,
  getPublishFileLimitViolation,
} from '~/lib/fileApi'

const CHANNEL_NAME_MIN_LENGTH = 3
const CHANNEL_NAME_MAX_LENGTH = 30
const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/
const ATTACHMENT_CHECK_TIMEOUT_MS = 10000
const ATTACHMENT_CHECK_REQUEST_TIMEOUT_MS = ATTACHMENT_CHECK_TIMEOUT_MS + 2000
const CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS = 1200
const CHANNEL_HISTORY_SYNC_DEBOUNCE_MS = 800
const CHANNEL_MENTION_UNREAD_SCAN_PAGE_SIZE = 100

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

function getChannelTitle(
  channel?: Pick<Channel, 'remark' | 'channelId' | 'name'> | null
) {
  return channel?.remark || getChannelId(channel)
}

function getRequestedChannelNameFromLocation() {
  if (typeof window === 'undefined') return ''
  return (
    new URLSearchParams(window.location.search).get('channel') || ''
  ).trim()
}

const CHAT_FILE_ROOT = 'chat-file'

function getAttachmentKind(file: File, fileName: string): FileSubtype {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('text/')) return 'text'
  return getFileSubtype(fileName)
}

function hasAddressSuffix(name?: string) {
  return /#[a-fA-F0-9]{4}$/.test(String(name || '').trim())
}

function normalizeMemberAddress(address?: string) {
  return String(address || '')
    .trim()
    .toLowerCase()
}

function getMentionCandidateBaseName(name?: string, address?: string) {
  const displayName = String(name || '')
    .trim()
    .replace(/#[a-fA-F0-9]{4}$/, '')
  return displayName || shortAddress(address) || 'Unknown'
}

type ChannelMentionUnreadPreview = {
  authorName: string
  content: string
  timestamp: number
}
type ChannelMentionUnreadPreviewMap = Record<
  string,
  ChannelMentionUnreadPreview
>

function formatMentionCandidateLabel({
  name,
  address,
  duplicateName = false,
}: {
  name?: string
  address?: string
  duplicateName?: boolean
}) {
  const baseName = getMentionCandidateBaseName(name, address)
  if (!duplicateName || !address || hasAddressSuffix(baseName)) {
    return baseName
  }
  return `${baseName}#${address.slice(-4).toUpperCase()}`
}

function formatChannelMentionUnreadPreview(message?: ChannelMessage | null) {
  if (!message) return null
  const content = String(message.content || '').trim()
  if (!content) return null
  const authorName = String(message.authorName || '').trim()
  return {
    authorName: authorName || shortAddress(message.author) || 'Unknown',
    content,
    timestamp: Number(message.timestamp) || Date.now(),
  }
}

function shouldShowChannelMentionUnread(
  channelKey: string,
  message: ChannelMessage | undefined,
  userAddress?: string
) {
  if (!channelKey || !message) return false
  const isSelfMessage =
    normalizeMemberAddress(message.author) ===
    normalizeMemberAddress(userAddress)
  return !isSelfMessage && messageMentionsAddress(message, userAddress)
}

function getLatestUnreadMentionMessage(
  messages: ChannelMessage[],
  readAt: number,
  userAddress?: string
) {
  return messages.reduce<ChannelMessage | null>((latest, message) => {
    const timestamp = Number(message?.timestamp)
    if (!Number.isFinite(timestamp) || timestamp <= readAt) return latest
    const isSelfMessage =
      normalizeMemberAddress(message.author) ===
      normalizeMemberAddress(userAddress)
    if (isSelfMessage || !messageMentionsAddress(message, userAddress)) {
      return latest
    }
    if (!latest || timestamp > (Number(latest.timestamp) || 0)) return message
    return latest
  }, null)
}

function formatChannelMentionPreviewText(
  preview?: ChannelMentionUnreadPreview
) {
  if (!preview) return ''
  return `${preview.authorName}: ${preview.content}`
}

function stringifyMemberTag(tag: MemberTag | undefined) {
  if (tag === null) return 'null'
  if (!tag) return 'undefined'
  return JSON.stringify(
    Object.keys(tag)
      .sort((a, b) => a.localeCompare(b))
      .map(key => [key, tag[key]])
  )
}

type AttachmentDownloadState = {
  status: 'checking' | 'ready' | 'downloading' | 'available' | 'error'
  message?: string
}

type ChannelLastReadMap = Record<string, number>
type ChannelMentionUnreadMap = Record<string, boolean>
type ComposerSelection = { start: number; end: number }
type MentionDraft = { content: string; mentions: ChannelMention[] }
type MentionTarget = { address: string; label: string }
type DisplayedChannelMemberProfile = {
  address: string
  displayName: string
  avatar?: string
  tag?: MemberTag
  hasPersistedProfile?: boolean
  profileUpdatedAt?: number
  firstSeenAt: number
  lastSeenAt: number
  index: number
}
type MentionCandidate = {
  address: string
  label: string
  tag?: string
  avatarSrc: string
  online: boolean
}
type BrowserAudioContextConstructor = typeof AudioContext

function getBrowserAudioContextConstructor():
  BrowserAudioContextConstructor | undefined {
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
  const [channelMentions, setChannelMentions] = useState<ChannelMention[]>([])
  const [composerSelection, setComposerSelection] = useState<ComposerSelection>(
    { start: 0, end: 0 }
  )
  const [isComposerComposing, setIsComposerComposing] = useState(false)
  const [dismissedMentionTriggerKey, setDismissedMentionTriggerKey] =
    useState('')
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(-1)
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
  const [isSendingChannelMessage, setIsSendingChannelMessage] = useState(false)
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
  const [channelMentionUnread, setChannelMentionUnread] =
    useState<ChannelMentionUnreadMap>({})
  const [channelMentionUnreadPreview, setChannelMentionUnreadPreview] =
    useState<ChannelMentionUnreadPreviewMap>({})
  const [channelPresence, setChannelPresence] = useState<ChannelPresence[]>([])
  const [channelMemberProfiles, setChannelMemberProfiles] = useState<
    PersistedChannelMemberProfile[]
  >([])
  const [channelMemberProfilesLoadedKey, setChannelMemberProfilesLoadedKey] =
    useState('')
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
  const channelComposerInputRef = useRef<HTMLTextAreaElement>(null)
  const activeChannelNameRef = useRef('')
  const autoJoinChannelAttemptsRef = useRef(new Set<string>())
  const autoLoginPromptedChannelsRef = useRef(new Set<string>())
  const notificationAudioContextRef = useRef<AudioContext | null>(null)
  const notificationAudioUnlockedRef = useRef(false)
  const lastNotificationSoundAtRef = useRef(0)
  const syncMessagesRef = useRef<
    (
      name?: string,
      options?: { replace?: boolean }
    ) => Promise<ChannelMessage[]>
  >(async () => [])
  const channelHistorySyncTimersRef = useRef(new Map<string, number>())
  const lastSubmittedMemberProfileKeyRef = useRef('')
  const mentionUnreadScanKeysRef = useRef(new Map<string, string>())
  const pendingAttachmentPreviewsRef = useRef(
    new Map<string, ChannelAttachment>()
  )
  const activeAttachmentDownloadsRef = useRef(new Set<string>())
  const isSendingChannelMessageRef = useRef(false)
  const isBackendReady = hasBackend === true
  const { t, compareStrings, formatDate, formatTime, locale } = useI18n()
  const voiceRoom = useGlobalVoiceRoom()

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

  useEffect(() => {
    mentionUnreadScanKeysRef.current.clear()
    setChannelMentionUnread({})
    setChannelMentionUnreadPreview({})
  }, [channelReadStorageKey])

  const markChannelRead = useCallback(
    (channelKey: string, timestamp = Date.now()) => {
      if (!channelKey) return
      setChannelMentionUnread(prev => {
        const result = clearChannelMentionUnreadInMap(prev, channelKey)
        return result.changed ? result.value : prev
      })
      setChannelMentionUnreadPreview(prev => {
        if (!prev[channelKey]) return prev
        const next = { ...prev }
        delete next[channelKey]
        return next
      })
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

  const refreshChannelMemberProfiles = useCallback(
    async (channel = activeChannel) => {
      const channelKey = getChannelKey(channel)
      if (!channelKey || !isBackendReady) {
        setChannelMemberProfiles([])
        setChannelMemberProfilesLoadedKey('')
        return
      }

      try {
        const profiles = await channelApi.getChannelMemberProfiles(channelKey)
        if (activeChannelNameRef.current !== channelKey) return
        setChannelMemberProfiles(profiles)
        setChannelMemberProfilesLoadedKey(channelKey)
      } catch (err) {
        console.warn(
          '[Chat] Failed to fetch channel member profiles:',
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
          setChannelMentionUnread(prev => {
            const result = applyIncomingChannelMentionUnreadState(prev, {
              channelName: channelKey,
              message,
              userAddress: userIdentity?.address,
            })
            return result.changed ? result.value : prev
          })
          if (
            shouldShowChannelMentionUnread(
              channelKey,
              message,
              userIdentity?.address
            )
          ) {
            const preview = formatChannelMentionUnreadPreview(message)
            if (preview) {
              setChannelMentionUnreadPreview(prev => {
                const previousPreview = prev[channelKey]
                if (
                  previousPreview &&
                  previousPreview.timestamp >= preview.timestamp
                ) {
                  return prev
                }
                return { ...prev, [channelKey]: preview }
              })
            }
          }
          setChannelLastReadAt(prev => {
            const result = applyIncomingChannelMessageReadState(prev, {
              channelName: channelKey,
              messageTime,
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
            void refreshChannelMemberProfiles(activeChannel)
          }
        }
        break
      }

      case 'channel:member-profile': {
        const channelKey = data?.channelKey || data?.channel
        if (
          activeChannel &&
          (!channelKey || channelKey === getChannelKey(activeChannel))
        ) {
          void refreshChannelMemberProfiles(activeChannel)
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
  const activeChannelKey = getChannelKey(activeChannel)
  const presenceProfile = useMemo(() => {
    if (!userIdentity) return {}
    return {
      ...getUserPresenceProfile(userIdentity),
      profileUpdatedAt: userIdentity.profileUpdatedAt,
    }
  }, [
    userIdentity?.avatar,
    userIdentity?.displayName,
    userIdentity?.profileUpdatedAt,
    userIdentity?.username,
  ])
  const activeVoiceRoomInfo = useMemo(() => {
    if (!activeChannel || !activeChannelKey) return null
    return {
      channelName: activeChannelKey,
      title: getChannelTitle(activeChannel),
    }
  }, [activeChannel, activeChannelKey])

  const {
    clearMessages: clearChannelMessages,
    messages: channelMessages,
    sendMessage: sendSharedChannelMessage,
    syncedChannelName: syncedChannelMessagesName,
    syncMessages,
  } = useChannelMessages({
    isReady: isBackendReady,
    enabled: Boolean(userIdentity),
    channelName: activeChannelKey,
    extraSubscribedChannelNames: subscribedChannelNames,
    peerId: myPeerId,
    waitForPeerId: true,
    onSyncError: err => showApiError(err, t('chat.error.messages')),
    onSocketEvent: handleChannelSocketEvent,
    onReconnect: () => {
      refreshChannels()
      if (activeChannel) {
        void refreshChannelPresence(activeChannel)
        void refreshChannelMemberProfiles(activeChannel)
      }
    },
    presenceEnabled: Boolean(activeChannel && userIdentity),
    presenceProfile,
  })

  useEffect(() => {
    syncMessagesRef.current = syncMessages
  }, [syncMessages])

  useEffect(() => {
    if (!isBackendReady || !channelReadStorageKey || !userIdentity?.address) {
      return
    }
    if (channels.length === 0) return

    const readStateReady = channels.every(channel => {
      const channelKey = getChannelKey(channel)
      return !channelKey || channelLastReadAt[channelKey] !== undefined
    })
    if (!readStateReady) return

    const scanEntries = channels
      .map(channel => {
        const channelKey = getChannelKey(channel)
        const readAt = Number(channelLastReadAt[channelKey])
        const activityTime = getChannelActivityTime(channel)
        return { channelKey, readAt, activityTime }
      })
      .filter(({ channelKey, readAt, activityTime }) => {
        if (!channelKey) {
          if (channelKey) mentionUnreadScanKeysRef.current.delete(channelKey)
          return false
        }
        if (!Number.isFinite(readAt) || activityTime <= readAt) {
          mentionUnreadScanKeysRef.current.delete(channelKey)
          return false
        }
        if (channelMentionUnread[channelKey]) return false

        const scanKey = `${userIdentity.address}:${readAt}:${activityTime}`
        if (mentionUnreadScanKeysRef.current.get(channelKey) === scanKey) {
          return false
        }
        mentionUnreadScanKeysRef.current.set(channelKey, scanKey)
        return true
      })

    if (scanEntries.length === 0) return

    let cancelled = false

    async function scanChannel({
      channelKey,
      readAt,
    }: {
      channelKey: string
      readAt: number
    }) {
      let offset = 0
      while (!cancelled) {
        const messages = await channelApi.getChannelMessages(
          channelKey,
          CHANNEL_MENTION_UNREAD_SCAN_PAGE_SIZE,
          offset
        )
        if (cancelled) return

        const pageResult = applyHistoricalChannelMentionUnreadState(
          {},
          {
            channelName: channelKey,
            messages,
            userAddress: userIdentity?.address,
            lastReadAt: readAt,
          }
        )
        if (pageResult.value[channelKey]) {
          const preview = formatChannelMentionUnreadPreview(
            getLatestUnreadMentionMessage(
              messages,
              readAt,
              userIdentity?.address
            )
          )
          setChannelMentionUnread(prev => {
            const result = applyHistoricalChannelMentionUnreadState(prev, {
              channelName: channelKey,
              messages,
              userAddress: userIdentity?.address,
              lastReadAt: readAt,
            })
            return result.changed ? result.value : prev
          })
          if (preview) {
            setChannelMentionUnreadPreview(prev => {
              const previousPreview = prev[channelKey]
              if (
                previousPreview &&
                previousPreview.timestamp >= preview.timestamp
              ) {
                return prev
              }
              return { ...prev, [channelKey]: preview }
            })
          }
          return
        }

        const oldestTimestamp = messages.reduce((oldest, message) => {
          const timestamp = Number(message?.timestamp)
          return Number.isFinite(timestamp)
            ? Math.min(oldest, timestamp)
            : oldest
        }, Number.POSITIVE_INFINITY)
        if (
          messages.length < CHANNEL_MENTION_UNREAD_SCAN_PAGE_SIZE ||
          oldestTimestamp === Number.POSITIVE_INFINITY ||
          oldestTimestamp <= readAt
        ) {
          return
        }
        offset += CHANNEL_MENTION_UNREAD_SCAN_PAGE_SIZE
      }
    }

    async function scanChannels() {
      for (const entry of scanEntries) {
        if (cancelled) return
        try {
          await scanChannel(entry)
        } catch (err) {
          mentionUnreadScanKeysRef.current.delete(entry.channelKey)
          console.warn(
            '[Chat] Failed to scan channel mention unread:',
            err instanceof Error ? err.message : err
          )
        }
      }
    }

    void scanChannels()
    return () => {
      cancelled = true
    }
  }, [
    channelLastReadAt,
    channelMentionUnread,
    channelReadStorageKey,
    channels,
    isBackendReady,
    userIdentity?.address,
  ])

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
    const membersByAuthor = new Map<string, DisplayedChannelMemberProfile>()

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
          ...(message.authorTag ? { tag: message.authorTag } : {}),
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
        if (message.authorTag) existing.tag = message.authorTag
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

  const persistedProfileByAddress = useMemo(() => {
    const map = new Map<string, PersistedChannelMemberProfile>()
    channelMemberProfiles.forEach(profile => {
      const address = normalizeMemberAddress(profile.address)
      if (!address) return
      map.set(address, profile)
    })
    return map
  }, [channelMemberProfiles])

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
    channelMemberProfiles.forEach((profile, index) => {
      const address = normalizeMemberAddress(profile.address)
      if (!address) return
      const existing = membersByAddress.get(address)
      const profileTime = Number(profile.profileUpdatedAt) || Date.now()
      membersByAddress.set(address, {
        ...(existing || {
          address: profile.address,
          firstSeenAt: profileTime,
          lastSeenAt: profileTime,
          index: channelMembers.length + index,
        }),
        address: profile.address,
        displayName: profile.displayName || existing?.displayName || '',
        ...(profile.avatar || existing?.avatar
          ? { avatar: profile.avatar || existing?.avatar }
          : {}),
        tag: profile.tag,
        hasPersistedProfile: true,
        profileUpdatedAt: Number(profile.profileUpdatedAt) || undefined,
        firstSeenAt: existing?.firstSeenAt || profileTime,
        lastSeenAt: Math.max(existing?.lastSeenAt || 0, profileTime),
        index: existing?.index ?? channelMembers.length + index,
      })
    })
    channelPresence.forEach((presence, index) => {
      const address = normalizeMemberAddress(presence.address)
      if (!address) return
      const existing = membersByAddress.get(address)
      if (existing) {
        const lastSeen = presence.lastSeen || Date.now()
        membersByAddress.set(address, {
          ...existing,
          displayName: presence.displayName || existing.displayName,
          ...(presence.avatar || existing.avatar
            ? { avatar: presence.avatar || existing.avatar }
            : {}),
          tag: existing.tag,
          hasPersistedProfile: existing.hasPersistedProfile,
          profileUpdatedAt: existing.profileUpdatedAt,
          lastSeenAt: Math.max(existing.lastSeenAt, lastSeen),
        })
        return
      }
      membersByAddress.set(address, {
        address: presence.address,
        displayName: presence.displayName || '',
        ...(presence.avatar ? { avatar: presence.avatar } : {}),
        firstSeenAt: presence.lastSeen || Date.now(),
        lastSeenAt: presence.lastSeen || Date.now(),
        index: channelMembers.length + channelMemberProfiles.length + index,
      })
    })
    return [...membersByAddress.values()].sort((a, b) => {
      const timeDiff = a.firstSeenAt - b.firstSeenAt
      return timeDiff || a.index - b.index
    })
  }, [
    channelMemberProfiles,
    channelMembers,
    channelPresence,
    messageProfileByAddress,
  ])

  const onlineMemberAddressSet = useMemo(() => {
    return new Set(presenceByAddress.keys())
  }, [presenceByAddress])
  const currentUserAddress = normalizeMemberAddress(userIdentity?.address)

  useEffect(() => {
    if (
      !isBackendReady ||
      !activeChannelKey ||
      !userIdentity?.address ||
      channelMemberProfilesLoadedKey !== activeChannelKey
    ) {
      return
    }

    const desiredProfile = getUserChannelProfile(userIdentity)
    const desiredAuthor = userIdentity.address
    const persistedProfile = persistedProfileByAddress.get(currentUserAddress)
    const shouldSyncTag = userIdentity.tag !== undefined
    const displayNameMatches =
      (persistedProfile?.displayName || '') === desiredProfile.displayName
    const avatarMatches =
      (persistedProfile?.avatar || '') === (desiredProfile.avatar || '')
    const tagMatches =
      !shouldSyncTag ||
      stringifyMemberTag(persistedProfile?.tag) ===
        stringifyMemberTag(desiredProfile.tag)

    if (persistedProfile && displayNameMatches && avatarMatches && tagMatches) {
      return
    }

    const submitKey = JSON.stringify([
      activeChannelKey,
      desiredAuthor,
      desiredProfile.displayName || '',
      desiredProfile.avatar || '',
      shouldSyncTag ? stringifyMemberTag(desiredProfile.tag) : 'tag:unchanged',
    ])
    if (lastSubmittedMemberProfileKeyRef.current === submitKey) {
      return
    }
    lastSubmittedMemberProfileKeyRef.current = submitKey

    let cancelled = false
    const profilePayload = {
      channelName: activeChannelKey,
      author: desiredAuthor,
      displayName: desiredProfile.displayName,
      avatar: desiredProfile.avatar,
      ...(shouldSyncTag ? { tag: desiredProfile.tag } : {}),
    }

    channelApi
      .updateChannelMemberProfile(profilePayload)
      .then(result => {
        if (cancelled || activeChannelNameRef.current !== activeChannelKey) {
          return
        }
        if (result.member) {
          setChannelMemberProfiles(prev => {
            const address = normalizeMemberAddress(result.member?.address)
            if (!address) return prev
            const exists = prev.some(
              item => normalizeMemberAddress(item.address) === address
            )
            return exists
              ? prev.map(item =>
                  normalizeMemberAddress(item.address) === address
                    ? (result.member as PersistedChannelMemberProfile)
                    : item
                )
              : [...prev, result.member as PersistedChannelMemberProfile]
          })
          setChannelMemberProfilesLoadedKey(activeChannelKey)
        } else {
          void refreshChannelMemberProfiles(activeChannel)
        }
      })
      .catch(err => {
        if (lastSubmittedMemberProfileKeyRef.current === submitKey) {
          lastSubmittedMemberProfileKeyRef.current = ''
        }
        console.warn(
          '[Chat] Failed to update channel member profile:',
          err instanceof Error ? err.message : err
        )
      })

    return () => {
      cancelled = true
    }
  }, [
    activeChannel,
    activeChannelKey,
    channelMemberProfilesLoadedKey,
    currentUserAddress,
    isBackendReady,
    persistedProfileByAddress,
    refreshChannelMemberProfiles,
    userIdentity?.address,
    userIdentity?.avatar,
    userIdentity?.displayName,
    userIdentity?.tag,
    userIdentity?.username,
  ])

  const allMentionTargets = useMemo<MentionTarget[]>(() => {
    const nameCounts = displayedChannelMembers.reduce((counts, member) => {
      const address = normalizeMemberAddress(member.address)
      if (!address) return counts
      const presence = presenceByAddress.get(address)
      const displayName = presence?.displayName || member.displayName
      const baseName = getMentionCandidateBaseName(displayName, member.address)
      const key = baseName.toLowerCase()
      counts.set(key, (counts.get(key) || 0) + 1)
      return counts
    }, new Map<string, number>())

    return displayedChannelMembers
      .map(member => {
        const address = normalizeMemberAddress(member.address)
        if (!address) return null
        const presence = presenceByAddress.get(address)
        const displayName = presence?.displayName || member.displayName
        const baseName = getMentionCandidateBaseName(
          displayName,
          member.address
        )
        return {
          address,
          label: formatMentionCandidateLabel({
            name: displayName,
            address: member.address,
            duplicateName: (nameCounts.get(baseName.toLowerCase()) || 0) > 1,
          }),
        }
      })
      .filter((target): target is MentionTarget => Boolean(target))
  }, [displayedChannelMembers, presenceByAddress])

  const composerMentionTargets = useMemo(
    () =>
      allMentionTargets.filter(
        target => normalizeMemberAddress(target.address) !== currentUserAddress
      ),
    [allMentionTargets, currentUserAddress]
  )

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
    setChannelMentions([])
    setComposerSelection({ start: 0, end: 0 })
    setDismissedMentionTriggerKey('')
    setMentionSelectedIndex(0)
  }, [activeChannelKey])

  useEffect(() => {
    setHasInviteLogoError(false)
    setHasInviteFallbackLogoError(false)
  }, [invitePreferredLogo, inviteFallbackLogo])

  useEffect(() => {
    activeChannelNameRef.current = getChannelKey(activeChannel)
  }, [activeChannel])

  useEffect(() => {
    voiceRoom.setPreviewRoom(
      userIdentity && activeVoiceRoomInfo ? activeVoiceRoomInfo : null
    )
    return () => {
      voiceRoom.setPreviewRoom(null)
    }
  }, [activeVoiceRoomInfo, userIdentity, voiceRoom.setPreviewRoom])

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
        setChannelMemberProfiles([])
        setChannelMemberProfilesLoadedKey('')
        void syncMessages(activeChannelKey, { replace: true })
        void refreshChannelPresence(activeChannel)
        void refreshChannelMemberProfiles(activeChannel)
      }
    } else {
      setChannelPresence([])
      setChannelMemberProfiles([])
      setChannelMemberProfilesLoadedKey('')
    }
  }, [
    activeChannel,
    isBackendReady,
    refreshChannelMemberProfiles,
    refreshChannelPresence,
    syncMessages,
  ])

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
    setChannelMentionUnread({})
    setChannelMentionUnreadPreview({})
    setChannelMemberProfiles([])
    setChannelMemberProfilesLoadedKey('')
    setChannelMentions([])
    setComposerSelection({ start: 0, end: 0 })
    setDismissedMentionTriggerKey('')
    setMentionSelectedIndex(0)
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
      setActiveChannel(prev => {
        if (!prev) return prev
        const updated = result.find(
          channel => getChannelKey(channel) === getChannelKey(prev)
        )
        return updated || prev
      })
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

  async function handleSavePreviewItem(item: {
    cid: string
    fileName: string
  }) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return

    try {
      const result = await saveFileToLocal({
        cid: item.cid,
        fileName: item.fileName,
        getFileDownloadUrl: fileApi.getFileDownloadUrl,
        getRequestHeaders: getApiRequestHeaders,
        loadFailedMessage: t('app.toast.getFileFailed'),
      })
      addToast(
        result.method === 'picker'
          ? t('app.toast.fileSaved')
          : t('app.toast.fileDownloaded'),
        'success'
      )
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast(t('app.saveFailedWithError', { error: err.message }), 'error')
      }
    }
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
    } catch {
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: {
          status: 'error',
          message: t('chat.attachment.noSeedsTitle'),
        },
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
    } catch {
      activeAttachmentDownloadsRef.current.delete(attachment.cid)
      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: {
          status: 'error',
          message: t('chat.attachment.noSeedsTitle'),
        },
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
        channelKey:
          result.channelKey || result.key || existingChannel?.channelKey,
        type: result.type || existingChannel?.type || 'public',
        createdAt: result.createdAt || existingChannel?.createdAt,
        coreKey: result.coreKey || result.key || existingChannel?.coreKey,
        localWriterCoreKey:
          result.localWriterCoreKey || existingChannel?.localWriterCoreKey,
        writerCoreKeys:
          result.writerCoreKeys || existingChannel?.writerCoreKeys,
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
    attachment?: ChannelAttachment,
    mentions: ChannelMention[] = []
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
        mentions: !attachment && mentions.length > 0 ? mentions : undefined,
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
    if (isSendingChannelMessageRef.current) return
    const finalized = finalizeMentionDraftForSend({
      content: channelInput,
      mentions: channelMentions,
    }) as MentionDraft
    const completed = completeMentionDraftFromTargets(
      finalized,
      composerMentionTargets
    ) as MentionDraft
    if (!completed.content) return
    isSendingChannelMessageRef.current = true
    setIsSendingChannelMessage(true)
    try {
      const sent = await sendChannelMessage(
        completed.content,
        undefined,
        completed.mentions
      )
      if (!sent) return
      setChannelInput('')
      setChannelMentions([])
      setComposerSelection({ start: 0, end: 0 })
      setDismissedMentionTriggerKey('')
      setMentionSelectedIndex(0)
    } finally {
      isSendingChannelMessageRef.current = false
      setIsSendingChannelMessage(false)
    }
  }

  function getChatAttachmentFileName(channelName: string, fileName: string) {
    return `${CHAT_FILE_ROOT}/${channelName}/${fileName}`
  }

  async function handleSelectAttachmentFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0 || !activeChannel) return
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (isPublishingAttachment) return

    setIsPublishingAttachment(true)
    let activePublishFileName = ''
    try {
      const publishPolicy = await fileApi.getNodePolicy().catch(() => null)
      for (const file of Array.from(files)) {
        activePublishFileName = file.name
        const limitMessage = getPublishFileLimitViolation(
          file,
          publishPolicy,
          t
        )
        if (limitMessage) {
          addToast(limitMessage, 'error')
          continue
        }

        const targetFileName = getChatAttachmentFileName(
          getChannelId(activeChannel),
          file.name
        )
        const result = await fileApi.publishFile(file, targetFileName)
        const fileName = result.fileName || targetFileName
        const link = result.link || buildMostLink(result.cid, fileName)
        const attachment: ChannelAttachment = {
          kind: getAttachmentKind(file, fileName),
          cid: result.cid,
          fileName,
          link,
          mimeType: file.type || undefined,
          size: file.size,
        }
        await sendChannelMessage(link, attachment)
      }
    } catch (err) {
      addToast(
        await getPublishFileErrorMessage(
          err,
          t('chat.error.attachmentSend'),
          t,
          activePublishFileName
        ),
        'error'
      )
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
      return <ChatTextBubble>{renderMessageTextContent(msg)}</ChatTextBubble>
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
    if (!displayName) return shortAddress(address) || 'Unknown'
    if (!showAddressSuffix) return displayName.replace(/#[a-fA-F0-9]{4}$/, '')
    if (hasAddressSuffix(displayName)) return displayName
    return address
      ? `${displayName}#${address.slice(-4).toUpperCase()}`
      : displayName
  }

  function getMessageDisplayAuthor(message: ChannelMessage) {
    const address = normalizeMemberAddress(message.author)
    const presence = presenceByAddress.get(address)
    const persistedProfile = persistedProfileByAddress.get(address)
    const messageProfile = messageProfileByAddress.get(address)
    return formatDisplayName(
      presence?.displayName ||
        persistedProfile?.displayName ||
        messageProfile?.displayName ||
        message.authorName,
      message.author
    )
  }

  function hasCurrentUserTag() {
    return userIdentity?.tag !== undefined
  }

  function getMemberDisplayTag(member?: DisplayedChannelMemberProfile | null) {
    const address = normalizeMemberAddress(member?.address)
    const persistedProfile = persistedProfileByAddress.get(address)
    if (persistedProfile) {
      return selectLocalizedTag(persistedProfile.tag, locale)
    }
    if (address && address === currentUserAddress && hasCurrentUserTag()) {
      return selectLocalizedTag(userIdentity?.tag, locale)
    }
    return selectLocalizedTag(member?.tag, locale)
  }

  function getMessageDisplayTag(message: ChannelMessage) {
    const address = normalizeMemberAddress(message.author)
    const persistedProfile = persistedProfileByAddress.get(address)
    if (persistedProfile) {
      return selectLocalizedTag(persistedProfile.tag, locale)
    }
    if (address && address === currentUserAddress && hasCurrentUserTag()) {
      return selectLocalizedTag(userIdentity?.tag, locale)
    }
    return selectLocalizedTag(message.authorTag, locale)
  }

  function handleChannelInputChange(
    value: string,
    selectionStart = value.length,
    selectionEnd = selectionStart
  ) {
    const draft = updateMentionDraft(
      { content: channelInput, mentions: channelMentions },
      value
    ) as MentionDraft
    setChannelInput(draft.content)
    setChannelMentions(draft.mentions)
    setComposerSelection({ start: selectionStart, end: selectionEnd })
    setDismissedMentionTriggerKey('')
  }

  function handleComposerSelectionChange(
    selectionStart: number,
    selectionEnd: number
  ) {
    setComposerSelection({ start: selectionStart, end: selectionEnd })
  }

  function focusComposerAt(caret: number) {
    window.requestAnimationFrame(() => {
      channelComposerInputRef.current?.focus()
      channelComposerInputRef.current?.setSelectionRange(caret, caret)
      setComposerSelection({ start: caret, end: caret })
    })
  }

  function selectMentionCandidate(index = mentionSelectedIndex) {
    if (!mentionTrigger || mentionCandidates.length === 0) return false
    if (index < 0) return false
    const candidate =
      mentionCandidates[
        Math.max(0, Math.min(index, mentionCandidates.length - 1))
      ]
    if (!candidate) return false

    const result = insertMentionIntoDraft(
      { content: channelInput, mentions: channelMentions },
      candidate,
      mentionTrigger.start,
      mentionTrigger.end
    ) as { draft: MentionDraft; caret: number }
    setChannelInput(result.draft.content)
    setChannelMentions(result.draft.mentions)
    setDismissedMentionTriggerKey('')
    setMentionSelectedIndex(-1)
    focusComposerAt(result.caret)
    return true
  }

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (!isMentionMenuOpen) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMentionSelectedIndex(index =>
        index < 0 ? 0 : (index + 1) % mentionCandidates.length
      )
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setMentionSelectedIndex(index =>
        index < 0
          ? mentionCandidates.length - 1
          : (index - 1 + mentionCandidates.length) % mentionCandidates.length
      )
      return true
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      if (mentionSelectedIndex < 0) return false
      event.preventDefault()
      return selectMentionCandidate()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setDismissedMentionTriggerKey(mentionTriggerKey)
      return true
    }

    return false
  }

  function getRenderableMentions(msg: ChannelMessage) {
    const content = String(msg.content || '')
    const result: ChannelMention[] = []

    if (Array.isArray(msg.mentions) && msg.mentions.length > 0) {
      for (const mention of [...msg.mentions].sort(
        (left, right) => left.start - right.start || left.end - right.end
      )) {
        if (mention.start < 0 || mention.end <= mention.start) continue
        if (mention.start < (result[result.length - 1]?.end || 0)) continue
        if (mention.end > content.length) continue
        if (content.slice(mention.start, mention.end) !== `@${mention.label}`) {
          continue
        }
        result.push(mention)
      }
      return result
    }

    return completeMentionDraftFromTargets(
      { content, mentions: [] },
      allMentionTargets
    ).mentions
  }

  function renderMessageTextContent(msg: ChannelMessage) {
    const content = String(msg.content || '')
    const mentions = getRenderableMentions(msg)
    if (mentions.length === 0) return content

    const parts: React.ReactNode[] = []
    const isOwnMessage =
      normalizeMemberAddress(msg.author) ===
      normalizeMemberAddress(userIdentity?.address)
    let cursor = 0
    mentions.forEach((mention, index) => {
      if (mention.start > cursor) {
        parts.push(content.slice(cursor, mention.start))
      }
      const isSelfMention =
        !isOwnMessage &&
        normalizeMemberAddress(mention.address) ===
          normalizeMemberAddress(userIdentity?.address)
      parts.push(
        <span
          className={isSelfMention ? 'chat-mention self' : 'chat-mention'}
          key={`${mention.address}-${mention.start}-${index}`}
          translate="no"
        >
          {content.slice(mention.start, mention.end)}
        </span>
      )
      cursor = mention.end
    })

    if (cursor < content.length) {
      parts.push(content.slice(cursor))
    }

    return parts
  }

  function isMessageMentioningCurrentUser(msg: ChannelMessage) {
    return messageMentionsAddress(msg, userIdentity?.address)
  }

  const mentionTrigger =
    isComposerComposing || !activeChannel
      ? null
      : getMentionTrigger(
          channelInput,
          composerSelection.start,
          composerSelection.end
        )
  const mentionTriggerKey = mentionTrigger
    ? `${activeChannelKey}:${mentionTrigger.start}:${mentionTrigger.query}`
    : ''
  const mentionQuery = String(mentionTrigger?.query || '').toLowerCase()
  const mentionCandidateNameCounts = mentionTrigger
    ? displayedChannelMembers.reduce((counts, member) => {
        const address = normalizeMemberAddress(member.address)
        if (!address || address === currentUserAddress) return counts
        const presence = presenceByAddress.get(address)
        const displayName = presence?.displayName || member.displayName
        const baseName = getMentionCandidateBaseName(
          displayName,
          member.address
        )
        const key = baseName.toLowerCase()
        counts.set(key, (counts.get(key) || 0) + 1)
        return counts
      }, new Map<string, number>())
    : new Map<string, number>()
  const mentionCandidates: MentionCandidate[] = mentionTrigger
    ? displayedChannelMembers
        .map(member => {
          const address = normalizeMemberAddress(member.address)
          const presence = presenceByAddress.get(address)
          const displayName = presence?.displayName || member.displayName
          const baseName = getMentionCandidateBaseName(
            displayName,
            member.address
          )
          const tag = getMemberDisplayTag(member)
          return {
            address,
            label: formatMentionCandidateLabel({
              name: displayName,
              address: member.address,
              duplicateName:
                (mentionCandidateNameCounts.get(baseName.toLowerCase()) || 0) >
                1,
            }),
            tag,
            avatarSrc: generateAvatar(
              member.address,
              presence?.avatar || member.avatar
            ),
            online: onlineMemberAddressSet.has(address),
          }
        })
        .filter(candidate => {
          if (!candidate.address || candidate.address === currentUserAddress) {
            return false
          }
          if (!mentionQuery) return true
          return [candidate.label, candidate.tag || '', candidate.address].some(
            value => value.toLowerCase().includes(mentionQuery)
          )
        })
        .slice(0, 8)
    : []
  const isMentionMenuOpen = Boolean(
    mentionTrigger &&
    mentionCandidates.length > 0 &&
    mentionTriggerKey !== dismissedMentionTriggerKey
  )

  useEffect(() => {
    setMentionSelectedIndex(-1)
  }, [mentionTriggerKey, mentionCandidates.length])

  const mentionMenu = isMentionMenuOpen ? (
    <div
      className="chat-mention-menu ui-glass-surface ui-glass-surface-elevated"
      role="listbox"
      aria-label={t('chat.mentionSuggestions')}
    >
      <span className="chat-mention-menu-title">
        {t('chat.mentionSuggestions')}
      </span>
      <div className="chat-mention-menu-list" role="presentation">
        {mentionCandidates.map((candidate, index) => (
          <button
            type="button"
            className={[
              'chat-mention-option',
              index === mentionSelectedIndex ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={candidate.address}
            role="option"
            aria-selected={index === mentionSelectedIndex}
            onMouseDown={event => {
              event.preventDefault()
              selectMentionCandidate(index)
            }}
          >
            <img
              className="chat-mention-option-avatar"
              src={candidate.avatarSrc}
              alt=""
            />
            <span className="chat-mention-option-body">
              <span className="chat-mention-option-name" translate="no">
                {candidate.label}
              </span>
              {candidate.tag && (
                <span className="chat-mention-option-meta" translate="no">
                  {candidate.tag}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null

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
            tag: getMemberDisplayTag(member),
            avatarSrc: generateAvatar(member.address, avatar),
            online: onlineMemberAddressSet.has(
              normalizeMemberAddress(member.address)
            ),
          }
        })}
      />
    )
  }

  const isLoadingActiveChannelMessages = Boolean(
    activeChannelKey && activeChannelKey !== syncedChannelMessagesName
  )
  const shouldShowChatRestoring =
    isInviteUser &&
    Boolean(requestedChannelName) &&
    (!activeChannel || isLoadingActiveChannelMessages)
  const chatLayoutClassName = [
    'chat-app-layout',
    isInviteUser ? 'sparkbit-chat-layout' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const sparkbitActionMenuClassName = isInviteUser
    ? 'sparkbit-chat-action-menu'
    : undefined

  const chatHeaderTitle = activeChannel ? (
    <h2 className="header-title" translate="no">
      {getChannelTitle(activeChannel)}
    </h2>
  ) : (
    <h2 className="header-title">{t('chat.title')}</h2>
  )
  const isVoiceRoomForActiveChannel = Boolean(
    activeVoiceRoomInfo &&
    voiceRoom.room?.channelName === activeVoiceRoomInfo.channelName
  )
  const voiceRemoteParticipantCount = voiceRoom.participants.filter(
    participant => !participant.local
  ).length
  const voiceBannerCount = voiceRoom.joined
    ? voiceRemoteParticipantCount
    : voiceRoom.participants.length
  const shouldShowVoiceBanner =
    !isInviteUser &&
    isVoiceRoomForActiveChannel &&
    (voiceRoom.joined || voiceRoom.participants.length > 0)
  const voiceBannerLabel = voiceRoom.joined
    ? t('chat.voice.bannerJoined', { count: voiceBannerCount })
    : t('chat.voice.bannerActive', { count: voiceBannerCount })

  function handleOpenActiveVoiceRoom() {
    if (!activeVoiceRoomInfo) return
    voiceRoom.openRoom(activeVoiceRoomInfo)
  }

  const channelSearchQuery = channelSearchInput.trim().toLowerCase()
  const sortedChannels = useMemo(
    () =>
      [...channels].sort((a, b) => {
        const mentionUnreadDiff =
          Number(hasUnreadChannelMention(b, channelMentionUnread)) -
          Number(hasUnreadChannelMention(a, channelMentionUnread))
        if (mentionUnreadDiff !== 0) return mentionUnreadDiff

        const unreadDiff =
          Number(hasUnreadChannelMessage(b, channelLastReadAt)) -
          Number(hasUnreadChannelMessage(a, channelLastReadAt))
        if (unreadDiff !== 0) return unreadDiff

        const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        if (pinnedDiff !== 0) return pinnedDiff

        const activityDiff =
          getChannelActivityTime(b) - getChannelActivityTime(a)
        if (activityDiff !== 0) return activityDiff

        return compareStrings(getChannelTitle(a), getChannelTitle(b))
      }),
    [channelLastReadAt, channelMentionUnread, channels, compareStrings]
  )
  const filteredChannels = channelSearchQuery
    ? sortedChannels.filter(channel => {
        const displayName = getChannelTitle(channel)
        return [
          displayName,
          getChannelId(channel),
          getChannelKey(channel),
        ].some(value => value.toLowerCase().includes(channelSearchQuery))
      })
    : sortedChannels

  return (
    <AppShell
      className={chatLayoutClassName}
      defaultHide={isInviteUser}
      hideAccountMenu={isInviteUser}
      languageTheme={isInviteUser ? 'sparkbit' : undefined}
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
                  active={
                    getChannelKey(activeChannel) === getChannelKey(channel)
                  }
                  pinned={Boolean(channel.pinned)}
                  unread={hasUnreadChannelMessage(channel, channelLastReadAt)}
                  mentionUnread={hasUnreadChannelMention(
                    channel,
                    channelMentionUnread
                  )}
                  mentionPreview={formatChannelMentionPreviewText(
                    channelMentionUnreadPreview[getChannelKey(channel)]
                  )}
                  title={getChannelTitle(channel)}
                  menuClassName={sparkbitActionMenuClassName}
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
      {shouldShowChatRestoring ? (
        <ChatRestoringIndicator />
      ) : activeChannel ? (
        <>
          {shouldShowVoiceBanner && (
            <button
              type="button"
              className="chat-voice-banner"
              onClick={handleOpenActiveVoiceRoom}
              title={t('chat.voice.expand')}
            >
              <span className="chat-voice-banner-icon">
                <PhoneCall size={18} />
              </span>
              <span className="chat-voice-banner-label">
                {voiceBannerLabel}
              </span>
              <ChevronRight size={18} />
            </button>
          )}
          <div className="chat-messages">
            {channelMessages.length === 0 ? (
              <div className="ui-empty-state chat-messages-empty">
                <div className="ui-empty-icon empty-icon">
                  <MessagesSquare size={28} />
                </div>
                <p>{t('chat.empty.noMessages')}</p>
              </div>
            ) : (
              channelMessages.map(msg => {
                if (isChannelMemberJoinedSystemMessage(msg)) {
                  const displayAuthor = getMessageDisplayAuthor(msg)
                  return (
                    <ChatSystemMessageItem
                      key={msg.id || `${msg.author}-${msg.timestamp}`}
                    >
                      {t('chat.system.memberJoined', { name: displayAuthor })}
                    </ChatSystemMessageItem>
                  )
                }

                const isSelf =
                  msg.author?.toLowerCase() ===
                  userIdentity?.address.toLowerCase()
                const presence = presenceByAddress.get(
                  normalizeMemberAddress(msg.author)
                )
                const persistedProfile = persistedProfileByAddress.get(
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
                  persistedProfile?.avatar ||
                  messageProfile?.avatar ||
                  msg.avatar ||
                  (isSelf ? userIdentity.avatar : undefined)
                const displayAuthor = getMessageDisplayAuthor(msg)
                const displayTag = getMessageDisplayTag(msg)

                return (
                  <ChatMessageItem
                    key={msg.id || `${msg.author}-${msg.timestamp}`}
                    variant={isSelf ? 'self' : 'other'}
                    pending={msg.pending}
                    isOnline={isOnline}
                    avatarSrc={generateAvatar(msg.author, avatar)}
                    author={displayAuthor}
                    authorTag={displayTag}
                    mentioned={!isSelf && isMessageMentioningCurrentUser(msg)}
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
            isSendingMessage={isSendingChannelMessage}
            isPublishingAttachment={isPublishingAttachment}
            attachmentInputRef={attachmentInputRef}
            inputRef={channelComposerInputRef}
            mentionMenu={mentionMenu}
            attachmentMenuClassName={sparkbitActionMenuClassName}
            showVoiceRoom={!isInviteUser}
            onMessageChange={handleChannelInputChange}
            onSelectionChange={handleComposerSelectionChange}
            onCompositionChange={setIsComposerComposing}
            onComposerKeyDown={handleComposerKeyDown}
            onSend={handleSendChannelMessage}
            onOpenVoiceRoom={handleOpenActiveVoiceRoom}
            onSelectAttachmentFiles={files => {
              void handleSelectAttachmentFiles(files)
            }}
          />
        </>
      ) : (
        <>
          <div className="ui-empty-state chat-welcome">
            <div className="ui-empty-icon ui-empty-icon-lg welcome-icon">
              <MessagesSquare size={36} />
            </div>
            <h2 className="ui-empty-title">{t('chat.select.title')}</h2>
            <p className="ui-empty-desc">{t('chat.select.desc')}</p>
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
            <p>{t('chat.attachment.noSeedsFallback')}</p>
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
          onSaveAs={handleSavePreviewItem}
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
