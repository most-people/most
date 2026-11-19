import {
  signedPresenceError,
  readSignedPresenceFrame,
} from '../../src/core/channelSignedPresence.js'
// Checks the desktop protocol v2 primitives against the shared vectors in
// docs/protocol/vectors/v2/. The mobile core test reads the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { H, KDF, MAC, label } from '../../src/core/protocolV2.js'
import {
  CanonicalJsonError,
  canonicalJson,
} from '../../src/core/canonicalJson.js'
import hypercoreCrypto from 'hypercore-crypto'
import { signedPayload } from '../../src/core/chatSigning.js'
import {
  signBody,
  verifySignedEnvelope,
} from '../../src/core/chatSignaturesV2.js'
import { verifyDeviceCert } from '../../src/utils/auth.js'
import {
  chatAccountFromSeed,
  chatIdentityPassword,
  chatIdentitySalt,
  deriveChatSeed,
} from '../../src/utils/chatIdentity.js'
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

describe('protocol v2 canonical JSON (desktop)', () => {
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
    assert.throws(() => canonicalJson({ fn: () => {} }), CanonicalJsonError)
  })
})

describe('protocol v2 signatures (desktop)', () => {
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
      assert.equal(verifyDeviceCert(cert, { checkTime: false }).ok, true)
    }
    assert.equal(
      verifyDeviceCert(certs.expiredCert, { now: 1795000000000 }).ok,
      false
    )
  })
})

describe('protocol v2 chat identity (desktop)', () => {
  const vectors = readVectors('chat-identity.json')

  it('derives the chat seed and sync key with scrypt N=2^17', async () => {
    for (const item of vectors.cases) {
      assert.equal(hex(chatIdentitySalt(item.username)), item.salt)
      assert.equal(hex(chatIdentityPassword(item.password)), item.passwordBytes)
      const chatSeed = await deriveChatSeed(item.username, item.password)
      assert.equal(chatSeed, item.chatSeed, item.username)
      const account = chatAccountFromSeed(chatSeed)
      assert.equal(account.syncKey, item.syncKey)
      assert.match(account.address, /^0x[0-9a-fA-F]{40}$/)
    }
  })
})

describe('protocol v2 signed presence (desktop)', () => {
  const vectors = readVectors('presence.json')
  const certs = readVectors('device-cert.json')
  const secretKey = hypercoreCrypto.keyPair(fromHex(certs.deviceSeed)).secretKey
  const options = { channelId: vectors.channelId, now: vectors.now }

  it('accepts shared vectors without rewriting signed bodies', () => {
    for (const item of vectors.valid) {
      const original = JSON.stringify(item.envelope)
      assert.equal(
        hex(signedPayload(item.envelope.body)),
        item.payload,
        item.name
      )
      assert.equal(
        signBody(item.envelope.body, secretKey),
        item.envelope.sig,
        item.name
      )
      assert.equal(signedPresenceError(item.envelope, options), '', item.name)
      const frame = { v: 2, type: 'channel-presence', ...item.envelope }
      assert.equal(readSignedPresenceFrame(frame, options), frame, item.name)
      assert.equal(JSON.stringify(item.envelope), original, item.name)
    }
  })

  it('rejects stale, tampered, misattributed and malformed presence', () => {
    for (const item of vectors.invalid) {
      const check = { ...options, ...item.options }
      assert.equal(
        signedPresenceError(item.envelope, check),
        item.error,
        item.name
      )
      const frame = { v: 2, type: 'channel-presence', ...item.envelope }
      assert.equal(readSignedPresenceFrame(frame, check), null, item.name)
    }
  })

  it('ignores unsigned, unknown-version and unknown-type frames', () => {
    for (const value of [null, {}, { body: null }]) {
      assert.notEqual(signedPresenceError(value, options), '')
      assert.equal(readSignedPresenceFrame(value, options), null)
    }
    const signed = vectors.valid[0].envelope
    for (const v of [undefined, 1, 3, '2']) {
      assert.equal(
        readSignedPresenceFrame(
          { v, type: 'channel-presence', ...signed },
          options
        ),
        null
      )
    }
    assert.equal(
      readSignedPresenceFrame({ v: 2, type: 'future', ...signed }, options),
      null
    )
  })
})
