import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { verifyMessage } from 'ethers'
import {
  DEFAULT_DEVICE_CERT_TTL,
  DEVICE_CERT_TTL_MS,
  DEVICE_CERT_TTL_OPTIONS,
  deviceCertRenewAt,
  readDeviceCertWindow,
  MOBILE_IDENTITY_VERSION,
  buildMobileAuthHeader,
  createMobileIdentity,
  isUsableDevice,
  readDeviceCertExpiry,
  signLegacyAccountMigration,
} from './identity'
import { deriveChatSeedJs } from './chatIdentity'

const vectors = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../docs/protocol/vectors/v2/chat-identity.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  cases: {
    username: string
    password: string
    chatSeed: string
    syncKey: string
  }[]
}
const alice = vectors.cases[0]

// Most tests do not care how the seed is derived; skip scrypt there.
const fixedSeed = async () => alice.chatSeed
const GOLDEN_OPTIONS = {
  now: 1_700_000_000_000,
  deviceLabel: 'golden-device',
  deriveChatSeed: fixedSeed,
}

describe('mobile remote identity', () => {
  it('uses the v2 chat seed vectors and never stores the seed', async () => {
    const identity = await createMobileIdentity(
      alice.username,
      alice.password,
      {
        ...GOLDEN_OPTIONS,
        deriveChatSeed: deriveChatSeedJs,
      }
    )
    assert.equal(identity.version, MOBILE_IDENTITY_VERSION)
    assert.equal(identity.username, 'alice')
    // v2 chat identity, separate from the v1 wallet 0x023B…7D4C (D3).
    assert.notEqual(
      identity.address,
      '0x023B10b4e691580966D160FbF50Dce5596A97D4C'
    )
    assert.equal(identity.syncKey, alice.syncKey)
    assert.equal(JSON.stringify(identity).includes('danger'), false)
    assert.equal(
      JSON.stringify(identity).includes(alice.chatSeed.slice(2)),
      false
    )
    assert.equal(
      readDeviceCertExpiry(identity.device.cert),
      GOLDEN_OPTIONS.now + DEVICE_CERT_TTL_MS
    )
  })

  it('derives distinct device keys per label and the same key per label', async () => {
    const a = await createMobileIdentity('alice', 'password', {
      deviceLabel: 'a',
      deriveChatSeed: fixedSeed,
    })
    const a2 = await createMobileIdentity('alice', 'password', {
      deviceLabel: 'a',
      deriveChatSeed: fixedSeed,
    })
    const b = await createMobileIdentity('alice', 'password', {
      deviceLabel: 'b',
      deriveChatSeed: fixedSeed,
    })
    assert.equal(a.device.publicKey, a2.device.publicKey)
    assert.notEqual(a.device.publicKey, b.device.publicKey)
  })

  it('builds a device-signed header bound to the cert', async () => {
    const identity = await createMobileIdentity(
      'alice',
      'password',
      GOLDEN_OPTIONS
    )
    const header = await buildMobileAuthHeader(
      identity,
      'POST',
      '/api/download',
      GOLDEN_OPTIONS.now
    )
    const [cert, timestamp, signature] = header.split(',')
    assert.equal(cert, identity.device.cert)
    assert.equal(timestamp, String(GOLDEN_OPTIONS.now))
    assert.ok(signature)
    assert.equal(await buildMobileAuthHeader(null, 'GET', '/'), '')
  })

  it('treats expired or malformed device credentials as unusable', async () => {
    const fresh = await createMobileIdentity('alice', 'password', {
      deriveChatSeed: fixedSeed,
    })
    assert.equal(isUsableDevice(fresh.device), true)
    const expired = await createMobileIdentity('alice', 'password', {
      now: Date.now() - DEVICE_CERT_TTL_MS - 1000,
      deriveChatSeed: fixedSeed,
    })
    assert.equal(isUsableDevice(expired.device), false)
    assert.equal(isUsableDevice({ ...fresh.device, secretKey: 'x' }), false)
    assert.equal(isUsableDevice(undefined), false)
  })

  it('signs the v1 account approval for moving to the v2 address', async () => {
    const newAddress = '0x' + '2'.repeat(40)
    const migration = await signLegacyAccountMigration(
      ' alice ',
      'correct horse battery staple',
      newAddress
    )
    assert.equal(
      migration.oldAddress,
      '0x023B10b4e691580966D160FbF50Dce5596A97D4C'
    )
    const message = [
      'most-box-account-migrate-v2',
      migration.oldAddress.toLowerCase(),
      newAddress,
    ].join('\n')
    assert.equal(
      verifyMessage(message, migration.signature),
      migration.oldAddress
    )
  })

  it('offers the same validity periods as the web and renews at a tenth', async () => {
    assert.deepEqual(DEVICE_CERT_TTL_OPTIONS, {
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '30d': DEVICE_CERT_TTL_MS,
    })
    assert.equal(DEFAULT_DEVICE_CERT_TTL, '30d')
    const hour = 60 * 60 * 1000
    for (const [ttlMs, leadMs] of [
      [DEVICE_CERT_TTL_OPTIONS['30d'], 72 * hour],
      [DEVICE_CERT_TTL_OPTIONS['1d'], 2.4 * hour],
      [DEVICE_CERT_TTL_OPTIONS['4h'], 0.4 * hour],
    ] as const) {
      const identity = await createMobileIdentity('alice', 'password', {
        ...GOLDEN_OPTIONS,
        ttlMs,
      })
      const now = GOLDEN_OPTIONS.now
      assert.deepEqual(readDeviceCertWindow(identity.device.cert), {
        issuedAt: now,
        expiresAt: now + ttlMs,
        ttlMs,
      })
      assert.equal(
        deviceCertRenewAt(identity.device.cert),
        now + ttlMs - leadMs
      )
    }
    assert.equal(deviceCertRenewAt('dc1.bad.sig'), 0)
  })
})
