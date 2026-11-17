// Checks the desktop implementation against the shared protocol vectors in
// docs/protocol/vectors/. The mobile tests read the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import c from 'compact-encoding'
import {
  buildMostLink,
  calculateCid,
  parseMostLink,
} from '../../src/core/cid.js'
import { getCidInfo } from '../../src/core/cidTopic.js'
import { cidDriveName } from '../../src/core/cidDriveExchange.js'
import {
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
} from '../../src/core/channelIdentity.js'
import { verifyChannelTopicProof } from '../../src/core/channelHello.js'
import {
  deriveP2PPingTopic,
  encodeP2PPingFrame,
} from '../../src/core/p2pPing.js'
import { mostWallet } from '../../src/utils/mostWallet.js'
import { deriveAccountSyncKeys } from '../../src/utils/accountSync.js'

function readVectors(name) {
  const url = new URL(`../../../docs/protocol/vectors/${name}`, import.meta.url)
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

function sampleContent(content) {
  if (content.utf8 !== undefined) return Buffer.from(content.utf8, 'utf8')
  const { length, modulo } = content.pattern
  return Buffer.alloc(length).map((_, i) => i % modulo)
}

const LINK_ERROR_KINDS = {
  link_empty: 'empty',
  unsupported_query_param: 'unsupported_query',
  cid_v1_required: 'cid_v1_required',
  invalid_cid_format: 'invalid_cid',
}

describe('protocol vectors (desktop)', () => {
  it('computes golden CIDs and their file topics', async () => {
    for (const sample of readVectors('cid.json').samples) {
      const { cid } = await calculateCid(sampleContent(sample.content))
      assert.equal(cid.toString(), sample.cid, sample.name)
      assert.equal(getCidInfo(sample.cid).topicHex, sample.topic, sample.name)
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

  it('parses and builds most:// links', () => {
    const vectors = readVectors('links.json')
    for (const item of vectors.valid) {
      assert.deepEqual(parseMostLink(item.input), {
        cid: item.cid,
        fileName: item.fileName,
      })
    }
    for (const item of vectors.invalid) {
      const parsed = parseMostLink(item.input)
      assert.equal(
        LINK_ERROR_KINDS[parsed.errorCode],
        item.errorKind,
        item.input
      )
    }
    for (const item of vectors.build) {
      assert.equal(buildMostLink(item.cid, item.fileName), item.link)
    }
  })

  it('derives channel topics and verifies channel proofs', () => {
    const vectors = readVectors('channels.json')
    for (const item of vectors.topics) {
      const hex = value => b4a.toString(value, 'hex')
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

  it('derives the account address and sync keys', () => {
    const vectors = readVectors('account.json')
    const wallet = mostWallet(vectors.username, vectors.password)
    assert.equal(wallet.danger, vectors.seed)
    assert.equal(wallet.address, vectors.address)
    const { syncKey, topic } = deriveAccountSyncKeys(wallet.danger)
    assert.equal(syncKey, vectors.syncKey)
    assert.equal(topic, vectors.syncTopic)
  })
})
