import { MCP_CLIENT_MAX_EXPIRES_IN_DAYS } from '../mcp/constants.js'

const JSON_CONTENT_TYPE = 'application/json'

const ref = name => ({ $ref: `#/components/schemas/${name}` })

function jsonContent(schema, example) {
  const resolvedExample =
    example === undefined ? createSchemaExample(schema) : example

  return {
    content: {
      [JSON_CONTENT_TYPE]: {
        schema,
        ...(resolvedExample === undefined ? {} : { example: resolvedExample }),
      },
    },
  }
}

function jsonRequest(schema, example) {
  return {
    required: true,
    ...jsonContent(schema, example),
  }
}

function jsonResponse(description, schema, example) {
  return {
    description,
    ...jsonContent(schema, example),
  }
}

const errorResponse = description =>
  jsonResponse(description, ref('ErrorResponse'))

function responses(success, errorStatuses = [400, 401, 403, 500]) {
  const result = { ...success }
  for (const status of errorStatuses) {
    result[status] = errorResponse(
      {
        400: 'Invalid request',
        401: 'Authentication required or invalid',
        403: 'Request is not allowed for this identity or access mode',
        404: 'Requested resource was not found',
        409: 'Request conflicts with current state',
        413: 'Payload exceeds the configured limit',
        429: 'Too many requests',
        500: 'Daemon operation failed',
      }[status] || 'Request failed'
    )
  }
  return result
}

function pathParameter(name, description) {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string' },
  }
}

function queryParameter(name, schema, description) {
  return {
    name,
    in: 'query',
    required: false,
    description,
    schema,
  }
}

