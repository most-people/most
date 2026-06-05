const SUITS = ['S', 'H', 'C', 'D']
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
const STRAIGHT_RANKS = RANKS.filter(rank => rank !== '2')
const RANK_VALUE = new Map(RANKS.map((rank, index) => [rank, index + 3]))
const INITIAL_HAND_SIZE = 5
const SEALED_PENALTY = 20
const INITIAL_SCORE = 1000

export function createGanDengYanRoom({
  roomCode,
  ownerAddress,
  ownerName,
  players = [],
  random = Math.random,
}) {
  const roomPlayers = normalizePlayers(players)
  if (!roomPlayers.some(player => player.address === normalizeAddress(ownerAddress))) {
    roomPlayers.unshift({
      address: normalizeAddress(ownerAddress),
      name: cleanName(ownerName),
    })
  }

  const room = {
    id: String(roomCode || '').toUpperCase(),
    ownerAddress: normalizeAddress(ownerAddress),
    status: 'lobby',
    seq: 1,
    players: roomPlayers.slice(0, 6).map((player, seat) => ({
      address: player.address,
      name: cleanName(player.name),
      seat,
      hand: [],
      handCount: 0,
      score: INITIAL_SCORE,
      playedCards: 0,
    })),
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
    random,
  }
  return publicGanDengYanRoom(room)
}

export function syncGanDengYanLobby(room, players = []) {
  const state = hydrateGanDengYanRoom(room)
  if (!state || state.status !== 'lobby') return state
  const currentScores = new Map(state.players.map(player => [player.address, player.score]))
  state.players = normalizePlayers(players)
    .slice(0, 6)
    .map((player, seat) => ({
      address: player.address,
      name: cleanName(player.name),
      seat,
      hand: [],
      handCount: 0,
      score: currentScores.get(player.address) ?? INITIAL_SCORE,
      playedCards: 0,
    }))
  state.seq += 1
  return publicGanDengYanRoom(state)
}

export function startGanDengYanRound(room, random = Math.random) {
  const state = hydrateGanDengYanRoom(room)
  if (!state || state.players.length < 2) {
    throw new Error('至少需要 2 名玩家')
  }

  state.deck = shuffle(createDeck(), random)
  state.discard = []
  state.table = null
  state.passSeats = []
  state.winnerSeat = null
  state.roundResult = null
  state.baseScore = 1
  state.bombCount = 0
  state.status = 'playing'
  for (const player of orderedPlayers(state)) {
    player.hand = draw(state, INITIAL_HAND_SIZE)
    player.handCount = player.hand.length
    player.playedCards = 0
    sortHand(player.hand)
  }
  const starter = chooseStarter(state, random)
  state.currentSeat = starter.seat
  state.lastWinnerSeat = null
  state.log = [`新一局开始，${starter.name} 先出牌`]
  if (state.diceRolls.length > 0) {
    state.log.unshift(
      `骰子结果：${state.diceRolls
        .map(roll => `${roll.name} ${roll.value}`)
        .join('，')}`
    )
  }
  state.seq += 1
  return publicGanDengYanRoom(state)
}

export function playGanDengYanCards(room, address, cardIds) {
  const state = hydrateGanDengYanRoom(room)
  const player = currentPlayer(state)
  const normalizedAddress = normalizeAddress(address)
  if (!player || player.address !== normalizedAddress) {
    return { ok: false, error: '还没轮到你', state: publicGanDengYanRoom(state) }
  }

  const cards = cardIds.map(id => player.hand.find(card => card.id === id))
  if (cards.length === 0 || cards.some(card => !card)) {
    return { ok: false, error: '手牌不存在', state: publicGanDengYanRoom(state) }
  }
  const combo = analyzeCards(cards)
  if (!combo) {
    return { ok: false, error: '这个牌型不合法', state: publicGanDengYanRoom(state) }
  }
  if (!canBeat(combo, state.table?.combo)) {
    return { ok: false, error: '出的牌压不过上一手', state: publicGanDengYanRoom(state) }
  }

  cards.sort(compareCards)
  player.hand = player.hand.filter(card => !cardIds.includes(card.id))
  player.handCount = player.hand.length
  player.playedCards += cards.length
  state.discard.push(...cards)
  state.table = { seat: player.seat, playerName: player.name, cards, combo }
  state.passSeats = []
  state.lastWinnerSeat = player.seat
  if (combo.type === 'bomb') {
    state.bombCount += 1
    state.baseScore *= 2
  }
  state.log.unshift(
    `${player.name} 出 ${combo.label} ${cards.map(labelCard).join(' ')}${
      combo.type === 'bomb' ? `，底分 ${state.baseScore}` : ''
    }`
  )
  if (player.hand.length === 0) {
    finishGame(state, player)
  } else {
    advanceTurn(state)
  }
  state.seq += 1
  return { ok: true, state: publicGanDengYanRoom(state) }
}

