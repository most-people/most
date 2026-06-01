import crypto from 'node:crypto'

const SUITS = ['S', 'H', 'C', 'D']
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
const STRAIGHT_RANKS = RANKS.filter(rank => rank !== '2')
const RANK_VALUE = new Map(RANKS.map((rank, index) => [rank, index + 3]))
const INITIAL_HAND_SIZE = 5
const SEALED_PENALTY = 15

export function createGanDengYanSocketHandlers() {
  const rooms = new Map()
  const clients = new Map()

  function bindClient(ws) {
    const id = crypto.randomUUID()
    clients.set(ws, { id, roomId: null, name: '玩家', address: '' })
    send(ws, 'gandengyan:hello', { playerId: id })
  }

  function unbindClient(ws) {
    const client = clients.get(ws)
    if (client?.roomId && rooms.has(client.roomId)) {
      const room = rooms.get(client.roomId)
      leaveRoom(room, client.id)
      broadcastRoom(room)
    }
    clients.delete(ws)
  }

  function handleMessage(ws, event, data = {}) {
    if (!event.startsWith('gandengyan:')) return false
    const client = clients.get(ws)
    if (!client) return true

    try {
      const identity = normalizeIdentity(data.identity)
      if (identity.name) client.name = identity.name
      if (identity.address) client.address = identity.address

      switch (event) {
        case 'gandengyan:createRoom': {
          const room = createRoom({
            roomId: makeRoomId(rooms),
            ownerId: client.id,
            ownerName: client.name,
            ownerAddress: client.address,
          })
          rooms.set(room.id, room)
          client.roomId = room.id
          send(ws, 'gandengyan:roomCreated', { roomId: room.id })
          broadcastRoom(room)
          return true
        }
        case 'gandengyan:joinRoom': {
          const roomId = String(data.roomId || '').trim().toUpperCase()
          const room = rooms.get(roomId)
          if (!room) throw new Error('房间不存在')
          joinRoom(room, client.id, client.name, client.address)
          client.roomId = room.id
          broadcastRoom(room)
          return true
        }
        default:
          break
      }

      const room = rooms.get(client.roomId)
      if (!room) throw new Error('请先进入房间')

      if (event === 'gandengyan:settings') {
        if (room.ownerId !== client.id) throw new Error('只有房主可以修改设置')
        setRoomSettings(room, data.settings || {})
        broadcastRoom(room)
        return true
      }

      if (event === 'gandengyan:start') {
        if (room.ownerId !== client.id) throw new Error('只有房主可以开始')
        startGame(room)
        broadcastRoom(room)
        scheduleBots(room, broadcastRoom)
        return true
      }

      if (event === 'gandengyan:play') {
        playCards(room, client.id, Array.isArray(data.cardIds) ? data.cardIds : [])
        broadcastRoom(room)
        scheduleBots(room, broadcastRoom)
        return true
      }

      if (event === 'gandengyan:pass') {
        passTurn(room, client.id)
        broadcastRoom(room)
        scheduleBots(room, broadcastRoom)
        return true
      }

      if (event === 'gandengyan:restart') {
        if (room.ownerId !== client.id) throw new Error('只有房主可以再来一局')
        startGame(room)
        broadcastRoom(room)
        scheduleBots(room, broadcastRoom)
        return true
      }
    } catch (error) {
      send(ws, 'gandengyan:error', {
        message: error instanceof Error ? error.message : '请求失败',
      })
    }

    return true
  }

  function broadcastRoom(room) {
    for (const [ws, client] of clients.entries()) {
      if (client.roomId === room.id && ws.readyState === 1) {
        send(ws, 'gandengyan:state', publicRoom(room, client.id))
      }
    }
  }

  return { bindClient, unbindClient, handleMessage }
}

function normalizeIdentity(identity) {
  if (!identity || typeof identity !== 'object') return {}
  return {
    name: cleanName(identity.displayName || identity.username || identity.name),
    address: String(identity.address || '').trim().slice(0, 64),
  }
}

function send(ws, event, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ event, data }))
  }
}

function scheduleBots(room, broadcastRoom) {
  setTimeout(() => {
    let moved = false
    let guard = 0
    while (room.status === 'playing' && guard < 8 && botStep(room)) {
      moved = true
      guard += 1
    }
    if (moved) broadcastRoom(room)
  }, 650)
}

