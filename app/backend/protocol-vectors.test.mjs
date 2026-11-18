// Checks the mobile core against the shared protocol vectors in
// docs/protocol/vectors/. The desktop tests read the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import c from 'compact-encoding'
import { calculateCid } from './mobile-core.mjs'
import {
  CID_DRIVE_PROTOCOL,
  cidDriveName,
  fileTopic,
  wantKeyFor,
  wantProof,
} from './cid-drive-exchange.mjs'
import {
  buildChannelHelloMessages,
  consumeChannelFrames,
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
  normalizeChannelAttachment,
  normalizeChannelMessage,
  sortChannelMessages,
  verifyChannelTopicProof,
} from './channel-protocol.mjs'
import { deriveP2PPingTopic, encodeP2PPingFrame } from './p2p-ping.mjs'
import { createRandomChannelId } from './protocol.mjs'

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

  it('derives v2 file topics, want proofs, drive names and payloads', () => {
    const vectors = readVectors('v2/file.json')
    assert.equal(CID_DRIVE_PROTOCOL, vectors.protocol)
    const hex = value => b4a.from(value, 'hex')
    const secret = hex(vectors.secret)
    for (const item of vectors.files) {
      const topic = fileTopic(hex(item.digest))
      const wantKey = wantKeyFor(hex(item.digest))
      const proof = wantProof(
        wantKey,
        topic,
        hex(vectors.challenge),
        hex(vectors.requesterPublicKey),
        hex(vectors.responderPublicKey)
      )
      assert.equal(b4a.toString(topic, 'hex'), item.topic, item.name)
      assert.equal(b4a.toString(wantKey, 'hex'), item.wantKey, item.name)
      assert.equal(b4a.toString(proof, 'hex'), item.proof, item.name)
      assert.equal(cidDriveName(secret, topic), item.driveName, item.name)
      assert.equal(
        b4a.toString(c.encode(c.fixed64, b4a.concat([topic, proof])), 'hex'),
        item.want,
        item.name
      )
      assert.equal(
        b4a.toString(
          c.encode(c.fixed64, b4a.concat([topic, hex(vectors.driveKey)])),
          'hex'
        ),
        item.have,
        item.name
      )
    }
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

  it('creates random channel IDs as v2 credentials', () => {
    // Protocol v2: a new channel is 32 random bytes encoded as a credential.
    const v2 = JSON.parse(
      fs.readFileSync(
        new URL('../../docs/protocol/vectors/v2/channel.json', import.meta.url),
        'utf8'
      )
    )
    for (const item of v2.channels) {
      const bytes = b4a.from(item.key, 'hex')
      assert.equal(
        createRandomChannelId(target => target.set(bytes)),
        item.credential
      )
    }
  })

  it('splits chat swarm frames', () => {
    for (const item of readVectors('chat.json').frames) {
      const run = () => {
        let remainder = b4a.alloc(0)
        const frames = []
        for (const chunk of item.chunks) {
          const result = consumeChannelFrames(
            remainder,
            b4a.from(chunk),
            item.maxFrameBytes
          )
          remainder = result.remainder
          frames.push(...result.frames)
        }
        return { frames, remainder: b4a.toString(remainder, 'utf8') }
      }
      if (item.error) {
        assert.throws(run, { code: item.error })
      } else {
        assert.deepEqual(run(), {
          frames: item.frames,
          remainder: item.remainder,
        })
      }
    }
  })

  it('splits channel-hello across frames', () => {
    const { base, channels, cases, empty } = readVectors('chat.json').hello
    for (const item of [...cases, empty]) {
      const list = item === empty ? [] : channels
      const build = () =>
        buildChannelHelloMessages(base, list, item.maxFrameBytes)
      if (item.error) {
        assert.throws(build, new RegExp(`hello ${item.error}`))
        continue
      }
      assert.deepEqual(
        build().map(message =>
          message.channels.map(channel => channel.channelId)
        ),
        item.frames
      )
    }
  })

  it('normalizes attachments and clientMessageIds', () => {
    const vectors = readVectors('chat.json')
    for (const item of vectors.attachments.valid) {
      assert.deepEqual(normalizeChannelAttachment(item.input), item.output)
    }
    for (const item of vectors.attachments.invalid) {
      assert.equal(
        normalizeChannelAttachment(item.input),
        undefined,
        item.reason
      )
    }
    for (const item of vectors.clientMessageIds) {
      const message = normalizeChannelMessage({
        content: 'hi',
        clientMessageId: item.input,
      })
      assert.equal(message.clientMessageId || '', item.output)
    }
  })

  it('dedupes and orders channel history', () => {
    const { entries, mobile } = readVectors('chat.json').history
    const messages = sortChannelMessages(
      entries.map(item => ({
        ...item.entry,
        _coreKey: item.coreKey,
        _index: item.index,
        _id: item.id,
      }))
    )
    assert.deepEqual(
      messages.map(message => message._id),
      mobile
    )
  })
})
