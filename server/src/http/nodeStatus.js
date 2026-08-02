import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_NODE_HOST } from '../node/config.js'
import { createOpenApiSpec } from './openapi.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_JSON = readPackageJson()

function readPackageJson() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'package.json'),
        'utf-8'
      )
    )
  } catch {
    return { version: '0.0.0' }
  }
}

function isWildcardHost(host) {
  return host === '0.0.0.0' || host === '::'
}

function isLoopbackHost(host) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
}

export function getNetworkAddresses(appPort, appHost = DEFAULT_NODE_HOST) {
  const addresses = [
    { type: 'local', ip: 'localhost', label: '本机', iface: 'loopback' },
  ]

  if (isWildcardHost(appHost)) {
    for (const [iface, entries = []] of Object.entries(
      os.networkInterfaces()
    )) {
      for (const entry of entries) {
        if (entry.internal) continue
        addresses.push({
          type: entry.family === 'IPv6' ? 'ipv6' : 'lan',
          ip: entry.address,
          label: iface,
          iface,
        })
      }
    }
  } else if (!isLoopbackHost(appHost)) {
    addresses.push({
      type: 'listen',
      ip: appHost,
      label: '监听地址',
      iface: 'configured',
    })
  }

  return { port: appPort, addresses }
}

export async function buildNodeStatus(
  engine,
  configStore,
  appPort,
  appHost = DEFAULT_NODE_HOST
) {
  const config = configStore.getNodeConfig()
  const { remoteInvites } = config
  const publicConfig = { ...config }
  delete publicConfig.remoteInvites
  delete publicConfig.adminAddress
  const remoteInviteCount = remoteInvites.length
  const storage = await engine.getStorageStats()
  const network = engine.getNetworkStatus()
  const holdings = engine.listHoldings()

  return {
    status: 'online',
    version: PACKAGE_JSON.version,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeId: engine.getNodeId(),
    host: appHost,
    port: appPort,
    listen: getNetworkAddresses(appPort, appHost),
    dataPath: configStore.getDataPath(),
    config: {
      ...publicConfig,
      remoteInviteCount,
      remoteInviteConfigured: remoteInviteCount > 0,
    },
    policy: {
      maxFileSizeBytes: config.maxFileSizeBytes,
    },
    capacity: {
      configuredBytes: config.capacityBytes,
      usedBytes: storage.logicalUsedBytes,
      freeBytes: Math.max(0, config.capacityBytes - storage.logicalUsedBytes),
      physicalFreeBytes: storage.physicalFreeBytes,
    },
    storage,
    network,
    holdings,
  }
}

export function buildOpenApiSpec(appPort) {
  return createOpenApiSpec({
    serverUrl: `http://localhost:${appPort}`,
    version: PACKAGE_JSON.version,
  })
}

export function getPackageVersion() {
  return PACKAGE_JSON.version
}