export function passGanDengYanTurn(room, address) {
  const state = hydrateGanDengYanRoom(room)
  const player = currentPlayer(state)
  const normalizedAddress = normalizeAddress(address)
  if (!player || player.address !== normalizedAddress) {
    return { ok: false, error: '还没轮到你', state: publicGanDengYanRoom(state) }
  }
  if (!state.table) {
    return { ok: false, error: '领出时不能不要', state: publicGanDengYanRoom(state) }
  }

  if (!state.passSeats.includes(player.seat)) state.passSeats.push(player.seat)
  state.log.unshift(`${player.name} 不要`)
  const activeSeats = activePlayers(state).map(item => item.seat)
  const seatsToBeat = activeSeats.filter(seat => seat !== state.lastWinnerSeat)
  if (seatsToBeat.every(seat => state.passSeats.includes(seat))) {
    refillAfterRound(state)
    state.currentSeat = state.lastWinnerSeat
    state.table = null
    state.passSeats = []
    state.log.unshift('本轮结束，所有玩家各补 1 张，重新领出')
  } else {
    advanceTurn(state)
  }
  state.seq += 1
  return { ok: true, state: publicGanDengYanRoom(state) }
}

export function publicGanDengYanRoom(room) {
  if (!room) return null
  return {
    id: room.id,
    ownerAddress: room.ownerAddress,
    status: room.status,
    seq: Number(room.seq || 1),
    deck: Array.isArray(room.deck) ? room.deck.map(publicCard) : [],
    deckCount: room.deck?.length || Number(room.deckCount || 0),
    discard: Array.isArray(room.discard) ? room.discard.map(publicCard) : [],
    discardCount: room.discard?.length || Number(room.discardCount || 0),
    currentSeat: Number(room.currentSeat || 0),
    lastWinnerSeat:
      room.lastWinnerSeat === null || room.lastWinnerSeat === undefined
        ? null
        : Number(room.lastWinnerSeat),
    previousWinnerSeat:
      room.previousWinnerSeat === null || room.previousWinnerSeat === undefined
        ? null
        : Number(room.previousWinnerSeat),
    baseScore: Number(room.baseScore || 1),
    bombCount: Number(room.bombCount || 0),
    diceRolls: Array.isArray(room.diceRolls) ? room.diceRolls : [],
    roundResult: room.roundResult || null,
    table: room.table
      ? { ...room.table, cards: room.table.cards.map(publicCard) }
      : null,
    passSeats: Array.isArray(room.passSeats) ? room.passSeats : [],
    winnerSeat:
      room.winnerSeat === null || room.winnerSeat === undefined
        ? null
        : Number(room.winnerSeat),
    log: Array.isArray(room.log) ? room.log.slice(0, 18) : [],
    players: orderedPlayers(room).map(player => ({
      address: player.address,
      name: player.name,
      seat: player.seat,
      handCount: player.hand?.length ?? player.handCount ?? 0,
      score: Number(player.score ?? INITIAL_SCORE),
      playedCards: Number(player.playedCards || 0),
      hand: Array.isArray(player.hand) ? player.hand.map(publicCard) : [],
    })),
  }
}

