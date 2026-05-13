import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MAX_FILE_SIZE } from '../config.js'

const DEFAULT_CONFIG_DIR_NAME = '.most-box'
const DEFAULT_DATA_DIR_NAME = 'most-data'
const DEFAULT_CAPACITY_BYTES = 100 * 1024 * 1024 * 1024
const DECIMAL_STRING_REGEX = /^\d+(?:\.\d{1,6})?$/

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
    minimumPriceUsdtPerGbMonth: '0',
    allowOrders: false,
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
  const minimumPriceUsdtPerGbMonth = normalizeDecimalString(
    rawNode.minimumPriceUsdtPerGbMonth ??
      raw.minimumPriceUsdtPerGbMonth ??
      defaults.minimumPriceUsdtPerGbMonth
  )

  return {
    dataPath:
      typeof raw.dataPath === 'string'
        ? raw.dataPath.trim()
        : defaults.dataPath,
    capacityBytes,
    minimumPriceUsdtPerGbMonth,
    allowOrders:
      typeof rawNode.allowOrders === 'boolean'
        ? rawNode.allowOrders
        : typeof raw.allowOrders === 'boolean'
          ? raw.allowOrders
          : defaults.allowOrders,
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
        minimumPriceUsdtPerGbMonth:
          patch.minimumPriceUsdtPerGbMonth === undefined
            ? current.minimumPriceUsdtPerGbMonth
            : patch.minimumPriceUsdtPerGbMonth,
        allowOrders:
          patch.allowOrders === undefined
            ? current.allowOrders
            : patch.allowOrders,
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
        minimumPriceUsdtPerGbMonth: next.minimumPriceUsdtPerGbMonth,
        allowOrders: next.allowOrders,
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

export function evaluateNodePolicy(config, input = {}) {
  const size = Number(input.size ?? input.fileSize ?? 0)
  const offeredPrice = normalizeDecimalString(
    input.offeredPriceUsdtPerGbMonth ?? input.priceUsdtPerGbMonth ?? '0'
  )
  const reasons = []

  if (!config.allowOrders) {
    reasons.push('orders-disabled')
  }
  if (!Number.isFinite(size) || size < 0) {
    reasons.push('invalid-size')
  } else if (size > config.maxFileSizeBytes) {
    reasons.push('file-too-large')
  } else if (size > config.capacityBytes) {
    reasons.push('capacity-too-small')
  }
  if (
    compareDecimalStrings(offeredPrice, config.minimumPriceUsdtPerGbMonth) < 0
  ) {
    reasons.push('price-too-low')
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

function normalizeDecimalString(value) {
  const text = String(value ?? '0').trim()
  if (!DECIMAL_STRING_REGEX.test(text)) {
    return '0'
  }
  return text.replace(/^0+(?=\d)/, '') || '0'
}

function compareDecimalStrings(left, right) {
  const [leftInt, leftDec = ''] = left.split('.')
  const [rightInt, rightDec = ''] = right.split('.')
  const leftBig = BigInt(leftInt || '0')
  const rightBig = BigInt(rightInt || '0')
  if (leftBig !== rightBig) {
    return leftBig > rightBig ? 1 : -1
  }

  const maxLength = Math.max(leftDec.length, rightDec.length)
  const leftPadded = leftDec.padEnd(maxLength, '0')
  const rightPadded = rightDec.padEnd(maxLength, '0')
  if (leftPadded === rightPadded) return 0
  return leftPadded > rightPadded ? 1 : -1
}
