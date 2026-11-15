import { createHmac } from 'node:crypto'
import b4a from 'b4a'
import c from 'compact-encoding'
import Protomux from 'protomux'

export const CID_DRIVE_PROTOCOL = 'most-cid-drive/2'

/**
 * Name of this node's own drive for a CID topic. Only the holder of `secret`
 * can derive the name, and therefore the drive's signing key.
 */
export function cidDriveName(secret, topicHex) {
  const tag = createHmac('sha256', secret)
    .update(`most-cid-drive-v2:${topicHex}`)
    .digest('hex')
  return `cid-drive-${tag}`
}

/**
 * Opens the want/have channel on a replication stream:
 * want(topic) asks which drive key the peer seeds for a topic;
 * have(topic, driveKey) answers it.
 */
export function attachCidDriveChannel(stream, { onWant, onHave, onClose }) {
  const mux = Protomux.from(stream.noiseStream || stream)
  let peer = null
  const channel = mux.createChannel({
    protocol: CID_DRIVE_PROTOCOL,
    onclose: () => onClose?.(peer),
  })
  if (!channel) return null

  const want = channel.addMessage({
    encoding: c.fixed32,
    onmessage: topic => onWant(topic, peer),
  })
  const have = channel.addMessage({
    encoding: c.fixed64,
    onmessage: message =>
      onHave(message.subarray(0, 32), message.subarray(32), peer),
  })

  peer = {
    want: topic => want.send(topic),
    have: (topic, driveKey) => have.send(b4a.concat([topic, driveKey])),
  }
  channel.open()
  return peer
}
