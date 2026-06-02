import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  analyzeCards,
  makeGameChannelName,
  makeGameEvent,
  reduceGameEvents,
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
})

function channelMessage(author, authorName, event, timestamp) {
  return {
    author,
    authorName,
    content: JSON.stringify(event),
    timestamp,
  }
}
