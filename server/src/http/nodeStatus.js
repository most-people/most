import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_NODE_HOST } from '../node/config.js'

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
    for (const [iface, entries = []] of Object.entries(os.networkInterfaces())) {
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
  const { remoteInvites, ...publicConfig } = config
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
      usedBytes: storage.used,
      freeBytes: Math.max(0, config.capacityBytes - storage.used),
    },
    storage,
    network,
    holdings,
  }
}

export function buildOpenApiSpec(appPort) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MostBox Node Daemon API',
      version: PACKAGE_JSON.version,
    },
    servers: [{ url: `http://localhost:${appPort}` }],
    paths: {
      '/api/node/status': {
        get: {
          summary: 'Get node daemon status',
          responses: { 200: { description: 'Node status' } },
        },
      },
      '/api/node/config': {
        get: {
          summary: 'Get node daemon config',
          responses: { 200: { description: 'Node config' } },
        },
        post: {
          summary: 'Update node daemon config',
          responses: { 200: { description: 'Updated config' } },
        },
      },
      '/api/node/policy': {
        get: {
          summary: 'Get local storage limits',
          responses: { 200: { description: 'Storage limits' } },
        },
        post: {
          summary: 'Update local storage limits',
          responses: { 200: { description: 'Updated policy' } },
        },
      },
      '/api/node/policy/evaluate': {
        post: {
          summary: 'Evaluate a local file against storage limits',
          responses: { 200: { description: 'Storage limit decision' } },
        },
      },
      '/api/node/holdings': {
        get: {
          summary: 'List CID replicas held by this node',
          responses: { 200: { description: 'Node holdings' } },
        },
        post: {
          summary: 'Add a held CID replica record and join its topic',
          responses: { 200: { description: 'Created holding' } },
        },
      },
      '/api/node/logs': {
        get: {
          summary: 'Read recent node daemon logs',
          responses: { 200: { description: 'Node logs' } },
        },
        delete: {
          summary: 'Clear node daemon logs',
          responses: { 200: { description: 'Logs cleared' } },
        },
      },
      '/api/node/diagnostics': {
        get: {
          summary: 'Export node diagnostics snapshot',
          responses: { 200: { description: 'Diagnostics snapshot' } },
        },
      },
      '/api/p2p/pull': {
        post: {
          summary: 'Pull a full file replica by CID',
          responses: { 200: { description: 'Pull task result' } },
        },
      },
      '/api/user/sync/start': {
        post: {
          summary: 'Start hidden authenticated user metadata sync',
          responses: { 200: { description: 'User sync status' } },
        },
      },
      '/api/user/sync/status': {
        get: {
          summary: 'Read authenticated user metadata sync status',
          responses: { 200: { description: 'User sync status' } },
        },
      },
      '/api/user/profile': {
        get: {
          summary: 'Read authenticated synced profile metadata',
          responses: { 200: { description: 'Synced profile' } },
        },
        put: {
          summary: 'Update authenticated synced profile metadata',
          responses: { 200: { description: 'Synced profile update result' } },
        },
      },
      '/api/files': {
        get: {
          summary: 'List published files for the authenticated local user',
          responses: { 200: { description: 'Published file list' } },
        },
      },
      '/api/files/{cid}/cache': {
        post: {
          summary: 'Pull a synced directory file into this node cache',
          responses: { 200: { description: 'Cache pull result' } },
        },
      },
      '/api/publish': {
        post: {
          summary: 'Publish a file and start seeding by CID',
          responses: { 200: { description: 'Published CID and most:// link' } },
        },
      },
      '/api/download/check': {
        post: {
          summary:
            'Check whether a most:// link is locally available or discoverable',
          responses: { 200: { description: 'Download availability result' } },
        },
      },
      '/api/download': {
        post: {
          summary: 'Start downloading a most:// link',
          responses: { 200: { description: 'Download task result' } },
        },
      },
      '/api/download/cancel': {
        post: {
          summary: 'Cancel an active download task',
          responses: { 200: { description: 'Cancellation result' } },
        },
      },
      '/api/files/{cid}/download': {
        get: {
          summary: 'Read a locally held file by CID',
          responses: { 200: { description: 'File bytes' } },
        },
      },
      '/api/channels': {
        get: {
          summary: 'List authenticated user channels',
          responses: { 200: { description: 'Channel list' } },
        },
        post: {
          summary: 'Create or join a P2P channel',
          responses: { 200: { description: 'Channel metadata' } },
        },
        delete: {
          summary: 'Leave a P2P channel',
          responses: { 200: { description: 'Updated channel list' } },
        },
      },
      '/api/channels/{name}/messages': {
        get: {
          summary: 'Read P2P channel messages',
          responses: { 200: { description: 'Channel messages' } },
        },
        post: {
          summary: 'Send a P2P channel message',
          responses: { 200: { description: 'Created channel message' } },
        },
      },
      '/api/channels/{name}/members': {
        get: {
          summary: 'List P2P channel members',
          responses: { 200: { description: 'Channel members' } },
        },
      },
      '/api/channels/{name}/peers': {
        get: {
          summary: 'List currently connected channel peers',
          responses: { 200: { description: 'Channel peers' } },
        },
      },
      '/api/channels/{name}/remark': {
        put: {
          summary: 'Set an authenticated user channel remark',
          responses: { 200: { description: 'Updated channel remark' } },
        },
      },
      '/api/channels/{name}/pin': {
        put: {
          summary: 'Pin or unpin a channel for the authenticated user',
          responses: { 200: { description: 'Updated pin state' } },
        },
      },
    },
  }
}

export function getPackageVersion() {
  return PACKAGE_JSON.version
}
