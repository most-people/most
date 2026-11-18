import { randomUUID } from 'node:crypto'
import { Wallet } from 'ethers'
import { signBody } from '../../src/core/chatSignaturesV2.js'
import { deviceFor } from './deviceIdentity.js'

/** Account that signs test messages unless a test passes its own signer. */
export const defaultSigner = Wallet.createRandom()

export function addressOf(signer) {
  return signer.address.toLowerCase()
}

/**
 * A client-signed message envelope (docs/protocol/v2/signatures.md §4).
 * `signer` is a wallet (a test device is issued for it); `identity` is a
 * login identity that already carries `{ address, device }`.
 */
export async function signedMessage(
  channelId,
  content,
  { signer = defaultSigner, identity, ...fields } = {}
) {
  const device = identity ? identity.device : await deviceFor(signer)
  const body = {
    kind: 'message',
    channelId,
    author: (identity || signer).address.toLowerCase(),
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
 * Signs and sends like a client would. `ownerAddress` defaults to the
 * signer's address when the test passes `owner: true`.
 */
export async function sendTestMessage(engine, channel, content, options = {}) {
  const { signer = defaultSigner, ownerAddress, ...fields } = options
  const channelId = engine.resolveChannelKey(channel, { ownerAddress })
  const signed = await signedMessage(channelId, content, { signer, ...fields })
  return engine.sendMessage(channel, signed, { ownerAddress })
}
