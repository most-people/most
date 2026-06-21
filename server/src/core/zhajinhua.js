import {
  createEventId as createSharedEventId,
  normalizeAddress,
  normalizeAvatar,
  normalizeRoomCode as normalizeSharedRoomCode,
  shortAddress,
} from './shared.js'

export const ZHJ_INITIAL_CHIPS = 1000
export const ZHJ_ANTE = 10
export const ZHJ_MIN_PLAYERS = 2
export const ZHJ_MAX_PLAYERS = 5
export const ZHJ_RAISE_STEPS = [10, 20, 50, 100]

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['D', 'C', 'H', 'S']
const RANK_VALUE = new Map(RANKS.map((rank, index) => [rank, index + 2]))
const SUIT_VALUE = new Map(SUITS.map((suit, index) => [suit, index + 1]))

const CATEGORY = {
  high: 1,
  pair: 2,
  straight: 3,
  flush: 4,
  straightFlush: 5,
  triple: 6,
}

const CATEGORY_LABEL = {
  [CATEGORY.high]: '散牌',
  [CATEGORY.pair]: '对子',
  [CATEGORY.straight]: '顺子',
  [CATEGORY.flush]: '金花',
  [CATEGORY.straightFlush]: '顺金',
  [CATEGORY.triple]: '豹子',
}

export function normalizeRoomCode(input) {
  return normalizeSharedRoomCode(input)
}

export function createEventId(prefix = 'zhajinhua') {
  return createSharedEventId(prefix)
}

export function createRoundId() {
  return createEventId('round')
}

