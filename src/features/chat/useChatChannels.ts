/**
 * Chat channel actions.
 *
 * Extracted from `ChatPage.tsx`: channel-id validation, list refresh, open,
 * leave, pin toggle, remark/rename, and the open-chat modal helper.
 *
 * Actions are `useCallback`-wrapped because several of them are read inside
 * effects in the caller, where an unstable identity would re-run the effect on
 * every render.
 *
 * Channel state stays owned by the caller: it is read all over `ChatPage`'s
 * render tree, and several effects depend on it.
 */
import { useCallback } from 'react'

import {
  CHANNEL_ID_MAX_LENGTH,
  CHANNEL_ID_MIN_LENGTH,
  CHANNEL_ID_REGEX,
  buildChatSharePath,
  createRandomChannelId,
  parseChatChannelInput,
} from '~/lib/chatRoom.js'
import { channelApi, type Channel } from '~/lib/channelApi'
import { getChannelActivityTime } from '~/lib/chatUnread.js'
import type { MessageKey } from '~/lib/i18n'
import { getUserChannelProfile } from '~/lib/userProfile'
import type { UserIdentity } from '~/stores/userStore'
import { getChannelId, getChannelKey } from './chatPageModel'

interface UseChatChannelsOptions {
  t: (key: MessageKey, params?: Record<string, string | number>) => string
  addToast: (message: string, type: 'success' | 'error' | 'warning') => void
  showApiError: (err: unknown, fallback: string) => Promise<void> | void
  requireLogin: () => boolean
  requireBackendReady: () => boolean
  isBackendReady: boolean
  channels: Channel[]
  setChannels: (updater: (previous: Channel[]) => Channel[]) => void
  setActiveChannel: (
    updater: (previous: Channel | null) => Channel | null
  ) => void
  setHasLoadedChannels: (value: boolean) => void
  setRequestedChannelName: (value: string) => void
  markChannelRead: (channelKey: string, timestamp: number) => void
  /**
   * Held in a ref rather than passed directly: it comes from
   * `useChannelMessages`, which itself needs `refreshChannels` from this hook,
   * so the two cannot be ordered naively.
   */
  clearChannelMessagesRef: React.RefObject<() => void>
  isOpeningChannel: boolean
  setIsOpeningChannel: (value: boolean) => void
  isLeavingChannel: boolean
  setIsLeavingChannel: (value: boolean) => void
  isRenamingChannel: boolean
  setIsRenamingChannel: (value: boolean) => void
  activeChannel: Channel | null
  setChannelToLeave: (channel: Channel | null) => void
  channelToRename: Channel | null
  setChannelToRename: (channel: Channel | null) => void
  remarkInput: string
  userIdentity: UserIdentity | null
  openChannelModal: { open: () => void; close: () => void }
  leaveChannelModal: { open: () => void; close: () => void }
  setOpenChatDefaultValue: (value: string) => void
}

