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

const JSON_CONTENT_TYPE = 'application/json'

function jsonSchema(schema) {
  return {
    content: {
      [JSON_CONTENT_TYPE]: {
        schema,
      },
    },
  }
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
  return {
    openapi: '3.1.0',
    info: {
      title: 'MostBox Node Daemon API',
      version: PACKAGE_JSON.version,
    },
    servers: [{ url: `http://localhost:${appPort}` }],
    components: {
      schemas: {
        ChannelMention: {
          type: 'object',
          required: ['address', 'label', 'start', 'end'],
          properties: {
            address: {
              type: 'string',
              description: 'Lowercase wallet address to notify.',
            },
            label: {
              type: 'string',
              description:
                'Visible label that must match the @label text in content.',
            },
            start: {
              type: 'integer',
              minimum: 0,
              description: 'UTF-16 start offset in the final trimmed content.',
            },
            end: {
              type: 'integer',
              minimum: 1,
              description: 'UTF-16 exclusive end offset.',
            },
          },
        },
        LocalizedTag: {
          type: 'object',
          description:
            'Localized member label map. Keys are locale codes or default.',
          additionalProperties: { type: 'string' },
          properties: {
            default: { type: 'string' },
          },
        },
        LocalizedTagInput: {
          oneOf: [
            { $ref: '#/components/schemas/LocalizedTag' },
            { type: 'string' },
          ],
        },
        MemberTag: {
          oneOf: [
            { $ref: '#/components/schemas/LocalizedTag' },
            { type: 'null' },
          ],
        },
        MemberTagInput: {
          oneOf: [
            { $ref: '#/components/schemas/LocalizedTagInput' },
            { type: 'null' },
          ],
        },
        Channel: {
          type: 'object',
          required: ['name', 'channelKey'],
          properties: {
            name: { type: 'string' },
            channelId: { type: 'string' },
            channelKey: { type: 'string' },
            key: { type: 'string' },
            coreKey: { type: 'string' },
            localWriterCoreKey: { type: 'string' },
            writerCoreKeys: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string' },
            lastMessageAt: { type: 'string' },
            type: { type: 'string' },
            peerCount: { type: 'number' },
            remark: { type: 'string' },
            pinned: { type: 'boolean' },
          },
        },
        ChannelAttachment: {
          type: 'object',
          required: ['kind', 'cid', 'fileName', 'link'],
          properties: {
            kind: {
              type: 'string',
              enum: ['image', 'video', 'audio', 'text', 'file'],
            },
            cid: { type: 'string' },
            fileName: { type: 'string' },
            link: { type: 'string' },
            mimeType: { type: 'string' },
            size: { type: 'integer', minimum: 0 },
          },
        },
        ChannelMessage: {
          type: 'object',
          required: ['type', 'author', 'authorName', 'content', 'timestamp'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['message', 'system'] },
            event: { type: 'string' },
            author: { type: 'string' },
            authorName: { type: 'string' },
            avatar: { type: 'string' },
            content: { type: 'string' },
            authorTag: { $ref: '#/components/schemas/LocalizedTag' },
            timestamp: { type: 'number' },
            clientMessageId: {
              type: 'string',
              description:
                'Client-generated UUID v4 used by clients to merge sends.',
            },
            mentions: {
              type: 'array',
              maxItems: 20,
              items: { $ref: '#/components/schemas/ChannelMention' },
            },
            attachment: { $ref: '#/components/schemas/ChannelAttachment' },
          },
        },
        ChannelMemberProfile: {
          type: 'object',
          required: ['address', 'displayName'],
          properties: {
            address: { type: 'string' },
            displayName: { type: 'string' },
            avatar: { type: 'string' },
            tag: { $ref: '#/components/schemas/MemberTag' },
            profileUpdatedAt: { type: 'number' },
            joinedAt: { type: 'string' },
          },
        },
        ChannelPresence: {
          type: 'object',
          required: ['channel', 'address', 'lastSeen', 'online'],
          properties: {
            channel: { type: 'string' },
            channelKey: { type: 'string' },
            channelId: { type: 'string' },
            address: { type: 'string' },
            displayName: { type: 'string' },
            avatar: { type: 'string' },
            lastSeen: { type: 'number' },
            online: { type: 'boolean' },
          },
        },
        ChannelCreateRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            displayName: { type: 'string' },
            avatar: { type: 'string' },
            tag: { $ref: '#/components/schemas/MemberTagInput' },
          },
        },
        ChannelMessageRequest: {
          type: 'object',
          required: ['content', 'author', 'authorName'],
          properties: {
            content: { type: 'string' },
            author: { type: 'string' },
            authorName: { type: 'string' },
            avatar: { type: 'string' },
            authorTag: { $ref: '#/components/schemas/LocalizedTagInput' },
            clientMessageId: {
              type: 'string',
              description: 'Optional UUID v4 generated by new clients.',
            },
            mentions: {
              type: 'array',
              maxItems: 20,
              items: { $ref: '#/components/schemas/ChannelMention' },
            },
            attachment: { $ref: '#/components/schemas/ChannelAttachment' },
          },
        },
        ChannelMemberProfileRequest: {
          type: 'object',
          required: ['author'],
          properties: {
            author: { type: 'string' },
            displayName: { type: 'string' },
            avatar: { type: 'string' },
            tag: { $ref: '#/components/schemas/MemberTagInput' },
          },
        },
      },
    },
    paths: {
      '/api/admin/access': {
        get: {
          summary: 'Read node administration access state',
          responses: { 200: { description: 'Administration access state' } },
        },
        post: {
          summary: 'Claim LAN node administration with a signed identity',
          responses: {
            200: { description: 'Administration access claimed' },
            409: { description: 'Administration already claimed' },
          },
        },
      },
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
      '/api/user/profile': {
        get: {
          summary: 'Read authenticated local profile metadata',
          responses: { 200: { description: 'Profile metadata' } },
        },
        put: {
          summary: 'Update authenticated local profile metadata',
          responses: { 200: { description: 'Profile update result' } },
        },
      },
      '/api/user/export': {
        get: {
          summary: 'Export authenticated account metadata for encrypted backup',
          responses: {
            200: { description: 'Account metadata backup payload' },
          },
        },
      },
      '/api/user/import': {
        post: {
          summary: 'Import authenticated account metadata from backup',
          responses: { 200: { description: 'Account metadata import result' } },
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
          summary: 'Pull a directory file into this node cache',
          responses: { 200: { description: 'Cache pull result' } },
        },
      },
      '/api/publish': {
        post: {
          summary: 'Publish a file and start seeding by CID',
          responses: { 200: { description: 'Published CID and most:// link' } },
        },
      },
      '/api/folder/share': {
        post: {
          summary:
            'Share an existing file-library folder as a UnixFS directory collection',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['path'],
                  properties: {
                    path: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description:
                'Folder collection CID, most:// link, file count, and size',
            },
          },
        },
      },
      '/api/collections/{cid}': {
        get: {
          summary: 'Read a UnixFS directory collection file list by root CID',
          responses: {
            200: {
              description:
                'Collection metadata with child file CIDs and local states',
            },
          },
        },
      },
      '/api/download/check': {
        post: {
          summary:
            'Check whether a CID-tailed share target is locally available or discoverable, including UnixFS directory file lists',
          responses: { 200: { description: 'Download availability result' } },
        },
      },
      '/api/download': {
        post: {
          summary:
            'Start downloading a CID-tailed share target, optionally with selected collection paths',
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
          responses: {
            200: {
              description: 'Channel list',
              ...jsonSchema({
                type: 'array',
                items: { $ref: '#/components/schemas/Channel' },
              }),
            },
          },
        },
        post: {
          summary: 'Create or join a P2P channel',
          requestBody: jsonSchema({
            $ref: '#/components/schemas/ChannelCreateRequest',
          }),
          responses: {
            200: {
              description: 'Channel metadata',
              ...jsonSchema({ $ref: '#/components/schemas/Channel' }),
            },
          },
        },
        delete: {
          summary: 'Leave a P2P channel',
          responses: { 200: { description: 'Updated channel list' } },
        },
      },
      '/api/channels/{name}/messages': {
        get: {
          summary: 'Read P2P channel messages',
          responses: {
            200: {
              description: 'Channel messages',
              ...jsonSchema({
                type: 'array',
                items: { $ref: '#/components/schemas/ChannelMessage' },
              }),
            },
          },
        },
        post: {
          summary: 'Send a P2P channel message',
          requestBody: jsonSchema({
            $ref: '#/components/schemas/ChannelMessageRequest',
          }),
          responses: {
            200: {
              description: 'Created channel message',
              ...jsonSchema({
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { $ref: '#/components/schemas/ChannelMessage' },
                },
              }),
            },
          },
        },
      },
      '/api/channels/{name}/member-profiles': {
        get: {
          summary: 'Read persisted member profiles for a channel',
          responses: {
            200: {
              description: 'Channel member profiles',
              ...jsonSchema({
                type: 'array',
                items: { $ref: '#/components/schemas/ChannelMemberProfile' },
              }),
            },
          },
        },
      },
      '/api/channels/{name}/member-profile': {
        post: {
          summary: 'Update authenticated member profile for a channel',
          requestBody: jsonSchema({
            $ref: '#/components/schemas/ChannelMemberProfileRequest',
          }),
          responses: {
            200: {
              description: 'Updated member profile',
              ...jsonSchema({
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  member: {
                    $ref: '#/components/schemas/ChannelMemberProfile',
                  },
                  event: { $ref: '#/components/schemas/ChannelMessage' },
                },
              }),
            },
          },
        },
      },
      '/api/channels/{name}/peers': {
        get: {
          summary: 'List currently connected channel peers',
          responses: { 200: { description: 'Channel peers' } },
        },
      },
      '/api/channels/{name}/presence': {
        get: {
          summary: 'List active user presence for a channel',
          responses: {
            200: {
              description: 'Channel presence',
              ...jsonSchema({
                type: 'array',
                items: { $ref: '#/components/schemas/ChannelPresence' },
              }),
            },
          },
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
