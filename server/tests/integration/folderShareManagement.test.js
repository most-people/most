import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MostBoxEngine } from '../../src/index.js'

test('manages one replaceable folder share outside the visible file library', async t => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'most-folder-share-management-')
  )
  const engine = new MostBoxEngine({
    dataPath: path.join(tmpDir, 'data'),
    disableNetwork: true,
  })
  t.after(async () => {
    await engine.stop().catch(() => {})
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  await engine.start()

  const folderName = 'managed-folder'
  const child = await engine.publishFile(
    Buffer.from('managed folder first'),
    `${folderName}/one.txt`
  )
  const firstShare = await engine.shareFolder(folderName)

  assert.ok(
    !engine.listPublishedFiles().some(file => file.cid === firstShare.cid)
  )
  assert.deepStrictEqual(
    (await engine.listFolderSharesWithAvailability()).map(file => ({
      cid: file.cid,
      folderShare: file.folderShare,
      localAvailable: file.localAvailable,
    })),
    [
      {
        cid: firstShare.cid,
        folderShare: true,
        localAvailable: true,
      },
    ]
  )

  await engine.publishFile(
    Buffer.from('managed folder second'),
    `${folderName}/two.txt`
  )
  const secondShare = await engine.shareFolder(folderName)

  assert.notStrictEqual(secondShare.cid, firstShare.cid)
  assert.deepStrictEqual(
    (await engine.listFolderSharesWithAvailability()).map(file => file.cid),
    [secondShare.cid]
  )
  assert.ok(
    !engine.listHoldings().some(holding => holding.cid === firstShare.cid)
  )

  await engine.deletePublishedFile(secondShare.cid)

  assert.deepStrictEqual(await engine.listFolderSharesWithAvailability(), [])
  assert.ok(
    !engine.listHoldings().some(holding => holding.cid === secondShare.cid)
  )
  assert.ok(engine.listHoldings().some(holding => holding.cid === child.cid))
})
