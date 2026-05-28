import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MAX_FILE_SIZE } from '../config.js'

const DEFAULT_CONFIG_DIR_NAME = '.most-box'
const DEFAULT_DATA_DIR_NAME = 'most-data'
const DEFAULT_CAPACITY_BYTES = 100 * 1024 * 1024 * 1024
export const DEFAULT_NODE_PORT = 1976
export const DEFAULT_NODE_HOST = '127.0.0.1'

export function getDefaultConfigDir() {
  return process.env.MOSTBOX_CONFIG_DIR
    ? path.resolve(process.env.MOSTBOX_CONFIG_DIR)
    : path.join(os.homedir(), DEFAULT_CONFIG_DIR_NAME)
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
    remoteInvites: normalizeRemoteInvites(process.env.MOSTBOX_REMOTE_INVITES),
  }
}

export function normalizeRemoteInvites(value = []) {
  const items = Array.isArray(value) ? value : String(value || '').split(',')
  return Array.from(
    new Set(items.map(item => String(item || '').trim()).filter(Boolean))
  )
}

export function normalizeNodeHost(value, fallback = DEFAULT_NODE_HOST) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
  if (['localhost', '127.0.0.1', '::1'].includes(host)) {
    return DEFAULT_NODE_HOST
  }
  if (['0.0.0.0', '::'].includes(host)) return host
  return fallback
}

export function normalizeNodeConfig(raw = {}) {
  const defaults = getDefaultNodeConfig()
  const rawNode = raw.node && typeof raw.node === 'object' ? raw.node : {}

  const capacityBytes = normalizePositiveInteger(
    rawNode.capacityBytes ?? raw.capacityBytes,
    defaults.capacityBytes
  )
  const maxFileSizeBytes = normalizePositiveInteger(
    rawNode.maxFileSizeBytes ?? raw.maxFileSizeBytes,
    defaults.maxFileSizeBytes
  )
  const port = normalizePort(rawNode.port ?? raw.port, defaults.port)
  const remoteInvites = normalizeRemoteInvites(
    rawNode.remoteInvites ?? raw.remoteInvites ?? defaults.remoteInvites
  )
  return {
    dataPath:
      typeof raw.dataPath === 'string'
        ? raw.dataPath.trim()
        : defaults.dataPath,
    host: normalizeNodeHost(rawNode.host ?? raw.host, defaults.host),
    port,
    capacityBytes,
    maxFileSizeBytes,
    remoteInvites,
  }
}

export function createNodeConfigStore(configDir = getDefaultConfigDir()) {
  const resolvedConfigDir = path.resolve(configDir)
  const configFile = path.join(resolvedConfigDir, 'config.json')

  function loadRawConfig() {
    try {
      if (fs.existsSync(configFile)) {
        return JSON.parse(fs.readFileSync(configFile, 'utf-8'))
      }
    } catch (err) {
      console.error('[Config] Load error:', err.message)
    }
    return {}
  }

  function saveRawConfig(config) {
    try {
      if (!fs.existsSync(resolvedConfigDir)) {
        fs.mkdirSync(resolvedConfigDir, { recursive: true })
      }
      const tmpPath = configFile + '.tmp'
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
      fs.renameSync(tmpPath, configFile)
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
    if (process.env.MOSTBOX_DATA_PATH) {
      return process.env.MOSTBOX_DATA_PATH
    }
    return getNodeConfig().dataPath || getDefaultDataPath()
  }

  function saveNodeConfigPatch(patch = {}) {
    const raw = loadRawConfig()
    const current = normalizeNodeConfig(raw)
    const next = normalizeNodeConfig({
      ...raw,
      dataPath:
        patch.dataPath === undefined ? current.dataPath : patch.dataPath,
      node: {
        ...(raw.node && typeof raw.node === 'object' ? raw.node : {}),
        host: patch.host === undefined ? current.host : patch.host,
        port: patch.port === undefined ? current.port : patch.port,
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
      },
    })

    const saved = {
      dataPath: next.dataPath,
      node: {
        host: next.host,
        port: next.port,
        capacityBytes: next.capacityBytes,
        maxFileSizeBytes: next.maxFileSizeBytes,
        remoteInvites: next.remoteInvites,
        updatedAt: new Date().toISOString(),
      },
    }

    return { success: saveRawConfig(saved), config: normalizeNodeConfig(saved) }
  }

  return {
    configDir: resolvedConfigDir,
    configFile,
    loadRawConfig,
    saveRawConfig,
    getNodeConfig,
    getDataPath,
    saveNodeConfigPatch,
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
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }
  return Math.floor(parsed)
}

function normalizePort(value, fallback) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback
  }
  return parsed
}
