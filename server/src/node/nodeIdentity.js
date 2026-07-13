import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import b4a from 'b4a'

import { PersistenceError } from '../utils/errors.js'

const NODE_IDENTITY_VERSION = 1
const NODE_IDENTITY_SEED_BYTES = 32

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

export function loadOrCreateNodeSeed(dataPath) {
  const filePath = getNodeIdentityPath(dataPath)
  try {
    return parseNodeIdentity(fs.readFileSync(filePath, 'utf-8'))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[MostBox] Node identity is invalid; generating a new one')
    }
  }

  const seed = crypto.randomBytes(NODE_IDENTITY_SEED_BYTES)
  try {
    fs.mkdirSync(dataPath, { recursive: true })
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: NODE_IDENTITY_VERSION,
        seed: b4a.toString(seed, 'hex'),
      }),
      'utf-8'
    )
  } catch (err) {
    throw new PersistenceError('Failed to persist node identity', {
      metadata: 'node identity',
      reason: 'NODE_IDENTITY_SAVE_FAILED',
      cause: err.message,
    })
  }

  return seed
}
