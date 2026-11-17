// Checks the mobile app against the shared protocol vectors in
// docs/protocol/vectors/. The desktop tests read the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildMostLink,
  getCidTopicDigest,
  MOST_LINK_ERROR_CODES,
  parseMostLink,
} from './protocol'
import { createMobileIdentity } from '../remoteNode/identity'

function readVectors(name: string) {
  const url = new URL(`../../../docs/protocol/vectors/${name}`, import.meta.url)
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

const LINK_ERROR_KINDS: Record<string, string> = {
  [MOST_LINK_ERROR_CODES.linkEmpty]: 'empty',
  [MOST_LINK_ERROR_CODES.unsupportedQuery]: 'unsupported_query',
  [MOST_LINK_ERROR_CODES.cidV1Required]: 'cid_v1_required',
  [MOST_LINK_ERROR_CODES.invalidCid]: 'invalid_cid',
}

function hex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('hex')
}

describe('protocol vectors (mobile app)', () => {
  it('derives file topics from CIDs', () => {
    for (const sample of readVectors('cid.json').samples) {
      assert.equal(hex(getCidTopicDigest(sample.cid)), sample.topic)
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
      assert.throws(
        () => parseMostLink(item.input),
        (error: Error) => LINK_ERROR_KINDS[error.message] === item.errorKind,
        item.input
      )
    }
    for (const item of vectors.build) {
      assert.equal(buildMostLink(item.cid, item.fileName), item.link)
    }
  })

  it('derives the account address and sync key', async () => {
    const vectors = readVectors('account.json')
    const identity = await createMobileIdentity(
      vectors.username,
      vectors.password,
      { deviceLabel: 'protocol-vectors' }
    )
    assert.equal(identity.address, vectors.address)
    assert.equal(identity.syncKey, vectors.syncKey)
  })
})
