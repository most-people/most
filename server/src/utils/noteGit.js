import fs from 'node:fs'
import path from 'node:path'
import git from 'isomorphic-git'
import { diffLines } from 'diff'
import { ConflictError, PathSecurityError, ValidationError } from './errors.js'
import {
  deleteMarkdownFile,
  normalizeNoteVaultRelativePath,
  readMarkdownFile,
  writeMarkdownFile,
} from './noteVault.js'

const DEFAULT_BRANCH = 'main'
const MAX_HISTORY_DEPTH = 100
const MAX_COMMIT_MESSAGE_LENGTH = 500
const MAX_AUTHOR_FIELD_LENGTH = 200
const GIT_FILE_TYPE_MASK = 0o170000
const GIT_REGULAR_FILE_MODE = 0o100000

function getGitDirectory(vaultPath) {
  return path.join(vaultPath, '.git')
}

async function getRepositoryState(vaultPath) {
  const gitDirectory = getGitDirectory(vaultPath)
  let stat
  try {
    stat = await fs.promises.lstat(gitDirectory)
  } catch (err) {
    if (err?.code === 'ENOENT') return { initialized: false, gitDirectory }
    throw err
  }

  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new PathSecurityError(
      'The knowledge base .git path must be a local directory'
    )
  }

  return { initialized: true, gitDirectory }
}

async function requireRepository(vaultPath) {
  const state = await getRepositoryState(vaultPath)
  if (!state.initialized) {
    throw new ValidationError(
      'Git is not initialized for this knowledge base',
      'NOTE_GIT_NOT_INITIALIZED'
    )
  }
  return state
}

function normalizeGitMarkdownPath(input) {
  return normalizeNoteVaultRelativePath(input)
}

function isNoteVaultFileNotFound(err) {
  return err?.errorCode === 'NOTE_VAULT_FILE_NOT_FOUND'
}

function getGitChangeType(head, workdir) {
  if (head === 0 && workdir === 2) return 'added'
  if (head === 1 && workdir === 0) return 'deleted'
  return 'modified'
}

function isMarkdownStatusPath(filepath) {
  try {
    return normalizeGitMarkdownPath(filepath) === filepath
  } catch {
    return false
  }
}

async function isRegularWorkingMarkdownPath(vaultPath, filepath) {
  let currentPath = path.resolve(vaultPath)
  const parts = filepath.split('/')

  for (let index = 0; index < parts.length; index += 1) {
    currentPath = path.join(currentPath, parts[index])
    let stat
    try {
      stat = await fs.promises.lstat(currentPath)
    } catch (err) {
      if (err?.code === 'ENOENT') return false
      throw err
    }
    if (stat.isSymbolicLink()) return false
    if (index < parts.length - 1 && !stat.isDirectory()) return false
    if (index === parts.length - 1) return stat.isFile()
  }

  return false
}

async function assertStagedMarkdownFilesAreRegular(vaultPath, filepaths) {
  const expectedPaths = new Set(filepaths)
  if (expectedPaths.size === 0) return

  const stagedModes = new Map()
  await git.walk({
    fs,
    dir: vaultPath,
    trees: [git.STAGE()],
    map: async (filepath, [entry]) => {
      if (!entry || !expectedPaths.has(filepath)) return
      stagedModes.set(filepath, await entry.mode())
    },
  })

  for (const filepath of expectedPaths) {
    const mode = stagedModes.get(filepath)
    if ((mode & GIT_FILE_TYPE_MASK) !== GIT_REGULAR_FILE_MODE) {
      throw new PathSecurityError(
        `Markdown Git changes must be regular files: ${filepath}`
      )
    }
  }
}

function normalizeAuthor(input) {
  const name = String(input?.name || '').trim()
  const email = String(input?.email || '').trim()

  if (!name || !email) {
    throw new ValidationError(
      'Git author name and email are required',
      'NOTE_GIT_AUTHOR_REQUIRED'
    )
  }
  if (
    name.length > MAX_AUTHOR_FIELD_LENGTH ||
    email.length > MAX_AUTHOR_FIELD_LENGTH ||
    /[\r\n<>]/.test(name) ||
    /[\r\n<>]/.test(email) ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  ) {
    throw new ValidationError(
      'Git author name or email is invalid',
      'NOTE_GIT_AUTHOR_INVALID'
    )
  }

  return { name, email }
}

function normalizeCommitMessage(input) {
  const message = String(input || '').trim()
  if (!message) {
    throw new ValidationError(
      'Commit message is required',
      'NOTE_GIT_MESSAGE_REQUIRED'
    )
  }
  if (message.length > MAX_COMMIT_MESSAGE_LENGTH) {
    throw new ValidationError(
      'Commit message is too long',
      'NOTE_GIT_MESSAGE_TOO_LONG'
    )
  }
  return message
}

