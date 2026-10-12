import { importer } from 'ipfs-unixfs-importer'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import type { CID } from 'multiformats/cid'

type SubtleCryptoLike = {
  digest: (
    algorithm: string | { name: string },
    data: BufferSource
  ) => Promise<ArrayBuffer>
}

function ensureCryptoSubtle() {
  const globalObject = globalThis as unknown as {
    crypto?: { subtle?: SubtleCryptoLike }
  }
  const cryptoObject = globalObject.crypto || {}
  if (typeof cryptoObject.subtle?.digest === 'function') return
  cryptoObject.subtle = {
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      const digest =
        name === 'SHA-256'
          ? sha256(bytes)
          : name === 'SHA-512'
            ? sha512(bytes)
            : null
      if (!digest) throw new Error(`Unsupported digest algorithm: ${name}`)
      return digest.buffer.slice(
        digest.byteOffset,
        digest.byteOffset + digest.byteLength
      ) as ArrayBuffer
    },
  }
  globalObject.crypto = cryptoObject
}

function createDummyBlockstore() {
  return {
    put: async (key: CID, _value: unknown) => key,
    get: async () => {
      throw new Error('CID calculation blockstore is write-only')
    },
    has: async () => false,
  }
}

export async function calculateUnixfsCidFromContent(
  content: Iterable<Uint8Array> | AsyncIterable<Uint8Array>
) {
  ensureCryptoSubtle()
  const blockstore = createDummyBlockstore()
  let rootCid: CID | null = null
  let size = 0

  async function* trackSize() {
    for await (const chunk of content) {
      size += chunk.byteLength
      yield chunk
    }
  }

  try {
    for await (const entry of importer(
      [
        {
          path: 'file',
          content: trackSize(),
        },
      ],
      blockstore,
      {
        cidVersion: 1,
        rawLeaves: true,
        wrapWithDirectory: false,
      }
    )) {
      rootCid = entry.cid
    }
  } catch (error) {
    throw new Error(
      `Failed to calculate mobile CID: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    )
  }

  if (!rootCid) {
    throw new Error('Failed to calculate mobile CID: no root CID generated')
  }

  return {
    cid: rootCid.toString(),
    size,
  }
}

export async function calculateUnixfsCidFromBytes(bytes: Uint8Array) {
  return calculateUnixfsCidFromContent([bytes])
}
