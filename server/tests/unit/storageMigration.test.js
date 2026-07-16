import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { CID } from 'multiformats/cid'
import { MostBoxEngine } from '../../src/index.js'
import { calculateCid, calculateDirectoryCid } from '../../src/core/cid.js'
import {
  migrateLegacyV042Storage,
  scanLegacyV042Storage,
} from '../../src/node/legacyV042Migration.js'
import {
  cleanupV05MigrationData,
  runV05StorageCleanupCli,
} from '../../src/node/storageCleanup.js'
import { ensureStorageSchema } from '../../src/node/storageSchema.js'
import { runV05StorageMigrationCli } from '../../src/node/storageMigration.js'

const LEGACY_PRIMARY_KEY_TEXT = 'most-box-global-shared-seed-v1'

function createTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'most-legacy-migrate-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function legacyDriveName(cid) {
  const digest = b4a.toString(CID.parse(cid).multihash.digest, 'hex')
  return `drive-${digest}`
}

async function writeDriveFile(store, driveName, driveKey, content) {
  const drive = new Hyperdrive(store.namespace(driveName))
  await drive.ready()
  await drive.put(driveKey, content)
  await drive.close()
}

async function createLegacyFixture(root, options = {}) {
  const sourcePath = path.join(root, 'legacy')
  fs.mkdirSync(sourcePath)
  const primaryKey = b4a.alloc(32).fill(LEGACY_PRIMARY_KEY_TEXT)
  const store = new Corestore(sourcePath, { primaryKey, unsafe: true })
  await store.ready()

  const fileContent = Buffer.from('legacy immutable file')
  const fileCid = (await calculateCid(fileContent)).cid.toString()
  const fileDriveName = legacyDriveName(fileCid)
  await writeDriveFile(store, fileDriveName, `/${fileCid}`, fileContent)

  const collectionFiles = [
    { path: 'legacy-folder/a.txt', content: Buffer.from('legacy a') },
    { path: 'legacy-folder/nested/b.txt', content: Buffer.from('legacy b') },
  ]
  const directory = await calculateDirectoryCid(collectionFiles)
  const collectionCid = directory.cid.toString()
  const collectionDriveName = legacyDriveName(collectionCid)
  const collectionFileCids = []
  for (let index = 0; index < collectionFiles.length; index += 1) {
    const file = collectionFiles[index]
    const cid = (await calculateCid(file.content)).cid.toString()
    collectionFileCids.push(cid)
    if (index === options.omitCollectionChildIndex) continue
    const driveName = legacyDriveName(cid)
    await writeDriveFile(store, driveName, `/${cid}`, file.content)
  }
  for (const [blockCid, block] of directory.blocks) {
    const driveKey =
      blockCid === collectionCid ? `/${blockCid}` : `/.unixfs/${blockCid}`
    await writeDriveFile(store, collectionDriveName, driveKey, block)
  }

  const channelId = 'legacy-room'
  const writer = store.namespace(`channel-${channelId}`).get({
    name: 'messages-legacy-writer',
    valueEncoding: 'json',
  })
  await writer.ready()
  await writer.append([
    {
      type: 'message',
      content: 'legacy first',
      author: '0x1111111111111111111111111111111111111111',
      authorName: 'Legacy',
      timestamp: 100,
    },
    {
      type: 'message',
      content: 'legacy second',
      author: '0x1111111111111111111111111111111111111111',
      authorName: 'Legacy',
      timestamp: 200,
    },
  ])
  const writerKey = b4a.toString(writer.key, 'hex')
  await writer.close()
  await store.close()

  fs.writeFileSync(
    path.join(sourcePath, 'node-holdings.json'),
    JSON.stringify([
      {
        cid: fileCid,
        fileName: 'legacy.txt',
        size: fileContent.length,
        driveName: fileDriveName,
        source: 'published',
      },
      {
        cid: collectionCid,
        fileName: 'legacy-folder',
        size: 0,
        driveName: collectionDriveName,
        source: 'published',
        kind: 'collection',
      },
    ])
  )
  fs.writeFileSync(
    path.join(sourcePath, 'published-files.json'),
    JSON.stringify({
      '0x1111111111111111111111111111111111111111': [
        {
          cid: fileCid,
          fileName: 'legacy.txt',
          size: fileContent.length,
          driveName: fileDriveName,
          source: 'published',
        },
        {
          cid: collectionCid,
          fileName: 'legacy-folder',
          size: directory.totalSize,
          driveName: collectionDriveName,
          source: 'published',
          kind: 'collection',
        },
      ],
    })
  )
  fs.writeFileSync(
    path.join(sourcePath, 'channels.json'),
    JSON.stringify([
      {
        channelId,
        channelKey: channelId,
        name: channelId,
        type: 'group',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastMessageAt: '2026-01-02T00:00:00.000Z',
        writerId: 'legacy-writer',
        localWriterCoreKey: writerKey,
        writerCoreKeys: [writerKey],
        members: [
          {
            address: '0x1111111111111111111111111111111111111111',
            displayName: 'Legacy',
          },
        ],
      },
    ])
  )
  fs.writeFileSync(
    path.join(sourcePath, 'account-metadata.json'),
    JSON.stringify({ profiles: {} })
  )

  return {
    sourcePath,
    fileCid,
    fileContent,
    collectionCid,
    collectionFileCids,
    channelId,
  }
}

