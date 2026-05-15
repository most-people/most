import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MAX_FILE_SIZE } from '../config.js'

const DEFAULT_CONFIG_DIR_NAME = '.most-box'
const DEFAULT_DATA_DIR_NAME = 'most-data'
const DEFAULT_CAPACITY_BYTES = 100 * 1024 * 1024 * 1024

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
    capacityBytes: DEFAULT_CAPACITY_BYTES,
    autoSeedDownloads: true,
    autoSeedPublishes: true,
    maxConcurrentSeeds: 32,
    uploadRateLimitBytesPerSecond: 0,
    maxFileSizeBytes: MAX_FILE_SIZE,
  }
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
  const maxConcurrentSeeds = normalizePositiveInteger(
    rawNode.maxConcurrentSeeds ?? raw.maxConcurrentSeeds,
    defaults.maxConcurrentSeeds
  )
  const uploadRateLimitBytesPerSecond = normalizePositiveInteger(
    rawNode.uploadRateLimitBytesPerSecond ??
      raw.uploadRateLimitBytesPerSecond,
    defaults.uploadRateLimitBytesPerSecond
  )

  return {
    dataPath:
      typeof raw.dataPath === 'string'
        ? raw.dataPath.trim()
        : defaults.dataPath,
    capacityBytes,
    autoSeedDownloads:
      typeof rawNode.autoSeedDownloads === 'boolean'
        ? rawNode.autoSeedDownloads
        : typeof raw.autoSeedDownloads === 'boolean'
          ? raw.autoSeedDownloads
          : defaults.autoSeedDownloads,
    autoSeedPublishes:
      typeof rawNode.autoSeedPublishes === 'boolean'
        ? rawNode.autoSeedPublishes
        : typeof raw.autoSeedPublishes === 'boolean'
          ? raw.autoSeedPublishes
          : defaults.autoSeedPublishes,
    maxConcurrentSeeds,
    uploadRateLimitBytesPerSecond,
    maxFileSizeBytes,
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
        capacityBytes:
          patch.capacityBytes === undefined
            ? current.capacityBytes
            : patch.capacityBytes,
        autoSeedDownloads:
          patch.autoSeedDownloads === undefined
            ? current.autoSeedDownloads
            : patch.autoSeedDownloads,
        autoSeedPublishes:
          patch.autoSeedPublishes === undefined
            ? current.autoSeedPublishes
            : patch.autoSeedPublishes,
        maxConcurrentSeeds:
          patch.maxConcurrentSeeds === undefined
            ? current.maxConcurrentSeeds
            : patch.maxConcurrentSeeds,
        uploadRateLimitBytesPerSecond:
          patch.uploadRateLimitBytesPerSecond === undefined
            ? current.uploadRateLimitBytesPerSecond
            : patch.uploadRateLimitBytesPerSecond,
        maxFileSizeBytes:
          patch.maxFileSizeBytes === undefined
            ? current.maxFileSizeBytes
            : patch.maxFileSizeBytes,
      },
    })

    const saved = {
      ...raw,
      dataPath: next.dataPath,
      node: {
        ...(raw.node && typeof raw.node === 'object' ? raw.node : {}),
        capacityBytes: next.capacityBytes,
        autoSeedDownloads: next.autoSeedDownloads,
        autoSeedPublishes: next.autoSeedPublishes,
        maxConcurrentSeeds: next.maxConcurrentSeeds,
        uploadRateLimitBytesPerSecond: next.uploadRateLimitBytesPerSecond,
        maxFileSizeBytes: next.maxFileSizeBytes,
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

export function evaluateSeedPolicy(config, input = {}) {
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
