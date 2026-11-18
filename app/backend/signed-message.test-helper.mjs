// Test helper: signs channel messages the way the app does before handing
// them to a core (docs/protocol/v2/signatures.md §4).
import { randomUUID } from 'node:crypto'
import hypercoreCrypto from 'hypercore-crypto'
import b4a from 'b4a'
import { Wallet } from 'ethers'
import { toBase64Url } from '../shared/chat-signing.mjs'
import { signBody } from './chat-signatures-v2.mjs'

const DEVICE_CERT_DOMAIN = 'most-box-device-cert-v1'
const devices = new WeakMap()

export const defaultWallet = Wallet.createRandom()

export async function deviceFor(wallet) {
  let pending = devices.get(wallet)
  if (!pending) {
    pending = (async () => {
      const keyPair = hypercoreCrypto.keyPair()
      const devicePublicKey = b4a.toString(keyPair.publicKey, 'hex')
      const issuedAt = Date.now()
      const expiresAt = issuedAt + 30 * 24 * 60 * 60 * 1000
      const address = wallet.address
      const signature = await wallet.signMessage(
        [
          DEVICE_CERT_DOMAIN,
          address,
          devicePublicKey,
          issuedAt,
          expiresAt,
        ].join('\n')
      )
      const payload = toBase64Url(
        new TextEncoder().encode(
          JSON.stringify({ address, devicePublicKey, issuedAt, expiresAt })
        )
      )
      return {
        publicKey: devicePublicKey,
        secretKey: keyPair.secretKey,
        cert: `dc1.${payload}.${signature}`,
      }
    })()
    devices.set(wallet, pending)
  }
  return pending
}

export function channelKeyOf(core, channelName) {
  const channel = core
    .listChannels()
    .find(
      item => item.channelId === channelName || item.channelKey === channelName
    )
  if (!channel) throw new Error(`no channel ${channelName}`)
  return channel.channelKey
}

/** A signed envelope for a message body in the channel with this public ID. */
export async function signMessage(
  channelId,
  content,
  { wallet = defaultWallet, ...fields } = {}
) {
  const device = await deviceFor(wallet)
  const body = {
    kind: 'message',
    channelId,
    author: wallet.address.toLowerCase(),
    id: randomUUID(),
    createdAt: Date.now(),
    content,
    ...fields,
  }
  return {
    body,
    device: device.publicKey,
    cert: device.cert,
    sig: signBody(body, device.secretKey),
  }
}

/**
 * sendChannelMessage input for `core`, signed: `{ channelName, content,
 * ...body fields, wallet? }` → `{ channelName, signed }`.
 */
export async function signedInput(core, { channelName, content, ...fields }) {
  return {
    channelName,
    signed: await signMessage(channelKeyOf(core, channelName), content, fields),
  }
}
