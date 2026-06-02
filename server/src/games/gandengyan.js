const SUITS = ['S', 'H', 'C', 'D']
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
const STRAIGHT_RANKS = RANKS.filter(rank => rank !== '2')
const RANK_VALUE = new Map(RANKS.map((rank, index) => [rank, index + 3]))
const INITIAL_HAND_SIZE = 5
const SEALED_PENALTY = 15
const INITIAL_SCORE = 1000

export const GAN_DENG_YAN_GAME_ID = 'gdy'
export const GAN_DENG_YAN_EVENT_TYPE = 'game'
export const GAN_DENG_YAN_CHANNEL_PREFIX = `game-${GAN_DENG_YAN_GAME_ID}`

export function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function normalizeRoomCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
}

export function makeGameChannelName(roomCode) {
  const normalized = normalizeRoomCode(roomCode)
  return normalized ? `${GAN_DENG_YAN_CHANNEL_PREFIX}-${normalized}` : ''
}

export function makeGameEvent({ roomCode, event, payload = {}, eventId }) {
  return {
    type: GAN_DENG_YAN_EVENT_TYPE,
    gameId: GAN_DENG_YAN_GAME_ID,
    roomCode: normalizeRoomCode(roomCode),
    event,
    eventId: eventId || `${event}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    payload,
  }
}

export function parseGameEventMessage(message, roomCode = '') {
  if (!message?.content) return null
  try {
    const data = JSON.parse(message.content)
    if (
      data?.type !== GAN_DENG_YAN_EVENT_TYPE ||
      data?.gameId !== GAN_DENG_YAN_GAME_ID
    ) {
      return null
    }
    const normalizedRoomCode = normalizeRoomCode(roomCode || data.roomCode)
    if (normalizedRoomCode && normalizeRoomCode(data.roomCode) !== normalizedRoomCode) {
      return null
    }
    return {
      ...data,
      roomCode: normalizeRoomCode(data.roomCode),
      actorId: message.author,
      actorName: message.authorName,
      timestamp: message.timestamp,
    }
  } catch {
    return null
  }
}

export function reduceGameEvents(messages, viewerId, roomCode = '') {
  let room = null
  const errors = []
  const seen = new Set()
  const events = messages
    .map(message => parseGameEventMessage(message, roomCode))
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

  for (const event of events) {
    const eventKey = event.eventId || `${event.actorId}-${event.timestamp}-${event.event}`
    if (seen.has(eventKey)) continue
    seen.add(eventKey)
    try {
      room = applyGameEvent(room, event)
    } catch (error) {
      errors.push({
        event,
        message: error instanceof Error ? error.message : '事件回放失败',
      })
    }
  }

  return {
    room,
    publicRoom: room ? publicRoom(room, viewerId) : null,
    errors,
    events,
  }
}

export function applyGameEvent(room, event) {
  const actorId = event.actorId
  const actorName = cleanName(event.payload?.name || event.actorName)
  const actorAddress = String(event.payload?.address || event.actorId || '').slice(0, 64)

  if (event.event === 'create') {
    if (room) return room
    return createRoom({
      roomId: event.roomCode,
      ownerId: actorId,
      ownerName: actorName,
      ownerAddress: actorAddress,
    })
  }

  if (!room) return null

  if (event.event === 'join') {
    joinRoom(room, actorId, actorName, actorAddress)
    return room
  }

  if (event.event === 'settings') {
    assertOwner(room, actorId)
    setRoomSettings(room, event.payload?.settings || {})
    return room
  }

  if (event.event === 'leave') {
    leaveRoom(room, actorId)
    return room
  }

  if (event.event === 'resetScores') {
    assertOwner(room, actorId)
    resetRoomScores(room)
    return room
  }

  if (event.event === 'start') {
    assertOwner(room, actorId)
    startGame(room, event.payload?.seed)
    if (room.lastAction) room.lastAction.id = event.eventId
    return room
  }

  if (event.event === 'play') {
    playCards(room, actorId, Array.isArray(event.payload?.cardIds) ? event.payload.cardIds : [])
    if (room.lastAction) room.lastAction.id = event.eventId
    return room
  }

  if (event.event === 'pass') {
    passTurn(room, actorId)
    if (room.lastAction) room.lastAction.id = event.eventId
    return room
  }

  if (event.event === 'restart') {
    assertOwner(room, actorId)
    startGame(room, event.payload?.seed)
    if (room.lastAction) room.lastAction.id = event.eventId
    return room
  }

  if (event.event === 'bot') {
    assertRoomHuman(room, actorId)
    if (!isExpectedBotEvent(room, event.payload || {})) return room
    botStep(room)
    if (room.lastAction) room.lastAction.id = event.eventId
    return room
  }

  return room
}

function assertOwner(room, playerId) {
  if (room.ownerId !== playerId) throw new Error('只有房主可以操作')
}

function assertRoomHuman(room, playerId) {
  if (!room.players.some(player => player.id === playerId && !player.bot)) {
    throw new Error('只有房间玩家可以操作人机')
  }
}

function isExpectedBotEvent(room, payload) {
  const player = currentPlayer(room)
  if (room.status !== 'playing' || !player?.bot) return false
  if (payload.seat !== undefined && Number(payload.seat) !== player.seat) return false
  if (
    payload.afterActionId !== undefined &&
    String(payload.afterActionId) !== String(room.lastAction?.id || '')
  ) {
    return false
  }
  return true
}

export function createRoom({ roomId, ownerId, ownerName, ownerAddress }) {
  const room = {
    id: normalizeRoomCode(roomId),
    ownerId,
    status: 'lobby',
    settings: { decks: 1, seats: 2, bots: 1 },
    players: [
      {
        id: ownerId,
        address: ownerAddress || '',
        name: ownerName || '玩家',
        bot: false,
        seat: 0,
        connected: true,
        hand: [],
        score: INITIAL_SCORE,
        playedCards: 0,
      },
    ],
    deck: [],
    discard: [],
    table: null,
    currentSeat: 0,
    lastWinnerSeat: null,
    previousWinnerSeat: null,
    passSeats: [],
    baseScore: 1,
    bombCount: 0,
    diceRolls: [],
    roundResult: null,
    lastAction: null,
    log: ['房间已创建'],
    winnerSeat: null,
    updatedAt: Date.now(),
  }
  syncBots(room)
  return room
}

export function setRoomSettings(room, settings) {
  if (room.status !== 'lobby') throw new Error('游戏开始后不能修改设置')
  room.settings.decks = clamp(Number(settings.decks) || 1, 1, 2)
  room.settings.seats = clamp(Number(settings.seats) || 2, 2, 6)
  room.settings.bots = clamp(Number(settings.bots) || 0, 0, room.settings.seats - 1)
  syncBots(room)
  room.updatedAt = Date.now()
}

export function joinRoom(room, playerId, name, address) {
  let player = room.players.find(item => item.id === playerId)
  if (player) {
    player.connected = true
    if (name) player.name = name
    if (address) player.address = address
    return player
  }
  if (room.status !== 'lobby') throw new Error('游戏已经开始')
  const seat = firstOpenHumanSeat(room)
  if (seat === -1) throw new Error('房间已满')
  player = {
    id: playerId,
    address: address || '',
    name: name || `玩家${seat + 1}`,
    bot: false,
    seat,
    connected: true,
    hand: [],
    score: INITIAL_SCORE,
    playedCards: 0,
  }
  room.players = room.players.filter(item => item.seat !== seat)
  room.players.push(player)
  room.players.sort((a, b) => a.seat - b.seat)
  syncBots(room)
  room.log.unshift(`${player.name} 加入牌桌`)
  room.updatedAt = Date.now()
  return player
}

export function leaveRoom(room, playerId) {
  const player = room.players.find(item => item.id === playerId)
  if (!player || player.bot) return
  player.leftScore = player.score
  player.connected = false
  room.log.unshift(`${player.name} 离开游戏，离开时 ${player.score} 分`)
  if (room.status === 'lobby') {
    room.players = room.players.filter(item => item.id !== playerId)
    syncBots(room)
  }
  transferOwnerAfterLeave(room, playerId)
  room.updatedAt = Date.now()
}

export function resetRoomScores(room) {
  for (const player of room.players) {
    player.score = INITIAL_SCORE
  }
  room.roundResult = null
  room.log.unshift(`房主已将所有玩家分数重置为 ${INITIAL_SCORE}`)
  room.updatedAt = Date.now()
}

export function startGame(room, seed = `${Date.now()}-${Math.random()}`) {
  if (room.players.filter(player => !player.bot).length < 1) {
    throw new Error('至少需要 1 名真人玩家')
  }
  const rng = createSeededRandom(seed)
  syncBots(room)
  room.deck = shuffle(createDeck(room.settings.decks), rng)
  room.discard = []
  room.table = null
  room.passSeats = []
  room.winnerSeat = null
  room.roundResult = null
  room.baseScore = 1
  room.bombCount = 0
  room.status = 'playing'
  for (const player of orderedPlayers(room)) {
    player.hand = draw(room, INITIAL_HAND_SIZE)
    player.playedCards = 0
    sortHand(player.hand)
  }
  const starter = chooseStarter(room, rng)
  room.currentSeat = starter.seat
  room.lastWinnerSeat = null
  room.log = [`新一局开始，${starter.name} 先出牌`]
  room.lastAction = {
    id: `start-${seed}`,
    type: 'start',
    seat: starter.seat,
    playerName: starter.name,
  }
  if (room.diceRolls.length > 0) {
    room.log.unshift(
      `骰子结果：${room.diceRolls.map(roll => `${roll.name} ${roll.value}`).join('，')}`
    )
  }
  room.updatedAt = Date.now()
}

export function playCards(room, playerId, cardIds) {
  finishIfAnyPlayerHasOnlyJokers(room)
  if (room.status !== 'playing') return
  const player = currentPlayer(room)
  if (!player || player.id !== playerId) throw new Error('还没轮到你')
  const cards = cardIds.map(id => player.hand.find(card => card.id === id))
  if (cards.length === 0 || cards.some(card => !card)) throw new Error('手牌不存在')
  const combo = analyzeCards(cards)
  if (!combo) throw new Error('这个牌型不合法')
  if (!canBeat(combo, room.table?.combo)) throw new Error('出的牌压不过上一手')
  player.hand = player.hand.filter(card => !cardIds.includes(card.id))
  player.playedCards += cards.length
  room.discard.push(...cards)
  room.table = { seat: player.seat, playerName: player.name, cards, combo }
  room.lastAction = {
    id: `play-${Date.now()}-${player.seat}-${cards.map(card => card.id).join('-')}`,
    type: 'play',
    seat: player.seat,
    playerName: player.name,
    cards,
    combo,
  }
  room.passSeats = []
  room.lastWinnerSeat = player.seat
  if (combo.type === 'bomb') {
    room.bombCount += 1
    room.baseScore *= 2
  }
  room.log.unshift(
    `${player.name} 出 ${combo.label} ${cards.map(labelCard).join(' ')}${combo.type === 'bomb' ? `，底分 ${room.baseScore}` : ''}`
  )
  if (player.hand.length === 0) {
    finishGame(room, player)
  } else {
    advanceTurn(room)
    finishIfAnyPlayerHasOnlyJokers(room)
  }
  room.updatedAt = Date.now()
}

export function passTurn(room, playerId) {
  finishIfAnyPlayerHasOnlyJokers(room)
  if (room.status !== 'playing') return
  const player = currentPlayer(room)
  if (!player || player.id !== playerId) throw new Error('还没轮到你')
  if (!room.table) throw new Error('领出时不能不要')
  if (!room.passSeats.includes(player.seat)) room.passSeats.push(player.seat)
  room.lastAction = {
    id: `pass-${Date.now()}-${player.seat}`,
    type: 'pass',
    seat: player.seat,
    playerName: player.name,
  }
  room.log.unshift(`${player.name} 不要`)
  const activeSeats = activePlayers(room).map(item => item.seat)
  const seatsToBeat = activeSeats.filter(seat => seat !== room.lastWinnerSeat)
  if (seatsToBeat.every(seat => room.passSeats.includes(seat))) {
    room.currentSeat = room.lastWinnerSeat
    room.table = null
    room.passSeats = []
    room.log.unshift('本轮结束，重新领出')
  } else {
    advanceTurn(room)
  }
  finishIfAnyPlayerHasOnlyJokers(room)
  room.updatedAt = Date.now()
}

export function botStep(room) {
  finishIfAnyPlayerHasOnlyJokers(room)
  if (room.status !== 'playing') return true
  const player = currentPlayer(room)
  if (!player?.bot || room.status !== 'playing') return false
  const move = chooseBotMove(player.hand, room.table?.combo)
  if (move.length > 0) {
    playCards(room, player.id, move.map(card => card.id))
  } else {
    passTurn(room, player.id)
  }
  return true
}

export function publicRoom(room, viewerId) {
  return {
    id: room.id,
    ownerId: room.ownerId,
    status: room.status,
    settings: room.settings,
    deckCount: room.deck.length,
    discardCount: room.discard.length,
    currentSeat: room.currentSeat,
    lastWinnerSeat: room.lastWinnerSeat,
    previousWinnerSeat: room.previousWinnerSeat,
    baseScore: room.baseScore,
    bombCount: room.bombCount,
    diceRolls: room.diceRolls,
    roundResult: room.roundResult,
    lastAction: publicAction(room.lastAction),
    table: room.table ? { ...room.table, cards: room.table.cards.map(publicCard) } : null,
    passSeats: room.passSeats,
    winnerSeat: room.winnerSeat,
    log: room.log.slice(0, 18),
    players: orderedPlayers(room).map(player => ({
      id: player.id,
      address: player.address,
      name: player.name,
      bot: player.bot,
      seat: player.seat,
      connected: player.connected,
      handCount: player.hand.length,
      score: player.score,
      leftScore: player.leftScore,
      playedCards: player.playedCards,
      hand: player.id === viewerId ? player.hand.map(publicCard) : [],
    })),
  }
}

function publicAction(action) {
  if (!action) return null
  return { ...action, cards: action.cards?.map(publicCard) }
}

export function analyzeCards(cards) {
  if (!cards?.length) return null
  const jokerCount = cards.filter(isJoker).length
  const normals = cards.filter(card => !isJoker(card))
  if (cards.length === 1 && jokerCount === 0) {
    const value = cardValue(cards[0])
    return makeCombo('single', value, 1, [value])
  }
  if (normals.length === 0) return null
  const bomb = analyzeBomb(cards, normals, jokerCount)
  if (bomb) return bomb
  if (cards.length === 2 && canRepresentSameRank(normals, jokerCount)) {
    const value = sameRankValue(normals)
    return makeCombo('pair', value, 2, [value, value])
  }
  return analyzeStraight(cards) || analyzePairStraight(cards)
}

function analyzeBomb(cards, normals, jokerCount) {
  if (cards.length < 3 || !canRepresentSameRank(normals, jokerCount)) return null
  const value = sameRankValue(normals)
  return makeCombo('bomb', value, cards.length, Array(cards.length).fill(value), jokerCount === 0)
}

function analyzeStraight(cards) {
  if (cards.length < 3) return null
  const normalValues = cards.filter(card => !isJoker(card)).map(cardValue)
  if (normalValues.some(value => value >= RANK_VALUE.get('2'))) return null
  if (new Set(normalValues).size !== normalValues.length) return null
  for (let start = 0; start <= STRAIGHT_RANKS.length - cards.length; start += 1) {
    const values = STRAIGHT_RANKS.slice(start, start + cards.length).map(rank => RANK_VALUE.get(rank))
    if (normalValues.every(value => values.includes(value))) {
      return makeCombo('straight', values.at(-1), cards.length, values)
    }
  }
  return null
}

function analyzePairStraight(cards) {
  if (cards.length < 4 || cards.length % 2 !== 0) return null
  const pairCount = cards.length / 2
  const rankCounts = countNormalRanks(cards)
  if ([...rankCounts.keys()].some(rank => rank === '2')) return null
  if ([...rankCounts.values()].some(count => count > 2)) return null
  const jokerCount = cards.filter(isJoker).length
  for (let start = 0; start <= STRAIGHT_RANKS.length - pairCount; start += 1) {
    const windowRanks = STRAIGHT_RANKS.slice(start, start + pairCount)
    const missing = windowRanks.reduce((sum, rank) => sum + Math.max(0, 2 - (rankCounts.get(rank) || 0)), 0)
    const outsideWindow = [...rankCounts.keys()].some(rank => !windowRanks.includes(rank))
    if (outsideWindow || missing !== jokerCount) continue
    const pairValues = windowRanks.map(rank => RANK_VALUE.get(rank))
    const values = pairValues.flatMap(value => [value, value])
    return makeCombo('pairStraight', pairValues.at(-1), cards.length, values)
  }
  return null
}

function countNormalRanks(cards) {
  const counts = new Map()
  for (const card of cards) {
    if (isJoker(card)) continue
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1)
  }
  return counts
}

function makeCombo(type, value, length, resolvedValues, pure = true) {
  return {
    type,
    value,
    length,
    resolvedValues,
    pure,
    label: labelCombo({ type, value, length, resolvedValues, pure }),
  }
}

function canBeat(combo, tableCombo) {
  if (!combo) return false
  if (!tableCombo) return true
  if (combo.type === 'bomb' && tableCombo.type !== 'bomb') return true
  if (combo.type !== tableCombo.type) return false
  if (combo.type === 'bomb') {
    if (combo.length !== tableCombo.length) return combo.length > tableCombo.length
    if (combo.pure !== tableCombo.pure) return combo.pure && !tableCombo.pure
    if (combo.value !== tableCombo.value) return combo.value > tableCombo.value
    return false
  }
  if (combo.length !== tableCombo.length) return false
  if (combo.type === 'single' || combo.type === 'pair') {
    return combo.value === nextValue(tableCombo.value) || (combo.value === RANK_VALUE.get('2') && tableCombo.value !== RANK_VALUE.get('2'))
  }
  return combo.value === nextValue(tableCombo.value)
}

function syncBots(room) {
  const seats = room.settings.seats
  room.players = room.players.filter(player => player.seat < seats)
  while (orderedPlayers(room).filter(player => player.bot).length > room.settings.bots) {
    const bot = orderedPlayers(room).filter(player => player.bot).at(-1)
    room.players = room.players.filter(player => player.id !== bot.id)
  }
  for (let seat = 0; orderedPlayers(room).filter(player => player.bot).length < room.settings.bots && seat < seats; seat += 1) {
    if (!room.players.find(player => player.seat === seat)) room.players.push(makeBot(seat))
  }
  room.players.sort((a, b) => a.seat - b.seat)
}

function makeBot(seat) {
  return {
    id: `bot-${seat}`,
    address: '',
    name: `人机${seat + 1}`,
    bot: true,
    seat,
    connected: true,
    hand: [],
    score: INITIAL_SCORE,
    playedCards: 0,
  }
}

function transferOwnerAfterLeave(room, playerId) {
  if (room.ownerId !== playerId) return
  const nextOwner = orderedPlayers(room).find(player => !player.bot && player.id !== playerId)
  if (nextOwner) room.ownerId = nextOwner.id
}

function chooseStarter(room, rng) {
  if (room.previousWinnerSeat !== null) {
    room.diceRolls = []
    return orderedPlayers(room).find(player => player.seat === room.previousWinnerSeat) || orderedPlayers(room)[0]
  }
  let candidates = orderedPlayers(room)
  let rolls = []
  while (candidates.length > 1) {
    rolls = candidates.map(player => ({ seat: player.seat, name: player.name, value: rollDice(rng) }))
    const max = Math.max(...rolls.map(roll => roll.value))
    const winners = rolls.filter(roll => roll.value === max)
    if (winners.length === 1) {
      room.diceRolls = rolls
      return candidates.find(player => player.seat === winners[0].seat)
    }
    candidates = candidates.filter(player => winners.some(roll => roll.seat === player.seat))
  }
  room.diceRolls = rolls
  return candidates[0]
}

function finishGame(room, winner) {
  room.status = 'finished'
  room.winnerSeat = winner.seat
  room.previousWinnerSeat = winner.seat
  const losers = []
  let winnerGain = 0
  for (const player of orderedPlayers(room)) {
    if (player.seat === winner.seat) continue
    const sealed = player.playedCards === 0
    const loss = sealed ? SEALED_PENALTY : player.hand.length * room.baseScore
    player.score -= loss
    winnerGain += loss
    losers.push({ seat: player.seat, name: player.name, loss, sealed, cardsLeft: player.hand.length })
  }
  winner.score += winnerGain
  room.roundResult = {
    winnerSeat: winner.seat,
    winnerName: winner.name,
    winnerGain,
    baseScore: room.baseScore,
    bombCount: room.bombCount,
    losers,
  }
  room.log.unshift(`${winner.name} 获胜，赢 ${winnerGain} 分`)
}

function finishIfAnyPlayerHasOnlyJokers(room) {
  const loser = orderedPlayers(room).find(player => player.hand.length > 0 && player.hand.every(isJoker))
  if (room.status !== 'playing' || !loser) return false
  const winner = chooseWinnerForOnlyJokers(room, loser)
  if (!winner) return false
  finishGameByOnlyJokers(room, loser, winner)
  return true
}

function chooseWinnerForOnlyJokers(room, loser) {
  const candidates = orderedPlayers(room).filter(player => player.seat !== loser.seat && player.hand.length > 0)
  return (
    candidates.find(player => player.seat === room.lastWinnerSeat) ||
    candidates.find(player => player.seat === room.currentSeat) ||
    candidates[0]
  )
}

function finishGameByOnlyJokers(room, loser, winner) {
  room.status = 'finished'
  room.winnerSeat = winner.seat
  room.previousWinnerSeat = winner.seat
  const loss = Math.max(1, loser.hand.length * room.baseScore)
  loser.score -= loss
  winner.score += loss
  room.roundResult = {
    winnerSeat: winner.seat,
    winnerName: winner.name,
    winnerGain: loss,
    baseScore: room.baseScore,
    bombCount: room.bombCount,
    losers: [
      {
        seat: loser.seat,
        name: loser.name,
        loss,
        sealed: loser.playedCards === 0,
        cardsLeft: loser.hand.length,
      },
    ],
  }
  room.log.unshift(`${loser.name} 只剩王牌，自动判负；${winner.name} 获胜`)
  room.updatedAt = Date.now()
}

function firstOpenHumanSeat(room) {
  for (let seat = 0; seat < room.settings.seats; seat += 1) {
    const player = room.players.find(item => item.seat === seat)
    if (!player || player.bot) return seat
  }
  return -1
}

function createDeck(decks) {
  const cards = []
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ id: `${deck}-${suit}-${rank}`, suit, rank, deck })
    }
    cards.push({ id: `${deck}-SJ`, suit: 'Joker', rank: 'SJ', deck })
    cards.push({ id: `${deck}-BJ`, suit: 'Joker', rank: 'BJ', deck })
  }
  return cards
}

function shuffle(cards, rng) {
  const copy = [...cards]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function draw(room, count) {
  return room.deck.splice(0, count)
}

function sortHand(hand) {
  hand.sort(compareCards)
}

function currentPlayer(room) {
  return room.players.find(player => player.seat === room.currentSeat)
}

function activePlayers(room) {
  return orderedPlayers(room).filter(player => player.hand.length > 0)
}

function orderedPlayers(room) {
  return [...room.players].sort((a, b) => a.seat - b.seat)
}

function advanceTurn(room) {
  const seats = activePlayers(room).map(player => player.seat)
  const currentIndex = seats.indexOf(room.currentSeat)
  room.currentSeat = seats[(currentIndex + 1) % seats.length]
}

function chooseBotMove(hand, tableCombo) {
  const candidates = enumerateBotMoves(hand)
  return candidates.find(cards => canBeat(analyzeCards(cards), tableCombo)) || []
}

function enumerateBotMoves(hand) {
  const sorted = [...hand].sort(compareCards)
  const jokers = sorted.filter(isJoker)
  const byRank = cardsByRank(sorted.filter(card => !isJoker(card)))
  const moves = sorted.filter(card => !isJoker(card)).map(card => [card])

  for (const cards of byRank.values()) {
    if (cards.length >= 2) moves.push(cards.slice(0, 2))
    if (cards.length === 1 && jokers.length > 0) moves.push([cards[0], jokers[0]])
    for (let size = 3; size <= Math.min(6, cards.length + jokers.length); size += 1) {
      const normalCount = Math.min(cards.length, size)
      const jokerCount = size - normalCount
      if (jokerCount <= jokers.length) {
        moves.push([...cards.slice(0, normalCount), ...jokers.slice(0, jokerCount)])
      }
    }
  }

  for (let start = 0; start < STRAIGHT_RANKS.length; start += 1) {
    const straight = []
    const pairStraight = []
    for (let index = start; index < STRAIGHT_RANKS.length; index += 1) {
      const rankCards = byRank.get(STRAIGHT_RANKS[index]) || []
      if (rankCards.length === 0) break
      straight.push(rankCards[0])
      if (straight.length >= 3) moves.push([...straight])
      if (rankCards.length < 2) break
      pairStraight.push(rankCards[0], rankCards[1])
      if (pairStraight.length >= 4) moves.push([...pairStraight])
    }
  }

  return moves.sort((a, b) => {
    const comboA = analyzeCards(a)
    const comboB = analyzeCards(b)
    if (comboA.type === 'bomb' && comboB.type !== 'bomb') return 1
    if (comboA.type !== 'bomb' && comboB.type === 'bomb') return -1
    return comboA.length - comboB.length || comboA.value - comboB.value
  })
}

function cardsByRank(cards) {
  const groups = new Map()
  for (const card of cards) {
    if (!groups.has(card.rank)) groups.set(card.rank, [])
    groups.get(card.rank).push(card)
  }
  return groups
}

function canRepresentSameRank(normals, jokerCount) {
  if (normals.length === 0) return false
  const first = normals[0].rank
  return normals.every(card => card.rank === first) && normals.length + jokerCount >= 2
}

function sameRankValue(normals) {
  return cardValue(normals[0])
}

function compareCards(a, b) {
  return cardValue(a) - cardValue(b) || suitValue(a.suit) - suitValue(b.suit)
}

function cardValue(card) {
  if (card.rank === 'SJ') return 16
  if (card.rank === 'BJ') return 17
  return RANK_VALUE.get(card.rank) || 99
}

function isJoker(card) {
  return card.rank === 'SJ' || card.rank === 'BJ'
}

function suitValue(suit) {
  return { D: 0, C: 1, H: 2, S: 3, Joker: 4 }[suit] || 0
}

function publicCard(card) {
  return { id: card.id, suit: card.suit, rank: card.rank, label: labelCard(card), color: cardColor(card) }
}

function labelCard(card) {
  if (card.rank === 'SJ') return '小王'
  if (card.rank === 'BJ') return '大王'
  return `${suitSymbol(card.suit)}${card.rank}`
}

function suitSymbol(suit) {
  return { S: '♠', H: '♥', C: '♣', D: '♦' }[suit] || ''
}

function cardColor(card) {
  return card.suit === 'H' || card.suit === 'D' || card.rank === 'BJ' ? 'red' : 'black'
}

function labelCombo(combo) {
  const resolved = combo.resolvedValues?.length ? `（${combo.resolvedValues.map(valueLabel).join(' ')}）` : ''
  return `${{
    single: '单张',
    pair: '对子',
    straight: '顺子',
    pairStraight: '连对',
    bomb: combo.pure ? '纯炸弹' : '带王炸弹',
  }[combo.type]}${resolved}`
}

function valueLabel(value) {
  if (value === 16) return '小王'
  if (value === 17) return '大王'
  return RANKS.find(rank => RANK_VALUE.get(rank) === value) || String(value)
}

function nextValue(value) {
  const index = RANKS.findIndex(rank => RANK_VALUE.get(rank) === value)
  if (index === -1 || index >= RANKS.length - 1) return null
  return RANK_VALUE.get(RANKS[index + 1])
}

function rollDice(rng) {
  return Math.floor(rng() * 6) + 1
}

function createSeededRandom(seed) {
  let value = 2166136261
  const text = String(seed || '')
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function cleanName(name) {
  return String(name || '玩家').trim().slice(0, 16) || '玩家'
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
