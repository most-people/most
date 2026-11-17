// Checks the mobile core against the shared protocol vectors in
// docs/protocol/vectors/. The desktop tests read the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import c from 'compact-encoding'
import { calculateCid } from './mobile-core.mjs'
import { cidDriveName } from './cid-drive-exchange.mjs'
import {
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
  verifyChannelTopicProof,
} from './channel-protocol.mjs'
import { deriveP2PPingTopic, encodeP2PPingFrame } from './p2p-ping.mjs'

function readVectors(name) {
  const url = new URL(`../../docs/protocol/vectors/${name}`, import.meta.url)
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

function sampleContent(content) {
  if (content.utf8 !== undefined) return Buffer.from(content.utf8, 'utf8')
  const { length, modulo } = content.pattern
  return Buffer.alloc(length).map((_, i) => i % modulo)
}

describe('protocol vectors (mobile core)', () => {
  it('computes golden CIDs', async () => {
    for (const sample of readVectors('cid.json').samples) {
      const { cid } = await calculateCid({
        buffer: sampleContent(sample.content),
      })
      assert.equal(cid, sample.cid, sample.name)
    }
  })

  it('derives CID drive names and encodes want/have', () => {
    const vectors = readVectors('file-transfer.json')
    const secret = b4a.from(vectors.secret, 'hex')
    for (const item of vectors.driveNames) {
      assert.equal(cidDriveName(secret, item.topic), item.driveName)
    }
    const { topic, driveKey, want, have } = vectors.messages
    const topicBytes = b4a.from(topic, 'hex')
    const haveBytes = b4a.concat([topicBytes, b4a.from(driveKey, 'hex')])
    assert.equal(
      b4a.toString(c.encode(c.fixed32, topicBytes), 'hex'),
      want.payload
    )
    assert.equal(
      b4a.toString(c.encode(c.fixed64, haveBytes), 'hex'),
      have.payload
    )
  })

  it('derives channel topics and verifies channel proofs', () => {
    const vectors = readVectors('channels.json')
    const hex = value => b4a.toString(value, 'hex')
    for (const item of vectors.topics) {
      assert.equal(
        hex(generateChannelDiscoveryKey(item.channelId)),
        item.replication
      )
      assert.equal(
        hex(generateChannelChatDiscoveryKey(item.channelId)),
        item.chat
      )
      assert.equal(
        hex(generateChannelIdDiscoveryKey(item.channelId)),
        item.candidates
      )
    }
    for (const item of vectors.proofs) {
      const { proof, ...input } = item
      assert.equal(verifyChannelTopicProof(input, proof), true)
    }
  })

  it('derives the P2P Ping topic and frames', () => {
    const vectors = readVectors('p2p-ping.json')
    assert.equal(
      b4a.toString(deriveP2PPingTopic(vectors.code, vectors.direction), 'hex'),
      vectors.topic
    )
    for (const [type, frame] of Object.entries(vectors.frames)) {
      assert.equal(
        encodeP2PPingFrame(
          vectors.code,
          vectors.direction,
          type,
          vectors.nonce
        ),
        `${frame}\n`
      )
    }
  })
})
