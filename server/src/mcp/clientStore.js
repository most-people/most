import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeAddress } from '../core/shared.js'
import { PathSecurityError, PermissionError } from '../utils/errors.js'
import { MCP_CLIENT_MAX_EXPIRES_IN_DAYS } from './constants.js'

export const MCP_SCOPES = Object.freeze([
  'node:read',
  'files:read',
  'files:publish',
  'files:download',
  'downloads:cancel',
])

const MCP_SCOPE_SET = new Set(MCP_SCOPES)
const DEFAULT_EXPIRES_IN_DAYS = 90
const LAST_USED_WRITE_INTERVAL_MS = 60_000

function normalizeScopes(value) {
  const scopes = Array.isArray(value) ? value : []
  return Array.from(
    new Set(scopes.map(scope => String(scope || '').trim()).filter(Boolean))
  ).filter(scope => MCP_SCOPE_SET.has(scope))
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .slice(0, 80)
}

function normalizeDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function normalizeClient(raw) {
  const ownerAddress = normalizeAddress(raw?.ownerAddress)
  const tokenHash = String(raw?.tokenHash || '').trim()
  if (!raw?.id || !ownerAddress || !/^[a-f0-9]{64}$/.test(tokenHash)) {
    return null
  }

  return {
    id: String(raw.id),
    name: normalizeName(raw.name) || 'MCP client',
    ownerAddress,
    tokenHash,
    scopes: normalizeScopes(raw.scopes),
    allowedRoots: Array.isArray(raw.allowedRoots)
      ? raw.allowedRoots.map(root => String(root || '')).filter(Boolean)
      : [],
    createdAt: normalizeDate(raw.createdAt) || new Date(0).toISOString(),
    expiresAt: normalizeDate(raw.expiresAt),
    lastUsedAt: normalizeDate(raw.lastUsedAt),
    revokedAt: normalizeDate(raw.revokedAt),
  }
}

function publicClient(client, currentTime = Date.now()) {
  return {
    id: client.id,
    name: client.name,
    ownerAddress: client.ownerAddress,
    scopes: [...client.scopes],
    allowedRoots: [...client.allowedRoots],
    createdAt: client.createdAt,
    expiresAt: client.expiresAt || null,
    lastUsedAt: client.lastUsedAt || null,
    revokedAt: client.revokedAt || null,
    active:
      !client.revokedAt &&
      (!client.expiresAt || new Date(client.expiresAt).getTime() > currentTime),
  }
}

function tokenDigest(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest()
}