function operation({
  tag,
  operationId,
  summary,
  description = '',
  sideEffect = 'none',
  confirmation = false,
  security,
  parameters,
  requestBody,
  responses: operationResponses,
}) {
  const sideEffectDescription =
    sideEffect === 'none'
      ? ''
      : sideEffect === 'dangerous'
        ? 'Side effect: this operation can remove, overwrite, or significantly reconfigure local state.'
        : 'Side effect: this operation changes local daemon or user state.'

  return {
    tags: [tag],
    operationId,
    summary,
    description: [description, sideEffectDescription]
      .filter(Boolean)
      .join('\n\n'),
    'x-mostbox-side-effect': sideEffect,
    ...(confirmation ? { 'x-mostbox-confirmation': true } : {}),
    security: security || [],
    ...(parameters ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: operationResponses,
  }
}

const signedSecurity = [{ MostBoxSignature: [] }]
const localAdminSecurity = [{ MostBoxSignature: [] }, {}]
const mcpSecurity = [{ McpBearer: [] }]

const successSchema = {
  type: 'object',
  required: ['success'],
  properties: { success: { type: 'boolean' } },
  additionalProperties: true,
}

const cidParameter = pathParameter('cid', 'UnixFS CID v1 content identity.')
const channelNameParameter = pathParameter(
  'name',
  'Channel name, key, or stable channel identifier.'
)

const schemas = {
  ErrorResponse: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string' },
      code: { type: 'string' },
      errorCode: { type: 'string' },
      details: { type: 'object', additionalProperties: true },
      requiredScope: { type: 'string' },
    },
    additionalProperties: true,
  },
  SuccessResponse: successSchema,
  AdministrationAccess: {
    type: 'object',
    required: ['mode', 'claimed', 'authorized', 'adminAddress'],
    properties: {
      mode: { type: 'string', enum: ['loopback', 'lan', 'remote'] },
      claimed: { type: 'boolean' },
      authorized: { type: 'boolean' },
      adminAddress: { type: 'string' },
      success: { type: 'boolean' },
    },
  },
  McpClient: {
    type: 'object',
    required: [
      'id',
      'name',
      'ownerAddress',
      'scopes',
      'allowedRoots',
      'createdAt',
      'active',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      ownerAddress: { type: 'string' },
      scopes: { type: 'array', items: { type: 'string' } },
      allowedRoots: { type: 'array', items: { type: 'string' } },
      createdAt: { type: 'string', format: 'date-time' },
      expiresAt: {
        oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
      },
      lastUsedAt: {
        oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
      },
      revokedAt: {
        oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
      },
      active: { type: 'boolean' },
    },
  },
  McpClientCreateRequest: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      scopes: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: {
          type: 'string',
          enum: [
            'node:read',
            'files:read',
            'files:publish',
            'files:download',
            'downloads:cancel',
          ],
        },
      },
      allowedRoots: { type: 'array', items: { type: 'string' } },
      expiresInDays: {
        type: 'integer',
        minimum: 1,
        maximum: MCP_CLIENT_MAX_EXPIRES_IN_DAYS,
      },
    },
  },
  McpClientList: {
    type: 'object',
    required: ['clients'],
    properties: {
      clients: { type: 'array', items: ref('McpClient') },
    },
  },
  McpCredential: {
    allOf: [
      successSchema,
      {
        type: 'object',
        required: ['client', 'token', 'endpoint'],
        properties: {
          client: ref('McpClient'),
          token: {
            type: 'string',
            description: 'Plaintext token returned once at creation time.',
          },
          endpoint: { type: 'string', format: 'uri' },
        },
      },
    ],
  },
  McpPrincipal: {
    type: 'object',
    required: ['client'],
    properties: { client: ref('McpClient') },
  },
  McpPublishRequest: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'Absolute daemon-host path under an allowed root.',
      },
      fileName: { type: 'string', minLength: 1, maxLength: 255 },
    },
  },
  NodeConfig: {
    type: 'object',
    properties: {
      dataPath: { type: 'string' },
      configuredDataPath: { type: 'string' },
      isDefaultDataPath: { type: 'boolean' },
      host: { type: 'string' },
      currentHost: { type: 'string' },
      port: { type: 'integer', minimum: 1, maximum: 65535 },
      currentPort: { type: 'integer', minimum: 1, maximum: 65535 },
      capacityBytes: { type: 'integer', minimum: 0 },
      maxFileSizeBytes: { type: 'integer', minimum: 0 },
      remoteInvites: { type: 'array', items: { type: 'string' } },
      remoteInviteCount: { type: 'integer', minimum: 0 },
      remoteInviteConfigured: { type: 'boolean' },
    },
    additionalProperties: true,
  },
  NodeConfigUpdate: {
    type: 'object',
    properties: {
      dataPath: { type: 'string' },
      resetStorage: { type: 'boolean' },
      host: { type: 'string' },
      port: { type: 'integer', minimum: 1, maximum: 65535 },
      capacityBytes: { type: 'integer', minimum: 0 },
      maxFileSizeBytes: { type: 'integer', minimum: 0 },
      remoteInvites: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  NodePolicy: {
    type: 'object',
    required: ['maxFileSizeBytes'],
    properties: { maxFileSizeBytes: { type: 'integer', minimum: 0 } },
  },
  StoragePolicyDecision: {
    type: 'object',
    required: ['accepted', 'reasons', 'policy'],
    properties: {
      accepted: { type: 'boolean' },
      reasons: { type: 'array', items: { type: 'string' } },
      policy: ref('NodeConfig'),
    },
  },
  NodeHolding: {
    type: 'object',
    required: ['cid', 'fileName', 'size'],
    properties: {
      cid: { type: 'string' },
      fileName: { type: 'string' },
      size: { type: 'integer', minimum: 0 },
      topic: {
        type: 'string',
        description: 'Hex CID digest topic joined for seeding.',
      },
      driveName: { type: 'string' },
      source: { type: 'string' },
      link: { type: 'string' },
      joined: { type: 'boolean' },
      seedStatus: {
        type: 'string',
        enum: ['queued', 'joining', 'active', 'paused', 'error'],
      },
      seedError: { type: 'string' },
      seedStatusUpdatedAt: { type: 'string', format: 'date-time' },
      peerCount: { type: 'integer', minimum: 0 },
      lastServedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
      },
      totalServedBytes: { type: 'integer', minimum: 0 },
      updatedAt: { type: 'string', format: 'date-time' },
    },
    additionalProperties: true,
  },
  NodeHoldingCreateRequest: {
    type: 'object',
    required: ['cid', 'fileName', 'size'],
    properties: {
      cid: { type: 'string' },
      fileName: { type: 'string' },
      size: { type: 'integer', minimum: 0 },
      driveName: { type: 'string' },
    },
  },
  NodeLog: {
    type: 'object',
    required: ['id', 'ts', 'level', 'event', 'message'],
    properties: {
      id: { type: 'string' },
      ts: { type: 'string', format: 'date-time' },
      level: { type: 'string' },
      event: { type: 'string' },
      message: { type: 'string' },
      data: { type: 'object', additionalProperties: true },
    },
  },
  NodeStatus: {
    type: 'object',
    required: [
      'status',
      'version',
      'nodeId',
      'capacity',
      'network',
      'holdings',
    ],
    properties: {
      status: { type: 'string' },
      version: { type: 'string' },
      uptimeSeconds: { type: 'integer', minimum: 0 },
      nodeId: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'integer' },
      dataPath: { type: 'string' },
      config: ref('NodeConfig'),
      policy: ref('NodePolicy'),
      capacity: { type: 'object', additionalProperties: true },
      storage: { type: 'object', additionalProperties: true },
      network: { type: 'object', additionalProperties: true },
      holdings: { type: 'array', items: ref('NodeHolding') },
    },
  },
  P2PPingDirection: {
    type: 'object',
    required: [
      'direction',
      'initiatorRole',
      'status',
      'phase',
      'discoveredPeers',
    ],
    properties: {
      direction: {
        type: 'string',
        enum: ['hostToJoin', 'joinToHost'],
      },
      initiatorRole: { type: 'string', enum: ['host', 'join'] },
      status: {
        type: 'string',
        enum: [
          'preparing',
          'waiting',
          'discovering',
          'connecting',
          'verifying',
          'success',
          'failed',
          'cancelled',
          'expired',
        ],
      },
      phase: { type: 'string' },
      elapsedMs: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
      discoveredPeers: { type: 'integer', minimum: 0 },
      localPeerKey: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      remotePeerKey: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      errorCode: {
        oneOf: [
          {
            type: 'string',
            enum: [
              'ANNOUNCE_FAILED',
              'PEER_NOT_FOUND',
              'CONNECTION_FAILED',
              'PING_FAILED',
              'TIMEOUT',
              'CANCELLED',
            ],
          },
          { type: 'null' },
        ],
      },
      errorMessage: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    },
  },
  P2PPing: {
    type: 'object',
    required: [
      'id',
      'role',
      'code',
      'status',
      'phase',
      'createdAt',
      'expiresAt',
      'discoveredPeers',
      'directions',
    ],
    properties: {
      id: { type: 'string', pattern: '^[0-9a-f]{32}$' },
      role: { type: 'string', enum: ['host', 'join'] },
      code: { type: 'string', pattern: '^\\d{6}$' },
      status: {
        type: 'string',
        enum: [
          'preparing',
          'waiting',
          'discovering',
          'connecting',
          'verifying',
          'success',
          'partial',
          'failed',
          'cancelled',
          'expired',
        ],
      },
      phase: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' },
      completedAt: {
        oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
      },
      elapsedMs: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
      discoveredPeers: { type: 'integer', minimum: 0 },
      localPeerKey: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      remotePeerKey: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      errorCode: {
        oneOf: [
          {
            type: 'string',
            enum: [
              'ANNOUNCE_FAILED',
              'PEER_NOT_FOUND',
              'CONNECTION_FAILED',
              'PING_FAILED',
              'TIMEOUT',
              'CANCELLED',
            ],
          },
          { type: 'null' },
        ],
      },
      errorMessage: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      directions: {
        type: 'object',
        required: ['hostToJoin', 'joinToHost'],
        properties: {
          hostToJoin: ref('P2PPingDirection'),
          joinToHost: ref('P2PPingDirection'),
        },
        additionalProperties: false,
      },
    },
  },
  P2PPingStartRequest: {
    type: 'object',
    required: ['role'],
    properties: {
      role: { type: 'string', enum: ['host', 'join'] },
      code: { type: 'string', pattern: '^\\d{6}$' },
    },
    additionalProperties: false,
  },
  P2PPingResponse: {
    allOf: [
      successSchema,
      {
        type: 'object',
        required: ['ping'],
        properties: { ping: ref('P2PPing') },
      },
    ],
  },
  PublishedFile: {
    type: 'object',
    required: ['cid', 'fileName'],
    properties: {
      cid: { type: 'string' },
      fileName: { type: 'string' },
      size: { type: 'integer', minimum: 0 },
      link: { type: 'string' },
      path: { type: 'string' },
      kind: { type: 'string', enum: ['file', 'collection'] },
      folderShare: { type: 'boolean' },
      source: { type: 'string', enum: ['published', 'downloaded'] },
      starred: { type: 'boolean' },
      localAvailable: { type: 'boolean' },
      seedStatus: { type: 'string' },
      joined: { type: 'boolean' },
      peerCount: { type: 'integer', minimum: 0 },
      createdAt: { type: 'string', format: 'date-time' },
    },
    additionalProperties: true,
  },
  PublishResult: {
    type: 'object',
    required: ['success', 'cid'],
    properties: {
      success: { type: 'boolean' },
      cid: { type: 'string' },
      fileName: { type: 'string' },
      size: { type: 'integer', minimum: 0 },
      link: { type: 'string' },
      taskId: { type: 'string' },
    },
    additionalProperties: true,
  },
  CollectionItem: {
    type: 'object',
    required: ['path', 'cid'],
    properties: {
      path: { type: 'string' },
      cid: { type: 'string' },
      size: { type: 'integer', minimum: 0 },
      localAvailable: { type: 'boolean' },
    },
    additionalProperties: true,
  },
  Collection: {
    type: 'object',
    required: ['cid', 'files'],
    properties: {
      cid: { type: 'string' },
      fileName: { type: 'string' },
      fileCount: { type: 'integer', minimum: 0 },
      size: { type: 'integer', minimum: 0 },
      files: { type: 'array', items: ref('CollectionItem') },
    },
    additionalProperties: true,
  },
  DownloadCheckRequest: {
    type: 'object',
    required: ['link'],
    properties: {
      link: { type: 'string', minLength: 1, maxLength: 4096 },
      timeout: { type: 'integer', minimum: 100, maximum: 30000 },
    },
  },
  DownloadRequest: {
    type: 'object',
    required: ['link'],
    properties: {
      link: { type: 'string', minLength: 1, maxLength: 4096 },
      selectedPaths: {
        type: 'array',
        maxItems: 500,
        items: { type: 'string' },
      },
      background: { type: 'boolean' },
    },
  },
  DownloadTask: {
    type: 'object',
    required: ['taskId'],
    properties: {
      taskId: { type: 'string' },
      cid: { type: 'string' },
      fileName: { type: 'string' },
      kind: { type: 'string' },
      status: { type: 'string' },
      progress: { type: 'number', minimum: 0, maximum: 1 },
      totalFiles: { type: 'integer', minimum: 0 },
    },
    additionalProperties: true,
  },
  DownloadResult: {
    allOf: [
      successSchema,
      {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          cid: { type: 'string' },
          fileName: { type: 'string' },
          kind: { type: 'string' },
          fileCount: { type: 'integer', minimum: 0 },
        },
        additionalProperties: true,
      },
    ],
  },
  CacheRequest: {
    type: 'object',
    properties: {
      timeout: { type: 'integer', minimum: 100 },
      taskId: { type: 'string' },
    },
  },
  PullRequest: {
    type: 'object',
    required: ['cid'],
    properties: {
      cid: { type: 'string' },
      fileName: { type: 'string' },
      timeout: { type: 'integer', minimum: 100 },
      taskId: { type: 'string' },
    },
    additionalProperties: true,
  },
  UserProfile: {
    type: 'object',
    properties: {
      displayName: { type: 'string' },
      avatar: { type: 'string' },
      tag: { $ref: '#/components/schemas/MemberTag' },
      updatedAt: { type: 'number' },
    },
    additionalProperties: true,
  },
  AccountBackup: {
    type: 'object',
    required: ['type', 'schemaVersion', 'ownerAddress'],
    properties: {
      type: { type: 'string', const: 'mostbox.account-backup' },
      schemaVersion: { type: 'integer', minimum: 1 },
      ownerAddress: { type: 'string' },
      exportedAt: { type: 'string', format: 'date-time' },
      profile: ref('UserProfile'),
      files: { type: 'array', items: ref('PublishedFile') },
      channels: { type: 'array', items: ref('Channel') },
      notes: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
      preferences: { type: 'object', additionalProperties: true },
    },
    additionalProperties: true,
  },
  ChannelMention: {
    type: 'object',
    required: ['address', 'label', 'start', 'end'],
    properties: {
      address: { type: 'string', description: 'Lowercase wallet address.' },
      label: { type: 'string' },
      start: { type: 'integer', minimum: 0 },
      end: { type: 'integer', minimum: 1 },
    },
  },
  LocalizedTag: {
    type: 'object',
    additionalProperties: { type: 'string' },
    properties: { default: { type: 'string' } },
  },
  LocalizedTagInput: {
    oneOf: [ref('LocalizedTag'), { type: 'string' }],
  },
  MemberTag: {
    oneOf: [ref('LocalizedTag'), { type: 'null' }],
  },
  MemberTagInput: {
    oneOf: [ref('LocalizedTagInput'), { type: 'null' }],
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
    additionalProperties: true,
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
      authorTag: ref('LocalizedTag'),
      timestamp: { type: 'number' },
      clientMessageId: { type: 'string', format: 'uuid' },
      mentions: { type: 'array', maxItems: 20, items: ref('ChannelMention') },
      attachment: ref('ChannelAttachment'),
    },
    additionalProperties: true,
  },
  ChannelMemberProfile: {
    type: 'object',
    required: ['address', 'displayName'],
    properties: {
      address: { type: 'string' },
      displayName: { type: 'string' },
      avatar: { type: 'string' },
      tag: ref('MemberTag'),
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
      tag: ref('MemberTagInput'),
    },
  },
  ChannelLeaveRequest: {
    type: 'object',
    properties: {
      channelKey: { type: 'string' },
      name: { type: 'string' },
    },
    anyOf: [{ required: ['channelKey'] }, { required: ['name'] }],
  },
  ChannelMessageRequest: {
    type: 'object',
    required: ['content', 'author', 'authorName'],
    properties: {
      content: { type: 'string' },
      author: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
      authorName: { type: 'string', maxLength: 50 },
      avatar: { type: 'string' },
      authorTag: ref('LocalizedTagInput'),
      clientMessageId: { type: 'string', format: 'uuid' },
      mentions: { type: 'array', maxItems: 20, items: ref('ChannelMention') },
      attachment: ref('ChannelAttachment'),
    },
  },
  ChannelMemberProfileRequest: {
    type: 'object',
    required: ['author'],
    properties: {
      author: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
      displayName: { type: 'string' },
      avatar: { type: 'string' },
      tag: ref('MemberTagInput'),
    },
  },
  ChannelRemarkRequest: {
    type: 'object',
    required: ['remark'],
    properties: { remark: { type: 'string' } },
  },
  ChannelPinRequest: {
    type: 'object',
    required: ['pinned'],
    properties: { pinned: { type: 'boolean' } },
  },
}

