import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  DEFAULT_CHUNK_SIZE,
  buildMerkleTree,
  calculateChunkMerkleRoot,
  createMerkleProof,
  verifyMerkleProof,
} from '../../src/core/merkle.js'

describe('Merkle chunk tools', () => {
  it('builds a deterministic root with default 256KB chunks', async () => {
    const content = Buffer.from('hello merkle')
    const first = await calculateChunkMerkleRoot(content)
    const second = await calculateChunkMerkleRoot(content)

    assert.strictEqual(first.chunkSize, DEFAULT_CHUNK_SIZE)
    assert.strictEqual(first.chunkCount, 1)
    assert.strictEqual(first.chunkMerkleRoot, second.chunkMerkleRoot)
    assert.match(first.chunkMerkleRoot, /^[0-9a-f]{64}$/)
  })

  it('splits content across chunk boundaries', async () => {
    const content = Buffer.alloc(DEFAULT_CHUNK_SIZE + 1, 0xab)
    const tree = await buildMerkleTree(content)

    assert.strictEqual(tree.chunkCount, 2)
    assert.strictEqual(tree.leaves.length, 2)
  })

  it('creates and verifies proofs for each chunk', async () => {
    const content = Buffer.from('aaabbbcccddd')
    const tree = await buildMerkleTree(content, { chunkSize: 3 })
    const chunks = [
      Buffer.from('aaa'),
      Buffer.from('bbb'),
      Buffer.from('ccc'),
      Buffer.from('ddd'),
    ]

    for (let i = 0; i < chunks.length; i++) {
      const proof = createMerkleProof(tree, i)
      assert.strictEqual(verifyMerkleProof(chunks[i], proof, tree.root), true)
    }
  })

  it('rejects tampered chunk data', async () => {
    const content = Buffer.from('aaabbb')
    const tree = await buildMerkleTree(content, { chunkSize: 3 })
    const proof = createMerkleProof(tree, 0)

    assert.strictEqual(
      verifyMerkleProof(Buffer.from('xxx'), proof, tree.root),
      false
    )
  })

  it('handles empty content as one empty chunk', async () => {
    const tree = await buildMerkleTree(Buffer.alloc(0))

    assert.strictEqual(tree.chunkCount, 1)
    assert.match(tree.root, /^[0-9a-f]{64}$/)
  })
})
