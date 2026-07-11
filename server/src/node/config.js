import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { MAX_FILE_SIZE } from '../config.js'
import { normalizeAddress } from '../core/shared.js'

const DEFAULT_CONFIG_DIR_NAME = '.most-box'
const DEFAULT_DATA_DIR_NAME = 'most-data'
const DEFAULT_CAPACITY_BYTES = 100 * 1024 * 1024 * 1024
const DEFAULT_LOCK_TIMEOUT_MS = 2_000
const DEFAULT_LOCK_STALE_MS = 30_000
const DEFAULT_LOCK_RETRY_MS = 10
const LOCK_SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4))
export const DEFAULT_NODE_PORT = 1976
export const DEFAULT_NODE_HOST = '127.0.0.1'

export function getDefaultConfigDir() {
  return path.join(os.homedir(), DEFAULT_CONFIG_DIR_NAME)
}

export function getDefaultDataPath() {
  return path.join(os.homedir(), DEFAULT_DATA_DIR_NAME)
}

export function getDefaultNodeConfig() {
  return {
    dataPath: '',
    host: DEFAULT_NODE_HOST,
    port: DEFAULT_NODE_PORT,
    capacityBytes: DEFAULT_CAPACITY_BYTES,
    maxFileSizeBytes: MAX_FILE_SIZE,
    remoteInvites: [],
    adminAddress: '',
  }
}

export function normalizeRemoteInvites(value = []) {
  const items = Array.isArray(value) ? value : String(value || '').split(',')
  return Array.from(
    new Set(items.map(item => String(item || '').trim()).filter(Boolean))
  )
}

export function normalizeNodeConfig(raw = {}) {
  const defaults = getDefaultNodeConfig()
  const rawNode = raw.node && typeof raw.node === 'object' ? raw.node : {}

  const capacityBytes = normalizePositiveInteger(
    rawNode.capacityBytes,
    defaults.capacityBytes
  )
  const maxFileSizeBytes = normalizePositiveInteger(
    rawNode.maxFileSizeBytes,
    defaults.maxFileSizeBytes
  )
  const remoteInvites = normalizeRemoteInvites(
    rawNode.remoteInvites ?? defaults.remoteInvites
  )
  const host = normalizeHost(rawNode.host, defaults.host)
  const adminAddress = normalizeAddress(rawNode.adminAddress)
  return {
    dataPath:
      typeof raw.dataPath === 'string'
        ? raw.dataPath.trim()
        : defaults.dataPath,
    host,
    port: DEFAULT_NODE_PORT,
    capacityBytes,
    maxFileSizeBytes,
    remoteInvites,
    adminAddress,
  }
}

