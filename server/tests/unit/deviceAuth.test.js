import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Wallet } from 'ethers'
import {
  DEFAULT_DEVICE_CERT_TTL,
  DEVICE_CERT_MAX_TTL_MS,
  DEVICE_CERT_TTL_MS,
  DEVICE_CERT_TTL_OPTIONS,
  deviceCertRenewAt,
  readDeviceCertWindow,
  buildAuthHeaders,
  buildDeviceAuthHeader,
  createDeviceKey,
  issueDeviceCert,
  issueDeviceCertWithSigner,
  verifyAuthHeader,
  verifyDeviceCert,
} from '../../src/utils/auth.js'
import { createLoginSession } from '../../src/utils/userIdentity.js'

const NOW = 1_700_000_000_000
const wallet = new Wallet('0x' + '11'.repeat(32))

async function setup(options = {}) {
  const device = createDeviceKey()
  const cert = await issueDeviceCertWithSigner(wallet, device.publicKey, {
    now: NOW,
    ...options,
  })
  return { device: { ...device, cert }, cert }
}

describe('device certificate', () => {
  it('verifies a freshly issued certificate and exposes its bindings', async () => {
    const { device, cert } = await setup()
    assert.deepEqual(verifyDeviceCert(cert, { now: NOW + 1000 }), {
      ok: true,
      address: wallet.address.toLowerCase(),
      devicePublicKey: device.publicKey,
      expiresAt: NOW + DEVICE_CERT_TTL_MS,
    })
  })

  it('rejects an expired certificate using the verifier clock', async () => {
    const { cert } = await setup()
    const result = verifyDeviceCert(cert, { now: NOW + DEVICE_CERT_TTL_MS })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'Device certificate expired')
  })

  it('rejects tampered payloads, so expiry cannot be extended', async () => {
    const { cert } = await setup()
    const [prefix, payload64, signature] = cert.split('.')
    const payload = JSON.parse(Buffer.from(payload64, 'base64url').toString())
    payload.expiresAt += DEVICE_CERT_TTL_MS
    const forged = [
      prefix,
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      signature,
    ].join('.')
    assert.equal(verifyDeviceCert(forged, { now: NOW }).ok, false)
    const swapped = {
      ...payload,
      expiresAt: payload.expiresAt - DEVICE_CERT_TTL_MS,
    }
    swapped.devicePublicKey = createDeviceKey().publicKey
    assert.equal(
      verifyDeviceCert(
        [
          prefix,
          Buffer.from(JSON.stringify(swapped)).toString('base64url'),
          signature,
        ].join('.'),
        { now: NOW }
      ).ok,
      false
    )
  })

  it('rejects over-long lifetimes, future issue dates and malformed tokens', async () => {
    const device = createDeviceKey()
    await assert.rejects(
      issueDeviceCertWithSigner(wallet, device.publicKey, {
        ttlMs: DEVICE_CERT_MAX_TTL_MS + 1,
      }),
      /ttl/
    )
    await assert.rejects(
      issueDeviceCertWithSigner(wallet, 'not-a-key'),
      /device public key/
    )
    const { cert } = await setup({ now: NOW + 3_600_000 })
    assert.equal(verifyDeviceCert(cert, { now: NOW }).ok, false)
    for (const bad of ['', 'dc1', 'dc1.a.b', 'xx.a.b', null]) {
      assert.equal(verifyDeviceCert(bad).ok, false)
    }
  })
})

describe('device request authorization', () => {
  it('accepts a signed request and binds it to method and canonical path', async () => {
    const { device } = await setup()
    const header = buildDeviceAuthHeader(device, 'POST', '/api/download', NOW)
    const ok = verifyAuthHeader(header, 'POST', '/api/download', { now: NOW })
    assert.equal(ok.ok, true)
    assert.equal(ok.address, wallet.address.toLowerCase())
    assert.equal(
      verifyAuthHeader(header, 'GET', '/api/download', { now: NOW }).ok,
      false
    )
    assert.equal(
      verifyAuthHeader(header, 'POST', '/proxy/api/download', { now: NOW }).ok,
      false
    )
  })

  it('rejects stale timestamps and signatures from another device', async () => {
    const { device } = await setup()
    const header = buildDeviceAuthHeader(device, 'GET', '/api/x', NOW)
    assert.equal(
      verifyAuthHeader(header, 'GET', '/api/x', { now: NOW + 6 * 60 * 1000 })
        .ok,
      false
    )
    const other = buildDeviceAuthHeader(
      { ...createDeviceKey(), cert: device.cert },
      'GET',
      '/api/x',
      NOW
    )
    assert.equal(
      verifyAuthHeader(other, 'GET', '/api/x', { now: NOW }).ok,
      false
    )
  })

  it('works end to end from a login session without persisting the seed', async () => {
    const { identity, danger } = await createLoginSession(
      'session-user',
      'a-long-enough-poem-line'
    )
    assert.equal(JSON.stringify(identity).includes(danger), false)
    assert.equal('danger' in identity, false)
    const headers = await buildAuthHeaders(identity, 'GET', '/api/ping')
    const result = verifyAuthHeader(headers.Authorization, 'GET', '/api/ping')
    assert.equal(result.ok, true)
    assert.equal(result.address, identity.address.toLowerCase())
    assert.deepEqual(await buildAuthHeaders({}, 'GET', '/'), {})
  })

  it('issues from a seed with the same address as the login identity', async () => {
    const { identity, danger } = await createLoginSession(
      'seed-user',
      'another-long-poem-line'
    )
    const device = createDeviceKey()
    const cert = await issueDeviceCert(danger, device.publicKey, { now: NOW })
    assert.equal(
      verifyDeviceCert(cert, { now: NOW }).address,
      identity.address.toLowerCase()
    )
  })
})

describe('device certificate validity options', () => {
  it('offers 4 hours, 1 day and the 30-day default', () => {
    assert.deepEqual(DEVICE_CERT_TTL_OPTIONS, {
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '30d': DEVICE_CERT_TTL_MS,
    })
    assert.equal(DEFAULT_DEVICE_CERT_TTL, '30d')
  })

  it('renews a tenth of the validity period before expiry', async () => {
    const hour = 60 * 60 * 1000
    for (const [ttlMs, leadMs] of [
      [DEVICE_CERT_TTL_OPTIONS['30d'], 72 * hour],
      [DEVICE_CERT_TTL_OPTIONS['1d'], 2.4 * hour],
      [DEVICE_CERT_TTL_OPTIONS['4h'], 0.4 * hour],
    ]) {
      const { cert } = await setup({ ttlMs })
      assert.deepEqual(readDeviceCertWindow(cert), {
        issuedAt: NOW,
        expiresAt: NOW + ttlMs,
        ttlMs,
      })
      assert.equal(deviceCertRenewAt(cert), NOW + ttlMs - leadMs)
    }
    assert.equal(readDeviceCertWindow('dc1.bad.sig'), null)
    assert.equal(deviceCertRenewAt(''), 0)
  })
})