function pathIsInside(rootPath, filePath) {
  const relative = path.relative(rootPath, filePath)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

export function createMcpClientStore(configDir, options = {}) {
  const resolvedConfigDir = path.resolve(configDir)
  const storeFile = path.join(resolvedConfigDir, 'mcp-clients.json')
  const now = options.now || (() => Date.now())

  function ensureConfigDir() {
    fs.mkdirSync(resolvedConfigDir, { recursive: true })
  }

  function loadClients() {
    try {
      if (!fs.existsSync(storeFile)) return []
      const raw = JSON.parse(fs.readFileSync(storeFile, 'utf-8'))
      if (raw?.version !== 1 || !Array.isArray(raw.clients)) {
        throw new TypeError('Invalid MCP client store')
      }
      const clients = raw.clients.map(normalizeClient)
      if (clients.some(client => !client)) {
        throw new TypeError('Invalid MCP client record')
      }
      return clients
    } catch (err) {
      console.error('[MCP] Failed to load client store:', err.message)
      throw err
    }
  }

  function persistClients(clients) {
    ensureConfigDir()
    const tempFile = `${storeFile}.${process.pid}.${crypto.randomUUID()}.tmp`
    let descriptor
    try {
      descriptor = fs.openSync(tempFile, 'wx', 0o600)
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ version: 1, clients }, null, 2),
        'utf-8'
      )
      fs.fsyncSync(descriptor)
      fs.closeSync(descriptor)
      descriptor = undefined
      fs.renameSync(tempFile, storeFile)
      fs.chmodSync(storeFile, 0o600)
    } catch (err) {
      if (descriptor !== undefined) fs.closeSync(descriptor)
      try {
        fs.unlinkSync(tempFile)
      } catch {}
      throw err
    }
  }

  function normalizeAllowedRoots(value) {
    const roots = Array.isArray(value) ? value : []
    return Array.from(
      new Set(
        roots.map(root => {
          const input = String(root || '').trim()
          if (!input) return ''
          try {
            const resolved = fs.realpathSync(input)
            if (!fs.statSync(resolved).isDirectory()) {
              throw new PathSecurityError(
                'MCP publish root must be a directory'
              )
            }
            return resolved
          } catch (err) {
            if (err instanceof PathSecurityError) throw err
            throw new PathSecurityError(
              'MCP publish root must be an existing directory'
            )
          }
        })
      )
    ).filter(Boolean)
  }

  function createClient(input = {}) {
    const name = normalizeName(input.name)
    const ownerAddress = normalizeAddress(input.ownerAddress)
    const scopes = normalizeScopes(input.scopes)
    const allowedRoots = normalizeAllowedRoots(input.allowedRoots)
    if (!name) throw new TypeError('MCP client name is required')
    if (!ownerAddress) throw new TypeError('MCP client owner is required')
    if (scopes.length === 0)
      throw new TypeError('At least one MCP scope is required')
    if (scopes.includes('files:publish') && allowedRoots.length === 0) {
      throw new PathSecurityError(
        'File publishing requires an allowed directory'
      )
    }

    const expiresInDays =
      input.expiresInDays === undefined ||
      input.expiresInDays === null ||
      input.expiresInDays === ''
        ? DEFAULT_EXPIRES_IN_DAYS
        : Number(input.expiresInDays)
    if (
      !Number.isInteger(expiresInDays) ||
      expiresInDays < 1 ||
      expiresInDays > MCP_CLIENT_MAX_EXPIRES_IN_DAYS
    ) {
      throw new TypeError(
        `MCP client expiration must be an integer between 1 and ${MCP_CLIENT_MAX_EXPIRES_IN_DAYS} days`
      )
    }
    const token = `mbx_mcp_${crypto.randomBytes(32).toString('base64url')}`
    const createdAt = new Date(now()).toISOString()
    const client = {
      id: crypto.randomUUID(),
      name,
      ownerAddress,
      tokenHash: tokenDigest(token).toString('hex'),
      scopes,
      allowedRoots,
      createdAt,
      expiresAt: new Date(now() + expiresInDays * 86_400_000).toISOString(),
      lastUsedAt: '',
      revokedAt: '',
    }
    const clients = loadClients()
    clients.push(client)
    persistClients(clients)
    return { client: publicClient(client, now()), token }
  }

  function listClients() {
    return loadClients()
      .map(client => publicClient(client, now()))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  function revokeClient(id) {
    const clients = loadClients()
    const client = clients.find(item => item.id === String(id || ''))
    if (!client) return null
    if (!client.revokedAt) {
      client.revokedAt = new Date(now()).toISOString()
      persistClients(clients)
    }
    return publicClient(client, now())
  }

  function deleteClient(id) {
    const clients = loadClients()
    const clientIndex = clients.findIndex(item => item.id === String(id || ''))
    if (clientIndex === -1) return null
    const [client] = clients.splice(clientIndex, 1)
    persistClients(clients)
    return publicClient(client, now())
  }

  function authenticate(token) {
    const digest = tokenDigest(token)
    const clients = loadClients()
    let matched = null
    for (const client of clients) {
      const storedDigest = Buffer.from(client.tokenHash, 'hex')
      if (
        storedDigest.length === digest.length &&
        crypto.timingSafeEqual(storedDigest, digest)
      ) {
        matched = client
      }
    }
    if (!matched || matched.revokedAt) return null
    if (matched.expiresAt && new Date(matched.expiresAt).getTime() <= now()) {
      return null
    }

    const lastUsedMs = matched.lastUsedAt
      ? new Date(matched.lastUsedAt).getTime()
      : 0
    if (now() - lastUsedMs >= LAST_USED_WRITE_INTERVAL_MS) {
      matched.lastUsedAt = new Date(now()).toISOString()
      persistClients(clients)
    }
    return publicClient(matched, now())
  }

  function resolvePublishPath(clientId, inputPath) {
    const client = loadClients().find(
      item => item.id === String(clientId || '')
    )
    if (!client || client.revokedAt) {
      throw new PermissionError('MCP client is not active')
    }
    if (!client.scopes.includes('files:publish')) {
      throw new PermissionError('MCP client cannot publish files')
    }

    let resolvedFile
    try {
      resolvedFile = fs.realpathSync(String(inputPath || ''))
    } catch {
      throw new PathSecurityError('MCP publish file does not exist')
    }
    if (!fs.statSync(resolvedFile).isFile()) {
      throw new PathSecurityError('MCP publish path must be a regular file')
    }
    if (!client.allowedRoots.some(root => pathIsInside(root, resolvedFile))) {
      throw new PathSecurityError(
        'MCP publish path is outside allowed directories'
      )
    }
    return resolvedFile
  }

  return {
    storeFile,
    createClient,
    listClients,
    revokeClient,
    deleteClient,
    authenticate,
    resolvePublishPath,
  }
}