describe('v0.4.2 to v0.5 storage migration', () => {
  it('verifies legacy content without changing either directory', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const before = fs.readdirSync(fixture.sourcePath).sort()

    const result = await scanLegacyV042Storage(fixture.sourcePath)

    assert.equal(result.holdingCount, 2)
    assert.equal(result.publishedCount, 2)
    assert.equal(result.collectionCount, 1)
    assert.equal(result.channelCount, 1)
    assert.equal(result.channelEntryCount, 2)
    assert.deepEqual(fs.readdirSync(fixture.sourcePath).sort(), before)
  })

  it('builds, verifies, and atomically switches a complete v0.5 store', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    ensureStorageSchema(targetPath)
    fs.writeFileSync(path.join(targetPath, 'empty-marker.txt'), 'old target')

    const result = await migrateLegacyV042Storage(
      { sourcePath: fixture.sourcePath, targetPath },
      { now: new Date('2026-07-20T00:00:00.000Z') }
    )

    assert.equal(result.importedPublishedCount, 2)
    assert.equal(result.importedChannelCount, 1)
    assert.equal(fs.existsSync(fixture.sourcePath), true)
    assert.equal(
      fs.readFileSync(
        path.join(result.archivedTarget, 'empty-marker.txt'),
        'utf8'
      ),
      'old target'
    )
    const report = JSON.parse(
      fs.readFileSync(path.join(targetPath, 'v0.5-import-report.json'), 'utf8')
    )
    assert.deepEqual(report.cleanupCandidates, [
      { kind: 'legacy-source', path: fixture.sourcePath },
      { kind: 'previous-target', path: result.archivedTarget },
    ])

    const engine = new MostBoxEngine({
      dataPath: targetPath,
      disableNetwork: true,
    })
    await engine.start()
    try {
      const file = await engine.readFileRaw(fixture.fileCid, { public: true })
      assert.deepEqual(file.buffer, fixture.fileContent)
      const collection = await engine.getCollection(fixture.collectionCid)
      assert.equal(collection.files.length, 2)
      const messages = await engine.getChannelMessages(fixture.channelId, {
        limit: 100,
      })
      assert.deepEqual(
        messages.map(message => message.content),
        ['legacy first', 'legacy second']
      )
    } finally {
      await engine.stop()
    }
  })

  it('keeps the CLI read-only unless --apply is explicit', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    const output = []

    const result = await runV05StorageMigrationCli(
      ['--source-path', fixture.sourcePath, '--data-path', targetPath],
      { write: line => output.push(line) }
    )

    assert.equal(result.status, 'verified')
    assert.equal(fs.existsSync(targetPath), false)
    assert.match(output.join('\n'), /No changes were made/)
  })

  it('preserves a partial collection and reports its unavailable child', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root, {
      omitCollectionChildIndex: 1,
    })
    const targetPath = path.join(root, 'target')

    const result = await migrateLegacyV042Storage({
      sourcePath: fixture.sourcePath,
      targetPath,
    })

    assert.equal(result.unavailableCount, 1)
    assert.equal(result.unavailableItems[0].kind, 'collection-file')
    assert.equal(result.unavailableItems[0].cid, fixture.collectionFileCids[1])
    assert.equal(result.importedRootCids.includes(fixture.collectionCid), true)

    const engine = new MostBoxEngine({
      dataPath: targetPath,
      disableNetwork: true,
    })
    await engine.start()
    try {
      const collection = await engine.getCollection(fixture.collectionCid)
      assert.equal(collection.files.length, 2)
      assert.equal(collection.localAvailableCount, 1)
      assert.equal(collection.missingLocalCount, 1)
    } finally {
      await engine.stop()
    }
  })

  it('leaves the target untouched when legacy verification fails', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    ensureStorageSchema(targetPath)
    fs.writeFileSync(path.join(targetPath, 'keep.txt'), 'keep target')
    const holdingsPath = path.join(fixture.sourcePath, 'node-holdings.json')
    fs.writeFileSync(holdingsPath, '{')

    await assert.rejects(
      migrateLegacyV042Storage({
        sourcePath: fixture.sourcePath,
        targetPath,
      }),
      error => error.code === 'LEGACY_METADATA_INVALID'
    )
    assert.equal(
      fs.readFileSync(path.join(targetPath, 'keep.txt'), 'utf8'),
      'keep target'
    )
  })

  it('rejects nested source and target paths', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(fixture.sourcePath, 'nested-target')

    await assert.rejects(
      migrateLegacyV042Storage({
        sourcePath: fixture.sourcePath,
        targetPath,
      }),
      error => error.code === 'MIGRATION_UNSAFE_PATH'
    )
    assert.equal(fs.existsSync(targetPath), false)
  })

  it('refuses to replace a target that already has an import report', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    ensureStorageSchema(targetPath)
    fs.writeFileSync(
      path.join(targetPath, 'v0.5-import-report.json'),
      JSON.stringify({ schemaVersion: 1 })
    )

    await assert.rejects(
      migrateLegacyV042Storage({
        sourcePath: fixture.sourcePath,
        targetPath,
      }),
      error => error.code === 'MIGRATION_ALREADY_APPLIED'
    )
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPath, 'v0.5-import-report.json'),
          'utf8'
        )
      ).schemaVersion,
      1
    )
  })

  it('rejects empty equals-form CLI paths', async () => {
    await assert.rejects(
      runV05StorageMigrationCli(['--data-path=']),
      error => error.code === 'STORAGE_MIGRATION_INVALID_ARGUMENT'
    )
    await assert.rejects(
      runV05StorageMigrationCli(['--source-path=']),
      error => error.code === 'STORAGE_MIGRATION_INVALID_ARGUMENT'
    )
  })
})

