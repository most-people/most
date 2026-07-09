import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  analyzeCards,
  createGanDengYanRoom,
  playGanDengYanCards,
  startGanDengYanRound,
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

  it('recognizes straights regardless of selection order', () => {
    const unsorted = analyzeCards([card('9'), card('7'), card('8')])
    assert.strictEqual(unsorted.type, 'straight')
    assert.strictEqual(unsorted.value, 9)

    const reverseUnsorted = analyzeCards([card('J'), card('9'), card('10')])
    assert.strictEqual(reverseUnsorted.type, 'straight')

    const shuffledPairStraight = analyzeCards([
      card('8', 'H'),
      card('7', 'S'),
      card('8', 'S'),
      card('7', 'H'),
    ])
    assert.strictEqual(shuffledPairStraight.type, 'pairStraight')
  })

  it('rejects joker-only selections', () => {
    assert.strictEqual(
      analyzeCards([card('SJ', 'Joker'), card('BJ', 'Joker')]),
      null
    )
  })

  it('starts each player at 1000 and carries scores into the next round', () => {
    const owner = '0x0000000000000000000000000000000000000301'
    const guest = '0x0000000000000000000000000000000000000302'
    const room = createGanDengYanRoom({
      roomCode: 'SCORE1',
      ownerAddress: owner,
      ownerName: '房主',
      players: [
        { address: owner, name: '房主' },
        { address: guest, name: '朋友' },
      ],
    })

    assert.equal(
      room.players.find(player => player.address === owner).score,
      1000
    )
    assert.equal(
      room.players.find(player => player.address === guest).score,
      1000
    )

    const round = startGanDengYanRound(room, makeDeterministicRandom())
    const ownerPlayer = round.players.find(player => player.address === owner)
    const guestPlayer = round.players.find(player => player.address === guest)
    ownerPlayer.hand = [card('3', 'S')]
    ownerPlayer.handCount = 1
    ownerPlayer.playedCards = 1
    guestPlayer.hand = [card('4', 'H'), card('5', 'H')]
    guestPlayer.handCount = 2
    guestPlayer.playedCards = 1
    round.currentSeat = ownerPlayer.seat
    round.table = null

    const result = playGanDengYanCards(round, owner, [ownerPlayer.hand[0].id])

    assert.equal(result.ok, true)
    assert.equal(result.state.status, 'finished')
    assert.equal(
      result.state.players.find(player => player.address === owner).score,
      1001
    )
    assert.equal(
      result.state.players.find(player => player.address === guest).score,
      999
    )

    const nextRound = startGanDengYanRound(
      result.state,
      makeDeterministicRandom()
    )

    assert.equal(
      nextRound.players.find(player => player.address === owner).score,
      1001
    )
    assert.equal(
      nextRound.players.find(player => player.address === guest).score,
      999
    )
  })

  it('penalizes sealed players with 20 points', () => {
    const owner = '0x0000000000000000000000000000000000000401'
    const guest = '0x0000000000000000000000000000000000000402'
    const room = createGanDengYanRoom({
      roomCode: 'SEAL1',
      ownerAddress: owner,
      ownerName: '房主',
      players: [
        { address: owner, name: '房主' },
        { address: guest, name: '朋友' },
      ],
    })

    const round = startGanDengYanRound(room, makeDeterministicRandom())
    const ownerPlayer = round.players.find(player => player.address === owner)
    const guestPlayer = round.players.find(player => player.address === guest)
    ownerPlayer.hand = [card('3', 'S')]
    ownerPlayer.handCount = 1
    ownerPlayer.playedCards = 1
    guestPlayer.hand = [card('4', 'H'), card('5', 'H')]
    guestPlayer.handCount = 2
    guestPlayer.playedCards = 0
    round.currentSeat = ownerPlayer.seat
    round.table = null

    const result = playGanDengYanCards(round, owner, [ownerPlayer.hand[0].id])

    assert.equal(result.ok, true)
    assert.equal(result.state.status, 'finished')
    assert.equal(
      result.state.players.find(player => player.address === owner).score,
      1020
    )
    assert.equal(
      result.state.players.find(player => player.address === guest).score,
      980
    )
  })

  it('doubles base score per bomb when calculating losses', () => {
    const owner = '0x0000000000000000000000000000000000000501'
    const guest = '0x0000000000000000000000000000000000000502'
    const room = createGanDengYanRoom({
      roomCode: 'BOMB1',
      ownerAddress: owner,
      ownerName: '房主',
      players: [
        { address: owner, name: '房主' },
        { address: guest, name: '朋友' },
      ],
    })

    const round = startGanDengYanRound(room, makeDeterministicRandom())
    const ownerPlayer = round.players.find(player => player.address === owner)
    const guestPlayer = round.players.find(player => player.address === guest)
    ownerPlayer.hand = [card('3', 'S')]
    ownerPlayer.handCount = 1
    ownerPlayer.playedCards = 1
    guestPlayer.hand = [card('4', 'H'), card('5', 'H')]
    guestPlayer.handCount = 2
    guestPlayer.playedCards = 1
    round.currentSeat = ownerPlayer.seat
    round.table = null
    round.baseScore = 2

    const result = playGanDengYanCards(round, owner, [ownerPlayer.hand[0].id])

    assert.equal(result.ok, true)
    assert.equal(result.state.status, 'finished')
    assert.equal(
      result.state.players.find(player => player.address === owner).score,
      1002
    )
    assert.equal(
      result.state.players.find(player => player.address === guest).score,
      998
    )
  })
})

function makeDeterministicRandom() {
  let index = 0
  return () => {
    index += 1
    return (index % 97) / 97
  }
}
