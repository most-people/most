// Checks the desktop implementation against the shared protocol vectors in
// docs/protocol/vectors/. The mobile tests read the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import c from 'compact-encoding'
import Hyperswarm from 'hyperswarm'
import { createRandomChannelId } from '../../../src/lib/chatRoom.js'
import { chatTopicFor } from '../../src/node/accountSync.js'
import {
  buildMostLink,
  calculateCid,
  parseMostLink,
} from '../../src/core/cid.js'
import { getCidInfo } from '../../src/core/cidTopic.js'
import {
  CID_DRIVE_PROTOCOL,
  cidDriveName,
  fileTopic,
  wantKeyFor,
  wantProof,
} from '../../src/core/cidDriveExchange.js'
import {
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
} from '../../src/core/channelIdentity.js'
import {
  buildChannelHelloMessages,
  verifyChannelTopicProof,
} from '../../src/core/channelHello.js'
import { consumeChannelFrames } from '../../src/core/channelFrames.js'
import { normalizeChannelAttachment } from '../../src/core/channelAttachment.js'
import {
  getChannelHistoryDedupeKey,
  isChannelHistoryEntry,
  isChannelMemberProfileEventEntry,
  normalizeChannelMentionList,
  normalizeClientMessageId,
} from '../../src/core/channelMessage.js'
import { compareChannelHistoryEntries } from '../../src/core/channelHistory.js'
import { normalizeChannelVoiceEvent } from '../../src/core/channelVoice.js'
import {
  deriveP2PPingTopic,
  encodeP2PPingFrame,
} from '../../src/core/p2pPing.js'
import { mostWallet } from '../../src/utils/mostWallet.js'
import {
  deriveAccountSyncKeys,
  mergeAccountEntries,
  openAccountEntry,
  sealAccountEntry,
} from '../../src/utils/accountSync.js'

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
  it('computes golden CIDs', async () => {
    for (const sample of readVectors('cid.json').samples) {
      const { cid } = await calculateCid(sampleContent(sample.content))
      assert.equal(cid.toString(), sample.cid, sample.name)
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
      const info = getCidInfo(item.cid)
      assert.equal(info.topicHex, item.topic, item.name)
      assert.equal(b4a.toString(info.wantKey, 'hex'), item.wantKey, item.name)
      assert.equal(info.legacyDriveName, item.legacyDriveName, item.name)
    }
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
    assert.equal(
      b4a.toString(chatTopicFor(topic), 'hex'),
      vectors.syncChatTopic
    )
  })

  it('creates random channel IDs as v2 credentials', () => {
    // Protocol v2: a new channel is 32 random bytes encoded as a credential.
    const v2 = JSON.parse(
      fs.readFileSync(
        new URL(
          '../../../docs/protocol/vectors/v2/channel.json',
          import.meta.url
        ),
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

  it('derives the file swarm key pair from the node seed', async () => {
    const vectors = readVectors('node.json')
    const swarm = new Hyperswarm({
      seed: b4a.from(vectors.seed, 'hex'),
      bootstrap: [],
    })
    try {
      assert.equal(
        b4a.toString(swarm.keyPair.publicKey, 'hex'),
        vectors.publicKey
      )
    } finally {
      await swarm.destroy()
    }
  })

  it('splits chat swarm frames', () => {
    for (const item of readVectors('chat.json').frames) {
      const run = () => {
        let remainder = Buffer.alloc(0)
        const frames = []
        for (const chunk of item.chunks) {
          const result = consumeChannelFrames(
            remainder,
            Buffer.from(chunk),
            item.maxFrameBytes
          )
          remainder = result.remainder
          frames.push(...result.frames)
        }
        return { frames, remainder: remainder.toString('utf8') }
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
      const messages = build()
      assert.deepEqual(
        messages.map(message =>
          message.channels.map(channel => channel.channelId)
        ),
        item.frames
      )
      for (const message of messages) {
        assert.ok(
          Buffer.byteLength(JSON.stringify(message)) <= item.maxFrameBytes
        )
      }
    }
  })

  it('normalizes attachments, clientMessageIds and mentions', () => {
    const vectors = readVectors('chat.json')
    for (const item of vectors.attachments.valid) {
      assert.deepEqual(normalizeChannelAttachment(item.input), item.output)
    }
    for (const item of vectors.attachments.invalid) {
      assert.throws(() => normalizeChannelAttachment(item.input), item.reason)
    }
    for (const item of vectors.clientMessageIds) {
      assert.equal(normalizeClientMessageId(item.input), item.output)
    }
    for (const item of vectors.mentions) {
      assert.deepEqual(
        normalizeChannelMentionList(item.input, item.content),
        item.output
      )
    }
  })

  it('dedupes and orders channel history', () => {
    const { entries, desktop } = readVectors('chat.json').history
    const seen = new Set()
    const history = entries
      .map(item => ({
        ...item.entry,
        _coreKey: item.coreKey,
        _index: item.index,
        _id: item.id,
      }))
      .filter(isChannelHistoryEntry)
      .filter(message => {
        const key = getChannelHistoryDedupeKey(message)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort(compareChannelHistoryEntries)
      .filter(message => !isChannelMemberProfileEventEntry(message))
    assert.deepEqual(
      history.map(message => message._id),
      desktop
    )
  })

  it('opens and merges account sync entries', () => {
    const vectors = readVectors('account-sync.json')
    assert.deepEqual(
      openAccountEntry(vectors.envelope, vectors.syncKey),
      vectors.entry
    )
    assert.equal(openAccountEntry(vectors.envelope, vectors.wrongSyncKey), null)
    const sealed = sealAccountEntry(vectors.entry, vectors.syncKey)
    assert.deepEqual(openAccountEntry(sealed, vectors.syncKey), vectors.entry)
    const winners = mergeAccountEntries(vectors.merge.entries)
    assert.deepEqual(Object.fromEntries(winners), vectors.merge.winners)
  })

  it('normalizes channel-voice events', () => {
    const vectors = readVectors('voice.json')
    const expand = value =>
      JSON.parse(JSON.stringify(value), (_key, field) =>
        field && typeof field === 'object' && 'repeat' in field
          ? field.repeat.repeat(field.count)
          : field
      )
    for (const item of vectors.valid) {
      assert.deepEqual(
        normalizeChannelVoiceEvent(item.channel, item.input, {
          timestamp: item.timestamp,
        }),
        item.output
      )
    }
    for (const item of vectors.invalid) {
      assert.throws(
        () => normalizeChannelVoiceEvent(item.channel, expand(item.input)),
        item.reason
      )
    }
  })
})
