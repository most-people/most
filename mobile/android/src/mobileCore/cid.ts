import { importer } from 'ipfs-unixfs-importer'
import type { CID } from 'multiformats/cid'

function createDummyBlockstore() {
  return {
    put: async (key: CID, _value: unknown) => key,
    get: async () => {
      throw new Error('Not implemented')
    },
    has: async () => false,
  }
}

export async function calculateUnixfsCidFromBytes(bytes: Uint8Array) {
  const blockstore = createDummyBlockstore()
  let rootCid: CID | null = null

  try {
    for await (const entry of importer(
      [
        {
          path: 'file',
          content: [bytes],
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
    size: bytes.byteLength,
  }
}
