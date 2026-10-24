import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEVICE_CERT_TTL_MS,
  buildMobileAuthHeader,
  createMobileIdentity,
  isUsableDevice,
  readDeviceCertExpiry,
} from './identity'

const GOLDEN_OPTIONS = { now: 1_700_000_000_000, deviceLabel: 'golden-device' }

describe('mobile remote identity', () => {
  it('keeps the desktop address golden sample and never stores the seed', async () => {
    const identity = await createMobileIdentity(
      'alice',
      'correct horse battery staple',
      GOLDEN_OPTIONS
    )
    assert.equal(identity.username, 'alice')
    assert.equal(identity.address, '0x023B10b4e691580966D160FbF50Dce5596A97D4C')
    assert.equal(JSON.stringify(identity).includes('danger'), false)
    assert.equal(
      JSON.stringify(identity).includes(
        '4b3dc89d94ac8b7dfac567f811278e08d853af3be74ee0582e75350edb831dbf'
      ),
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
    })
    const a2 = await createMobileIdentity('alice', 'password', {
      deviceLabel: 'a',
    })
    const b = await createMobileIdentity('alice', 'password', {
      deviceLabel: 'b',
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
    const fresh = await createMobileIdentity('alice', 'password')
    assert.equal(isUsableDevice(fresh.device), true)
    const expired = await createMobileIdentity('alice', 'password', {
      now: Date.now() - DEVICE_CERT_TTL_MS - 1000,
    })
    assert.equal(isUsableDevice(expired.device), false)
    assert.equal(isUsableDevice({ ...fresh.device, secretKey: 'x' }), false)
    assert.equal(isUsableDevice(undefined), false)
  })
})