function createSchemaExample(schema, seenRefs = new Set(), propertyName = '') {
  if (!schema || typeof schema !== 'object') return undefined
  if (schema.example !== undefined) return schema.example
  if (schema.const !== undefined) return schema.const
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0)
    return schema.enum[0]

  if (schema.$ref) {
    const name = schema.$ref.split('/').at(-1)
    if (!name || seenRefs.has(name) || !schemas[name]) return {}
    return createSchemaExample(
      schemas[name],
      new Set([...seenRefs, name]),
      propertyName
    )
  }

  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((example, item) => {
      const next = createSchemaExample(item, seenRefs, propertyName)
      return next && typeof next === 'object' && !Array.isArray(next)
        ? { ...example, ...next }
        : example
    }, {})
  }

  const type = Array.isArray(schema.type)
    ? schema.type.find(value => value !== 'null')
    : schema.type

  if (type === 'object' || schema.properties) {
    const properties = Object.entries(schema.properties || {})
    const required = new Set(schema.required || [])
    const selected = required.size
      ? properties.filter(([name]) => required.has(name))
      : properties.slice(0, 3)
    return Object.fromEntries(
      selected.map(([name, value]) => [
        name,
        createSchemaExample(value, seenRefs, name),
      ])
    )
  }

  const alternative = schema.oneOf?.[0] || schema.anyOf?.[0]
  if (alternative) {
    return createSchemaExample(alternative, seenRefs, propertyName)
  }

  if (type === 'array') {
    return [createSchemaExample(schema.items, seenRefs, propertyName)]
  }
  if (type === 'boolean') return true
  if (type === 'integer' || type === 'number') return schema.minimum ?? 0
  if (type !== 'string') return undefined

  if (schema.format === 'binary') return '<binary>'
  if (schema.format === 'date-time') return '2026-08-01T00:00:00.000Z'
  if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000'
  if (/cid/i.test(propertyName)) {
    return 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
  }
  if (/url/i.test(propertyName)) return 'http://localhost:1976'
  if (/address/i.test(propertyName)) {
    return '0x0000000000000000000000000000000000000000'
  }
  if (/path|filename/i.test(propertyName)) return 'example.txt'
  if (/token/i.test(propertyName)) return 'mostbox_token'
  if (/name/i.test(propertyName)) return 'example'
  return 'string'
}

