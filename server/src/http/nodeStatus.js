import fs from 'node:fs'
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

export function getNetworkAddresses(appPort) {
  return {
    port: appPort,
    addresses: [
      { type: 'local', ip: 'localhost', label: '本机', iface: 'loopback' },
    ],
  }
}

export async function buildNodeStatus(engine, configStore, appPort) {
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
    host: DEFAULT_NODE_HOST,
    port: appPort,
    listen: getNetworkAddresses(appPort),
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
    },
  }
}

export function getPackageVersion() {
  return PACKAGE_JSON.version
}
