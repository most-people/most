import crypto from 'node:crypto'
import fs from 'node:fs'

export const DEFAULT_CHUNK_SIZE = 256 * 1024

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest()
}

function toHex(buffer) {
  return buffer.toString('hex')
}

async function collectChunks(content, chunkSize) {
  if (Buffer.isBuffer(content)) {
    if (content.length === 0) return [Buffer.alloc(0)]

    const chunks = []
    for (let offset = 0; offset < content.length; offset += chunkSize) {
      chunks.push(content.subarray(offset, offset + chunkSize))
    }
    return chunks
  }

  if (typeof content === 'string') {
    const chunks = []
    const stream = fs.createReadStream(content, { highWaterMark: chunkSize })
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    return chunks.length > 0 ? chunks : [Buffer.alloc(0)]
  }

  const chunks = []
  let pending = Buffer.alloc(0)
  for await (const chunk of content) {
    pending = Buffer.concat([pending, Buffer.from(chunk)])
    while (pending.length >= chunkSize) {
      chunks.push(pending.subarray(0, chunkSize))
      pending = pending.subarray(chunkSize)
    }
  }
  if (pending.length > 0 || chunks.length === 0) {
    chunks.push(pending)
  }
  return chunks
}

export async function buildMerkleTree(content, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE
  const chunks = await collectChunks(content, chunkSize)
  const leaves = chunks.map(chunk => sha256(chunk))
  const levels = [leaves]

  while (levels.at(-1).length > 1) {
    const current = levels.at(-1)
    const next = []

    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]
      const right = current[i + 1] || left
      next.push(sha256(Buffer.concat([left, right])))
    }

    levels.push(next)
  }

  return {
    root: toHex(levels.at(-1)[0]),
    chunkSize,
    chunkCount: chunks.length,
    leaves: leaves.map(toHex),
    levels: levels.map(level => level.map(toHex)),
  }
}

export async function calculateChunkMerkleRoot(content, options = {}) {
  const tree = await buildMerkleTree(content, options)
  return {
    chunkMerkleRoot: tree.root,
    chunkSize: tree.chunkSize,
    chunkCount: tree.chunkCount,
  }
}

export function createMerkleProof(tree, chunkIndex) {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error('chunkIndex must be a non-negative integer')
  }
  if (chunkIndex >= tree.chunkCount) {
    throw new Error('chunkIndex out of range')
  }

  const proof = []
  let index = chunkIndex

  for (let levelIndex = 0; levelIndex < tree.levels.length - 1; levelIndex++) {
    const level = tree.levels[levelIndex]
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1
    const sibling = level[siblingIndex] || level[index]

    proof.push({
      position: index % 2 === 0 ? 'right' : 'left',
      hash: sibling,
    })

    index = Math.floor(index / 2)
  }

  return proof
}

export function verifyMerkleProof(chunk, proof, expectedRoot) {
  let current = sha256(Buffer.from(chunk))

  for (const step of proof) {
    const sibling = Buffer.from(step.hash, 'hex')
    current =
      step.position === 'left'
        ? sha256(Buffer.concat([sibling, current]))
        : sha256(Buffer.concat([current, sibling]))
  }

  return toHex(current) === expectedRoot
}