export function createOpenApiSpec({
  serverUrl = 'http://localhost:1976',
  version = '0.0.0',
} = {}) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MostBox Node Daemon API',
      version,
      description:
        'HTTP control surface for a MostBox node. User routes use a per-request MostBox signature. MCP API routes use a scoped bearer token and only accept loopback requests. Remote nodes additionally require x-mostbox-invite.',
    },
    servers: [{ url: String(serverUrl).replace(/\/+$/, '') }],
    tags: [
      { name: 'Administration', description: 'Local node administration.' },
      {
        name: 'MCP',
        description: 'Scoped MCP client administration and bridge APIs.',
      },
      {
        name: 'Node',
        description: 'Node status, configuration, policy, and diagnostics.',
      },
      {
        name: 'Seeding',
        description: 'Complete local replicas and direct P2P pulls.',
      },
      { name: 'Files', description: 'Published files and UnixFS collections.' },
      {
        name: 'Downloads',
        description: 'CID availability, downloads, and file reads.',
      },
      {
        name: 'Users',
        description: 'Signed-in user profile and backup metadata.',
      },
      {
        name: 'Channels',
        description: 'P2P chat channels and member presence.',
      },
    ],
    components: {
      securitySchemes: {
        MostBoxSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description:
            'Per-request value: address,timestamp,signature. The documentation page generates it from the signed-in MostBox identity.',
        },
        McpBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'MostBox MCP token',
          description:
            'Scoped token created in the local node administration page.',
        },
        RemoteInvite: {
          type: 'apiKey',
          in: 'header',
          name: 'x-mostbox-invite',
          description:
            'Required in addition to user authentication for a configured remote node.',
        },
      },
      schemas,
    },
    paths: {
      '/api/admin/access': {
        get: operation({
          tag: 'Administration',
          operationId: 'getAdministrationAccess',
          summary: 'Read node administration access state',
          responses: responses(
            {
              200: jsonResponse(
                'Administration access state',
                ref('AdministrationAccess')
              ),
            },
            [403, 429]
          ),
        }),
        post: operation({
          tag: 'Administration',
          operationId: 'claimAdministrationAccess',
          summary: 'Claim LAN node administration',
          description:
            'The signed identity becomes the node administrator when no owner exists.',
          sideEffect: 'dangerous',
          confirmation: true,
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse(
                'Administration access claimed',
                ref('AdministrationAccess')
              ),
            },
            [401, 403, 409, 429, 500]
          ),
        }),
      },
      '/api/admin/mcp/clients': {
        get: operation({
          tag: 'MCP',
          operationId: 'listMcpClients',
          summary: 'List MCP clients without token secrets',
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse('MCP client list', ref('McpClientList')),
            },
            [401, 403, 429]
          ),
        }),
        post: operation({
          tag: 'MCP',
          operationId: 'createMcpClient',
          summary: 'Create a scoped MCP client',
          description: 'The plaintext token is returned exactly once.',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest(ref('McpClientCreateRequest'), {
            name: 'Codex',
            scopes: ['node:read', 'files:read'],
            expiresInDays: 30,
          }),
          responses: responses(
            {
              201: jsonResponse(
                'Created MCP client credential',
                ref('McpCredential')
              ),
            },
            [400, 401, 403, 429, 500]
          ),
        }),
      },
      '/api/admin/mcp/clients/{id}': {
        delete: operation({
          tag: 'MCP',
          operationId: 'removeMcpClient',
          summary: 'Revoke or permanently delete an MCP client',
          sideEffect: 'dangerous',
          confirmation: true,
          security: signedSecurity,
          parameters: [
            {
              ...pathParameter('id', 'MCP client UUID.'),
              schema: { type: 'string', format: 'uuid' },
            },
            queryParameter(
              'purge',
              { type: 'boolean', default: false },
              'Permanently delete the client record instead of revoking it.'
            ),
          ],
          responses: responses(
            {
              200: jsonResponse('Revoked or deleted MCP client', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: {
                      deleted: { type: 'boolean' },
                      client: ref('McpClient'),
                    },
                  },
                ],
              }),
            },
            [401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/mcp/me': {
        get: operation({
          tag: 'MCP',
          operationId: 'getMcpPrincipal',
          summary: 'Read the authenticated MCP principal',
          security: mcpSecurity,
          responses: responses(
            {
              200: jsonResponse('MCP client principal', ref('McpPrincipal')),
            },
            [401, 403, 429]
          ),
        }),
      },
      '/api/mcp/publish-local': {
        post: operation({
          tag: 'MCP',
          operationId: 'publishMcpLocalFile',
          summary: 'Publish a file from an MCP allowed directory',
          sideEffect: 'write',
          security: mcpSecurity,
          requestBody: jsonRequest(ref('McpPublishRequest')),
          responses: responses(
            {
              200: jsonResponse(
                'Published CID and most:// link',
                ref('PublishResult')
              ),
            },
            [400, 401, 403, 413, 429, 500]
          ),
        }),
      },
      '/api/node/status': {
        get: operation({
          tag: 'Node',
          operationId: 'getNodeStatus',
          summary: 'Get node daemon status',
          responses: responses(
            {
              200: jsonResponse('Node status', ref('NodeStatus')),
            },
            [403, 429, 500]
          ),
        }),
      },
      '/api/node/config': {
        get: operation({
          tag: 'Node',
          operationId: 'getNodeConfig',
          summary: 'Get node daemon configuration',
          security: localAdminSecurity,
          responses: responses(
            {
              200: jsonResponse('Node configuration', ref('NodeConfig')),
            },
            [401, 403, 429]
          ),
        }),
        post: operation({
          tag: 'Node',
          operationId: 'updateNodeConfig',
          summary: 'Update node daemon configuration',
          sideEffect: 'dangerous',
          confirmation: true,
          security: localAdminSecurity,
          requestBody: jsonRequest(ref('NodeConfigUpdate')),
          responses: responses(
            {
              200: jsonResponse('Updated node configuration', {
                allOf: [successSchema, ref('NodeConfig')],
              }),
            },
            [400, 401, 403, 429, 500]
          ),
        }),
      },
      '/api/node/policy': {
        get: operation({
          tag: 'Node',
          operationId: 'getNodePolicy',
          summary: 'Get local storage limits',
          security: localAdminSecurity,
          responses: responses(
            {
              200: jsonResponse('Storage limits', ref('NodePolicy')),
            },
            [401, 403, 429]
          ),
        }),
        post: operation({
          tag: 'Node',
          operationId: 'updateNodePolicy',
          summary: 'Update local storage limits',
          sideEffect: 'write',
          security: localAdminSecurity,
          requestBody: jsonRequest(ref('NodePolicy')),
          responses: responses(
            {
              200: jsonResponse('Updated policy', {
                allOf: [successSchema, ref('NodePolicy')],
              }),
            },
            [400, 401, 403, 429, 500]
          ),
        }),
      },
      '/api/node/policy/evaluate': {
        post: operation({
          tag: 'Node',
          operationId: 'evaluateNodePolicy',
          summary: 'Evaluate a file size against storage limits',
          security: localAdminSecurity,
          requestBody: jsonRequest(
            {
              type: 'object',
              properties: {
                size: { type: 'integer', minimum: 0 },
                fileSize: { type: 'integer', minimum: 0 },
              },
            },
            { size: 1048576 }
          ),
          responses: responses(
            {
              200: jsonResponse(
                'Storage limit decision',
                ref('StoragePolicyDecision')
              ),
            },
            [400, 401, 403, 429]
          ),
        }),
      },
      '/api/node/holdings': {
        get: operation({
          tag: 'Seeding',
          operationId: 'listNodeHoldings',
          summary: 'List complete CID replicas held by this node',
          security: localAdminSecurity,
          responses: responses(
            {
              200: jsonResponse('Node holdings', {
                type: 'array',
                items: ref('NodeHolding'),
              }),
            },
            [401, 403, 429, 500]
          ),
        }),
        post: operation({
          tag: 'Seeding',
          operationId: 'createNodeHolding',
          summary: 'Add a held CID replica and join its topic',
          sideEffect: 'write',
          security: localAdminSecurity,
          requestBody: jsonRequest(ref('NodeHoldingCreateRequest')),
          responses: responses(
            {
              200: jsonResponse('Created holding', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: { holding: ref('NodeHolding') },
                  },
                ],
              }),
            },
            [400, 401, 403, 429, 500]
          ),
        }),
      },
      '/api/node/logs': {
        get: operation({
          tag: 'Node',
          operationId: 'listNodeLogs',
          summary: 'Read recent node daemon logs',
          security: localAdminSecurity,
          parameters: [
            queryParameter(
              'limit',
              { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
              'Maximum number of entries.'
            ),
            queryParameter(
              'filter',
              { type: 'string', default: 'all' },
              'Log level or event filter. Common diagnostic filters: join, pull, verify, serve, error.'
            ),
            queryParameter(
              'q',
              { type: 'string' },
              'Case-insensitive text search.'
            ),
          ],
          responses: responses(
            {
              200: jsonResponse('Node logs', {
                type: 'object',
                required: ['logs'],
                properties: {
                  logFile: { type: 'string' },
                  filter: { type: 'string' },
                  query: { type: 'string' },
                  logs: { type: 'array', items: ref('NodeLog') },
                },
              }),
            },
            [401, 403, 429]
          ),
        }),
        delete: operation({
          tag: 'Node',
          operationId: 'clearNodeLogs',
          summary: 'Clear node daemon logs',
          sideEffect: 'dangerous',
          confirmation: true,
          security: localAdminSecurity,
          responses: responses(
            {
              200: jsonResponse('Logs cleared', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: {
                      clearedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                ],
              }),
            },
            [401, 403, 429, 500]
          ),
        }),
      },
      '/api/node/diagnostics': {
        get: operation({
          tag: 'Node',
          operationId: 'getNodeDiagnostics',
          summary: 'Export a node diagnostics snapshot',
          security: localAdminSecurity,
          responses: responses(
            {
              200: jsonResponse('Diagnostics snapshot', {
                type: 'object',
                required: ['generatedAt', 'packageVersion', 'status', 'logs'],
                properties: {
                  generatedAt: { type: 'string', format: 'date-time' },
                  packageVersion: { type: 'string' },
                  platform: { type: 'string' },
                  nodeVersion: { type: 'string' },
                  status: ref('NodeStatus'),
                  logFile: { type: 'string' },
                  logs: { type: 'array', items: ref('NodeLog') },
                },
              }),
            },
            [401, 403, 429, 500]
          ),
        }),
      },
      '/api/p2p/pull': {
        post: operation({
          tag: 'Seeding',
          operationId: 'pullFileByCid',
          summary: 'Pull and retain a full file replica by CID',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest(ref('PullRequest')),
          responses: responses(
            {
              200: jsonResponse('Pull task result', ref('DownloadResult')),
            },
            [400, 401, 403, 404, 413, 429, 500]
          ),
        }),
      },
      '/api/p2p/ping': {
        post: operation({
          tag: 'Node',
          operationId: 'startP2PPing',
          summary: 'Start a temporary direct peer-to-peer connectivity test',
          description:
            'Available on loopback and to the LAN node administrator. Remote management requests are rejected.',
          sideEffect: 'write',
          security: localAdminSecurity,
          requestBody: jsonRequest(ref('P2PPingStartRequest')),
          responses: responses(
            {
              202: jsonResponse('P2P Ping accepted', ref('P2PPingResponse')),
            },
            [400, 401, 403, 409, 429, 500]
          ),
        }),
      },
      '/api/p2p/ping/{id}': {
        get: operation({
          tag: 'Node',
          operationId: 'getP2PPing',
          summary: 'Read a P2P Ping stage and result',
          security: localAdminSecurity,
          parameters: [pathParameter('id', 'P2P Ping identifier.')],
          responses: responses(
            { 200: jsonResponse('P2P Ping status', ref('P2PPingResponse')) },
            [401, 403, 404, 429, 500]
          ),
        }),
        delete: operation({
          tag: 'Node',
          operationId: 'cancelP2PPing',
          summary: 'Cancel a P2P Ping and release its temporary swarm',
          sideEffect: 'write',
          security: localAdminSecurity,
          parameters: [pathParameter('id', 'P2P Ping identifier.')],
          responses: responses(
            { 200: jsonResponse('P2P Ping cancelled', ref('P2PPingResponse')) },
            [401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/user/profile': {
        get: operation({
          tag: 'Users',
          operationId: 'getUserProfile',
          summary: 'Read authenticated local profile metadata',
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse('Profile metadata', ref('UserProfile')),
            },
            [401, 403, 429, 500]
          ),
        }),
        put: operation({
          tag: 'Users',
          operationId: 'updateUserProfile',
          summary: 'Update authenticated local profile metadata',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest(ref('UserProfile')),
          responses: responses(
            {
              200: jsonResponse('Profile update result', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: { profile: ref('UserProfile') },
                  },
                ],
              }),
            },
            [400, 401, 403, 429, 500]
          ),
        }),
      },
      '/api/user/export': {
        get: operation({
          tag: 'Users',
          operationId: 'exportUserData',
          summary: 'Export authenticated account metadata',
          description: 'File content and secrets are not included.',
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse(
                'Account metadata backup payload',
                ref('AccountBackup')
              ),
            },
            [401, 403, 429, 500]
          ),
        }),
      },
      '/api/user/import': {
        post: operation({
          tag: 'Users',
          operationId: 'importUserData',
          summary: 'Import authenticated account metadata',
          description:
            'Profile metadata in the supplied backup can overwrite the current profile.',
          sideEffect: 'dangerous',
          confirmation: true,
          security: signedSecurity,
          requestBody: jsonRequest(ref('AccountBackup')),
          responses: responses(
            {
              200: jsonResponse('Account metadata import result', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: {
                      result: { type: 'object', additionalProperties: true },
                    },
                  },
                ],
              }),
            },
            [400, 401, 403, 409, 429, 500]
          ),
        }),
      },
      '/api/files': {
        get: operation({
          tag: 'Files',
          operationId: 'listPublishedFiles',
          summary: 'List published files for the authenticated user',
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse('Published file list', {
                type: 'array',
                items: ref('PublishedFile'),
              }),
            },
            [401, 403, 429, 500]
          ),
        }),
      },
      '/api/files/{cid}/cache': {
        post: operation({
          tag: 'Downloads',
          operationId: 'cacheFileByCid',
          summary: 'Pull a collection file into the node cache',
          sideEffect: 'write',
          security: signedSecurity,
          parameters: [cidParameter],
          requestBody: jsonRequest(ref('CacheRequest')),
          responses: responses(
            {
              200: jsonResponse('Cache pull result', ref('DownloadResult')),
            },
            [400, 401, 403, 404, 413, 429, 500]
          ),
        }),
      },
      '/api/publish': {
        post: operation({
          tag: 'Files',
          operationId: 'publishFile',
          summary: 'Publish a file and start seeding by CID',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: { file: { type: 'string', format: 'binary' } },
                },
                example: { file: '<binary>' },
              },
            },
          },
          responses: responses(
            {
              200: jsonResponse(
                'Published CID and most:// link',
                ref('PublishResult')
              ),
            },
            [400, 401, 403, 413, 429, 500]
          ),
        }),
      },
      '/api/folder/share': {
        post: operation({
          tag: 'Files',
          operationId: 'shareFolder',
          summary: 'Share a file-library folder as a UnixFS collection',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest({
            type: 'object',
            required: ['path'],
            properties: { path: { type: 'string' } },
          }),
          responses: responses(
            {
              200: jsonResponse(
                'Folder collection CID and most:// link',
                ref('PublishResult')
              ),
            },
            [400, 401, 403, 413, 429, 500]
          ),
        }),
      },
      '/api/folder/shares': {
        get: operation({
          tag: 'Files',
          operationId: 'listFolderShares',
          summary: 'List folder shares for the authenticated user',
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse('Folder share list', {
                type: 'array',
                items: ref('PublishedFile'),
              }),
            },
            [401, 403, 429, 500]
          ),
        }),
      },
      '/api/collections/{cid}': {
        get: operation({
          tag: 'Files',
          operationId: 'getCollection',
          summary: 'Read a UnixFS collection by root CID',
          security: signedSecurity,
          parameters: [cidParameter],
          responses: responses(
            {
              200: jsonResponse(
                'Collection metadata and child CIDs',
                ref('Collection')
              ),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/download/check': {
        post: operation({
          tag: 'Downloads',
          operationId: 'checkDownloadAvailability',
          summary: 'Check local or online CID availability',
          security: signedSecurity,
          requestBody: jsonRequest(ref('DownloadCheckRequest'), {
            link: 'most://<cid>?filename=example.txt',
            timeout: 5000,
          }),
          responses: responses(
            {
              200: jsonResponse('Download availability result', {
                allOf: [
                  successSchema,
                  { type: 'object', additionalProperties: true },
                ],
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/download': {
        post: operation({
          tag: 'Downloads',
          operationId: 'startDownload',
          summary: 'Start a CID-verified download',
          description:
            'Successful content is retained and seeded automatically.',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest(ref('DownloadRequest')),
          responses: responses(
            {
              200: jsonResponse(
                'Download task or local result',
                ref('DownloadResult')
              ),
            },
            [400, 401, 403, 404, 413, 429, 500]
          ),
        }),
      },
      '/api/download/tasks': {
        get: operation({
          tag: 'Downloads',
          operationId: 'listDownloadTasks',
          summary: 'List active downloads for the authenticated user',
          security: signedSecurity,
          responses: responses(
            {
              200: jsonResponse('Active download tasks', {
                type: 'array',
                items: ref('DownloadTask'),
              }),
            },
            [401, 403, 429]
          ),
        }),
      },
      '/api/download/cancel': {
        post: operation({
          tag: 'Downloads',
          operationId: 'cancelDownload',
          summary: 'Cancel an active download task',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest({
            type: 'object',
            required: ['taskId'],
            properties: { taskId: { type: 'string' } },
          }),
          responses: responses(
            {
              200: jsonResponse('Cancellation result', ref('SuccessResponse')),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/files/{cid}/download': {
        get: operation({
          tag: 'Downloads',
          operationId: 'downloadFileByCid',
          summary: 'Read a locally held file by CID',
          security: [],
          parameters: [
            cidParameter,
            {
              name: 'Range',
              in: 'header',
              required: false,
              description: 'Optional byte range, for example bytes=0-1023.',
              schema: { type: 'string' },
            },
          ],
          responses: responses(
            {
              200: {
                description: 'Complete file bytes',
                content: {
                  'application/octet-stream': {
                    schema: { type: 'string', format: 'binary' },
                  },
                },
                headers: {
                  'Accept-Ranges': {
                    schema: { type: 'string', const: 'bytes' },
                  },
                },
              },
              206: {
                description: 'Requested byte range',
                content: {
                  'application/octet-stream': {
                    schema: { type: 'string', format: 'binary' },
                  },
                },
              },
              416: { description: 'Requested range is not satisfiable' },
            },
            [400, 404, 429]
          ),
        }),
      },
      '/api/channels': {
        get: operation({
          tag: 'Channels',
          operationId: 'listChannels',
          summary: 'List authenticated user channels',
          security: signedSecurity,
          parameters: [
            queryParameter(
              'type',
              { type: 'string' },
              'Optional channel type filter.'
            ),
          ],
          responses: responses(
            {
              200: jsonResponse('Channel list', {
                type: 'array',
                items: ref('Channel'),
              }),
            },
            [401, 403, 429, 500]
          ),
        }),
        post: operation({
          tag: 'Channels',
          operationId: 'createChannel',
          summary: 'Create or join a P2P channel',
          sideEffect: 'write',
          security: signedSecurity,
          requestBody: jsonRequest(ref('ChannelCreateRequest')),
          responses: responses(
            {
              200: jsonResponse('Channel metadata', {
                allOf: [successSchema, ref('Channel')],
              }),
            },
            [400, 401, 403, 409, 429, 500]
          ),
        }),
        delete: operation({
          tag: 'Channels',
          operationId: 'leaveChannel',
          summary: 'Leave a P2P channel',
          sideEffect: 'dangerous',
          confirmation: true,
          security: signedSecurity,
          requestBody: jsonRequest(ref('ChannelLeaveRequest')),
          responses: responses(
            {
              200: jsonResponse('Updated channel list', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: {
                      channels: { type: 'array', items: ref('Channel') },
                    },
                  },
                ],
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/messages': {
        get: operation({
          tag: 'Channels',
          operationId: 'listChannelMessages',
          summary: 'Read P2P channel messages',
          security: signedSecurity,
          parameters: [
            channelNameParameter,
            queryParameter(
              'limit',
              { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
              'Maximum messages to return.'
            ),
            queryParameter(
              'offset',
              { type: 'integer', minimum: 0, default: 0 },
              'Message offset.'
            ),
          ],
          responses: responses(
            {
              200: jsonResponse('Channel messages', {
                type: 'array',
                items: ref('ChannelMessage'),
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
        post: operation({
          tag: 'Channels',
          operationId: 'sendChannelMessage',
          summary: 'Send a P2P channel message',
          sideEffect: 'write',
          security: signedSecurity,
          parameters: [channelNameParameter],
          requestBody: jsonRequest(ref('ChannelMessageRequest')),
          responses: responses(
            {
              200: jsonResponse('Created channel message', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: { message: ref('ChannelMessage') },
                  },
                ],
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/member-profiles': {
        get: operation({
          tag: 'Channels',
          operationId: 'listChannelMemberProfiles',
          summary: 'Read persisted channel member profiles',
          security: signedSecurity,
          parameters: [channelNameParameter],
          responses: responses(
            {
              200: jsonResponse('Channel member profiles', {
                type: 'array',
                items: ref('ChannelMemberProfile'),
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/member-profile': {
        post: operation({
          tag: 'Channels',
          operationId: 'updateChannelMemberProfile',
          summary: 'Update the authenticated channel member profile',
          sideEffect: 'write',
          security: signedSecurity,
          parameters: [channelNameParameter],
          requestBody: jsonRequest(ref('ChannelMemberProfileRequest')),
          responses: responses(
            {
              200: jsonResponse('Updated member profile', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: {
                      member: ref('ChannelMemberProfile'),
                      event: ref('ChannelMessage'),
                    },
                  },
                ],
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/peers': {
        get: operation({
          tag: 'Channels',
          operationId: 'listChannelPeers',
          summary: 'List connected channel peers',
          security: signedSecurity,
          parameters: [channelNameParameter],
          responses: responses(
            {
              200: jsonResponse('Channel peers', {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/presence': {
        get: operation({
          tag: 'Channels',
          operationId: 'listChannelPresence',
          summary: 'List active channel presence',
          security: signedSecurity,
          parameters: [channelNameParameter],
          responses: responses(
            {
              200: jsonResponse('Channel presence', {
                type: 'array',
                items: ref('ChannelPresence'),
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/remark': {
        put: operation({
          tag: 'Channels',
          operationId: 'updateChannelRemark',
          summary: 'Set an authenticated user channel remark',
          sideEffect: 'write',
          security: signedSecurity,
          parameters: [channelNameParameter],
          requestBody: jsonRequest(ref('ChannelRemarkRequest')),
          responses: responses(
            {
              200: jsonResponse('Updated channel remark', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: { remark: { type: 'string' } },
                  },
                ],
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
      '/api/channels/{name}/pin': {
        put: operation({
          tag: 'Channels',
          operationId: 'updateChannelPin',
          summary: 'Pin or unpin a channel',
          sideEffect: 'write',
          security: signedSecurity,
          parameters: [channelNameParameter],
          requestBody: jsonRequest(ref('ChannelPinRequest')),
          responses: responses(
            {
              200: jsonResponse('Updated pin state', {
                allOf: [
                  successSchema,
                  {
                    type: 'object',
                    properties: { pinned: { type: 'boolean' } },
                  },
                ],
              }),
            },
            [400, 401, 403, 404, 429, 500]
          ),
        }),
      },
    },
  }
}

export function listOpenApiOperations(spec) {
  const operations = []
  for (const [path, pathItem] of Object.entries(spec?.paths || {})) {
    for (const [method, value] of Object.entries(pathItem || {})) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      operations.push({ path, method: method.toUpperCase(), operation: value })
    }
  }
  return operations
}

function pathTemplateMatches(template, pathname) {
  const templateParts = template.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  return (
    templateParts.length === pathParts.length &&
    templateParts.every((part, index) =>
      /^\{[^}]+\}$/.test(part)
        ? Boolean(pathParts[index])
        : part === pathParts[index]
    )
  )
}

export function findOpenApiOperation(spec, method, pathname) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const normalizedPath = String(pathname || '/').split('?')[0]
  return listOpenApiOperations(spec).find(
    item =>
      item.method === normalizedMethod &&
      pathTemplateMatches(item.path, normalizedPath)
  )
}
