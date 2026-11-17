// Checks the desktop protocol v2 primitives against the shared vectors in
// docs/protocol/vectors/v2/. The mobile core test reads the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { H, KDF, MAC, label } from '../../src/core/protocolV2.js'
import {
  channelIdFromKey,
  channelTopics,
  channelWriterKeyPair,
  createChannelProof,
  decodeChannelCredential,
  encodeChannelCredential,
  legacyChannelKey,
  normalizePublicChannelName,
  publicChannelKey,
  verifyChannelProof,
} from '../../src/core/channelKeysV2.js'

const hex = bytes => Buffer.from(bytes).toString('hex')
const fromHex = value => Buffer.from(value, 'hex')

function readVectors(name) {
  const url = new URL(
    `../../../docs/protocol/vectors/v2/${name}`,
    import.meta.url
  )
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

function parts(list) {
  return list.map(part =>
    part.utf8 !== undefined
      ? Buffer.from(part.utf8, 'utf8')
      : Buffer.from(part.hex, 'hex')
  )
}

describe('protocol v2 primitives (desktop)', () => {
  const vectors = readVectors('envelope.json')

  it('builds labels and rejects invalid purposes', () => {
    for (const item of vectors.labels) {
      assert.equal(label(item.purpose).toString('hex'), item.label)
    }
    for (const purpose of vectors.invalidPurposes) {
      assert.throws(() => label(purpose), TypeError, JSON.stringify(purpose))
    }
  })

  it('computes H, MAC and KDF', () => {
    for (const item of vectors.H) {
      assert.equal(
        H(item.purpose, ...parts(item.parts)).toString('hex'),
        item.output
      )
    }
    for (const item of vectors.MAC) {
      const key = Buffer.from(item.key, 'hex')
      assert.equal(
        MAC(key, item.purpose, ...parts(item.parts)).toString('hex'),
        item.output
      )
    }
    for (const item of vectors.KDF) {
      const key = Buffer.from(item.key, 'hex')
      assert.equal(KDF(key, item.purpose).toString('hex'), item.output)
    }
  })
})

describe('protocol v2 channel keys (desktop)', () => {
  const vectors = readVectors('channel.json')
  const nodeSecret = fromHex(vectors.nodeSecret)

  it('encodes credentials and derives channel IDs and topics', () => {
    for (const item of vectors.channels) {
      const key = fromHex(item.key)
      assert.equal(encodeChannelCredential(key), item.credential)
      assert.equal(hex(decodeChannelCredential(item.credential)), item.key)
      assert.equal(
        hex(decodeChannelCredential(item.credential.toUpperCase())),
        item.key
      )
      assert.equal(channelIdFromKey(key), item.channelId)
      const topics = channelTopics(key)
      assert.equal(hex(topics.replication), item.replicationTopic)
      assert.equal(hex(topics.chat), item.chatTopic)
    }
    for (const credential of vectors.invalidCredentials) {
      assert.equal(decodeChannelCredential(credential), null, credential)
    }
  })

  it('creates and verifies channel proofs', () => {
    for (const item of vectors.channels) {
      const input = { key: fromHex(item.key), ...item.proof }
      delete input.proof
      assert.equal(hex(createChannelProof(input)), item.proof.proof)
      assert.equal(verifyChannelProof(input, item.proof.proof), true)
      const other = { ...input, verifierPublicKey: item.proof.proverPublicKey }
      assert.equal(verifyChannelProof(other, item.proof.proof), false)
    }
  })

  it('derives public, legacy and writer keys', () => {
    for (const item of vectors.publicChannels) {
      assert.equal(normalizePublicChannelName(item.name), item.normalized)
      assert.equal(hex(publicChannelKey(item.name)), item.key)
    }
    for (const name of vectors.invalidPublicNames) {
      assert.equal(normalizePublicChannelName(name), '', name)
      assert.throws(() => publicChannelKey(name), TypeError)
    }
    for (const item of vectors.legacyChannels) {
      assert.equal(hex(legacyChannelKey(item.v1ChannelId)), item.key)
    }
    for (const item of vectors.channels) {
      for (const writer of item.writers) {
        const pair = channelWriterKeyPair(
          nodeSecret,
          item.channelId,
          writer.generation
        )
        assert.equal(hex(pair.publicKey), writer.publicKey)
        assert.equal(pair.secretKey.length, 64)
      }
    }
  })
})
