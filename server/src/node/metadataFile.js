import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { PersistenceError } from '../utils/errors.js'

export const METADATA_BACKUP_SUFFIX = '.bak'

function fsyncDirectory(directory) {
  try {
    const descriptor = fs.openSync(directory, 'r')
    try {
      fs.fsyncSync(descriptor)
    } finally {
      fs.closeSync(descriptor)
    }
  } catch {}
}

function atomicReplace(filePath, data) {
  const directory = path.dirname(filePath)
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const content = Buffer.isBuffer(data) ? data : Buffer.from(String(data))
  let descriptor

  fs.mkdirSync(directory, { recursive: true })
  try {
    descriptor = fs.openSync(tmpPath, 'wx')
    fs.writeFileSync(descriptor, content)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(tmpPath, filePath)
    fsyncDirectory(directory)
  } catch (err) {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
    throw err
  }
}

function metadataLoadError(label, filePath, primaryError, backupError) {
  return new PersistenceError(`Failed to load ${label} metadata`, {
    metadata: label,
    filePath,
    backupPath: `${filePath}${METADATA_BACKUP_SUFFIX}`,
    primaryError: primaryError?.message || 'Primary metadata is missing',
    backupError: backupError?.message || 'Backup metadata is missing',
  })
}

export function readMetadataFile(
  filePath,
  { label = 'application', parse = JSON.parse, fallback = () => null } = {}
) {
  const backupPath = `${filePath}${METADATA_BACKUP_SUFFIX}`
  const primaryExists = fs.existsSync(filePath)
  const backupExists = fs.existsSync(backupPath)

  if (!primaryExists && !backupExists) {
    return typeof fallback === 'function' ? fallback() : fallback
  }

  let primaryError
  if (primaryExists) {
    try {
      return parse(fs.readFileSync(filePath, 'utf-8'))
    } catch (err) {
      primaryError = err
    }
  }

  if (!backupExists) {
    throw metadataLoadError(label, filePath, primaryError)
  }

  try {
    const backupData = fs.readFileSync(backupPath)
    const recovered = parse(backupData.toString('utf-8'))
    let quarantinePath = ''

    if (primaryExists) {
      quarantinePath = `${filePath}.corrupt-${Date.now()}-${randomUUID()}`
      fs.renameSync(filePath, quarantinePath)
    }
    atomicReplace(filePath, backupData)
    console.warn(
      `[Metadata] Recovered ${label} metadata from ${backupPath}` +
        (quarantinePath ? `; corrupt file moved to ${quarantinePath}` : '')
    )
    return recovered
  } catch (backupError) {
    throw metadataLoadError(label, filePath, primaryError, backupError)
  }
}

export function writeMetadataFile(filePath, data) {
  const backupPath = `${filePath}${METADATA_BACKUP_SUFFIX}`
  const content = Buffer.isBuffer(data) ? data : Buffer.from(String(data))
  JSON.parse(content.toString('utf-8'))

  const backupData = fs.existsSync(filePath)
    ? fs.readFileSync(filePath)
    : content
  atomicReplace(backupPath, backupData)
  atomicReplace(filePath, content)
}
