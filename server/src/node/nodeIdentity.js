import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import b4a from 'b4a'

import { PersistenceError } from '../utils/errors.js'

const NODE_IDENTITY_VERSION = 1
const NODE_IDENTITY_SEED_BYTES = 32

function persistenceError(message, reason, cause) {
  return new PersistenceError(message, {
    metadata: 'node identity',
    reason,
    cause: cause?.message || String(cause || ''),
  })
}

function parseNodeIdentity(data) {
  const parsed = JSON.parse(data)
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.version !== NODE_IDENTITY_VERSION ||
    typeof parsed.seed !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(parsed.seed)
  ) {
    throw new TypeError('node identity metadata has an invalid shape')
  }

  return b4a.from(parsed.seed, 'hex')
}

export function getNodeIdentityPath(dataPath) {
  return path.join(dataPath, 'node-identity.json')
}

function restrictIdentityPermissions(filePath) {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o600)
  }
}

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

function loadNodeSeed(filePath) {
  let data
  try {
    data = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    throw persistenceError(
      'Failed to load node identity',
      'NODE_IDENTITY_LOAD_FAILED',
      err
    )
  }

  let seed
  try {
    seed = parseNodeIdentity(data)
  } catch (err) {
    throw persistenceError(
      'Node identity is invalid; remove it explicitly to generate a new identity',
      'NODE_IDENTITY_INVALID',
      err
    )
  }

  try {
    restrictIdentityPermissions(filePath)
  } catch (err) {
    throw persistenceError(
      'Failed to secure node identity permissions',
      'NODE_IDENTITY_PERMISSION_FAILED',
      err
    )
  }
  return seed
}

function createNodeSeed(
  filePath,
  seed = crypto.randomBytes(NODE_IDENTITY_SEED_BYTES)
) {
  const directory = path.dirname(filePath)
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  const content = JSON.stringify({
    version: NODE_IDENTITY_VERSION,
    seed: b4a.toString(seed, 'hex'),
  })
  let descriptor

  fs.mkdirSync(directory, { recursive: true })
  try {
    descriptor = fs.openSync(tempPath, 'wx', 0o600)
    fs.writeFileSync(descriptor, content, 'utf-8')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined

    try {
      fs.linkSync(tempPath, filePath)
    } catch (err) {
      if (err.code === 'EEXIST') {
        return loadNodeSeed(filePath)
      }
      throw err
    }

    restrictIdentityPermissions(filePath)
    fsyncDirectory(directory)
    return seed
  } catch (err) {
    if (err instanceof PersistenceError) throw err
    throw persistenceError(
      'Failed to persist node identity',
      'NODE_IDENTITY_SAVE_FAILED',
      err
    )
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try {
      fs.unlinkSync(tempPath)
    } catch {}
  }
}

export function loadOrCreateNodeSeed(dataPath) {
  const filePath = getNodeIdentityPath(dataPath)
  if (fs.existsSync(filePath)) {
    return loadNodeSeed(filePath)
  }

  try {
    return createNodeSeed(filePath)
  } catch (err) {
    if (err instanceof PersistenceError) throw err
    throw persistenceError(
      'Failed to persist node identity',
      'NODE_IDENTITY_SAVE_FAILED',
      err
    )
  }
}

export function ensureNodeSeedPersisted(dataPath, expectedSeed) {
  const filePath = getNodeIdentityPath(dataPath)
  const persistedSeed = fs.existsSync(filePath)
    ? loadNodeSeed(filePath)
    : createNodeSeed(filePath, expectedSeed)

  if (!b4a.equals(persistedSeed, expectedSeed)) {
    throw persistenceError(
      'Persisted node identity does not match the active node identity',
      'NODE_IDENTITY_MISMATCH'
    )
  }

  return persistedSeed
}
