import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import * as zhajinhuaCore from '../../src/core/zhajinhua.js'
import {
  ZHJ_ANTE,
  ZHJ_INITIAL_CHIPS,
  applyPlayerAction,
  canStartRound,
  compareHands,
  createPlayerActionEvent,
  evaluateHand,
  getHandLabel,
  getPublicRoundState,
  hydrateRoundWithHands,
  startRound,
  validatePlayerAction,
} from '../../src/core/zhajinhua.js'
import {
  most25519,
  mostBoxDecrypt,
  mostBoxEncrypt,
  mostWallet,
} from '../../src/utils/mostWallet.js'

function identity(username) {
  const wallet = mostWallet(username, 'password')
  const keys = most25519(wallet.danger)
  return {
    ...wallet,
    name: `${username}#${wallet.address.slice(-4).toUpperCase()}`,
    publicKey: keys.public_key,
    privateKey: keys.private_key,
  }
}

describe('zhajinhua card ranking', () => {
  it('orders the classic categories from high card to triple', () => {
    const hands = [
      ['AS', '9D', '5C'],
      ['AS', 'AD', '5C'],
      ['2S', '3D', '4C'],
      ['AS', '9S', '5S'],
      ['QS', 'KS', 'AS'],
      ['9S', '9D', '9C'],
    ]

    for (let i = 0; i < hands.length - 1; i++) {
      assert.ok(compareHands(hands[i], hands[i + 1]) < 0)
    }
  })

  it('treats A23 as the lowest straight and QKA as a high straight', () => {
    assert.strictEqual(getHandLabel(['AS', '2D', '3C']), '顺子')
    assert.strictEqual(getHandLabel(['QS', 'KD', 'AC']), '顺子')
    assert.ok(compareHands(['AS', '2D', '3C'], ['2S', '3D', '4C']) < 0)
    assert.ok(compareHands(['QS', 'KD', 'AC'], ['JS', 'QD', 'KC']) > 0)
  })

  it('compares pairs and high cards by rank kickers', () => {
    assert.ok(compareHands(['KS', 'KD', '3C'], ['QS', 'QD', 'AC']) > 0)
    assert.ok(compareHands(['AS', 'JD', '9C'], ['AS', '10D', '9C']) > 0)
    assert.strictEqual(evaluateHand(['5S', '5D', 'AC']).label, '对子')
  })

  it('breaks fully tied points by suit order', () => {
    assert.ok(compareHands(['AS', 'KD', '9C'], ['AH', 'KD', '9C']) > 0)
    assert.ok(compareHands(['AD', 'KC', '9C'], ['AC', 'KH', '9D']) < 0)
  })
})

describe('zhajinhua room events', () => {
  it('does not expose bot-only helpers without a product entry point', () => {
    assert.strictEqual('chooseBotAction' in zhajinhuaCore, false)
  })

  it('validates betting and turn order', () => {
    const alice = identity('alice')
    const bob = identity('bob')
    const publicRound = getPublicRoundState(
      startRound({
        roomCode: 'ABC123',
        hostAddress: alice.address,
        players: [
          { ...alice, chips: ZHJ_INITIAL_CHIPS },
          { ...bob, chips: ZHJ_INITIAL_CHIPS },
        ],
        previousWinner: bob.address,
        random: () => 0,
      })
    )
    const bobAction = createPlayerActionEvent({
      roundId: publicRound.roundId,
      action: 'raise',
      amount: 20,
    })
    const aliceAction = createPlayerActionEvent({
      roundId: publicRound.roundId,
      action: 'raise',
      amount: 15,
    })

    assert.deepStrictEqual(validatePlayerAction(publicRound, bobAction, bob.address), {
      ok: true,
    })
    assert.strictEqual(
      validatePlayerAction(publicRound, aliceAction, alice.address).ok,
      false
    )
    assert.strictEqual(
      validatePlayerAction(publicRound, { action: 'raise', amount: 15 }, bob.address)
        .ok,
      false
    )
  })

  it('applies compare actions and publishes a finished showdown', () => {
    const alice = identity('alice')
    const bob = identity('bob')
    const publicRound = getPublicRoundState(
      startRound({
        roomCode: 'ABC123',
        hostAddress: alice.address,
        players: [
          { ...alice, chips: ZHJ_INITIAL_CHIPS },
          { ...bob, chips: ZHJ_INITIAL_CHIPS },
        ],
        previousWinner: bob.address,
        random: () => 0,
      })
    )
    let round = hydrateRoundWithHands(publicRound, {
      [alice.address.toLowerCase()]: ['AS', 'AD', 'AC'],
      [bob.address.toLowerCase()]: ['KS', 'KD', 'KC'],
    })
    const bobCallEvent = createPlayerActionEvent({
      roundId: round.roundId,
      action: 'call',
    })
    const bobCallResult = applyPlayerAction(round, bobCallEvent, bob.address)
    round = bobCallResult.state
    const aliceCallEvent = createPlayerActionEvent({
      roundId: round.roundId,
      action: 'call',
    })
    const aliceCallResult = applyPlayerAction(round, aliceCallEvent, alice.address)
    round = aliceCallResult.state
    const action = createPlayerActionEvent({
      roundId: round.roundId,
      action: 'compare',
      target: alice.address,
    })
    const result = applyPlayerAction(round, action, bob.address)

    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.state.status, 'finished')
    assert.strictEqual(result.state.winner, alice.address.toLowerCase())
    assert.deepStrictEqual(
      result.state.showdown[alice.address.toLowerCase()],
      ['AS', 'AD', 'AC']
    )
  })

  it('requires two eligible players before starting a round', () => {
    const alice = identity('alice')
    const bob = identity('bob')

    assert.strictEqual(canStartRound([{ ...alice, chips: ZHJ_INITIAL_CHIPS }]), false)
    assert.strictEqual(
      canStartRound([
        { ...alice, chips: ZHJ_INITIAL_CHIPS },
        { ...bob, chips: ZHJ_ANTE },
      ]),
      true
    )
    assert.strictEqual(
      canStartRound([
        { ...alice, chips: ZHJ_INITIAL_CHIPS },
        { ...bob, chips: ZHJ_ANTE - 1 },
      ]),
      false
    )
  })
})

describe('zhajinhua private deal encryption', () => {
  it('decrypts a private hand only with the target identity', () => {
    const host = identity('host')
    const bob = identity('bob')
    const carol = identity('carol')
    const cards = ['AS', 'KD', '9C']
    const encrypted = mostBoxEncrypt(JSON.stringify(cards), {
      senderPrivateKey: host.privateKey,
      recipientPublicKey: bob.publicKey,
    })

    assert.deepStrictEqual(
      JSON.parse(
        mostBoxDecrypt(encrypted, {
          senderPublicKey: host.publicKey,
          recipientPrivateKey: bob.privateKey,
        })
      ),
      cards
    )
    assert.strictEqual(
      mostBoxDecrypt(encrypted, {
        senderPublicKey: host.publicKey,
        recipientPrivateKey: carol.privateKey,
      }),
      ''
    )
  })
})
