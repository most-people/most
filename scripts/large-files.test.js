import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { MostBoxEngine } from '../server/src/index.js'
import { calculateCid } from '../server/src/core/cid.js'
import { MobileP2PCore } from '../mobile/app/backend/mobile-core.mjs'

const FILE_SIZE = 2112 * 1024 * 1024
const EXPECTED_CID =
  'bafybeih2aevrefukrvek3by26dzp2vflcwbyl4pluxewbrowb3xgkitpu4'

class OfflineSwarm extends EventEmitter {
  connections = new Set()
  keyPair = { publicKey: Buffer.alloc(32, 3) }
  join() {
    return { flushed: async () => {} }
  }
  async leave() {}
  async destroy() {
    this.emit('close')
  }
}

it(
  'keeps a 2112MiB CID stable across desktop, mobile and seed handoff',
  {
    timeout: 300000,
  },
  async t => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'mostbox-large-files-')
    )
    const engines = []
    const connections = []
    let mobile
    t.after(async () => {
      for (const connection of connections) connection.close()
      await Promise.allSettled(engines.map(engine => engine.stop()))
      if (mobile) await mobile.stop()
      await fs.promises.rm(directory, { recursive: true, force: true })
    })

    const filePath = path.join(directory, 'large.bin')
    const chunk = Buffer.alloc(1024 * 1024)
    for (let index = 0; index < chunk.length; index++)
      chunk[index] = index % 251
    const file = await fs.promises.open(filePath, 'w')
    try {
      for (let offset = 0; offset < FILE_SIZE; offset += chunk.length) {
        chunk.writeUInt32LE(offset / chunk.length, 0)
        await file.write(chunk)
      }
    } finally {
      await file.close()
    }

    for (const highWaterMark of [0, 1024 * 1024, 70003]) {
      const content = highWaterMark
        ? fs.createReadStream(filePath, { highWaterMark })
        : filePath
      const calculated = await calculateCid(content)
      assert.equal(calculated.cid.toString(), EXPECTED_CID)
    }

    async function createEngine(name) {
      const engine = new MostBoxEngine({
        dataPath: path.join(directory, name),
        disableNetwork: true,
        downloadTimeout: 30000,
      })
      engines.push(engine)
      await engine.start()
      return engine
    }
    const publisher = await createEngine('publisher')
    const seed = await createEngine('seed')
    const receiver = await createEngine('receiver')
    const published = await publisher.publishFile(filePath, 'large.bin')
    assert.equal(published.cid, EXPECTED_CID)
    connections.push(publisher.replicateWith(seed))
    const downloaded = await seed.pullByCid({
      cid: published.cid,
      fileName: 'large.bin',
      streamReadTimeout: 30000,
    })
    assert.equal(downloaded.localAvailable, true)
    await publisher.stop()
    connections.push(seed.replicateWith(receiver))
    const handedOff = await receiver.pullByCid({
      cid: published.cid,
      fileName: 'large.bin',
      streamReadTimeout: 30000,
    })
    assert.equal(handedOff.localAvailable, true)
    const { stream } = await receiver.openFileReadStream(published.cid, {
      public: true,
    })
    assert.equal((await calculateCid(stream)).cid.toString(), EXPECTED_CID)

    mobile = new MobileP2PCore({
      storagePath: path.join(directory, 'mobile'),
      createSwarm: () => new OfflineSwarm(),
    })
    await mobile.start()
    const mobilePublished = await mobile.publishFile({
      filePath,
      name: 'large.bin',
    })
    assert.equal(mobilePublished.holding.cid, EXPECTED_CID)
    assert.equal(mobilePublished.holding.localAvailable, true)
    await mobile.stop()
    await mobile.start()
    const existing = await mobile.downloadLink({ link: published.link })
    assert.equal(existing.alreadyExists, true)
    assert.equal(existing.holding.localAvailable, true)
    assert.equal(existing.holding.status, 'active')
  }
)
