import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { UnixFS } from 'ipfs-unixfs'

describe('UnixFS file size encoding', () => {
  it('encodes unsigned file sizes consistently across 32-bit boundaries', () => {
    const samples = [
      [2147483647n, 'ffffffff07'],
      [2147483648n, '8080808008'],
      [2214592512n, '808080a008'],
      [4294967295n, 'ffffffff0f'],
      [4294967296n, '8080808010'],
      [10737418240n, '8080808028'],
    ]

    for (const [size, encodedSize] of samples) {
      for (let run = 0; run < 3; run++) {
        const bytes = new UnixFS({ type: 'file', blockSizes: [size] }).marshal()
        assert.equal(
          Buffer.from(bytes).toString('hex'),
          `080218${encodedSize}20${encodedSize}`,
          `Invalid UnixFS encoding for ${size} bytes`
        )
        assert.equal(UnixFS.unmarshal(bytes).fileSize(), size)
      }
    }
  })
})
