import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  configureNoteVault,
  createMarkdownFile,
  createNoteVaultSnapshot,
  deleteMarkdownFile,
  getNoteVaultStatus,
  listMarkdownFiles,
  moveMarkdownFile,
  normalizeNoteVaultRelativePath,
  readMarkdownFile,
  restoreNoteVaultSnapshot,
  writeMarkdownFile,
} from '../../src/utils/noteVault.js'

const tmpDirs = []

function makeTmpDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `most-${name}-`))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true })
  }
})

describe('noteVault', () => {
  it('normalizes Markdown relative paths and rejects unsafe paths', () => {
    assert.strictEqual(
      normalizeNoteVaultRelativePath('folder\\note.md'),
      'folder/note.md'
    )
    assert.throws(
      () => normalizeNoteVaultRelativePath('../secret.md'),
      /traversal|escapes|Absolute/i
    )
    assert.throws(
      () => normalizeNoteVaultRelativePath(path.resolve('secret.md')),
      /Absolute/i
    )
    assert.throws(
      () => normalizeNoteVaultRelativePath('folder/image.png'),
      /Markdown/i
    )
    assert.throws(
      () => normalizeNoteVaultRelativePath('.git/config.md'),
      /Hidden|excluded/i
    )
  })

  it('configures a vault and reports status', async () => {
    const configDir = makeTmpDir('note-vault-config')
    const vaultDir = makeTmpDir('note-vault-files')
    fs.writeFileSync(path.join(vaultDir, 'index.md'), '# Hello', 'utf8')

    const status = await configureNoteVault(configDir, vaultDir)
    const savedStatus = await getNoteVaultStatus(configDir)

    assert.strictEqual(status.configured, true)
    assert.strictEqual(savedStatus.configured, true)
    assert.strictEqual(savedStatus.fileCount, 1)
    assert.strictEqual(savedStatus.vaultPath, fs.realpathSync(vaultDir))
    assert.strictEqual(savedStatus.writable, true)
  })

  it('recursively lists Markdown files and skips excluded directories', async () => {
    const vaultDir = makeTmpDir('note-vault-list')
    fs.mkdirSync(path.join(vaultDir, 'docs'), { recursive: true })
    fs.mkdirSync(path.join(vaultDir, '.hidden'), { recursive: true })
    fs.mkdirSync(path.join(vaultDir, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(vaultDir, 'root.md'), 'root', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'docs', 'child.md'), 'child', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'docs', 'skip.txt'), 'skip', 'utf8')
    fs.writeFileSync(
      path.join(vaultDir, '.hidden', 'hidden.md'),
      'hidden',
      'utf8'
    )
    fs.writeFileSync(
      path.join(vaultDir, 'node_modules', 'package.md'),
      'package',
      'utf8'
    )

    const files = await listMarkdownFiles(vaultDir)

    assert.deepStrictEqual(
      files.map(file => file.path),
      ['docs/child.md', 'root.md']
    )
  })

  it('reads and writes Markdown files inside the vault', async () => {
    const vaultDir = makeTmpDir('note-vault-read-write')
    fs.mkdirSync(path.join(vaultDir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(vaultDir, 'docs', 'note.md'), 'before', 'utf8')

    const before = await readMarkdownFile(vaultDir, 'docs/note.md')
    assert.strictEqual(before.content, 'before')

    const after = await writeMarkdownFile(vaultDir, 'docs/note.md', 'after')

    assert.strictEqual(after.content, 'after')
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'docs', 'note.md'), 'utf8'),
      'after'
    )
  })

  it('creates, moves, and deletes Markdown files without overwriting', async () => {
    const vaultDir = makeTmpDir('note-vault-file-ops')
    fs.mkdirSync(path.join(vaultDir, 'docs'), { recursive: true })

    const created = await createMarkdownFile(vaultDir, 'docs/new.md', 'new')
    assert.strictEqual(created.path, 'docs/new.md')
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'docs', 'new.md'), 'utf8'),
      'new'
    )

    await assert.rejects(
      createMarkdownFile(vaultDir, 'docs/new.md', 'again'),
      /already exists/i
    )

    const moved = await moveMarkdownFile(
      vaultDir,
      'docs/new.md',
      'archive/new.md'
    )
    assert.strictEqual(moved.path, 'archive/new.md')
    assert.strictEqual(
      fs.existsSync(path.join(vaultDir, 'docs', 'new.md')),
      false
    )
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'archive', 'new.md'), 'utf8'),
      'new'
    )

    const deleted = await deleteMarkdownFile(vaultDir, 'archive/new.md')
    assert.deepStrictEqual(deleted, {
      path: 'archive/new.md',
      deleted: true,
    })
    assert.strictEqual(
      fs.existsSync(path.join(vaultDir, 'archive', 'new.md')),
      false
    )
  })

  it('creates snapshots and mirror restores Markdown files', async () => {
    const vaultDir = makeTmpDir('note-vault-snapshot')
    fs.mkdirSync(path.join(vaultDir, 'nested'), { recursive: true })
    fs.mkdirSync(path.join(vaultDir, '.hidden'), { recursive: true })
    fs.writeFileSync(path.join(vaultDir, 'keep.md'), 'same', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'old.md'), 'old', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'ignore.txt'), 'ignore', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'nested', 'current.md'), 'old', 'utf8')
    fs.writeFileSync(
      path.join(vaultDir, '.hidden', 'secret.md'),
      'secret',
      'utf8'
    )

    const snapshot = await createNoteVaultSnapshot(vaultDir)
    assert.deepStrictEqual(
      snapshot.files.map(file => file.path),
      ['keep.md', 'nested/current.md', 'old.md']
    )

    const result = await restoreNoteVaultSnapshot(vaultDir, {
      files: [
        { path: 'keep.md', content: 'same' },
        { path: 'nested/new.md', content: 'new' },
      ],
    })

    assert.deepStrictEqual(result, {
      created: 1,
      updated: 0,
      deleted: 2,
      skipped: 1,
      files: 2,
    })
    assert.strictEqual(fs.existsSync(path.join(vaultDir, 'old.md')), false)
    assert.strictEqual(
      fs.existsSync(path.join(vaultDir, 'nested', 'current.md')),
      false
    )
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'nested', 'new.md'), 'utf8'),
      'new'
    )
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'ignore.txt'), 'utf8'),
      'ignore'
    )
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, '.hidden', 'secret.md'), 'utf8'),
      'secret'
    )
  })

  it('rejects unsafe snapshot restore paths', async () => {
    const vaultDir = makeTmpDir('note-vault-unsafe-snapshot')

    await assert.rejects(
      restoreNoteVaultSnapshot(vaultDir, {
        files: [{ path: '../escape.md', content: 'bad' }],
      }),
      /traversal|escapes|Absolute/i
    )
    await assert.rejects(
      restoreNoteVaultSnapshot(vaultDir, {
        files: [{ path: 'image.png', content: 'bad' }],
      }),
      /Markdown/i
    )
  })
})