export function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`)
    }
  }
  return deck
}

export function shuffleDeck(inputDeck = createDeck(), random = Math.random) {
  const deck = [...inputDeck]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export function parseCard(card) {
  const value = String(card || '').trim().toUpperCase()
  const suit = value.slice(-1)
  const rank = value.slice(0, -1)
  if (!RANK_VALUE.has(rank) || !SUIT_VALUE.has(suit)) {
    throw new Error(`Invalid card: ${card}`)
  }
  return {
    id: `${rank}${suit}`,
    rank,
    suit,
    rankValue: RANK_VALUE.get(rank),
    suitValue: SUIT_VALUE.get(suit),
  }
}

function compareNumberArrays(a, b) {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const left = a[i] || 0
    const right = b[i] || 0
    if (left !== right) return left - right
  }
  return 0
}

function getStraightHigh(rankValues) {
  const values = [...new Set(rankValues)].sort((a, b) => a - b)
  if (values.length !== 3) return 0
  if (values[0] === 2 && values[1] === 3 && values[2] === 14) return 3
  if (values[0] + 1 === values[1] && values[1] + 1 === values[2]) {
    return values[2]
  }
  return 0
}

export function evaluateHand(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) {
    throw new Error('炸金花手牌必须是 3 张牌')
  }

  const parsed = cards.map(parseCard)
  const ranks = parsed.map(card => card.rankValue)
  const rankCounts = new Map()
  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1)
  }

  const isFlush = new Set(parsed.map(card => card.suit)).size === 1
  const straightHigh = getStraightHigh(ranks)
  const sortedRanks = [...ranks].sort((a, b) => b - a)
  const tieSuit = Math.max(...parsed.map(card => card.suitValue))

  let category = CATEGORY.high
  let tiebreakers = sortedRanks

  if (rankCounts.size === 1) {
    category = CATEGORY.triple
    tiebreakers = [sortedRanks[0]]
  } else if (straightHigh && isFlush) {
    category = CATEGORY.straightFlush
    tiebreakers = [straightHigh]
  } else if (isFlush) {
    category = CATEGORY.flush
    tiebreakers = sortedRanks
  } else if (straightHigh) {
    category = CATEGORY.straight
    tiebreakers = [straightHigh]
  } else if (rankCounts.size === 2) {
    category = CATEGORY.pair
    const pairRank = [...rankCounts.entries()].find(([, count]) => count === 2)[0]
    const kicker = [...rankCounts.entries()].find(([, count]) => count === 1)[0]
    tiebreakers = [pairRank, kicker]
  }

  return {
    category,
    label: CATEGORY_LABEL[category],
    tiebreakers,
    tieSuit,
    cards: parsed.map(card => card.id),
  }
}

export function compareHands(leftCards, rightCards) {
  const left = evaluateHand(leftCards)
  const right = evaluateHand(rightCards)
  if (left.category !== right.category) return left.category - right.category
  const rankDiff = compareNumberArrays(left.tiebreakers, right.tiebreakers)
  if (rankDiff !== 0) return rankDiff
  return left.tieSuit - right.tieSuit
}

export function getHandLabel(cards) {
  return evaluateHand(cards).label
}

export function createPlayerActionEvent({
  roundId,
  action,
  amount,
  target,
}) {
  return {
    roundId,
    eventId: createEventId('action'),
    action,
    amount,
    target,
  }
}

export function canStartRound(players = []) {
  const eligible = players.filter(player => Number(player.chips) >= ZHJ_ANTE)
  return eligible.length >= ZHJ_MIN_PLAYERS && eligible.length <= ZHJ_MAX_PLAYERS
}

export function startRound({ roomCode, players, hostAddress, previousSeq = 0, previousWinner = '', roundId = createRoundId(), random = Math.random }) {
  const participants = players
    .filter(player => Number(player.chips) >= ZHJ_ANTE)
    .slice(0, ZHJ_MAX_PLAYERS)

  if (participants.length < ZHJ_MIN_PLAYERS) {
    throw new Error('至少需要 2 名有足够筹码的玩家')
  }

  const deck = shuffleDeck(createDeck(), random)
  const hands = {}
  const publicPlayers = participants.map((player, index) => {
    const cards = deck.slice(index * 3, index * 3 + 3)
    hands[player.address] = cards
    return {
      address: player.address,
      name: player.name,
      avatar: normalizeAvatar(player.avatar),
      publicKey: player.publicKey,
      chips: Number(player.chips) - ZHJ_ANTE,
      status: 'active',
      looked: false,
      bet: ZHJ_ANTE,
    }
  })

  let turnAddress
  const winnerNorm = normalizeAddress(previousWinner)
  const winnerIndex = winnerNorm
    ? publicPlayers.findIndex(p => normalizeAddress(p.address) === winnerNorm)
    : -1
  if (winnerIndex >= 0) {
    turnAddress = publicPlayers[winnerIndex].address
  } else {
    const randomIndex = Math.floor(random() * publicPlayers.length)
    turnAddress = publicPlayers[randomIndex].address
  }

  const round = {
    roomCode: normalizeRoomCode(roomCode),
    roundId,
    status: 'playing',
    host: normalizeAddress(hostAddress),
    seq: previousSeq + 1,
    startedAt: Date.now(),
    ante: ZHJ_ANTE,
    pot: ZHJ_ANTE * publicPlayers.length,
    currentBet: ZHJ_ANTE,
    turnAddress,
    players: publicPlayers,
    lastAction: '本局开始',
    winner: null,
    showdown: null,
    appliedEventIds: [],
    hands,
    actionCounts: {},
    compareReveal: {},
  }

  return round
}

export function getPublicRoundState(round) {
  if (!round) return null
  const publicState = { ...round }
  delete publicState.hands
  return clone(publicState)
}

export function hydrateRoundWithHands(publicRound, hands) {
  const round = normalizePublicRoundState(publicRound)
  if (!round || !hands || typeof hands !== 'object') return null
  return {
    ...round,
    hands: clone(hands),
  }
}

export function normalizePublicRoundState(input) {
  if (!input || typeof input !== 'object') return null
  if (!input.roundId || !Array.isArray(input.players)) return null
  return {
    roomCode: normalizeRoomCode(input.roomCode),
    roundId: String(input.roundId),
    status: input.status === 'finished' ? 'finished' : 'playing',
    host: normalizeAddress(input.host),
    seq: Number(input.seq) || 1,
    startedAt: Number(input.startedAt) || Date.now(),
    ante: Number(input.ante) || ZHJ_ANTE,
    pot: Math.max(0, Number(input.pot) || 0),
    currentBet: Math.max(0, Number(input.currentBet) || ZHJ_ANTE),
    turnAddress: normalizeAddress(input.turnAddress),
    players: input.players.map(normalizeRoundPlayer).filter(Boolean),
    lastAction: String(input.lastAction || ''),
    winner: input.winner ? normalizeAddress(input.winner) : null,
    showdown: input.showdown && typeof input.showdown === 'object' ? clone(input.showdown) : null,
    appliedEventIds: Array.isArray(input.appliedEventIds)
      ? input.appliedEventIds.map(String)
      : [],
    actionCounts: input.actionCounts && typeof input.actionCounts === 'object' ? clone(input.actionCounts) : {},
    compareReveal: input.compareReveal && typeof input.compareReveal === 'object' ? clone(input.compareReveal) : {},
    lastCompare: input.lastCompare && typeof input.lastCompare === 'object' ? clone(input.lastCompare) : null,
    finishedAt: input.finishedAt ? Number(input.finishedAt) : null,
  }
}

export function validatePlayerAction(round, actionEvent, authorAddress) {
  const state = normalizePublicRoundState(round)
  if (!state || state.status !== 'playing') return { ok: false, error: '当前没有进行中的牌局' }

  const author = normalizeAddress(authorAddress)
  const player = state.players.find(item => item.address === author)
  if (!player || player.status !== 'active') return { ok: false, error: '玩家不在本轮牌局中' }
  if (state.turnAddress !== author) return { ok: false, error: '还没有轮到你操作' }

  const action = actionEvent?.action
  if (!['look', 'call', 'raise', 'compare', 'fold'].includes(action)) {
    return { ok: false, error: '未知操作' }
  }

  if (action === 'look') {
    return player.looked ? { ok: false, error: '已经看过牌' } : { ok: true }
  }

  if (action === 'call') {
    return player.chips >= ZHJ_ANTE ? { ok: true } : { ok: false, error: '筹码不足，不能跟注' }
  }

  if (action === 'raise') {
    const amount = Number(actionEvent.amount)
    if (!ZHJ_RAISE_STEPS.includes(amount)) {
      return { ok: false, error: '加注档位无效' }
    }
    const need = state.currentBet + amount - player.bet
    return player.chips >= need ? { ok: true } : { ok: false, error: '筹码不足，不能加注' }
  }

  if (action === 'compare') {
    const target = normalizeAddress(actionEvent.target)
    const targetPlayer = state.players.find(item => item.address === target)
    if (!target || target === author || !targetPlayer || targetPlayer.status !== 'active') {
      return { ok: false, error: '请选择有效的比牌对象' }
    }
    const activePlayers = state.players.filter(p => p.status === 'active')
    const allActed = activePlayers.every(p => (state.actionCounts?.[p.address] || 0) >= 1)
    if (!allActed) {
      return { ok: false, error: '第一轮不能比牌，请先跟注或加注' }
    }
    const need = Math.max(0, state.currentBet - player.bet)
    return player.chips >= need ? { ok: true } : { ok: false, error: '筹码不足，不能比牌' }
  }

  return { ok: true }
}

export function applyPlayerAction(round, actionEvent, authorAddress) {
  const validation = validatePlayerAction(round, actionEvent, authorAddress)
  if (!validation.ok) return { ok: false, error: validation.error, state: round }

  const state = clone(round)
  const author = normalizeAddress(authorAddress)
  const player = state.players.find(item => item.address === author)
  const eventId = String(actionEvent.eventId)

  if (state.appliedEventIds?.includes(eventId)) {
    return { ok: true, state, duplicate: true }
  }

  if (!Array.isArray(state.appliedEventIds)) state.appliedEventIds = []
  state.appliedEventIds.push(eventId)

  if (actionEvent.action === 'look') {
    player.looked = true
    state.lastAction = `${player.name} 看牌`
    return advanceSeq(state)
  }

  if (actionEvent.action === 'fold') {
    player.status = 'folded'
    state.lastAction = `${player.name} 弃牌`
    incrementActionCount(state, author)
    return maybeFinishOrAdvance(state, author)
  }

  if (actionEvent.action === 'call') {
    player.chips -= ZHJ_ANTE
    player.bet += ZHJ_ANTE
    state.pot += ZHJ_ANTE
    state.lastAction = `${player.name} 跟注`
    incrementActionCount(state, author)
    return maybeFinishOrAdvance(state, author)
  }

  if (actionEvent.action === 'raise') {
    const amount = Number(actionEvent.amount)
    state.currentBet += amount
    payToCurrentBet(state, player)
    state.lastAction = `${player.name} 加注 ${amount}`
    incrementActionCount(state, author)
    return maybeFinishOrAdvance(state, author)
  }

  if (actionEvent.action === 'compare') {
    payToCurrentBet(state, player)
    const targetAddress = normalizeAddress(actionEvent.target)
    const targetPlayer = state.players.find(item => item.address === targetAddress)
    const initiatorLooked = player.looked
    const targetLookedBefore = targetPlayer.looked
    const diff = compareHands(state.hands?.[author] || [], state.hands?.[targetAddress] || [])
    const winner = diff >= 0 ? player : targetPlayer
    const loser = diff >= 0 ? targetPlayer : player
    loser.status = 'folded'
    loser.looked = true
    if (!state.compareReveal) state.compareReveal = {}
    const bothLooked = initiatorLooked && targetLookedBefore
    const neitherLooked = !initiatorLooked && !targetLookedBefore
    if (bothLooked) {
      state.compareReveal[author] = state.hands?.[targetAddress] || []
      state.compareReveal[targetAddress] = state.hands?.[author] || []
    } else if (neitherLooked) {
      state.compareReveal[loser.address] = state.hands?.[winner.address] || []
    } else {
      const lookedPlayer = initiatorLooked ? player : targetPlayer
      const unlookedPlayer = initiatorLooked ? targetPlayer : player
      state.compareReveal[lookedPlayer.address] = state.hands?.[unlookedPlayer.address] || []
      state.compareReveal[loser.address] = state.hands?.[winner.address] || []
    }
    state.lastCompare = {
      initiator: author,
      target: targetAddress,
      winner: winner.address,
      loser: loser.address,
      initiatorLooked,
      targetLooked: targetLookedBefore,
      timestamp: Date.now(),
    }
    state.lastAction = `${player.name} 与 ${targetPlayer.name} 比牌，${loser.name} 出局`
    incrementActionCount(state, author)
    return maybeFinishOrAdvance(state, author)
  }

  return { ok: false, error: '未知操作', state: round }
}

export function getActiveRoundPlayers(round) {
  return (round?.players || []).filter(player => player.status === 'active')
}

export function getAllowedActions(round, address) {
  const player = (round?.players || []).find(item => item.address === normalizeAddress(address))
  if (!round || round.status !== 'playing' || !player || player.status !== 'active') return []
  if (round.turnAddress !== player.address) return []

  const actions = []
  if (!player.looked) actions.push('look')
  if (validatePlayerAction(round, { action: 'call' }, player.address).ok) actions.push('call')
  if (ZHJ_RAISE_STEPS.some(amount => validatePlayerAction(round, { action: 'raise', amount }, player.address).ok)) {
    actions.push('raise')
  }
  if (getActiveRoundPlayers(round).length > 1) {
    const activePlayers = round.players.filter(p => p.status === 'active')
    const allActed = activePlayers.every(p => (round.actionCounts?.[p.address] || 0) >= 1)
    if (allActed) actions.push('compare')
  }
  actions.push('fold')
  return actions
}

export function chooseBotAction(round, address, random = Math.random) {
  const botAddress = normalizeAddress(address)
  const allowedActions = getAllowedActions(round, botAddress)
  if (allowedActions.length === 0) return null

  const player = (round?.players || []).find(item => item.address === botAddress)
  const handStrength = estimateHandStrength(round?.hands?.[botAddress])
  const activeOpponents = getActiveRoundPlayers(round).filter(
    item => item.address !== botAddress
  )

  function canCompare() {
    if (!allowedActions.includes('compare') || activeOpponents.length === 0) return false
    const target = activeOpponents[0].address
    return validatePlayerAction(round, { action: 'compare', target }, botAddress).ok
  }

  if (
    allowedActions.includes('look') &&
    !player?.looked &&
    random() < (handStrength >= 0.68 ? 0.52 : 0.82)
  ) {
    return { action: 'look' }
  }

  if (
    canCompare() &&
    activeOpponents.length === 1 &&
    handStrength >= 0.54 &&
    random() < 0.58
  ) {
    return { action: 'compare', target: activeOpponents[0].address }
  }

  if (allowedActions.includes('raise') && handStrength >= 0.7 && random() < 0.58) {
    const amount = chooseBotRaiseAmount(round, botAddress, handStrength, random)
    if (amount) return { action: 'raise', amount }
  }

  if (
    canCompare() &&
    activeOpponents.length > 0 &&
    handStrength >= 0.82 &&
    random() < 0.36
  ) {
    return {
      action: 'compare',
      target: activeOpponents[Math.floor(random() * activeOpponents.length)].address,
    }
  }

  if (
    allowedActions.includes('call') &&
    (handStrength >= 0.34 || random() < 0.62)
  ) {
    return { action: 'call' }
  }

  if (allowedActions.includes('fold')) return { action: 'fold' }
  return { action: allowedActions[0] }
}

function payToCurrentBet(state, player) {
  const need = Math.max(0, state.currentBet - player.bet)
  player.chips -= need
  player.bet += need
  state.pot += need
}

function incrementActionCount(state, address) {
  if (!state.actionCounts) state.actionCounts = {}
  state.actionCounts[address] = (state.actionCounts[address] || 0) + 1
}

function maybeFinishOrAdvance(state, fromAddress) {
  const active = getActiveRoundPlayers(state)
  if (active.length === 1) {
    return finishRound(state, active[0].address)
  }
  state.turnAddress = nextActiveAddress(state, fromAddress)
  return advanceSeq(state)
}

function finishRound(state, winnerAddress) {
  const winner = state.players.find(player => player.address === winnerAddress)
  const winAmount = state.pot
  if (winner) {
    winner.chips += state.pot
  }
  state.status = 'finished'
  state.winner = winnerAddress
  state.winAmount = winAmount
  state.turnAddress = ''
  state.showdown = state.hands ? clone(state.hands) : null
  state.lastAction = winner ? `${winner.name} 赢得 ${winAmount} 筹码` : '本局结束'
  state.pot = 0
  state.finishedAt = Date.now()
  return advanceSeq(state)
}

function nextActiveAddress(state, fromAddress) {
  const players = state.players
  const start = Math.max(
    0,
    players.findIndex(player => player.address === normalizeAddress(fromAddress))
  )
  for (let offset = 1; offset <= players.length; offset++) {
    const player = players[(start + offset) % players.length]
    if (player.status === 'active') return player.address
  }
  return ''
}

function advanceSeq(state) {
  state.seq = Number(state.seq || 0) + 1
  return { ok: true, state }
}

function estimateHandStrength(cards) {
  try {
    const result = evaluateHand(cards)
    const categoryScore = (result.category - CATEGORY.high) / (CATEGORY.triple - CATEGORY.high)
    const rankScore =
      result.tiebreakers.reduce((sum, value, index) => {
        return sum + (Number(value) || 0) / Math.pow(16, index + 1)
      }, 0) / 1.05
    return Math.max(0, Math.min(1, categoryScore * 0.72 + rankScore * 0.28))
  } catch {
    return 0.45
  }
}

function chooseBotRaiseAmount(round, address, handStrength, random) {
  const validAmounts = ZHJ_RAISE_STEPS.filter(amount =>
    validatePlayerAction(round, { action: 'raise', amount }, address).ok
  )
  if (validAmounts.length === 0) return 0

  const ceiling = handStrength >= 0.9 ? 100 : handStrength >= 0.8 ? 50 : 20
  const pool = validAmounts.filter(amount => amount <= ceiling)
  const choices = pool.length > 0 ? pool : validAmounts
  return choices[Math.floor(random() * choices.length)]
}

function normalizeRoundPlayer(input) {
  if (!input || typeof input !== 'object') return null
  const address = normalizeAddress(input.address)
  if (!address) return null
  return {
    address,
    name: String(input.name || shortAddress(address)).slice(0, 50),
    avatar: normalizeAvatar(input.avatar),
    publicKey: String(input.publicKey || ''),
    chips: Math.max(0, Number(input.chips) || 0),
    status: input.status === 'folded' ? 'folded' : 'active',
    looked: input.looked === true,
    bet: Math.max(0, Number(input.bet) || 0),
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
