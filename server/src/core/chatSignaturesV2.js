// Device signatures on v2 chat bodies (docs/protocol/v2/signatures.md §4).
// The mobile core has the same checks in app/backend/chat-signatures-v2.mjs.
import b4a from 'b4a'
import hypercoreCrypto from 'hypercore-crypto'
import {
  fromBase64Url,
  signedBodyError,
  signedPayload,
  toBase64Url,
} from './chatSigning.js'
import { verifyDeviceCert } from '../utils/auth.js'

const HEX_64_REGEX = /^[0-9a-f]{64}$/

/** Signs a body with a 64-byte ed25519 device secret key (hex or bytes). */
export function signBody(body, deviceSecretKey) {
  const secretKey =
    typeof deviceSecretKey === 'string'
      ? b4a.from(deviceSecretKey, 'hex')
      : deviceSecretKey
  return toBase64Url(hypercoreCrypto.sign(signedPayload(body), secretKey))
}

/**
 * Checks a signed envelope { body, device, cert, sig } for a channel.
 * Returns { ok: true, author } or { ok: false, error }.
 */
export function verifySignedEnvelope(envelope, { channelId } = {}) {
  const { body, device, cert, sig } = envelope || {}
  const bodyError = signedBodyError(body)
  if (bodyError) return { ok: false, error: bodyError }
  if (channelId !== undefined && body.channelId !== channelId) {
    return { ok: false, error: 'channel mismatch' }
  }
  if (!HEX_64_REGEX.test(String(device))) {
    return { ok: false, error: 'invalid device' }
  }
  const signature = fromBase64Url(sig)
  if (!signature || signature.length !== 64) {
    return { ok: false, error: 'invalid signature encoding' }
  }
  let payload
  try {
    payload = signedPayload(body)
  } catch (error) {
    return { ok: false, error: error.message }
  }
  if (!hypercoreCrypto.verify(payload, signature, b4a.from(device, 'hex'))) {
    return { ok: false, error: 'bad signature' }
  }
  const certificate = verifyDeviceCert(cert, { checkTime: false })
  if (!certificate.ok) return { ok: false, error: certificate.error }
  if (certificate.devicePublicKey !== device) {
    return { ok: false, error: 'certificate is for another device' }
  }
  if (certificate.address !== body.author) {
    return { ok: false, error: 'certificate is for another account' }
  }
  return { ok: true, author: body.author }
}
