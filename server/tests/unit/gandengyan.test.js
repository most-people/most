import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  analyzeCards,
  applyGameEvent,
  botStep,
  createRoom,
  joinRoom,
  makeGameChannelName,
  makeGameEvent,
  passTurn,
  playCards,
  reduceGameEvents,
  setRoomSettings,
  startGame,
} from '../../src/games/gandengyan.js'

function card(rank, suit = 'S') {
  return { id: `${suit}-${rank}`, rank, suit }
}

describe('Gan Deng Yan rules', () => {
  it('recognizes single cards', () => {
    const combo = analyzeCards([card('7')])
    assert.strictEqual(combo.type, 'single')
    assert.strictEqual(combo.value, 7)
  })

  it('recognizes pairs and bombs', () => {
    const pair = analyzeCards([card('J', 'S'), card('J', 'H')])
    const bomb = analyzeCards([card('9', 'S'), card('9', 'H'), card('9', 'D')])

    assert.strictEqual(pair.type, 'pair')
    assert.strictEqual(bomb.type, 'bomb')
  })

  it('lets a same-length pure bomb beat a joker-assisted bomb', () => {
    const owner = '0x0000000000000000000000000000000000000501'
    const guest = '0x0000000000000000000000000000000000000502'
    const room = createRoom({
      roomId: 'BOMB31',
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })
    joinRoom(room, guest, '朋友', guest)
    setRoomSettings(room, { decks: 1, seats: 2, bots: 0 })
    startGame(room, 'pure-bomb-over-joker-bomb')

    const ownerPlayer = room.players.find(player => player.id === owner)
    const guestPlayer = room.players.find(player => player.id === guest)
    ownerPlayer.hand = [card('3', 'S'), card('3', 'H'), card('3', 'D'), card('5', 'S')]
    guestPlayer.hand = [card('2', 'S'), card('2', 'H'), card('BJ', 'Joker'), card('6', 'H')]
    ownerPlayer.playedCards = 0
    guestPlayer.playedCards = 0
    room.currentSeat = guestPlayer.seat
    room.table = null

    playCards(room, guest, guestPlayer.hand.slice(0, 3).map(item => item.id))
    playCards(room, owner, ownerPlayer.hand.slice(0, 3).map(item => item.id))

    assert.equal(room.table.combo.type, 'bomb')
    assert.equal(room.table.combo.pure, true)
    assert.deepEqual(room.table.combo.resolvedValues, [3, 3, 3])
  })

  it('recognizes straights and pair straights', () => {
    const straight = analyzeCards([card('7'), card('8'), card('9')])
    const pairStraight = analyzeCards([
      card('7', 'S'),
      card('7', 'H'),
      card('8', 'S'),
      card('8', 'H'),
    ])

    assert.strictEqual(straight.type, 'straight')
    assert.strictEqual(pairStraight.type, 'pairStraight')
  })

  it('rejects joker-only selections', () => {
    assert.strictEqual(analyzeCards([card('SJ', 'Joker'), card('BJ', 'Joker')]), null)
  })

  it('uses the shared game channel naming contract', () => {
    assert.strictEqual(makeGameChannelName('a1b2c3'), 'game-gdy-A1B2C3')
  })

  it('replays structured game events from channel messages', () => {
    const roomCode = 'A1B2C3'
    const owner = '0x0000000000000000000000000000000000000001'
    const guest = '0x0000000000000000000000000000000000000002'
    const messages = [
      channelMessage(owner, '房主', makeGameEvent({
        roomCode,
        event: 'create',
        eventId: 'create-1',
        payload: { name: '房主', address: owner },
      }), 1),
      channelMessage(guest, '朋友', makeGameEvent({
        roomCode,
        event: 'join',
        eventId: 'join-1',
        payload: { name: '朋友', address: guest },
      }), 2),
      channelMessage(owner, '房主', makeGameEvent({
        roomCode,
        event: 'settings',
        eventId: 'settings-1',
        payload: { settings: { decks: 1, seats: 2, bots: 0 } },
      }), 3),
      channelMessage(owner, '房主', makeGameEvent({
        roomCode,
        event: 'start',
        eventId: 'start-1',
        payload: { seed: 'fixed-seed' },
      }), 4),
    ]

    const result = reduceGameEvents(messages, owner, roomCode)

    assert.equal(result.errors.length, 0)
    assert.equal(result.publicRoom.id, roomCode)
    assert.equal(result.publicRoom.players.length, 2)
    assert.equal(result.publicRoom.status, 'playing')
    assert.equal(result.publicRoom.players.find(player => player.id === owner).hand.length, 5)
    assert.equal(result.publicRoom.players.find(player => player.id === guest).hand.length, 0)
  })

  it('lets a seated non-owner drive a bot turn and ignores stale bot events', () => {
    const roomCode = 'BOT123'
    const owner = '0x0000000000000000000000000000000000000101'
    const guest = '0x0000000000000000000000000000000000000102'
    const room = createRoom({
      roomId: roomCode,
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })

    setRoomSettings(room, { decks: 1, seats: 4, bots: 2 })
    joinRoom(room, guest, '朋友', guest)
    startGame(room, 'bot-stale-guard')

    const firstBot = room.players.find(player => player.seat === 2)
    const secondBot = room.players.find(player => player.seat === 3)
    assert.equal(firstBot.bot, true)
    assert.equal(secondBot.bot, true)

    room.currentSeat = firstBot.seat
    room.table = null
    room.lastAction = {
      id: 'human-play',
      type: 'play',
      seat: 1,
      playerName: '朋友',
    }

    const firstBotHandCount = firstBot.hand.length
    applyGameEvent(room, {
      event: 'bot',
      eventId: 'bot-1',
      roomCode,
      actorId: guest,
      actorName: '朋友',
      payload: { seat: firstBot.seat, afterActionId: 'human-play' },
    })

    assert.equal(room.lastAction.id, 'bot-1')
    assert.equal(room.currentSeat, secondBot.seat)
    assert.ok(firstBot.hand.length < firstBotHandCount)

    const secondBotHandCount = secondBot.hand.length
    applyGameEvent(room, {
      event: 'bot',
      eventId: 'bot-stale',
      roomCode,
      actorId: guest,
      actorName: '朋友',
      payload: { seat: firstBot.seat, afterActionId: 'human-play' },
    })

    assert.equal(room.lastAction.id, 'bot-1')
    assert.equal(room.currentSeat, secondBot.seat)
    assert.equal(secondBot.hand.length, secondBotHandCount)
  })

  it('plays 50 human and bot turns without stalling', () => {
    const owner = '0x0000000000000000000000000000000000000201'
    const room = createRoom({
      roomId: 'LONG50',
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })
    startGame(room, 'long-run-0')

    let gameCount = 0
    for (let turn = 0; turn < 50; turn += 1) {
      if (room.status !== 'playing') {
        gameCount += 1
        startGame(room, `long-run-${gameCount}`)
      }

      const before = roomProgressKey(room)
      const current = room.players.find(player => player.seat === room.currentSeat)
      if (current.bot) {
        botStep(room)
      } else {
        playHumanTurn(room, current.id)
      }
      const after = roomProgressKey(room)

      assert.notEqual(after, before, `turn ${turn + 1} did not advance`)
    }
  })

  it('does not draw cards when everyone passes', () => {
    const owner = '0x0000000000000000000000000000000000000601'
    const guest = '0x0000000000000000000000000000000000000602'
    const room = createRoom({
      roomId: 'PASS01',
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })
    joinRoom(room, guest, '朋友', guest)
    setRoomSettings(room, { decks: 1, seats: 2, bots: 0 })
    startGame(room, 'no-draw-after-pass')

    const ownerPlayer = room.players.find(player => player.id === owner)
    const guestPlayer = room.players.find(player => player.id === guest)
    ownerPlayer.hand = [card('3', 'S'), card('4', 'S')]
    guestPlayer.hand = [card('5', 'H'), card('6', 'H')]
    room.deck = [card('7', 'D'), card('8', 'D')]
    ownerPlayer.playedCards = 0
    guestPlayer.playedCards = 0
    room.currentSeat = ownerPlayer.seat
    room.table = null

    playCards(room, owner, [ownerPlayer.hand[0].id])
    const ownerHandCount = ownerPlayer.hand.length
    const guestHandCount = guestPlayer.hand.length
    const deckCount = room.deck.length

    passTurn(room, guest)

    assert.equal(room.table, null)
    assert.equal(room.currentSeat, ownerPlayer.seat)
    assert.equal(ownerPlayer.hand.length, ownerHandCount)
    assert.equal(guestPlayer.hand.length, guestHandCount)
    assert.equal(room.deck.length, deckCount)
    assert.equal(room.log[0], '本轮结束，重新领出')
  })

  it('starts each player at 1000 and carries scores into the next round', () => {
    const owner = '0x0000000000000000000000000000000000000301'
    const guest = '0x0000000000000000000000000000000000000302'
    const room = createRoom({
      roomId: 'SCORE1',
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })
    joinRoom(room, guest, '朋友', guest)
    setRoomSettings(room, { decks: 1, seats: 2, bots: 0 })

    assert.equal(room.players.find(player => player.id === owner).score, 1000)
    assert.equal(room.players.find(player => player.id === guest).score, 1000)

    startGame(room, 'score-carry-1')
    const ownerPlayer = room.players.find(player => player.id === owner)
    const guestPlayer = room.players.find(player => player.id === guest)
    ownerPlayer.hand = [card('3', 'S')]
    guestPlayer.hand = [card('4', 'H'), card('5', 'H')]
    ownerPlayer.playedCards = 0
    guestPlayer.playedCards = 0
    room.currentSeat = ownerPlayer.seat
    room.table = null

    playCards(room, owner, [ownerPlayer.hand[0].id])

    assert.equal(room.status, 'finished')
    assert.equal(ownerPlayer.score, 1015)
    assert.equal(guestPlayer.score, 985)

    startGame(room, 'score-carry-2')

    assert.equal(ownerPlayer.score, 1015)
    assert.equal(guestPlayer.score, 985)
  })

  it('carries bot scores into the next round', () => {
    const owner = '0x0000000000000000000000000000000000000311'
    const room = createRoom({
      roomId: 'BOTSC1',
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })

    startGame(room, 'bot-score-carry-1')
    const ownerPlayer = room.players.find(player => player.id === owner)
    const botPlayer = room.players.find(player => player.bot)
    ownerPlayer.hand = [card('3', 'S')]
    botPlayer.hand = [card('4', 'H'), card('5', 'H')]
    ownerPlayer.playedCards = 1
    botPlayer.playedCards = 1
    room.currentSeat = ownerPlayer.seat
    room.table = null

    playCards(room, owner, [ownerPlayer.hand[0].id])

    assert.equal(room.status, 'finished')
    assert.equal(ownerPlayer.score, 1002)
    assert.equal(botPlayer.score, 998)

    startGame(room, 'bot-score-carry-2')

    const nextRoundBot = room.players.find(player => player.bot)
    assert.equal(nextRoundBot.score, 998)
    assert.equal(nextRoundBot.id, botPlayer.id)
  })

  it('records leave scores and lets only the owner reset all scores to 1000', () => {
    const owner = '0x0000000000000000000000000000000000000401'
    const guest = '0x0000000000000000000000000000000000000402'
    const room = createRoom({
      roomId: 'RESET1',
      ownerId: owner,
      ownerName: '房主',
      ownerAddress: owner,
    })
    joinRoom(room, guest, '朋友', guest)
    setRoomSettings(room, { decks: 1, seats: 2, bots: 0 })
    startGame(room, 'leave-score-1')
    room.players.find(player => player.id === owner).score = 1120
    const guestPlayer = room.players.find(player => player.id === guest)
    guestPlayer.score = 930

    applyGameEvent(room, {
      event: 'leave',
      eventId: 'leave-1',
      roomCode: 'RESET1',
      actorId: guest,
      actorName: '朋友',
      payload: {},
    })

    assert.equal(guestPlayer.connected, false)
    assert.equal(guestPlayer.leftScore, 930)
    assert.equal(guestPlayer.score, 930)

    assert.throws(() => applyGameEvent(room, {
      event: 'resetScores',
      eventId: 'reset-bad',
      roomCode: 'RESET1',
      actorId: guest,
      actorName: '朋友',
      payload: {},
    }), /只有房主可以操作/)

    applyGameEvent(room, {
      event: 'resetScores',
      eventId: 'reset-good',
      roomCode: 'RESET1',
      actorId: owner,
      actorName: '房主',
      payload: {},
    })

    assert.equal(room.players.find(player => player.id === owner).score, 1000)
    assert.equal(guestPlayer.score, 1000)
    assert.equal(guestPlayer.leftScore, 930)
  })
})

function channelMessage(author, authorName, event, timestamp) {
  return {
    author,
    authorName,
    content: JSON.stringify(event),
    timestamp,
  }
}

function roomProgressKey(room) {
  return JSON.stringify({
    status: room.status,
    currentSeat: room.currentSeat,
    lastActionId: room.lastAction?.id,
    deckCount: room.deck.length,
    hands: room.players.map(player => [player.seat, player.hand.length, player.playedCards]),
  })
}

function playHumanTurn(room, playerId) {
  if (tryPlaySingle(room, playerId)) return
  if (room.status !== 'playing') return
  if (room.table) {
    passTurn(room, playerId)
    return
  }

  const player = room.players.find(item => item.id === playerId)
  if (player?.hand.length) {
    playCards(room, playerId, player.hand.map(card => card.id))
    return
  }
  throw new Error('human player has no legal move')
}

function tryPlaySingle(room, playerId) {
  const player = room.players.find(item => item.id === playerId)
  const candidates = player?.hand.filter(card => card.rank !== 'SJ' && card.rank !== 'BJ') || []
  for (const card of candidates) {
    try {
      playCards(room, playerId, [card.id])
      return true
    } catch {}
  }
  return false
}