export function useChatChannels(options: UseChatChannelsOptions) {
  const {
    t,
    addToast,
    showApiError,
    requireLogin,
    requireBackendReady,
    isBackendReady,
    channels,
    setChannels,
    setActiveChannel,
    setHasLoadedChannels,
    setRequestedChannelName,
    markChannelRead,
    clearChannelMessagesRef,
    isOpeningChannel,
    setIsOpeningChannel,
    isLeavingChannel,
    setIsLeavingChannel,
    isRenamingChannel,
    setIsRenamingChannel,
    activeChannel,
    setChannelToLeave,
    channelToRename,
    setChannelToRename,
    remarkInput,
    userIdentity,
    openChannelModal,
    leaveChannelModal,
    setOpenChatDefaultValue,
  } = options

  const getChannelNameValidationError = useCallback(
    (name: string) => {
      if (name.length < CHANNEL_ID_MIN_LENGTH) {
        return t('chat.validation.nameMin', { count: CHANNEL_ID_MIN_LENGTH })
      }
      if (name.length > CHANNEL_ID_MAX_LENGTH) {
        return t('chat.validation.nameMax', { count: CHANNEL_ID_MAX_LENGTH })
      }
      if (name.includes('.')) {
        return t('chat.validation.dotReserved')
      }
      if (!CHANNEL_ID_REGEX.test(name)) {
        return t('chat.validation.allowedChars')
      }
      return ''
    },
    [t]
  )

  const getOpenChannelValidationError = useCallback(
    (value: string) => {
      const channelId = parseChatChannelInput(
        value,
        typeof window === 'undefined' ? undefined : window.location.origin
      )
      if (!channelId) return t('chat.validation.invalidShareLink')
      return getChannelNameValidationError(channelId)
    },
    [getChannelNameValidationError, t]
  )

  const generateChannelId = useCallback(() => {
    try {
      return createRandomChannelId()
    } catch {
      addToast(t('chat.error.randomId'), 'error')
      return ''
    }
  }, [addToast, t])

  const handleShowOpenChatModal = useCallback(() => {
    if (!requireLogin() || !requireBackendReady()) return
    const generatedChatId = generateChannelId()
    if (!generatedChatId) return
    setOpenChatDefaultValue(generatedChatId)
    openChannelModal.open()
  }, [
    generateChannelId,
    openChannelModal,
    requireBackendReady,
    requireLogin,
    setOpenChatDefaultValue,
  ])

  const refreshChannels = useCallback(async () => {
    if (!isBackendReady) {
      setHasLoadedChannels(false)
      return
    }
    try {
      const result = await channelApi.getChannels()
      setChannels(() => result)
      setActiveChannel(prev => {
        if (!prev) return prev
        const updated = result.find(
          channel => getChannelKey(channel) === getChannelKey(prev)
        )
        return updated || prev
      })
      setHasLoadedChannels(true)
    } catch (err) {
      setChannels(() => [])
      setHasLoadedChannels(false)
      await showApiError(err, t('chat.error.channelList'))
    }
  }, [
    isBackendReady,
    setActiveChannel,
    setChannels,
    setHasLoadedChannels,
    showApiError,
    t,
  ])

  const handleOpenChannel = useCallback(
    async (channel: Channel, options: { replaceHistory?: boolean } = {}) => {
      if (!requireLogin()) return
      if (!requireBackendReady()) return
      const channelKey = getChannelKey(channel)
      markChannelRead(
        channelKey,
        Math.max(getChannelActivityTime(channel), Date.now())
      )
      setActiveChannel(() => channel)
      const channelId = getChannelId(channel)
      setRequestedChannelName(channelId)
      if (options.replaceHistory) {
        window.history.replaceState({}, '', buildChatSharePath(channelId))
      } else {
        window.history.pushState({}, '', buildChatSharePath(channelId))
      }
    },
    [
      markChannelRead,
      requireBackendReady,
      requireLogin,
      setActiveChannel,
      setRequestedChannelName,
    ]
  )

  const handleLeaveChannel = useCallback(
    async (channelKey: string, e?: React.MouseEvent<HTMLButtonElement>) => {
      if (e) e.stopPropagation()
      if (!requireLogin()) return
      if (!requireBackendReady()) return
      if (isLeavingChannel) return
      setIsLeavingChannel(true)
      try {
        await channelApi.leaveChannel(channelKey)
        if (getChannelKey(activeChannel) === channelKey) {
          setActiveChannel(() => null)
          setRequestedChannelName('')
          clearChannelMessagesRef.current?.()
          window.history.pushState({}, '', '/chat/')
        }
        refreshChannels()
        leaveChannelModal.close()
        setChannelToLeave(null)
      } catch (err) {
        await showApiError(err, t('chat.error.leave'))
      } finally {
        setIsLeavingChannel(false)
      }
    },
    [
      activeChannel,
      clearChannelMessagesRef,
      isLeavingChannel,
      leaveChannelModal,
      refreshChannels,
      requireBackendReady,
      requireLogin,
      setActiveChannel,
      setChannelToLeave,
      setIsLeavingChannel,
      setRequestedChannelName,
      showApiError,
      t,
    ]
  )

  const handleToggleChannelPin = useCallback(
    async (channel: Channel) => {
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
    },
    [
      requireBackendReady,
      requireLogin,
      setActiveChannel,
      setChannels,
      showApiError,
      t,
    ]
  )

  const updateChannelRemark = useCallback(
    async (channel: Channel, nextRemark: string) => {
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
    },
    [requireBackendReady, requireLogin, setActiveChannel, setChannels]
  )

  const handleSetRemark = useCallback(async () => {
    if (!activeChannel) return
    try {
      await updateChannelRemark(activeChannel, remarkInput)
    } catch (err) {
      await showApiError(err, t('chat.error.remark'))
    }
  }, [activeChannel, remarkInput, showApiError, t, updateChannelRemark])

  const handleRenameChannel = useCallback(
    async (value: string) => {
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
    },
    [
      channelToRename,
      isRenamingChannel,
      setChannelToRename,
      setIsRenamingChannel,
      showApiError,
      t,
      updateChannelRemark,
    ]
  )

  const handleOpenChannelId = useCallback(
    async (channelName: string, options: { replaceHistory?: boolean } = {}) => {
      const name = parseChatChannelInput(
        channelName,
        typeof window === 'undefined' ? undefined : window.location.origin
      )
      if (!name || isOpeningChannel) return
      const validationError = getChannelNameValidationError(name)
      if (validationError) {
        addToast(validationError, 'error')
        return
      }
      if (!requireLogin()) return
      if (!requireBackendReady()) return
      setIsOpeningChannel(true)
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
        openChannelModal.close()
        await handleOpenChannel(joinedChannel, options)
        refreshChannels()
      } catch (err) {
        await showApiError(err, t('chat.error.open'))
      } finally {
        setIsOpeningChannel(false)
      }
    },
    [
      addToast,
      channels,
      getChannelNameValidationError,
      handleOpenChannel,
      isOpeningChannel,
      openChannelModal,
      refreshChannels,
      requireBackendReady,
      requireLogin,
      setChannels,
      setIsOpeningChannel,
      showApiError,
      t,
      userIdentity,
    ]
  )

  return {
    getChannelNameValidationError,
    getOpenChannelValidationError,
    generateChannelId,
    handleShowOpenChatModal,
    refreshChannels,
    handleOpenChannel,
    handleLeaveChannel,
    handleToggleChannelPin,
    handleOpenChannelId,
    updateChannelRemark,
    handleSetRemark,
    handleRenameChannel,
  }
}
