import { describe, it } from 'node:test'
import assert from 'node:assert'
import { analyzeCards } from '../../src/games/gandengyan.js'

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
})
