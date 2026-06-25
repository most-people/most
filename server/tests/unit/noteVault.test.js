import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  configureNoteVault,
  getNoteVaultStatus,
  listMarkdownFiles,
  normalizeNoteVaultRelativePath,
  readMarkdownFile,
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
    fs.writeFileSync(path.join(vaultDir, '.hidden', 'hidden.md'), 'hidden', 'utf8')
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
})