function normalizeHistoryLimit(input) {
  const limit = Number(input)
  if (!Number.isFinite(limit)) return 50
  return Math.min(Math.max(Math.floor(limit), 1), MAX_HISTORY_DEPTH)
}

function normalizeCommitOid(input) {
  const oid = String(input || '')
    .trim()
    .toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(oid)) {
    throw new ValidationError(
      'Git commit id is invalid',
      'NOTE_GIT_COMMIT_INVALID'
    )
  }
  return oid
}

async function getAuthor(vaultPath) {
  const [name, email] = await Promise.all([
    git.getConfig({ fs, dir: vaultPath, path: 'user.name' }),
    git.getConfig({ fs, dir: vaultPath, path: 'user.email' }),
  ])
  return name && email ? { name: String(name), email: String(email) } : null
}

async function getHeadOid(vaultPath) {
  try {
    return await git.resolveRef({ fs, dir: vaultPath, ref: 'HEAD' })
  } catch (err) {
    if (err?.code === 'NotFoundError') return ''
    throw err
  }
}

async function getStatusMatrix(vaultPath) {
  return git.statusMatrix({ fs, dir: vaultPath })
}

async function getStatusChanges(vaultPath, matrix) {
  const changes = await Promise.all(
    matrix.map(async ([filepath, head, workdir, stage]) => {
      if (
        !isMarkdownStatusPath(filepath) ||
        (head === workdir && head === stage)
      ) {
        return null
      }
      if (
        workdir !== 0 &&
        !(await isRegularWorkingMarkdownPath(vaultPath, filepath))
      ) {
        return null
      }
      return {
        path: filepath,
        status: getGitChangeType(head, workdir),
        staged: stage !== head,
      }
    })
  )
  return changes.filter(Boolean)
}

async function readWorkingMarkdown(vaultPath, filepath) {
  try {
    const file = await readMarkdownFile(vaultPath, filepath)
    return {
      exists: true,
      content: file.content,
    }
  } catch (err) {
    if (isNoteVaultFileNotFound(err)) return { exists: false, content: '' }
    throw err
  }
}

async function readBlobContent(vaultPath, oid) {
  if (!oid) return { exists: false, content: '' }
  const result = await git.readBlob({ fs, dir: vaultPath, oid })
  return {
    exists: true,
    content: new TextDecoder().decode(result.blob),
  }
}

async function readCommitFile(vaultPath, oid, filepath) {
  try {
    const result = await git.readBlob({
      fs,
      dir: vaultPath,
      oid,
      filepath,
    })
    return {
      exists: true,
      content: new TextDecoder().decode(result.blob),
    }
  } catch (err) {
    if (err?.code === 'NotFoundError') return { exists: false, content: '' }
    throw err
  }
}

function createDiffParts(before, after) {
  return diffLines(before.content, after.content).map(part => ({
    value: part.value,
    count: part.count || 0,
    added: part.added === true,
    removed: part.removed === true,
  }))
}

export async function getNoteGitStatus(vaultPath) {
  const repository = await getRepositoryState(vaultPath)
  if (!repository.initialized) {
    return {
      initialized: false,
      branch: DEFAULT_BRANCH,
      headOid: '',
      changes: [],
      stagedCount: 0,
      author: null,
    }
  }

  const [matrix, branch, headOid, author] = await Promise.all([
    getStatusMatrix(vaultPath),
    git.currentBranch({ fs, dir: vaultPath, fullname: false, test: true }),
    getHeadOid(vaultPath),
    getAuthor(vaultPath),
  ])

  return {
    initialized: true,
    branch: branch || (headOid ? 'HEAD' : DEFAULT_BRANCH),
    headOid,
    changes: await getStatusChanges(vaultPath, matrix),
    stagedCount: matrix.filter(([, head, , stage]) => stage !== head).length,
    author,
  }
}

export async function initializeNoteGit(vaultPath, authorInput) {
  const repository = await getRepositoryState(vaultPath)
  if (repository.initialized) {
    throw new ConflictError('Git is already initialized')
  }

  const author = normalizeAuthor(authorInput)
  await git.init({ fs, dir: vaultPath, defaultBranch: DEFAULT_BRANCH })
  await configureNoteGitAuthor(vaultPath, author)
  return getNoteGitStatus(vaultPath)
}

export async function configureNoteGitAuthor(vaultPath, authorInput) {
  await requireRepository(vaultPath)
  const author = normalizeAuthor(authorInput)
  await git.setConfig({
    fs,
    dir: vaultPath,
    path: 'user.name',
    value: author.name,
  })
  await git.setConfig({
    fs,
    dir: vaultPath,
    path: 'user.email',
    value: author.email,
  })
  return author
}