export function hydrateGanDengYanRoom(input) {
  if (!input || typeof input !== 'object') return null
  return {
    id: String(input.id || '').toUpperCase(),
    ownerAddress: normalizeAddress(input.ownerAddress),
    status:
      input.status === 'playing' || input.status === 'finished'
        ? input.status
        : 'lobby',
    seq: Number(input.seq || 1),
    players: Array.isArray(input.players)
      ? input.players.map(normalizeRoundPlayer).filter(Boolean)
      : [],
    deck: Array.isArray(input.deck) ? input.deck.map(expandCompactCard).filter(Boolean) : [],
    discard: Array.isArray(input.discard)
      ? input.discard.map(normalizeCard).filter(Boolean)
      : [],
    table:
      input.table && typeof input.table === 'object'
        ? {
            ...input.table,
            cards: Array.isArray(input.table.cards)
              ? input.table.cards.map(normalizeCard).filter(Boolean)
              : [],
          }
        : null,
    currentSeat: Number(input.currentSeat || 0),
    lastWinnerSeat:
      input.lastWinnerSeat === null || input.lastWinnerSeat === undefined
        ? null
        : Number(input.lastWinnerSeat),
    previousWinnerSeat:
      input.previousWinnerSeat === null || input.previousWinnerSeat === undefined
        ? null
        : Number(input.previousWinnerSeat),
    passSeats: Array.isArray(input.passSeats) ? input.passSeats.map(Number) : [],
    baseScore: Number(input.baseScore || 1),
    bombCount: Number(input.bombCount || 0),
    diceRolls: Array.isArray(input.diceRolls) ? input.diceRolls : [],
    roundResult: input.roundResult || null,
    log: Array.isArray(input.log) ? input.log.map(String) : [],
    winnerSeat:
      input.winnerSeat === null || input.winnerSeat === undefined
        ? null
        : Number(input.winnerSeat),
  }
}

export function analyzeCards(cards) {
  if (!cards?.length) return null
  cards = [...cards].sort(compareCards)
  const jokerCount = cards.filter(isJoker).length
  const normals = cards.filter(card => !isJoker(card))
  if (normals.length === 0) return null
  const bomb = analyzeBomb(cards, normals, jokerCount)
  if (bomb) return bomb
  if (cards.length === 1 && jokerCount === 0) {
    return makeCombo('single', cardValue(cards[0]), 1, [cardValue(cards[0])])
  }
  if (cards.length === 2 && canRepresentSameRank(normals, jokerCount)) {
    const value = sameRankValue(normals)
    return makeCombo('pair', value, 2, [value, value])
  }
  return analyzeStraight(cards) || analyzePairStraight(cards)
}

function analyzeBomb(cards, normals, jokerCount) {
  if (cards.length < 3 || !canRepresentSameRank(normals, jokerCount)) return null
  const value = sameRankValue(normals)
  return makeCombo(
    'bomb',
    value,
    cards.length,
    Array(cards.length).fill(value),
    jokerCount === 0
  )
}

function analyzeStraight(cards) {
  if (cards.length < 3) return null
  const jokerCount = cards.filter(isJoker).length
  const normals = cards.filter(card => !isJoker(card))
  for (let start = 0; start <= STRAIGHT_RANKS.length - cards.length; start += 1) {
    const values = STRAIGHT_RANKS.slice(start, start + cards.length).map(rank =>
      RANK_VALUE.get(rank)
    )
    const remaining = [...values]
    let matched = 0
    for (const card of normals) {
      const idx = remaining.indexOf(cardValue(card))
      if (idx !== -1) {
        remaining.splice(idx, 1)
        matched += 1
      }
    }
    if (matched + jokerCount === cards.length && remaining.length === jokerCount) {
      return makeCombo('straight', values.at(-1), cards.length, values)
    }
  }
  return null
}

function analyzePairStraight(cards) {
  if (cards.length < 4 || cards.length % 2 !== 0) return null
  const pairCount = cards.length / 2
  const jokerCount = cards.filter(isJoker).length
  const normals = cards.filter(card => !isJoker(card))
  for (let start = 0; start <= STRAIGHT_RANKS.length - pairCount; start += 1) {
    const pairValues = STRAIGHT_RANKS.slice(start, start + pairCount).map(rank =>
      RANK_VALUE.get(rank)
    )
    const remaining = pairValues.flatMap(value => [value, value])
    let matched = 0
    for (const card of normals) {
      const idx = remaining.indexOf(cardValue(card))
      if (idx !== -1) {
        remaining.splice(idx, 1)
        matched += 1
      }
    }
    if (matched + jokerCount === cards.length && remaining.length === jokerCount) {
      const values = pairValues.flatMap(value => [value, value])
      return makeCombo('pairStraight', pairValues.at(-1), cards.length, values)
    }
  }
  return null
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
    if (combo.value !== tableCombo.value) return combo.value > tableCombo.value
    return combo.pure && !tableCombo.pure
  }
  if (combo.length !== tableCombo.length) return false
  if (combo.type === 'single' || combo.type === 'pair') {
    return (
      combo.value === nextValue(tableCombo.value) ||
      (combo.value === RANK_VALUE.get('2') && tableCombo.value !== RANK_VALUE.get('2'))
    )
  }
  return combo.value === nextValue(tableCombo.value)
}

