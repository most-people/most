import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateUnixfsCidFromBytes,
  calculateUnixfsCidFromContent,
} from './cid'

describe('mobile UnixFS CID', () => {
  it('matches protocol golden samples', async () => {
    const samples = [
      {
        name: 'empty',
        content: Buffer.alloc(0),
        expected: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
      },
      {
        name: 'hello-world',
        content: Buffer.from('hello world'),
        expected: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
      },
      {
        name: 'cross-chunk',
        content: Buffer.from(
          Array.from({ length: 256 * 1024 + 1 }, (_, index) => index % 251)
        ),
        expected: 'bafybeiexg2oqkfnj56l7fcmawswqbijt5shq4b5rg6a546uwpkqqzwjioi',
      },
    ]

    for (const sample of samples) {
      const result = await calculateUnixfsCidFromBytes(sample.content)
      assert.equal(result.cid, sample.expected, `${sample.name} CID changed`)
      assert.equal(result.size, sample.content.byteLength)
    }
  })

  it('keeps the same CID when content arrives in uneven chunks', async () => {
    const content = Buffer.from(
      Array.from({ length: 256 * 1024 + 1 }, (_, index) => index % 251)
    )
    const result = await calculateUnixfsCidFromContent([
      content.subarray(0, 17),
      content.subarray(17, 70_003),
      content.subarray(70_003),
    ])
    assert.equal(
      result.cid,
      'bafybeiexg2oqkfnj56l7fcmawswqbijt5shq4b5rg6a546uwpkqqzwjioi'
    )
    assert.equal(result.size, content.length)
  })

  it('consumes a multi-megabyte file as bounded chunks', async () => {
    const totalBytes = 2 * 1024 * 1024 + 123
    let offset = 0
    let largestChunk = 0
    async function* chunks() {
      while (offset < totalBytes) {
        const size = Math.min(64 * 1024, totalBytes - offset)
        const chunk = Buffer.allocUnsafe(size)
        for (let index = 0; index < size; index += 1) {
          chunk[index] = (offset + index) % 251
        }
        offset += size
        largestChunk = Math.max(largestChunk, chunk.length)
        yield chunk
      }
    }

    const result = await calculateUnixfsCidFromContent(chunks())
    assert.equal(
      result.cid,
      'bafybeias463b7nhk4h2rzv3demsptjfsw74vt7cirldq6qtjpczkgeouxq'
    )
    assert.equal(result.size, totalBytes)
    assert.equal(largestChunk, 64 * 1024)
  })
})