function createRoom({ roomId, ownerId, ownerName, ownerAddress }) {
  const room = {
    id: roomId,
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
        score: 0,
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
    log: ['房间已创建'],
    winnerSeat: null,
    updatedAt: Date.now(),
  }
  syncBots(room)
  return room
}

function setRoomSettings(room, settings) {
  if (room.status !== 'lobby') throw new Error('游戏开始后不能修改设置')
  room.settings.decks = clamp(Number(settings.decks) || 1, 1, 2)
  room.settings.seats = clamp(Number(settings.seats) || 2, 2, 6)
  room.settings.bots = clamp(Number(settings.bots) || 0, 0, room.settings.seats - 1)
  syncBots(room)
  room.updatedAt = Date.now()
}

function joinRoom(room, playerId, name, address) {
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
    score: 0,
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

function leaveRoom(room, playerId) {
  const player = room.players.find(item => item.id === playerId)
  if (!player || player.bot) return
  player.connected = false
  if (room.status === 'lobby') {
    room.players = room.players.filter(item => item.id !== playerId)
    syncBots(room)
  }
  room.updatedAt = Date.now()
}

function startGame(room) {
  if (room.players.filter(player => !player.bot).length < 1) {
    throw new Error('至少需要 1 名真人玩家')
  }
  syncBots(room)
  room.deck = shuffle(createDeck(room.settings.decks))
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
  const starter = chooseStarter(room)
  room.currentSeat = starter.seat
  room.lastWinnerSeat = null
  room.log = [`新一局开始，${starter.name} 先出牌`]
  if (room.diceRolls.length > 0) {
    room.log.unshift(`骰子结果：${room.diceRolls.map(roll => `${roll.name} ${roll.value}`).join('，')}`)
  }
  room.updatedAt = Date.now()
}

function playCards(room, playerId, cardIds) {
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
  room.passSeats = []
  room.lastWinnerSeat = player.seat
  if (combo.type === 'bomb') {
    room.bombCount += 1
    room.baseScore *= 2
  }
  room.log.unshift(`${player.name} 出 ${combo.label} ${cards.map(labelCard).join(' ')}${combo.type === 'bomb' ? `，底分 ${room.baseScore}` : ''}`)
  if (player.hand.length === 0) {
    finishGame(room, player)
  } else {
    advanceTurn(room)
  }
  room.updatedAt = Date.now()
}

function passTurn(room, playerId) {
  const player = currentPlayer(room)
  if (!player || player.id !== playerId) throw new Error('还没轮到你')
  if (!room.table) throw new Error('领出时不能不要')
  if (!room.passSeats.includes(player.seat)) room.passSeats.push(player.seat)
  room.log.unshift(`${player.name} 不要`)
  const activeSeats = activePlayers(room).map(item => item.seat)
  const seatsToBeat = activeSeats.filter(seat => seat !== room.lastWinnerSeat)
  if (seatsToBeat.every(seat => room.passSeats.includes(seat))) {
    refillAfterRound(room)
    room.currentSeat = room.lastWinnerSeat
    room.table = null
    room.passSeats = []
    room.log.unshift('本轮结束，所有玩家各补 1 张，重新领出')
  } else {
    advanceTurn(room)
  }
  room.updatedAt = Date.now()
}

function botStep(room) {
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

function publicRoom(room, viewerId) {
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
      playedCards: player.playedCards,
      hand: player.id === viewerId ? player.hand.map(publicCard) : [],
    })),
  }
}

export function analyzeCards(cards) {
  if (!cards?.length) return null
  const jokerCount = cards.filter(isJoker).length
  const normals = cards.filter(card => !isJoker(card))
  if (normals.length === 0) return null
  const bomb = analyzeBomb(cards, normals, jokerCount)
  if (bomb) return bomb
  if (cards.length === 1 && jokerCount === 0) return makeCombo('single', cardValue(cards[0]), 1, [cardValue(cards[0])])
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
  for (let start = 0; start <= STRAIGHT_RANKS.length - cards.length; start += 1) {
    const values = STRAIGHT_RANKS.slice(start, start + cards.length).map(rank => RANK_VALUE.get(rank))
    if (cards.every((card, index) => isJoker(card) || cardValue(card) === values[index])) {
      return makeCombo('straight', values.at(-1), cards.length, values)
    }
  }
  return null
}