function normalizePlayers(players) {
  const seen = new Set()
  return players
    .map(player => ({
      address: normalizeAddress(player.address),
      name: cleanName(player.name),
      publicKey: String(player.publicKey || ''),
    }))
    .filter(player => {
      if (!player.address || seen.has(player.address)) return false
      seen.add(player.address)
      return true
    })
}

function normalizeRoundPlayer(input) {
  const address = normalizeAddress(input.address)
  if (!address) return null
  return {
    address,
    name: cleanName(input.name),
    seat: Number(input.seat || 0),
    hand: Array.isArray(input.hand) ? input.hand.map(normalizeCard).filter(Boolean) : [],
    handCount: Number(input.handCount || 0),
    score: Number(input.score ?? INITIAL_SCORE),
    playedCards: Number(input.playedCards || 0),
  }
}

function normalizeCard(card) {
  if (!card || typeof card !== 'object') return null
  const rank = String(card.rank || '')
  const suit = String(card.suit || '')
  if (!RANK_VALUE.has(rank) && rank !== 'SJ' && rank !== 'BJ') return null
  if (!SUITS.includes(suit) && suit !== 'Joker') return null
  return {
    id: String(card.id || `${suit}-${rank}`),
    suit,
    rank,
    label: card.label || labelCard({ suit, rank }),
    color: card.color || cardColor({ suit, rank }),
  }
}

function chooseStarter(room, random) {
  if (room.previousWinnerSeat !== null) {
    room.diceRolls = []
    return orderedPlayers(room).find(player => player.seat === room.previousWinnerSeat) || orderedPlayers(room)[0]
  }
  let candidates = orderedPlayers(room)
  let rolls = []
  while (candidates.length > 1) {
    rolls = candidates.map(player => ({
      seat: player.seat,
      name: player.name,
      value: rollDice(random),
    }))
    const max = Math.max(...rolls.map(roll => roll.value))
    const winners = rolls.filter(roll => roll.value === max)
    if (winners.length === 1) {
      room.diceRolls = rolls
      return candidates.find(player => player.seat === winners[0].seat)
    }
    candidates = candidates.filter(player =>
      winners.some(roll => roll.seat === player.seat)
    )
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
    const loss = sealed ? SEALED_PENALTY : player.hand.length * room.baseScore * 0.5
    player.score -= loss
    winnerGain += loss
    losers.push({
      seat: player.seat,
      name: player.name,
      loss,
      sealed,
      cardsLeft: player.hand.length,
    })
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

function refillAfterRound(room) {
  for (const player of activePlayers(room)) {
    if (room.deck.length === 0) break
    player.hand.push(...draw(room, 1))
    player.handCount = player.hand.length
    sortHand(player.hand)
  }
}

function createDeck() {
  const cards = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${suit}-${rank}`, suit, rank })
    }
  }
  cards.push({ id: 'SJ', suit: 'Joker', rank: 'SJ' })
  cards.push({ id: 'BJ', suit: 'Joker', rank: 'BJ' })
  return cards.map(publicCard)
}

function shuffle(cards, random) {
  const copy = [...cards]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
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
  return [...(room?.players || [])].sort((a, b) => a.seat - b.seat)
}

function advanceTurn(room) {
  const seats = activePlayers(room).map(player => player.seat)
  const currentIndex = seats.indexOf(room.currentSeat)
  room.currentSeat = seats[(currentIndex + 1) % seats.length]
}

function canRepresentSameRank(normals, jokerCount = 0) {
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

function expandCompactCard(input) {
  if (typeof input === 'string') {
    const [suit, rank] = input.split('-')
    return normalizeCard({ id: input, suit, rank })
  }
  return normalizeCard(input)
}

function publicCard(card) {
  return {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    label: labelCard(card),
    color: cardColor(card),
  }
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
  return card.suit === 'H' || card.suit === 'D' || card.rank === 'BJ'
    ? 'red'
    : 'black'
}

function labelCombo(combo) {
  const resolved = combo.resolvedValues?.length
    ? `（${combo.resolvedValues.map(valueLabel).join(' ')}）`
    : ''
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

function rollDice(random) {
  return Math.floor(random() * 6) + 1
}

function normalizeAddress(value) {
  const address = String(value || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : ''
}

function cleanName(name) {
  return String(name || '玩家').trim().slice(0, 16) || '玩家'
}
