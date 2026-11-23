import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import createTestnet from 'hyperdht/testnet.js'
import b4a from 'b4a'
import { MostBoxEngine } from '../../src/index.js'
import { getCidInfo } from '../../src/core/cidTopic.js'
import { calculateCid } from '../../src/core/cid.js'

const require = createRequire(import.meta.url)
const DHT = createRequire(require.resolve('hyperswarm'))('hyperdht')

// On the public DHT a lookup can miss a seed's record (or run before the
// record lands). Hyperswarm only queries a topic again after 10 minutes, so
// the download must keep looking the topic up itself. Here the downloader's
// first query is made to return no peers.
it('finds the seed after the first topic lookup missed it', async t => {
  const original = DHT.prototype.announce
  const testnet = await createTestnet(3)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-late-seed-'))
  const engines = []
  t.after(async () => {
    DHT.prototype.announce = original
    await Promise.allSettled(engines.map(engine => engine.stop()))
    await testnet.destroy()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const start = async name => {
    const engine = new MostBoxEngine({
      dataPath: path.join(directory, name),
      bootstrap: testnet.bootstrap,
    })
    engines.push(engine)
    await engine.start()
    return engine
  }

  const content = Buffer.from('found on the second lookup')
  const { topic } = getCidInfo((await calculateCid(content)).cid.toString())
  // Joined topics announce, and the announce query is also the lookup. The
  // publisher's DHT is left alone; the downloader's first query loses its
  // peers.
  const publisherDhts = new Set()
  let downloading = false
  let missed = false
  DHT.prototype.announce = function (...args) {
    const query = original.apply(this, args)
    if (!b4a.equals(args[0], topic)) return query
    if (!downloading) publisherDhts.add(this)
    if (!downloading || publisherDhts.has(this) || missed) return query
    missed = true
    return {
      get closestNodes() {
        return query.closestNodes
      },
      destroy: () => query.destroy(),
      async *[Symbol.asyncIterator]() {
        for await (const data of query) yield { ...data, peers: [] }
      },
    }
  }
  const publisher = await start('publisher')
  const { cid, link } = await publisher.publishFile(content, 'late.txt')
  const downloader = await start('downloader')
  downloading = true
  const result = await downloader.downloadFile(link, null, { timeout: 20000 })
  assert.ok(missed)
  assert.equal(result.localAvailable, true)
  assert.deepEqual((await downloader.readFileRaw(cid)).buffer, content)
})