function analyzePairStraight(cards) {
  if (cards.length < 4 || cards.length % 2 !== 0) return null
  const pairCount = cards.length / 2
  for (let start = 0; start <= STRAIGHT_RANKS.length - pairCount; start += 1) {
    const pairValues = STRAIGHT_RANKS.slice(start, start + pairCount).map(rank => RANK_VALUE.get(rank))
    const values = pairValues.flatMap(value => [value, value])
    if (cards.every((card, index) => isJoker(card) || cardValue(card) === values[index])) {
      return makeCombo('pairStraight', pairValues.at(-1), cards.length, values)
    }
  }
  return null
}

function makeCombo(type, value, length, resolvedValues, pure = true) {
  return { type, value, length, resolvedValues, pure, label: labelCombo({ type, value, length, resolvedValues, pure }) }
}

function canBeat(combo, tableCombo) {
  if (!combo) return false
  if (!tableCombo) return true
  if (combo.type === 'bomb' && tableCombo.type !== 'bomb') return true
  if (combo.type !== tableCombo.type) return false
  if (combo.type === 'bomb') {
    if (combo.length !== tableCombo.length) return combo.length > tableCombo.length
    if (combo.value !== tableCombo.value) return combo.value > tableCombo.value
    return combo.pure && !tableCombo.pure
  }
  if (combo.length !== tableCombo.length) return false
  if (combo.type === 'single' || combo.type === 'pair') {
    return combo.value === nextValue(tableCombo.value) || combo.value === RANK_VALUE.get('2')
  }
  return combo.value === nextValue(tableCombo.value)
}

function syncBots(room) {
  const seats = room.settings.seats
  room.players = room.players.filter(player => player.seat < seats && (!player.bot || room.status === 'lobby'))
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
    id: `bot-${seat}-${Math.random().toString(36).slice(2, 8)}`,
    address: '',
    name: `人机${seat + 1}`,
    bot: true,
    seat,
    connected: true,
    hand: [],
    score: 0,
    playedCards: 0,
  }
}

function chooseStarter(room) {
  if (room.previousWinnerSeat !== null) {
    room.diceRolls = []
    return orderedPlayers(room).find(player => player.seat === room.previousWinnerSeat) || orderedPlayers(room)[0]
  }
  let candidates = orderedPlayers(room)
  let rolls = []
  while (candidates.length > 1) {
    rolls = candidates.map(player => ({ seat: player.seat, name: player.name, value: rollDice() }))
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
  room.roundResult = { winnerSeat: winner.seat, winnerName: winner.name, winnerGain, baseScore: room.baseScore, bombCount: room.bombCount, losers }
  room.log.unshift(`${winner.name} 获胜，赢 ${winnerGain} 分`)
}

function refillAfterRound(room) {
  for (const player of activePlayers(room)) {
    if (room.deck.length === 0) break
    player.hand.push(...draw(room, 1))
    sortHand(player.hand)
  }
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

function shuffle(cards) {
  const copy = [...cards]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
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
  const moves = sorted.filter(card => !isJoker(card)).map(card => [card])
  for (let size = 2; size <= Math.min(6, sorted.length); size += 1) {
    for (const cards of combinations(sorted, size)) {
      if (analyzeCards(cards)) moves.push(cards)
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

function combinations(cards, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix)
    return output
  }
  for (let index = start; index <= cards.length - (size - prefix.length); index += 1) {
    combinations(cards, size, index + 1, [...prefix, cards[index]], output)
  }
  return output
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
  return RANKS.find(rank => RANK_VALUE.get(rank) === value) || String(value)
}

function nextValue(value) {
  const index = RANKS.findIndex(rank => RANK_VALUE.get(rank) === value)
  if (index === -1 || index >= RANKS.length - 1) return null
  return RANK_VALUE.get(RANKS[index + 1])
}

function makeRoomId(rooms) {
  let id = ''
  do {
    id = Math.random().toString(36).slice(2, 8).toUpperCase()
  } while (rooms.has(id))
  return id
}

function cleanName(name) {
  return String(name || '玩家').trim().slice(0, 16) || '玩家'
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