export async function commitNoteGitChanges(vaultPath, messageInput) {
  await requireRepository(vaultPath)
  const message = normalizeCommitMessage(messageInput)
  const author = await getAuthor(vaultPath)
  if (!author) normalizeAuthor(author)

  const matrix = await getStatusMatrix(vaultPath)
  if (matrix.some(([, head, , stage]) => stage !== head)) {
    throw new ConflictError(
      'The Git index already contains staged changes; commit or unstage them outside MostBox first'
    )
  }

  const changes = (
    await Promise.all(
      matrix.map(async row => {
        const [filepath, head, workdir] = row
        if (!isMarkdownStatusPath(filepath) || head === workdir) return null
        if (
          workdir !== 0 &&
          !(await isRegularWorkingMarkdownPath(vaultPath, filepath))
        ) {
          return null
        }
        return row
      })
    )
  ).filter(Boolean)
  if (changes.length === 0) {
    throw new ValidationError(
      'There are no Markdown changes to commit',
      'NOTE_GIT_NO_CHANGES'
    )
  }

  const indexPath = path.join(getGitDirectory(vaultPath), 'index')
  const originalIndex = await fs.promises.readFile(indexPath).catch(err => {
    if (err?.code === 'ENOENT') return null
    throw err
  })

  try {
    for (const [filepath, , workdir] of changes) {
      if (workdir === 0) {
        await git.remove({ fs, dir: vaultPath, filepath })
      } else {
        await git.add({ fs, dir: vaultPath, filepath })
      }
    }

    await assertStagedMarkdownFilesAreRegular(
      vaultPath,
      changes
        .filter(([, , workdir]) => workdir !== 0)
        .map(([filepath]) => filepath)
    )

    const oid = await git.commit({ fs, dir: vaultPath, message, author })
    return { oid, status: await getNoteGitStatus(vaultPath) }
  } catch (err) {
    if (originalIndex) {
      await fs.promises.writeFile(indexPath, originalIndex)
    } else {
      await fs.promises.rm(indexPath, { force: true })
    }
    throw err
  }
}

export async function listNoteGitHistory(vaultPath, limitInput) {
  await requireRepository(vaultPath)
  const headOid = await getHeadOid(vaultPath)
  if (!headOid) return []
  const limit = normalizeHistoryLimit(limitInput)

  const commits = await git.log({
    fs,
    dir: vaultPath,
    includeChanges: true,
  })

  return commits
    .map(entry => ({
      oid: entry.oid,
      message: entry.commit.message.trim(),
      author: {
        name: entry.commit.author.name,
        email: entry.commit.author.email,
      },
      timestamp: entry.commit.author.timestamp * 1000,
      changes: (entry.commit.changes || [])
        .filter(([, , filepath]) => isMarkdownStatusPath(filepath))
        .map(([newOid, oldOid, filepath]) => ({
          path: filepath,
          status: !oldOid ? 'added' : !newOid ? 'deleted' : 'modified',
        })),
    }))
    .filter(commit => commit.changes.length > 0)
    .slice(0, limit)
}

export async function getNoteGitDiff(vaultPath, filepathInput, oidInput = '') {
  await requireRepository(vaultPath)
  const filepath = normalizeGitMarkdownPath(filepathInput)
  const oid = oidInput ? normalizeCommitOid(oidInput) : ''

  let before
  let after
  if (oid) {
    const [entry] = await git.log({
      fs,
      dir: vaultPath,
      ref: oid,
      depth: 1,
      includeChanges: true,
    })
    const change = entry?.commit.changes?.find(
      ([, , changedPath]) => changedPath === filepath
    )
    if (!change) {
      throw new ValidationError(
        'The selected commit does not change this Markdown file',
        'NOTE_GIT_FILE_NOT_CHANGED'
      )
    }
    after = await readBlobContent(vaultPath, change[0])
    before = await readBlobContent(vaultPath, change[1])
  } else {
    const headOid = await getHeadOid(vaultPath)
    before = headOid
      ? await readCommitFile(vaultPath, headOid, filepath)
      : { exists: false, content: '' }
    after = await readWorkingMarkdown(vaultPath, filepath)
  }

  return {
    path: filepath,
    oid,
    beforeExists: before.exists,
    afterExists: after.exists,
    parts: createDiffParts(before, after),
  }
}

export async function restoreNoteGitFile(vaultPath, filepathInput, oidInput) {
  await requireRepository(vaultPath)
  const filepath = normalizeGitMarkdownPath(filepathInput)
  const oid = normalizeCommitOid(oidInput)
  const version = await readCommitFile(vaultPath, oid, filepath)

  if (version.exists) {
    await writeMarkdownFile(vaultPath, filepath, version.content)
  } else {
    try {
      await deleteMarkdownFile(vaultPath, filepath)
    } catch (err) {
      if (!isNoteVaultFileNotFound(err)) throw err
    }
  }

  return {
    path: filepath,
    oid,
    exists: version.exists,
    status: await getNoteGitStatus(vaultPath),
  }
}