export function createNodeConfigStore(
  configDir = getDefaultConfigDir(),
  options = {}
) {
  const resolvedConfigDir = path.resolve(configDir)
  const configFile = path.join(resolvedConfigDir, 'config.json')
  const lockFile = `${configFile}.lock`
  const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
  const lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS
  const lockRetryMs = options.lockRetryMs ?? DEFAULT_LOCK_RETRY_MS

  function ensureConfigDir() {
    if (!fs.existsSync(resolvedConfigDir)) {
      fs.mkdirSync(resolvedConfigDir, { recursive: true })
    }
  }

  function readRawConfig() {
    if (!fs.existsSync(configFile)) return {}
    return JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  }

  function loadRawConfig() {
    try {
      return readRawConfig()
    } catch (err) {
      console.error('[Config] Load error:', err.message)
    }
    return {}
  }

  function removeStaleLock() {
    try {
      const stat = fs.statSync(lockFile)
      if (Date.now() - stat.mtimeMs <= lockStaleMs) return false
      fs.unlinkSync(lockFile)
      return true
    } catch (err) {
      return err.code === 'ENOENT'
    }
  }

  function acquireConfigLock() {
    ensureConfigDir()
    const token = `${process.pid}:${randomUUID()}`
    const deadline = Date.now() + lockTimeoutMs

    while (true) {
      let descriptor
      let created = false
      try {
        descriptor = fs.openSync(lockFile, 'wx')
        created = true
        try {
          fs.writeFileSync(descriptor, token, 'utf-8')
          fs.fsyncSync(descriptor)
        } finally {
          fs.closeSync(descriptor)
          descriptor = undefined
        }
        return token
      } catch (err) {
        if (descriptor !== undefined) {
          fs.closeSync(descriptor)
          descriptor = undefined
        }
        if (created) {
          try {
            fs.unlinkSync(lockFile)
          } catch {}
        }
        if (err.code !== 'EEXIST') throw err
        if (removeStaleLock()) continue
        if (Date.now() >= deadline) {
          const timeoutError = new Error('Timed out waiting for config lock')
          timeoutError.code = 'CONFIG_LOCK_TIMEOUT'
          throw timeoutError
        }
        Atomics.wait(LOCK_SLEEP_BUFFER, 0, 0, lockRetryMs)
      }
    }
  }

  function releaseConfigLock(token) {
    try {
      if (fs.readFileSync(lockFile, 'utf-8') === token) {
        fs.unlinkSync(lockFile)
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[Config] Failed to release lock:', err.message)
      }
    }
  }

  function withConfigLock(operation) {
    const token = acquireConfigLock()
    try {
      return operation()
    } finally {
      releaseConfigLock(token)
    }
  }

  function persistRawConfig(config) {
    ensureConfigDir()
    const tmpPath = `${configFile}.${process.pid}.${randomUUID()}.tmp`
    let descriptor
    try {
      descriptor = fs.openSync(tmpPath, 'wx')
      fs.writeFileSync(descriptor, JSON.stringify(config, null, 2), 'utf-8')
      fs.fsyncSync(descriptor)
      fs.closeSync(descriptor)
      descriptor = undefined
      fs.renameSync(tmpPath, configFile)

      try {
        const directoryDescriptor = fs.openSync(resolvedConfigDir, 'r')
        try {
          fs.fsyncSync(directoryDescriptor)
        } finally {
          fs.closeSync(directoryDescriptor)
        }
      } catch {}
    } catch (err) {
      if (descriptor !== undefined) fs.closeSync(descriptor)
      try {
        fs.unlinkSync(tmpPath)
      } catch {}
      throw err
    }
  }

  function saveRawConfig(config) {
    try {
      withConfigLock(() => persistRawConfig(config))
      return true
    } catch (err) {
      console.error('[Config] Save error:', err.message)
      return false
    }
  }

  function getNodeConfig() {
    return normalizeNodeConfig(loadRawConfig())
  }

  function getDataPath() {
    return getNodeConfig().dataPath || getDefaultDataPath()
  }

  function buildSavedConfig(raw, patch = {}, adminAddressOverride) {
    const current = normalizeNodeConfig(raw)
    const next = normalizeNodeConfig({
      ...raw,
      dataPath:
        patch.dataPath === undefined ? current.dataPath : patch.dataPath,
      node: {
        ...(raw.node && typeof raw.node === 'object' ? raw.node : {}),
        host: patch.host === undefined ? current.host : patch.host,
        port: DEFAULT_NODE_PORT,
        capacityBytes:
          patch.capacityBytes === undefined
            ? current.capacityBytes
            : patch.capacityBytes,
        maxFileSizeBytes:
          patch.maxFileSizeBytes === undefined
            ? current.maxFileSizeBytes
            : patch.maxFileSizeBytes,
        remoteInvites:
          patch.remoteInvites === undefined
            ? current.remoteInvites
            : patch.remoteInvites,
        adminAddress:
          adminAddressOverride === undefined
            ? current.adminAddress
            : adminAddressOverride,
      },
    })

    return {
      ...raw,
      dataPath: next.dataPath,
      node: {
        ...(raw.node && typeof raw.node === 'object' ? raw.node : {}),
        host: next.host,
        port: next.port,
        capacityBytes: next.capacityBytes,
        maxFileSizeBytes: next.maxFileSizeBytes,
        remoteInvites: next.remoteInvites,
        adminAddress: next.adminAddress,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  function saveNodeConfigPatchInternal(patch = {}, adminAddressOverride) {
    try {
      return withConfigLock(() => {
        const raw = readRawConfig()
        const saved = buildSavedConfig(raw, patch, adminAddressOverride)
        persistRawConfig(saved)
        return { success: true, config: normalizeNodeConfig(saved) }
      })
    } catch (err) {
      console.error('[Config] Save error:', err.message)
      return {
        success: false,
        reason: err.code || 'CONFIG_SAVE_FAILED',
        config: getNodeConfig(),
      }
    }
  }

  function saveNodeConfigPatch(patch = {}) {
    return saveNodeConfigPatchInternal(patch)
  }

  function claimAdminAddress(addressInput) {
    const address = normalizeAddress(addressInput)
    if (!address) {
      return { success: false, claimed: false, reason: 'INVALID_ADDRESS' }
    }

    try {
      return withConfigLock(() => {
        const raw = readRawConfig()
        const current = normalizeNodeConfig(raw)
        if (current.adminAddress) {
          return {
            success: true,
            claimed: false,
            adminAddress: current.adminAddress,
          }
        }

        const saved = buildSavedConfig(raw, {}, address)
        persistRawConfig(saved)
        return {
          success: true,
          claimed: true,
          config: normalizeNodeConfig(saved),
          adminAddress: address,
        }
      })
    } catch (err) {
      console.error('[Config] Claim admin error:', err.message)
      return {
        success: false,
        claimed: false,
        reason: err.code || 'CONFIG_SAVE_FAILED',
        adminAddress: getNodeConfig().adminAddress,
      }
    }
  }

  return {
    configDir: resolvedConfigDir,
    configFile,
    lockFile,
    loadRawConfig,
    saveRawConfig,
    getNodeConfig,
    getDataPath,
    saveNodeConfigPatch,
    claimAdminAddress,
  }
}

export function evaluateStorageLimits(config, input = {}) {
  const size = Number(input.size ?? input.fileSize ?? 0)
  const reasons = []

  if (!Number.isFinite(size) || size < 0) {
    reasons.push('invalid-size')
  } else if (size > config.maxFileSizeBytes) {
    reasons.push('file-too-large')
  } else if (size > config.capacityBytes) {
    reasons.push('capacity-too-small')
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    policy: config,
  }
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value)
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > Number.MAX_SAFE_INTEGER
  ) {
    return fallback
  }
  return Math.floor(parsed)
}

function normalizeHost(value, fallback) {
  const host = String(value || '').trim()
  return host || fallback
}
