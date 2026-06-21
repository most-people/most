import {
  createEventId,
  normalizeAddress,
  normalizeAvatar,
  normalizeDisplayName,
  normalizeRoomCode,
  randomInt,
  shortAddress,
} from './shared.js'

export { normalizeAddress } from './shared.js'

export const GAME_CHANNEL_TYPE = 'game'
export const GAME_EVENT_KIND = 'mostbox.game.event'
export const GAME_EVENT_VERSION = 1

export const GAME_IDS = ['gandengyan', 'zhajinhua']

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeGameId(input) {
  const value = String(input || '').trim().toLowerCase()
  return GAME_IDS.includes(value) ? value : ''
}

export function normalizeGameRoomCode(input) {
  return normalizeRoomCode(input)
}

export function isValidGameRoomCode(input) {
  return /^[A-Z0-9]{4,8}$/.test(String(input || ''))
}

export function createGameRoomCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function gameRoomCodeToChannelName(gameId, roomCode) {
  const normalizedGameId = normalizeGameId(gameId)
  const code = normalizeGameRoomCode(roomCode)
  if (!normalizedGameId || !isValidGameRoomCode(code)) return ''
  return `game.${normalizedGameId}.${code.toLowerCase()}`
}

export function channelNameToGameRoom(input) {
  const value = String(input || '').trim().toLowerCase()
  const match = /^game\.([a-z0-9]+)\.([a-z0-9]+)$/.exec(value)
  if (!match) return null
  const gameId = normalizeGameId(match[1])
  const roomCode = normalizeGameRoomCode(match[2])
  if (!gameId || !isValidGameRoomCode(roomCode)) return null
  return { gameId, roomCode }
}

export function createGameEvent({ gameId, roomCode, event, payload }) {
  const normalizedGameId = normalizeGameId(gameId)
  const code = normalizeGameRoomCode(roomCode)
  return {
    kind: GAME_EVENT_KIND,
    version: GAME_EVENT_VERSION,
    gameId: normalizedGameId,
    roomCode: code,
    event: String(event || ''),
    eventId: createEventId(normalizedGameId || 'game'),
    payload: payload || {},
  }
}

export function parseGameEvent(content, options = {}) {
  try {
    const event = JSON.parse(String(content || ''))
    if (
      !event ||
      event.kind !== GAME_EVENT_KIND ||
      event.version !== GAME_EVENT_VERSION ||
      typeof event.event !== 'string' ||
      typeof event.eventId !== 'string'
    ) {
      return null
    }

    const gameId = normalizeGameId(event.gameId)
    const roomCode = normalizeGameRoomCode(event.roomCode)
    if (!gameId || !isValidGameRoomCode(roomCode)) return null
    if (options.gameId && gameId !== normalizeGameId(options.gameId)) return null
    if (
      options.roomCode &&
      roomCode !== normalizeGameRoomCode(options.roomCode)
    ) {
      return null
    }

    return {
      ...event,
      gameId,
      roomCode,
      payload:
        event.payload && typeof event.payload === 'object'
          ? event.payload
          : {},
    }
  } catch {
    return null
  }
}

export function deriveGameRoomLobby(messages = [], options = {}) {
  const players = []
  const playerMap = new Map()
  let hostAddress = ''

  for (const message of sortMessages(messages)) {
    const event = parseGameEvent(message.content, options)
    if (!event) continue

    if (event.event === 'room:create') {
      const player = createPlayerFromPayload(event.payload?.player, message)
      if (!player) continue
      if (!hostAddress) hostAddress = player.address
      upsertPlayer(players, playerMap, player)
      continue
    }

    if (event.event === 'player:join') {
      const player = createPlayerFromPayload(event.payload?.player, message)
      if (player) upsertPlayer(players, playerMap, player)
      continue
    }

    if (event.event === 'player:leave') {
      const address = normalizeAddress(event.payload?.player?.address || message.author)
      if (address) {
        const index = players.findIndex(p => p.address === address)
        if (index !== -1) {
          players.splice(index, 1)
          playerMap.delete(address)
        }
      }
    }
  }

  return {
    gameId: normalizeGameId(options.gameId),
    roomCode: normalizeGameRoomCode(options.roomCode),
    hostAddress,
    players,
  }
}

export function getLatestGameState(messages = [], options = {}) {
  let latest = null
  for (const message of sortMessages(messages)) {
    const event = parseGameEvent(message.content, options)
    if (!event) continue
    if (event.event !== 'room:state') continue
    const seq = Number(event.payload?.seq || 0)
    if (!latest || seq >= Number(latest.payload?.seq || 0)) {
      latest = event
    }
  }
  return latest
}

export function createPlayerFromPayload(input, messageOrAuthor) {
  if (!input || typeof input !== 'object') return null
  const message =
    messageOrAuthor && typeof messageOrAuthor === 'object'
      ? messageOrAuthor
      : { author: messageOrAuthor }
  const author = message.author
  const address = normalizeAddress(input.address || author)
  if (!address || normalizeAddress(author) !== address) return null
  const name = normalizeDisplayName(
    message.authorName || input.name,
    shortAddress(address)
  )
  const avatar = normalizeAvatar(message.avatar || input.avatar)
  const publicKey = String(input.publicKey || '').trim()
  const player = {
    address,
    name,
    publicKey,
    joinedAt: Number(input.joinedAt || Date.now()),
  }
  if (avatar) player.avatar = avatar
  return player
}

export function normalizeGamePlayer(input) {
  if (!input || typeof input !== 'object') return null
  const address = normalizeAddress(input.address)
  if (!address) return null
  return {
    ...input,
    address,
    name: String(input.name || shortAddress(address)).slice(0, 50),
    publicKey: String(input.publicKey || ''),
  }
}

function upsertPlayer(players, playerMap, player) {
  const existing = playerMap.get(player.address)
  if (existing) {
    Object.assign(existing, player)
    return
  }
  players.push(player)
  playerMap.set(player.address, player)
}

function sortMessages(messages) {
  return [...messages].sort(
    (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)
  )
}
