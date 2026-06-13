import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  GAME_CHANNEL_TYPE,
  channelNameToGameRoom,
  createGameEvent,
  gameRoomCodeToChannelName,
  parseGameEvent,
} from '../../src/core/gameRoom.js'

describe('game room shared core', () => {
  it('uses one channel type for game rooms', () => {
    assert.strictEqual(GAME_CHANNEL_TYPE, 'game')
  })

  it('maps game ids and room codes to shared channel names', () => {
    assert.strictEqual(
      gameRoomCodeToChannelName('zhajinhua', 'ABC123'),
      'game.zhajinhua.abc123'
    )
    assert.deepStrictEqual(channelNameToGameRoom('game.gandengyan.abcd'), {
      gameId: 'gandengyan',
      roomCode: 'ABCD',
    })
    assert.strictEqual(gameRoomCodeToChannelName('bad', 'ABC123'), '')
  })

  it('parses only matching event envelopes', () => {
    const event = createGameEvent({
      gameId: 'zhajinhua',
      roomCode: 'ABC123',
      event: 'room:create',
      payload: { ok: true },
    })

    assert.strictEqual(
      parseGameEvent(JSON.stringify(event), {
        gameId: 'zhajinhua',
        roomCode: 'ABC123',
      }).payload.ok,
      true
    )
    assert.strictEqual(
      parseGameEvent(JSON.stringify(event), { gameId: 'gandengyan' }),
      null
    )
  })
})
