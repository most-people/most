import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { PathSecurityError, ValidationError } from './errors.js'

const CONFIG_FILE_NAME = 'note-vault.json'
const MARKDOWN_EXTENSION = '.md'
const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules'])

function getNoteVaultConfigPath(configDir) {
  return path.join(configDir, CONFIG_FILE_NAME)
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

function isDisallowedDirectoryName(name) {
  return name.startsWith('.') || EXCLUDED_DIRECTORY_NAMES.has(name)
}

function toNativePath(relativePath) {
  return relativePath.split('/').join(path.sep)
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function getVaultDirectoryInfo(vaultPath, options = {}) {
  const rawPath = String(vaultPath || '').trim()
  if (!rawPath) {
    throw new ValidationError(
      'note vault is not configured',
      'NOTE_VAULT_NOT_CONFIGURED'
    )
  }

  const resolvedPath = path.resolve(rawPath)
  let stat
  try {
    stat = await fs.stat(resolvedPath)
  } catch {
    throw new ValidationError(
      'note vault directory does not exist',
      'NOTE_VAULT_NOT_FOUND'
    )
  }

  if (!stat.isDirectory()) {
    throw new ValidationError(
      'note vault path must be a directory',
      'NOTE_VAULT_NOT_DIRECTORY'
    )
  }

  const realPath = await fs.realpath(resolvedPath)
  await fs.access(realPath, fsSync.constants.R_OK)
  if (options.requireWritable) {
    await fs.access(realPath, fsSync.constants.W_OK)
  }

  return { path: resolvedPath, realPath }
}

async function readNoteVaultConfig(configDir) {
  try {
    const raw = await fs.readFile(getNoteVaultConfigPath(configDir), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      vaultPath:
        typeof parsed.vaultPath === 'string' ? parsed.vaultPath.trim() : '',
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    }
  } catch {
    return { vaultPath: '' }
  }
}

async function writeNoteVaultConfig(configDir, config) {
  await fs.mkdir(configDir, { recursive: true })
  const configPath = getNoteVaultConfigPath(configDir)
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf8')
  await fs.rename(tempPath, configPath)
}

export function normalizeNoteVaultRelativePath(input) {
  const raw = String(input || '').trim()
  if (!raw) {
    throw new ValidationError(
      'note vault file path is required',
      'NOTE_VAULT_PATH_REQUIRED'
    )
  }
  if (raw.includes('\0')) {
    throw new PathSecurityError('Invalid note vault path')
  }
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new PathSecurityError('Absolute note vault paths are not allowed')
  }

  const slashPath = raw.replace(/\\/g, '/')
  const normalized = path.posix.normalize(slashPath)
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new PathSecurityError('Path traversal is not allowed')
  }

  const parts = normalized.split('/').filter(Boolean)
  if (
    parts.length === 0 ||
    parts.some(part => part === '.' || part === '..' || !part.trim())
  ) {
    throw new PathSecurityError('Invalid note vault path')
  }

  const directoryParts = parts.slice(0, -1)
  if (directoryParts.some(isDisallowedDirectoryName)) {
    throw new PathSecurityError('Hidden or excluded directories are not allowed')
  }

  const fileName = parts[parts.length - 1]
  if (!fileName.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
    throw new ValidationError(
      'only Markdown files are allowed',
      'NOTE_VAULT_MARKDOWN_REQUIRED'
    )
  }

  return parts.join('/')
}

export async function configureNoteVault(configDir, vaultPath) {
  const info = await getVaultDirectoryInfo(vaultPath, { requireWritable: true })
  const config = {
    vaultPath: info.realPath,
    updatedAt: new Date().toISOString(),
  }
  await writeNoteVaultConfig(configDir, config)
  return getNoteVaultStatus(configDir)
}

export async function getConfiguredNoteVaultPath(configDir) {
  const config = await readNoteVaultConfig(configDir)
  const info = await getVaultDirectoryInfo(config.vaultPath)
  return info.realPath
}

