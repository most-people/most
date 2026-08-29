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

test('does not keep deleted folder children seeded through a hidden share', async t => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'most-folder-share-child-cleanup-')
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

  const folderName = 'folder-child-cleanup'
  const first = await engine.publishFile(
    Buffer.from('folder child to delete'),
    `${folderName}/one.txt`
  )
  const second = await engine.publishFile(
    Buffer.from('folder child to retain'),
    `${folderName}/two.txt`
  )
  const share = await engine.shareFolder(folderName)

  await engine.deletePublishedFile(first.cid)

  const holdings = engine.listHoldings()
  assert.ok(holdings.some(holding => holding.cid === share.cid))
  assert.ok(!holdings.some(holding => holding.cid === first.cid))
  assert.ok(holdings.some(holding => holding.cid === second.cid))

  const collection = await engine.getCollection(share.cid)
  assert.deepStrictEqual(
    collection.files.map(file => ({
      path: file.path,
      localAvailable: file.localAvailable,
    })),
    [
      { path: 'one.txt', localAvailable: false },
      { path: 'two.txt', localAvailable: true },
    ]
  )
})

test('rejects a folder share CID already used by another library record', async t => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'most-folder-share-cid-conflict-')
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

  const folderName = 'folder-share-conflict'
  const firstContent = Buffer.from('folder share conflict first')
  const secondContent = Buffer.from('folder share conflict second')
  await engine.publishFile(firstContent, `${folderName}/one.txt`)
  const originalShare = await engine.shareFolder(folderName)
  await engine.publishFile(secondContent, `${folderName}/two.txt`)

  const visibleCollection = await engine.publishCollection(
    [
      { path: `${folderName}/one.txt`, content: firstContent },
      { path: `${folderName}/two.txt`, content: secondContent },
    ],
    'visible-copy',
    { seedChildFiles: false }
  )

  await assert.rejects(engine.shareFolder(folderName), error => {
    assert.strictEqual(error.code, 'CONFLICT')
    return true
  })
  assert.deepStrictEqual(
    (await engine.listFolderSharesWithAvailability()).map(file => file.cid),
    [originalShare.cid]
  )
  assert.ok(
    engine.listPublishedFiles().some(file => file.cid === visibleCollection.cid)
  )
})
