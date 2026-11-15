import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Hyperswarm from 'hyperswarm'
import createTestnet from 'hyperdht/testnet.js'
import { MostBoxEngine } from '../server/src/index.js'
import { MobileP2PCore } from '../app/backend/mobile-core.mjs'

// Desktop engine and mobile core are separate implementations of the CID
// drive protocol; they must exchange files in both directions over a real
// (local) DHT.
it(
  'transfers files between the desktop engine and the mobile core',
  { timeout: 120000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-cross-core-'))
    const testnet = await createTestnet(3)
    const bootstrap = testnet.bootstrap
    const nodes = []

    try {
      const desktop = new MostBoxEngine({
        dataPath: path.join(directory, 'desktop'),
        bootstrap,
        downloadTimeout: 30000,
      })
      await desktop.start()
      nodes.push(desktop)

      const mobile = new MobileP2PCore({
        storagePath: path.join(directory, 'mobile'),
        createSwarm: options => new Hyperswarm({ ...options, bootstrap }),
      })
      await mobile.start()
      nodes.push(mobile)

      const fromDesktop = Buffer.from('published by the desktop engine')
      const desktopPublished = await desktop.publishFile(
        fromDesktop,
        'desktop.txt'
      )
      const mobileDownload = await mobile.downloadLink({
        link: `most://${desktopPublished.cid}?filename=desktop.txt`,
        timeout: 30000,
      })
      assert.deepEqual(fs.readFileSync(mobileDownload.savedPath), fromDesktop)
      assert.equal(mobileDownload.holding.cid, desktopPublished.cid)

      const fromMobile = Buffer.from('published by the mobile core')
      const mobilePublished = await mobile.publishFile({
        name: 'mobile.txt',
        contentBase64: fromMobile.toString('base64'),
      })
      const desktopDownload = await desktop.downloadFile(
        mobilePublished.transfer.link,
        null,
        { timeout: 30000 }
      )
      assert.equal(desktopDownload.localAvailable, true)
      assert.deepEqual(
        (await desktop.readFileRaw(mobilePublished.holding.cid)).buffer,
        fromMobile
      )
    } finally {
      await Promise.allSettled(nodes.map(node => node.stop()))
      await testnet.destroy()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
)
