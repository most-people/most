import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createGameEvent,
  createGameRoomCode,
  gameRoomCodeToChannelName,
  GAME_CHANNEL_TYPE,
  normalizeGameRoomCode,
  parseGameEvent,
} from '~server/src/core/gameRoom.js'
import { channelApi, type ChannelMessage } from '~/lib/channelApi'
import { useChannelMessages } from '~/hooks/useChannelMessages'
import { getApiErrorMessage } from '~server/src/utils/api'
import { useI18n } from '~/lib/i18n'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore, type UserIdentity } from '~/stores/userStore'
import {
  getUserChannelProfile,
  getUserDisplayName,
  getUserMessageIdentity,
} from '~/lib/userSync'

interface UseGameRoomOptions {
  gameId: string
  onError?: (message: string) => void
  getPlayerPayload?: (identity: UserIdentity) => Record<string, unknown>
}

export function useGameRoom({
  gameId,
  onError,
  getPlayerPayload,
}: UseGameRoomOptions) {
  const { t } = useI18n()
  const hasBackend = useAppStore(s => s.hasBackend)
  const checkBackend = useAppStore(s => s.checkBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)

  const [roomCode, setRoomCode] = useState('')
  const [channelName, setChannelName] = useState('')
  const [joining, setJoining] = useState(false)

  const isBackendReady = hasBackend === true

  const reportError = useCallback(
    async (err: unknown, fallback: string) => {
      const message = await getApiErrorMessage(err, fallback)
      if (onError) onError(message)
    },
    [onError]
  )

  const acceptGameMessage = useCallback(
    (message: ChannelMessage) =>
      Boolean(parseGameEvent(message.content, { gameId, roomCode })),
    [gameId, roomCode]
  )

  const getGameMessageKey = useCallback(
    (message: ChannelMessage) => {
      const event = parseGameEvent(message.content, { gameId, roomCode })
      return event
        ? `${message.author}-${event.eventId}`
        : `${message.author}-${message.timestamp}-${message.content}`
    },
    [gameId, roomCode]
  )

  const {
    clearMessages,
    connected,
    messages,
    sendMessage,
    syncMessages,
  } = useChannelMessages({
    isReady: isBackendReady,
    enabled: Boolean(userIdentity),
    channelName,
    limit: 500,
    acceptMessage: acceptGameMessage,
    getMessageKey: getGameMessageKey,
    onSyncError: err => reportError(err, t('game.room.error.readLog')),
  })

  const roomEvents = useMemo(
    () =>
      messages
        .map(message => ({
          message,
          event: parseGameEvent(message.content, { gameId, roomCode }),
        }))
        .filter(item => item.event),
    [gameId, messages, roomCode]
  )

  const ensureReady = useCallback(() => {
    if (!userIdentity) {
      openLoginModal()
      return false
    }
    if (!isBackendReady) {
      openConnectModal()
      return false
    }
    return true
  }, [isBackendReady, openConnectModal, openLoginModal, userIdentity])

  useEffect(() => {
    if (hasBackend === null) {
      void checkBackend()
    }
  }, [checkBackend, hasBackend])

  const enterRoom = useCallback(
    async (codeInput: string, create = false) => {
      if (!ensureReady() || !userIdentity) return false
      const code = create ? createGameRoomCode() : normalizeGameRoomCode(codeInput)
      const name = gameRoomCodeToChannelName(gameId, code)
      if (!name) {
        if (onError) onError(t('game.room.error.invalidCode'))
        return false
      }
      setJoining(true)
      try {
        const channel = await channelApi.createChannel(
          name,
          GAME_CHANNEL_TYPE,
          getUserChannelProfile(userIdentity)
        )
        const channelKey = channel.channelKey || channel.key || name
        const eventName = create ? 'room:create' : 'player:join'
        await sendGameEventToChannel(
          channelKey,
          userIdentity,
          gameId,
          code,
          eventName,
          {
            player: getPlayerPayload
              ? {
                  ...playerPayload(userIdentity),
                  ...getPlayerPayload(userIdentity),
                }
              : playerPayload(userIdentity),
          }
        )
        setRoomCode(code)
        setChannelName(channelKey)
        clearMessages()
        return true
      } catch (err) {
        await reportError(
          err,
          create
            ? t('game.room.error.createFailed')
            : t('game.room.error.joinFailed')
        )
        return false
      } finally {
        setJoining(false)
      }
    },
    [
      ensureReady,
      gameId,
      getPlayerPayload,
      onError,
      reportError,
      clearMessages,
      t,
      userIdentity,
    ]
  )

  const createRoom = useCallback(() => enterRoom('', true), [enterRoom])
  const joinRoom = useCallback((code: string) => enterRoom(code), [enterRoom])

  const sendRoomEvent = useCallback(
    async (eventName: string, payload: Record<string, unknown> = {}) => {
      if (!ensureReady() || !userIdentity || !channelName || !roomCode) {
        return false
      }
      const event = createGameEvent({
        gameId,
        roomCode,
        event: eventName,
        payload,
      })
      const content = JSON.stringify(event)
      try {
        await sendMessage({
          channelName,
          content,
          optimisticId: `${userIdentity.address}-${event.eventId}`,
        })
        return true
      } catch (err) {
        await reportError(err, t('game.room.error.sendEventFailed'))
        return false
      }
    },
    [
      channelName,
      ensureReady,
      gameId,
      reportError,
      roomCode,
      sendMessage,
      t,
      userIdentity,
    ]
  )

  return {
    channelName,
    connected,
    createRoom,
    ensureReady,
    isBackendReady,
    joinRoom,
    joining,
    messages,
    roomCode,
    roomEvents,
    sendRoomEvent,
    setRoomCode,
    syncMessages,
    userIdentity,
  }
}

async function sendGameEventToChannel(
  channelName: string,
  userIdentity: UserIdentity,
  gameId: string,
  roomCode: string,
  eventName: string,
  payload: Record<string, unknown>
) {
  const event = createGameEvent({
    gameId,
    roomCode,
    event: eventName,
    payload,
  })
  await channelApi.sendChannelMessage({
    channelName,
    content: JSON.stringify(event),
    ...getUserMessageIdentity(userIdentity),
  })
}

function playerPayload(identity: UserIdentity) {
  return {
    address: identity.address,
    name: getUserDisplayName(identity),
    avatar: identity.avatar || '',
    publicKey: '',
    joinedAt: Date.now(),
  }
}
