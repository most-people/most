import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { cleanupLegacyKnowledgeData } from './legacyKnowledgeCleanup.js'

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'most-legacy-cleanup-'))
  const documentsPath = path.join(root, 'Documents')
  const userDataPath = path.join(root, 'UserData')
  const notesPath = path.join(documentsPath, 'MostBox', 'Notes')
  await fs.mkdir(notesPath, { recursive: true })
  await fs.mkdir(userDataPath, { recursive: true })
  await fs.writeFile(path.join(notesPath, 'old.md'), 'legacy')
  await fs.writeFile(
    path.join(documentsPath, 'MostBox', 'published-files.json'),
    'keep'
  )
  return { root, documentsPath, userDataPath, notesPath }
}

test('removes only the fixed Notes directory and records completion', async () => {
  const fixture = await makeFixture()
  try {
    await cleanupLegacyKnowledgeData(fixture)

    await assert.rejects(fs.access(fixture.notesPath))
    assert.equal(
      await fs.readFile(
        path.join(fixture.documentsPath, 'MostBox', 'published-files.json'),
        'utf8'
      ),
      'keep'
    )
    assert.equal(
      await fs.readFile(
        path.join(fixture.userDataPath, 'legacy-knowledge-cleanup-v1'),
        'utf8'
      ),
      'done'
    )
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true })
  }
})

test('retries after a cleanup failure instead of recording a marker', async () => {
  const fixture = await makeFixture()
  let failOnce = true
  const fileSystem = {
    readFile: (...args) => fs.readFile(...args),
    lstat: (...args) => fs.lstat(...args),
    rm: async (...args) => {
      if (failOnce) {
        failOnce = false
        throw new Error('temporary failure')
      }
      return fs.rm(...args)
    },
    mkdir: (...args) => fs.mkdir(...args),
    writeFile: (...args) => fs.writeFile(...args),
  }
  const warnings = []

  try {
    await cleanupLegacyKnowledgeData({
      ...fixture,
      fileSystem,
      logger: { warn: (...args) => warnings.push(args) },
    })
    await fs.access(fixture.notesPath)
    assert.equal(warnings.length, 1)
    await assert.rejects(
      fs.access(path.join(fixture.userDataPath, 'legacy-knowledge-cleanup-v1'))
    )

    await cleanupLegacyKnowledgeData(fixture)
    await assert.rejects(fs.access(fixture.notesPath), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true })
  }
})

test('does not follow a symlink stored at the Notes target', async t => {
  const fixture = await makeFixture()
  const outsidePath = path.join(fixture.root, 'outside')
  try {
    await fs.rm(fixture.notesPath, { recursive: true, force: true })
    await fs.mkdir(outsidePath)
    await fs.writeFile(path.join(outsidePath, 'keep.txt'), 'keep')
    try {
      await fs.symlink(outsidePath, fixture.notesPath, 'junction')
    } catch {
      t.skip('symlink creation is unavailable on this platform')
      return
    }

    await cleanupLegacyKnowledgeData(fixture)
    assert.equal(
      await fs.readFile(path.join(outsidePath, 'keep.txt'), 'utf8'),
      'keep'
    )
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true })
  }
})
