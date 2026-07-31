import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import git from 'isomorphic-git'
import {
  commitNoteGitChanges,
  configureNoteGitAuthor,
  getNoteGitDiff,
  getNoteGitStatus,
  initializeNoteGit,
  listNoteGitHistory,
  restoreNoteGitFile,
} from '../../src/utils/noteGit.js'

const tmpDirs = []
const AUTHOR = { name: 'MostBox User', email: 'user@mostbox.local' }

function makeVault(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `most-note-git-${name}-`))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true })
  }
})

describe('noteGit', () => {
  it('initializes a main repository with repository-local author config', async () => {
    const vaultDir = makeVault('init')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), '# Hello', 'utf8')

    const before = await getNoteGitStatus(vaultDir)
    const initialized = await initializeNoteGit(vaultDir, AUTHOR)

    assert.strictEqual(before.initialized, false)
    assert.strictEqual(initialized.initialized, true)
    assert.strictEqual(initialized.branch, 'main')
    assert.deepStrictEqual(initialized.author, AUTHOR)
    assert.deepStrictEqual(initialized.changes, [
      { path: 'hello.md', status: 'added', staged: false },
    ])
    assert.strictEqual(
      await git.getConfig({ fs, dir: vaultDir, path: 'user.name' }),
      AUTHOR.name
    )
  })

  it('commits only Markdown changes and exposes history and diffs', async () => {
    const vaultDir = makeVault('commit')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), '# Hello', 'utf8')
    fs.writeFileSync(path.join(vaultDir, 'ignored.txt'), 'not a note', 'utf8')
    await initializeNoteGit(vaultDir, AUTHOR)

    const first = await commitNoteGitChanges(vaultDir, 'Initial notes')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), '# Updated', 'utf8')

    const workingDiff = await getNoteGitDiff(vaultDir, 'hello.md')
    const second = await commitNoteGitChanges(vaultDir, 'Update hello')
    const history = await listNoteGitHistory(vaultDir, 10)
    const commitDiff = await getNoteGitDiff(vaultDir, 'hello.md', second.oid)

    assert.match(first.oid, /^[a-f0-9]{40}$/)
    assert.match(second.oid, /^[a-f0-9]{40}$/)
    assert.deepStrictEqual(second.status.changes, [])
    assert.ok(workingDiff.parts.some(part => part.removed))
    assert.ok(workingDiff.parts.some(part => part.added))
    assert.deepStrictEqual(
      history.map(commit => commit.message),
      ['Update hello', 'Initial notes']
    )
    assert.deepStrictEqual(history[0].changes, [
      { path: 'hello.md', status: 'modified' },
    ])
    assert.ok(commitDiff.parts.some(part => part.added))
    assert.deepStrictEqual(
      await git.listFiles({ fs, dir: vaultDir, ref: 'HEAD' }),
      ['hello.md']
    )
  })

  it('restores a historical file into the working tree without moving HEAD', async () => {
    const vaultDir = makeVault('restore')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), 'first', 'utf8')
    await initializeNoteGit(vaultDir, AUTHOR)
    const first = await commitNoteGitChanges(vaultDir, 'First')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), 'second', 'utf8')
    const second = await commitNoteGitChanges(vaultDir, 'Second')

    const restored = await restoreNoteGitFile(vaultDir, 'hello.md', first.oid)

    assert.strictEqual(restored.exists, true)
    assert.strictEqual(
      fs.readFileSync(path.join(vaultDir, 'hello.md'), 'utf8'),
      'first'
    )
    assert.strictEqual(
      await git.resolveRef({ fs, dir: vaultDir, ref: 'HEAD' }),
      second.oid
    )
    assert.deepStrictEqual(restored.status.changes, [
      { path: 'hello.md', status: 'modified', staged: false },
    ])
  })

  it('treats restoring an already deleted file version as successful', async () => {
    const vaultDir = makeVault('restore-deleted')
    const filePath = path.join(vaultDir, 'hello.md')
    fs.writeFileSync(filePath, 'first', 'utf8')
    await initializeNoteGit(vaultDir, AUTHOR)
    await commitNoteGitChanges(vaultDir, 'Add file')
    fs.unlinkSync(filePath)
    const deletion = await commitNoteGitChanges(vaultDir, 'Delete file')

    const restored = await restoreNoteGitFile(
      vaultDir,
      'hello.md',
      deletion.oid
    )

    assert.strictEqual(restored.exists, false)
    assert.strictEqual(fs.existsSync(filePath), false)
    assert.deepStrictEqual(restored.status.changes, [])
  })

  it('rejects working diffs through symlinks outside the vault', async t => {
    if (process.platform === 'win32') {
      t.skip('symlink creation requires additional Windows privileges')
      return
    }

    const rootDir = makeVault('diff-symlink')
    const vaultDir = path.join(rootDir, 'vault')
    const outsideFile = path.join(rootDir, 'outside.txt')
    fs.mkdirSync(vaultDir)
    fs.writeFileSync(outsideFile, 'outside secret', 'utf8')
    fs.symlinkSync(outsideFile, path.join(vaultDir, 'leak.md'))
    await initializeNoteGit(vaultDir, AUTHOR)

    await assert.rejects(
      getNoteGitDiff(vaultDir, 'leak.md'),
      err => err.code === 'PATH_SECURITY_ERROR'
    )

    const status = await getNoteGitStatus(vaultDir)
    assert.deepStrictEqual(status.changes, [])
    await assert.rejects(
      commitNoteGitChanges(vaultDir, 'Commit link'),
      err => err.errorCode === 'NOTE_GIT_NO_CHANGES'
    )
  })

  it('applies the history limit after filtering non-Markdown commits', async () => {
    const vaultDir = makeVault('history-limit')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), 'note', 'utf8')
    await initializeNoteGit(vaultDir, AUTHOR)
    await commitNoteGitChanges(vaultDir, 'Markdown commit')

    for (let index = 1; index <= 3; index += 1) {
      fs.writeFileSync(path.join(vaultDir, 'other.txt'), String(index), 'utf8')
      await git.add({ fs, dir: vaultDir, filepath: 'other.txt' })
      await git.commit({
        fs,
        dir: vaultDir,
        message: `Other ${index}`,
        author: AUTHOR,
      })
    }

    const originalLog = git.log
    const logOptions = []
    git.log = options => {
      logOptions.push(options)
      return originalLog(options)
    }

    let history
    try {
      history = await listNoteGitHistory(vaultDir, 1)
    } finally {
      git.log = originalLog
    }

    assert.deepStrictEqual(
      history.map(commit => commit.message),
      ['Markdown commit']
    )
    assert.ok(logOptions.every(options => Number.isInteger(options.depth)))
    assert.strictEqual(logOptions[0].includeChanges, undefined)
    assert.ok(
      logOptions
        .slice(1)
        .every(
          options => options.depth === 1 && options.includeChanges === true
        )
    )
  })

  it('refuses to include an existing staged index in a MostBox commit', async () => {
    const vaultDir = makeVault('staged')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), 'first', 'utf8')
    await initializeNoteGit(vaultDir, AUTHOR)
    await commitNoteGitChanges(vaultDir, 'First')
    fs.writeFileSync(path.join(vaultDir, 'hello.md'), 'second', 'utf8')
    await git.add({ fs, dir: vaultDir, filepath: 'hello.md' })

    await assert.rejects(
      commitNoteGitChanges(vaultDir, 'Should fail'),
      /staged changes/i
    )
  })

  it('updates author config and rejects unsafe .git paths', async () => {
    const vaultDir = makeVault('config')
    await initializeNoteGit(vaultDir, AUTHOR)
    const nextAuthor = { name: 'Another User', email: 'another@example.com' }

    assert.deepStrictEqual(
      await configureNoteGitAuthor(vaultDir, nextAuthor),
      nextAuthor
    )

    const unsafeVault = makeVault('unsafe')
    fs.writeFileSync(path.join(unsafeVault, '.git'), 'outside', 'utf8')
    await assert.rejects(getNoteGitStatus(unsafeVault), /local directory/i)
  })
})