export async function getNoteVaultStatus(configDir) {
  const config = await readNoteVaultConfig(configDir)
  if (!config.vaultPath) {
    return {
      configured: false,
      vaultPath: '',
      fileCount: 0,
      writable: false,
    }
  }

  try {
    const info = await getVaultDirectoryInfo(config.vaultPath)
    const files = await listMarkdownFiles(info.realPath)
    const writable = await fs
      .access(info.realPath, fsSync.constants.W_OK)
      .then(() => true)
      .catch(() => false)
    return {
      configured: true,
      vaultPath: info.realPath,
      fileCount: files.length,
      writable,
      updatedAt: config.updatedAt,
    }
  } catch (err) {
    return {
      configured: false,
      vaultPath: config.vaultPath,
      fileCount: 0,
      writable: false,
      error: err instanceof Error ? err.message : 'note vault unavailable',
    }
  }
}

export async function listMarkdownFiles(vaultPath) {
  const info = await getVaultDirectoryInfo(vaultPath)
  const files = []

  async function scanDirectory(currentPath, relativeParts = []) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (isDisallowedDirectoryName(entry.name)) continue
        const directoryPath = path.join(currentPath, entry.name)
        const realDirectoryPath = await fs.realpath(directoryPath)
        if (!isPathInside(info.realPath, realDirectoryPath)) continue
        await scanDirectory(realDirectoryPath, [...relativeParts, entry.name])
        continue
      }

      if (!entry.isFile()) continue
      if (!entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) continue

      const filePath = path.join(currentPath, entry.name)
      const realFilePath = await fs.realpath(filePath)
      if (!isPathInside(info.realPath, realFilePath)) continue

      const stat = await fs.stat(realFilePath)
      const relativePath = [...relativeParts, entry.name].join('/')
      files.push({
        path: relativePath,
        name: entry.name,
        directory: relativeParts.join('/'),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    }
  }

  await scanDirectory(info.realPath)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

export async function readMarkdownFile(vaultPath, relativePath) {
  const info = await getVaultDirectoryInfo(vaultPath)
  const normalizedPath = normalizeNoteVaultRelativePath(relativePath)
  const targetPath = path.resolve(info.realPath, toNativePath(normalizedPath))

  let realFilePath
  try {
    realFilePath = await fs.realpath(targetPath)
  } catch {
    throw new ValidationError(
      'note vault file not found',
      'NOTE_VAULT_FILE_NOT_FOUND'
    )
  }

  if (!isPathInside(info.realPath, realFilePath)) {
    throw new PathSecurityError('Note vault file escapes the configured vault')
  }

  const stat = await fs.stat(realFilePath)
  if (!stat.isFile()) {
    throw new ValidationError(
      'note vault path is not a file',
      'NOTE_VAULT_NOT_FILE'
    )
  }

  return {
    path: normalizedPath,
    name: path.posix.basename(normalizedPath),
    directory: path.posix.dirname(normalizedPath) === '.'
      ? ''
      : path.posix.dirname(normalizedPath),
    content: await fs.readFile(realFilePath, 'utf8'),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  }
}

export async function writeMarkdownFile(vaultPath, relativePath, content) {
  const info = await getVaultDirectoryInfo(vaultPath, { requireWritable: true })
  const normalizedPath = normalizeNoteVaultRelativePath(relativePath)
  const targetPath = path.resolve(info.realPath, toNativePath(normalizedPath))
  const parentPath = path.dirname(targetPath)

  await fs.mkdir(parentPath, { recursive: true })
  const realParentPath = await fs.realpath(parentPath)
  if (!isPathInside(info.realPath, realParentPath)) {
    throw new PathSecurityError('Note vault file escapes the configured vault')
  }

  if (await pathExists(targetPath)) {
    const targetStat = await fs.lstat(targetPath)
    if (targetStat.isSymbolicLink()) {
      throw new PathSecurityError('Symlink Markdown files are not writable')
    }
    if (!targetStat.isFile()) {
      throw new ValidationError(
        'note vault path is not a file',
        'NOTE_VAULT_NOT_FILE'
      )
    }
    const realTargetPath = await fs.realpath(targetPath)
    if (!isPathInside(info.realPath, realTargetPath)) {
      throw new PathSecurityError(
        'Note vault file escapes the configured vault'
      )
    }
  }

  const tempPath = path.join(
    parentPath,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${crypto
      .randomBytes(4)
      .toString('hex')}.tmp`
  )

  try {
    await fs.writeFile(tempPath, String(content ?? ''), 'utf8')
    await fs.rename(tempPath, targetPath)
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw err
  }

  return readMarkdownFile(info.realPath, normalizedPath)
}