describe('v0.5 migration cleanup', () => {
  it('previews and then permanently removes only recorded migration archives', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    ensureStorageSchema(targetPath)
    fs.writeFileSync(path.join(targetPath, 'old-target.txt'), 'old target')
    const migration = await migrateLegacyV042Storage(
      { sourcePath: fixture.sourcePath, targetPath },
      { now: new Date('2026-07-20T01:00:00.000Z') }
    )

    const preview = cleanupV05MigrationData(targetPath)
    assert.equal(preview.status, 'preview')
    assert.equal(preview.changed, false)
    assert.equal(preview.candidates.length, 2)
    assert.equal(fs.existsSync(fixture.sourcePath), true)
    assert.equal(fs.existsSync(migration.archivedTarget), true)

    const cleaned = cleanupV05MigrationData(targetPath, {
      apply: true,
      now: new Date('2026-07-20T02:00:00.000Z'),
    })
    assert.equal(cleaned.status, 'cleaned')
    assert.equal(cleaned.removed.length, 2)
    assert.equal(fs.existsSync(fixture.sourcePath), false)
    assert.equal(fs.existsSync(migration.archivedTarget), false)
    assert.equal(fs.existsSync(targetPath), true)
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPath, 'v0.5-import-report.json'),
          'utf8'
        )
      ).cleanup.removed.length,
      2
    )

    const repeated = cleanupV05MigrationData(targetPath, { apply: true })
    assert.equal(repeated.status, 'already-clean')
    assert.equal(repeated.changed, false)
  })

  it('derives candidates from migration reports created before cleanup support', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    const createdAt = '2026-07-20T03:00:00.000Z'
    const archivedTarget = `${targetPath}.before-v0.5-import-20260720030000000`
    ensureStorageSchema(targetPath)
    ensureStorageSchema(archivedTarget)
    fs.writeFileSync(path.join(archivedTarget, 'old-target.txt'), 'old target')
    fs.writeFileSync(
      path.join(targetPath, 'v0.5-import-report.json'),
      JSON.stringify({
        schemaVersion: 1,
        sourcePath: fixture.sourcePath,
        createdAt,
      })
    )

    const result = cleanupV05MigrationData(targetPath)
    assert.deepEqual(
      result.candidates.map(candidate => candidate.path),
      [fixture.sourcePath, archivedTarget]
    )
    assert.equal(
      result.candidates.every(candidate => candidate.exists),
      true
    )
  })

  it('refuses a tampered report that points cleanup at the active target', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    ensureStorageSchema(targetPath)
    fs.writeFileSync(
      path.join(targetPath, 'v0.5-import-report.json'),
      JSON.stringify({
        schemaVersion: 1,
        sourcePath: fixture.sourcePath,
        targetPath,
        createdAt: '2026-07-20T04:00:00.000Z',
        cleanupCandidates: [{ kind: 'legacy-source', path: targetPath }],
      })
    )

    assert.throws(
      () => cleanupV05MigrationData(targetPath, { apply: true }),
      error => error.code === 'STORAGE_CLEANUP_UNSAFE_PATH'
    )
    assert.equal(fs.existsSync(targetPath), true)
    assert.equal(fs.existsSync(fixture.sourcePath), true)
  })

  it('uses the configured path and requires interactive confirmation', async t => {
    const root = createTempRoot(t)
    const fixture = await createLegacyFixture(root)
    const targetPath = path.join(root, 'target')
    ensureStorageSchema(targetPath)
    fs.writeFileSync(
      path.join(targetPath, 'v0.5-import-report.json'),
      JSON.stringify({
        schemaVersion: 1,
        sourcePath: fixture.sourcePath,
        createdAt: '2026-07-20T05:00:00.000Z',
        cleanupCandidates: [
          { kind: 'legacy-source', path: fixture.sourcePath },
        ],
      })
    )
    const output = []

    const result = await runV05StorageCleanupCli([], {
      dataPath: targetPath,
      confirm: async () => false,
      write: line => output.push(line),
    })

    assert.equal(result.status, 'cancelled')
    assert.equal(fs.existsSync(fixture.sourcePath), true)
    assert.match(output.join('\n'), /Cleanup cancelled/)

    const cleaned = await runV05StorageCleanupCli([], {
      dataPath: targetPath,
      confirm: async () => true,
      write: () => {},
    })
    assert.equal(cleaned.status, 'cleaned')
    assert.equal(fs.existsSync(fixture.sourcePath), false)
  })
})
