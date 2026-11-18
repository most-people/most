// most-cid-drive/3: see docs/protocol/v2/file-privacy.md. The mobile core has
// an identical copy in app/backend/cid-drive-exchange.mjs; shared vectors in
// docs/protocol/vectors/v2/file.json keep them equal.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import b4a from 'b4a'
import c from 'compact-encoding'
import Protomux from 'protomux'
import { H, MAC } from './protocolV2.js'

export const CID_DRIVE_PROTOCOL = 'most-cid-drive/3'
/** Invalid proofs one connection may send before its channel is closed (§4.3). */
export const MAX_INVALID_WANTS = 16

/** File topic for a CID multihash digest (§3). */
export function fileTopic(digest) {
  return H('topic/file', digest)
}

/** Key the requester proves knowledge of the digest with (§4.2). */
export function wantKeyFor(digest) {
  return H('file/want-key', digest)
}

export function wantProof(
  wantKey,
  topic,
  challenge,
  requesterPublicKey,
  responderPublicKey
) {
  return MAC(
    wantKey,
    'file/want',
    topic,
    challenge,
    requesterPublicKey,
    responderPublicKey
  )
}

/**
 * Name of this node's own drive for a file topic (§6). Only the holder of
 * `secret` can derive the name, and therefore the drive's signing key.
 */
export function cidDriveName(secret, topic) {
  return `cid-drive-${b4a.toString(MAC(secret, 'cid-drive/name', topic), 'hex')}`
}

/**
 * Opens the want/have channel on a replication stream. The handshake carries
 * a fresh 32-byte challenge; want(topic ‖ proof) is bound to the peer's
 * challenge and both Noise public keys, so it cannot be replayed elsewhere.
 *
 * onWant(topic, proof, peer): the caller looks up the wantKey for a topic it
 *   seeds and calls peer.verifyWant(); unknown topics are simply ignored.
 * onHave(topic, driveKey, peer): answer to one of our wants.
 */
export function attachCidDriveChannel(
  stream,
  { onWant, onHave, onClose, createChallenge = randomBytes }
) {
  const noise = stream.noiseStream || stream
  const mux = Protomux.from(noise)
  const localChallenge = b4a.from(createChallenge(32))
  let remoteChallenge = null
  let invalidWants = 0
  const pendingWants = new Map()
  let peer = null

  const channel = mux.createChannel({
    protocol: CID_DRIVE_PROTOCOL,
    handshake: c.fixed32,
    onopen: handshake => {
      remoteChallenge = handshake
      for (const [topic, wantKey] of pendingWants.values()) {
        sendWant(topic, wantKey)
      }
      pendingWants.clear()
    },
    onclose: () => onClose?.(peer),
  })
  if (!channel) return null

  const want = channel.addMessage({
    encoding: c.fixed64,
    onmessage: message =>
      onWant(message.subarray(0, 32), message.subarray(32), peer),
  })
  const have = channel.addMessage({
    encoding: c.fixed64,
    onmessage: message =>
      onHave(message.subarray(0, 32), message.subarray(32), peer),
  })

  function sendWant(topic, wantKey) {
    const proof = wantProof(
      wantKey,
      topic,
      remoteChallenge,
      noise.publicKey,
      noise.remotePublicKey
    )
    want.send(b4a.concat([topic, proof]))
  }

  peer = {
    want(topic, wantKey) {
      if (channel.closed) return
      if (remoteChallenge) sendWant(topic, wantKey)
      else pendingWants.set(b4a.toString(topic, 'hex'), [topic, wantKey])
    },
    have: (topic, driveKey) => have.send(b4a.concat([topic, driveKey])),
    /** Constant-time check; the channel closes after MAX_INVALID_WANTS misses. */
    verifyWant(topic, proof, wantKey) {
      if (channel.closed) return false
      const expected = wantProof(
        wantKey,
        topic,
        localChallenge,
        noise.remotePublicKey,
        noise.publicKey
      )
      if (proof.length === expected.length && timingSafeEqual(proof, expected))
        return true
      invalidWants += 1
      if (invalidWants >= MAX_INVALID_WANTS) channel.close()
      return false
    },
  }
  channel.open(localChallenge)
  return peer
}
