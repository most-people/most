// Checks the mobile protocol v2 primitives against the shared vectors in
// docs/protocol/vectors/v2/. The desktop test reads the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import { H, KDF, MAC, label } from './protocol-v2.mjs'
import { CanonicalJsonError, canonicalJson } from '../shared/canonical-json.mjs'
import hypercoreCrypto from 'hypercore-crypto'
import { signedPayload } from '../shared/chat-signing.mjs'
import { signBody, verifySignedEnvelope } from './chat-signatures-v2.mjs'
import { verifyDeviceCertP2P } from './device-cert.mjs'
import { deriveChatSeed } from './scrypt-native.mjs'
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
  resolveChannelHandle,
  verifyChannelProof,
} from './channel-keys-v2.mjs'

function readVectors(name) {
  const url = new URL(`../../docs/protocol/vectors/v2/${name}`, import.meta.url)
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

function parts(list) {
  return list.map(part =>
    part.utf8 !== undefined
      ? b4a.from(part.utf8, 'utf8')
      : b4a.from(part.hex, 'hex')
  )
}

const hex = bytes => b4a.toString(bytes, 'hex')
const fromHex = value => b4a.from(value, 'hex')

describe('protocol v2 primitives (mobile core)', () => {
  const vectors = readVectors('envelope.json')

  it('builds labels and rejects invalid purposes', () => {
    for (const item of vectors.labels) {
      assert.equal(hex(label(item.purpose)), item.label)
    }
    for (const purpose of vectors.invalidPurposes) {
      assert.throws(() => label(purpose), TypeError, JSON.stringify(purpose))
    }
  })

  it('computes H, MAC and KDF', () => {
    for (const item of vectors.H) {
      assert.equal(hex(H(item.purpose, ...parts(item.parts))), item.output)
    }
    for (const item of vectors.MAC) {
      const key = b4a.from(item.key, 'hex')
      assert.equal(
        hex(MAC(key, item.purpose, ...parts(item.parts))),
        item.output
      )
    }
    for (const item of vectors.KDF) {
      const key = b4a.from(item.key, 'hex')
      assert.equal(hex(KDF(key, item.purpose)), item.output)
    }
  })
})

describe('protocol v2 channel keys (mobile core)', () => {
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

  it('resolves channel handles', () => {
    for (const item of vectors.handles) {
      const result = resolveChannelHandle(item.input)
      if (!item.result) {
        assert.equal(result, null, item.input)
        continue
      }
      assert.deepEqual(
        { ...result, key: hex(result.key) },
        item.result,
        item.input
      )
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

describe('protocol v2 canonical JSON (mobile)', () => {
  const vectors = readVectors('canonical-json.json')

  it('serializes valid values and rejects the rest', () => {
    for (const item of vectors.valid) {
      assert.equal(canonicalJson(JSON.parse(item.input)), item.canonical)
    }
    for (const input of vectors.invalid) {
      assert.throws(
        () => canonicalJson(JSON.parse(input)),
        CanonicalJsonError,
        input
      )
    }
    assert.throws(() => canonicalJson({ at: new Date() }), CanonicalJsonError)
  })
})

describe('protocol v2 signatures (mobile core)', () => {
  const vectors = readVectors('signatures.json')
  const certs = readVectors('device-cert.json')
  const secretKey = hypercoreCrypto.keyPair(fromHex(certs.deviceSeed)).secretKey

  it('verifies and reproduces the signed envelopes', () => {
    for (const item of vectors.valid) {
      assert.equal(hex(signedPayload(item.envelope.body)), item.payload)
      assert.equal(signBody(item.envelope.body, secretKey), item.envelope.sig)
      assert.deepEqual(
        verifySignedEnvelope(item.envelope, { channelId: vectors.channelId }),
        { ok: true, author: vectors.author }
      )
    }
  })

  it('rejects tampered or misattributed envelopes', () => {
    for (const item of vectors.invalid) {
      const result = verifySignedEnvelope(item.envelope, {
        channelId: item.channelId || vectors.channelId,
      })
      assert.equal(result.ok, false, item.reason)
    }
  })

  it('accepts certificates regardless of time in P2P', () => {
    for (const cert of [certs.cert, certs.expiredCert]) {
      assert.deepEqual(verifyDeviceCertP2P(cert), {
        ok: true,
        address: certs.address,
        devicePublicKey: certs.devicePublicKey,
      })
    }
    assert.equal(
      verifyDeviceCertP2P(certs.otherAccountCert).address,
      certs.otherAccountAddress
    )
    assert.equal(verifyDeviceCertP2P(`${certs.cert}x`).ok, false)
  })
})

describe('protocol v2 chat identity (mobile core, native)', () => {
  const vectors = readVectors('chat-identity.json')

  it('derives the same chat seed with libsodium', async () => {
    for (const item of vectors.cases) {
      const chatSeed = await deriveChatSeed(item.username, item.password)
      assert.equal(`0x${hex(chatSeed)}`, item.chatSeed, item.username)
    }
  })
})
