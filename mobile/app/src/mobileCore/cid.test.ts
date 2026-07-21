import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateUnixfsCidFromBytes } from './cid'

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
})
