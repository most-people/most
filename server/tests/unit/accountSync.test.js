import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mostWallet } from '../../src/utils/mostWallet.js'
import {
  deriveAccountSyncKeys,
  mergeAccountEntries,
  openAccountEntry,
  sealAccountEntry,
} from '../../src/utils/accountSync.js'

const { danger } = mostWallet('alice', 'a-long-enough-poem-line', 1)
const { danger: otherDanger } = mostWallet('bob', 'a-long-enough-poem-line', 1)

const entry = (overrides = {}) => ({
  kind: 'channel',
  id: 'room',
  deviceId: 'phone',
  updatedAt: 100,
  data: { channelId: 'room', pinned: true },
  ...overrides,
})

describe('account sync keys', () => {
  it('derives stable keys that differ from the seed and per account', () => {
    const first = deriveAccountSyncKeys(danger)
    assert.deepEqual(deriveAccountSyncKeys(danger), first)
    assert.notEqual(first.syncKey, danger)
    assert.notEqual(first.topic, first.syncKey)
    assert.notEqual(deriveAccountSyncKeys(otherDanger).syncKey, first.syncKey)
    assert.match(first.syncKey, /^0x[0-9a-f]{64}$/)
    assert.match(first.topic, /^0x[0-9a-f]{64}$/)
  })
})

describe('account sync envelope', () => {
  const { syncKey } = deriveAccountSyncKeys(danger)

  it('round-trips an entry and hides its content', () => {
    const envelope = sealAccountEntry(entry(), syncKey)
    assert.match(envelope, /^ma:\/\/1\./)
    assert.ok(!envelope.includes('room'))
    assert.deepEqual(openAccountEntry(envelope, syncKey), {
      v: 1,
      kind: 'channel',
      id: 'room',
      deviceId: 'phone',
      updatedAt: 100,
      deleted: false,
      data: { channelId: 'room', pinned: true },
    })
  })

  it('rejects wrong keys, tampering and malformed input', () => {
    const envelope = sealAccountEntry(entry(), syncKey)
    const otherKey = deriveAccountSyncKeys(otherDanger).syncKey
    assert.equal(openAccountEntry(envelope, otherKey), null)
    const [prefix, nonce, cipher] = envelope.split('.')
    const flipped = (cipher[0] === 'A' ? 'B' : 'A') + cipher.slice(1)
    assert.equal(
      openAccountEntry([prefix, nonce, flipped].join('.'), syncKey),
      null
    )
    for (const bad of ['', 'ma://1', 'x.y.z', null, 42]) {
      assert.equal(openAccountEntry(bad, syncKey), null)
    }
    assert.throws(() => sealAccountEntry({ kind: 'x' }, syncKey), /Invalid/)
  })

  it('drops data from tombstones', () => {
    const opened = openAccountEntry(
      sealAccountEntry(entry({ deleted: true }), syncKey),
      syncKey
    )
    assert.equal(opened.deleted, true)
    assert.equal(opened.data, null)
  })
})

describe('account entry merge', () => {
  const older = entry({ updatedAt: 100, data: { pinned: false } })
  const newer = entry({
    updatedAt: 200,
    deviceId: 'cloud',
    data: { pinned: true },
  })
  const tombstone = entry({ updatedAt: 300, deleted: true, data: null })

  it('keeps the latest entry regardless of input order', () => {
    for (const input of [
      [older, newer, tombstone],
      [tombstone, newer, older],
      [newer, tombstone, older],
    ]) {
      const merged = mergeAccountEntries(input)
      assert.equal(merged.size, 1)
      assert.equal(merged.get('channel:room').deleted, true)
    }
  })

  it('does not resurrect a deleted entry from an older write', () => {
    const merged = mergeAccountEntries([tombstone, older])
    assert.equal(merged.get('channel:room').deleted, true)
  })

  it('breaks timestamp ties by device id deterministically', () => {
    const a = entry({ deviceId: 'a', data: { v: 1 } })
    const b = entry({ deviceId: 'b', data: { v: 2 } })
    assert.deepEqual(
      mergeAccountEntries([a, b]).get('channel:room'),
      mergeAccountEntries([b, a]).get('channel:room')
    )
    assert.equal(mergeAccountEntries([a, b]).get('channel:room').deviceId, 'b')
  })

  it('keeps different kinds and ids apart', () => {
    const merged = mergeAccountEntries([
      entry(),
      entry({ id: 'other' }),
      entry({ kind: 'profile', id: 'self' }),
    ])
    assert.equal(merged.size, 3)
  })
})
