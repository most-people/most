import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { parseMostLink, validateCidString } from '../core/cid.js'
import { sanitizeFilename } from '../utils/security.js'
import { normalizeAddress, verifyAuthHeader } from '../utils/auth.js'
import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  createNodeConfigStore,
  evaluateStorageLimits,
  normalizeRemoteInvites,
} from '../node/config.js'
import { createNodeLogger } from '../node/logs.js'
import {
  getAllowedOrigins,
  getInvalidInviteResponse,
  getRequestPath,
  hasValidInvite,
  isLocalRequest,
  isLocalUpgradeRequest,
  isLoopbackRemoteAddress,
  isPublicListenHost,
  isRemoteAccessRequest,
  remoteInviteConfigured,
} from './access.js'
import { badRequestOrAppError, errorJson } from './errors.js'
import { listFilteredNodeLogs } from './nodeLogs.js'
import {
  buildNodeStatus,
  buildOpenApiSpec,
  getNetworkAddresses,
  getPackageVersion,
} from './nodeStatus.js'
import { parseMultipartBusboy } from './uploads.js'
import { getMimeType, registerStaticRoutes } from './staticFiles.js'

const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 120
export { UPLOAD_TMP_DIR } from './uploads.js'

// --- 配置 ---
const defaultConfigStore = createNodeConfigStore()
const CONFIG_DIR = defaultConfigStore.configDir
const PORT = DEFAULT_NODE_PORT
const HOST = DEFAULT_NODE_HOST

function validationErrorPayload(errorCode, details = undefined) {
  return {
    errorCode,
    code: 'VALIDATION_ERROR',
    ...(details ? { details } : {}),
  }
}



export function getDataPath(configStore = defaultConfigStore) {
  return configStore.getDataPath()
}

function resolveDataPathForSave(inputPath) {
  let dataPath = String(inputPath || '').trim()
  let basePath = dataPath

  if (!dataPath) {
    return { dataPath: '' }
  }

  if (dataPath.match(/^[A-Za-z]:\\$/)) {
    basePath = dataPath
    dataPath = path.join(dataPath, 'most-data')
  }

  if (!fs.existsSync(basePath)) {
    return { error: '目录不存在' }
  }

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }

  return { dataPath }
}



// --- Hono 应用工厂 ---
export function createApp(engine, options = {}) {
  const appPort = options.port || PORT
  const appHost = options.host || HOST
  const configStore = options.configStore || defaultConfigStore
  const nodeLogger =
    options.nodeLogger || createNodeLogger(configStore.configDir || CONFIG_DIR)
  const wssRef = options.wssRef || { current: null }
  const serverInstanceRef = options.serverInstanceRef || { current: null }
  function getRemoteInviteSet() {
    const invites =
      options.remoteInvites === undefined
        ? configStore.getNodeConfig().remoteInvites
        : normalizeRemoteInvites(options.remoteInvites)
    return new Set(invites)
  }

  // 速率限制（每个 app 实例独立）
  const rateLimitMap = new Map()
  function checkRateLimit(clientIp) {
    const now = Date.now()
    if (!rateLimitMap.has(clientIp)) {
      rateLimitMap.set(clientIp, [])
    }
    const requests = rateLimitMap.get(clientIp)
    while (requests.length > 0 && requests[0] < now - RATE_LIMIT_WINDOW) {
      requests.shift()
    }
    if (requests.length === 0) {
      rateLimitMap.delete(clientIp)
    }
    if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
      return false
    }
    requests.push(now)
    return true
  }

  function rateLimitMiddleware() {
    return async (c, next) => {
      const clientIp =
        c.req.header('x-forwarded-for') ||
        c.env?.incoming?.socket?.remoteAddress ||
        'unknown'
      if (!checkRateLimit(clientIp)) {
        return c.json({ error: 'Too many requests' }, 429)
      }
      await next()
    }
  }

  function isValidInvite(c) {
    const invite = String(c.req.header('x-mostbox-invite') || '').trim()
    return hasValidInvite(getRemoteInviteSet(), invite)
  }

  function isRemoteRequest(c) {
    return isRemoteAccessRequest({
      invite: c.req.header('x-mostbox-invite'),
      origin: c.req.header('origin'),
      listenHost: appHost,
      local: isLocalRequest(c),
    })
  }

  function isPublicFileDownloadPath(path) {
    return /^\/api\/files\/[^/]+\/download$/.test(path)
  }

  function requiresUserAuth(path) {
    if (isPublicFileDownloadPath(path)) {
      return false
    }

    return (
      path === '/api/files' ||
      path === '/api/publish' ||
      path === '/api/download/check' ||
      path === '/api/download' ||
      path === '/api/download/cancel' ||
      path === '/api/user/sync/start' ||
      path === '/api/user/sync/status' ||
      path === '/api/trash' ||
      path === '/api/move' ||
      path === '/api/folder/rename' ||
      path.startsWith('/api/files/') ||
      path.startsWith('/api/trash/') ||
      path.startsWith('/api/channels')
    )
  }

  function isAdminApi(path) {
    return (
      path.startsWith('/api/admin/') ||
      path === '/api/node/config' ||
      path === '/api/node/policy' ||
      path === '/api/node/logs' ||
      path === '/api/shutdown'
    )
  }

  function authMiddleware() {
    return async (c, next) => {
      const path = getRequestPath(c)

      if (isRemoteRequest(c) && !isValidInvite(c)) {
        return getInvalidInviteResponse(c)
      }

      if (isRemoteRequest(c) && isAdminApi(path)) {
        return c.json(
          {
            error: 'Remote users cannot access node administration',
            code: 'REMOTE_ADMIN_FORBIDDEN',
          },
          403
        )
      }

      const authHeader = c.req.header('authorization')
      if (authHeader) {
        if (isPublicFileDownloadPath(path)) {
          await next()
          return
        }

        const auth = verifyAuthHeader(authHeader, c.req.method, path)
        if (!auth.ok) {
          return c.json({ error: auth.error, code: 'UNAUTHORIZED' }, 401)
        }
        c.set('userAddress', auth.address)
      }

      if (requiresUserAuth(path) && !c.get('userAddress')) {
        return c.json({ error: 'Login required', code: 'LOGIN_REQUIRED' }, 401)
      }

      await next()
    }
  }

  // WebSocket 广播
  const channelSubscriptions = new Map()

  function wsBroadcast(event, data) {
    const payload = JSON.stringify({ event, data })
    const wss = wssRef.current
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(payload)
          } catch (err) {
            console.warn('[WS] Failed to send to client:', err.message)
          }
        }
      })
    }
  }

  async function broadcastNodeStatus() {
    try {
      const status = await buildNodeStatus(engine, configStore, appPort)
      wsBroadcast('node:status', status)
      return status
    } catch (err) {
      const entry = nodeLogger.append({
        level: 'error',
        event: 'node:status:error',
        message: err.message,
      })
      wsBroadcast('node:log', entry)
      return null
    }
  }

  function appendNodeLog(input) {
    const entry = nodeLogger.append(input)
    wsBroadcast('node:log', entry)
    return entry
  }

  function wsSendToChannel(channelName, event, data) {
    const payload = JSON.stringify({ event, data })
    const subscribers = channelSubscriptions.get(channelName)
    if (subscribers) {
      subscribers.forEach(ws => {
        if (ws.readyState === 1) {
          try {
            ws.send(payload)
          } catch (err) {
            console.warn(
              '[WS] Failed to send to channel subscriber:',
              err.message
            )
          }
        }
      })
    }
  }

  function subscribeToChannel(ws, channelName) {
    if (!channelSubscriptions.has(channelName)) {
      channelSubscriptions.set(channelName, new Set())
    }
    channelSubscriptions.get(channelName).add(ws)
  }

  function unsubscribeFromChannel(ws, channelName) {
    const subscribers = channelSubscriptions.get(channelName)
    if (subscribers) {
      subscribers.delete(ws)
      if (subscribers.size === 0) {
        channelSubscriptions.delete(channelName)
      }
    }
  }

  function cleanupWsSubscriptions(ws) {
    for (const [channel, subscribers] of channelSubscriptions) {
      subscribers.delete(ws)
      if (subscribers.size === 0) {
        channelSubscriptions.delete(channel)
      }
    }
  }

  function validateWebSocketRequest(req) {
    const url = new URL(req.url, `http://localhost:${appPort}`)
    const invite = String(url.searchParams.get('invite') || '').trim()
    const remote = isRemoteAccessRequest({
      invite,
      origin: req.headers.origin,
      listenHost: appHost,
      local: isLocalUpgradeRequest(req),
    })
    if (!remote) return true

    const wsInviteSet = new Set(configStore.getNodeConfig().remoteInvites)
    if (!hasValidInvite(wsInviteSet, invite)) {
      return false
    }

    const address = url.searchParams.get('address') || ''
    const timestamp = url.searchParams.get('timestamp') || ''
    const signature = url.searchParams.get('signature') || ''
    const auth = verifyAuthHeader(
      `${address},${timestamp},${signature}`,
      'GET',
      '/ws'
    )
    return auth.ok
  }

  // 将广播函数挂载到 engine 上供外部测试使用
  engine.wsBroadcast = wsBroadcast
  engine.wsSendToChannel = wsSendToChannel

  const app = new Hono()

  app.use('/api/*', async (c, next) => {
    if (c.req.header('access-control-request-private-network') === 'true') {
      c.header('Access-Control-Allow-Private-Network', 'true')
    }
    await next()
  })

  // CORS 中间件
  app.use(
    '/api/*',
    cors({
      origin: getAllowedOrigins(appPort),
      credentials: true,
    })
  )

  // 速率限制中间件
  app.use('/api/*', rateLimitMiddleware())
  app.use('/api/*', authMiddleware())

  // 全局错误处理
  app.onError((err, c) => {
    console.error('[API Error]', err)
    try {
      const errorLogDir = configStore.configDir || CONFIG_DIR
      const errorLogPath = path.join(errorLogDir, 'server-error.log')
      if (!fs.existsSync(errorLogDir)) {
        fs.mkdirSync(errorLogDir, { recursive: true })
      }
      fs.appendFileSync(
        errorLogPath,
        `[${new Date().toISOString()}] ${err.stack}\n`
      )
    } catch {}
    return c.json({ error: err.message, code: err.code }, 500)
  })

  // --- 配置路由 ---
  app.get('/api/node-id', c => {
    return c.json({ id: engine.getNodeId() })
  })

  app.get('/api/remote/capabilities', c => {
    const remoteInviteSet = getRemoteInviteSet()
    return c.json({
      remoteAccess:
        isPublicListenHost(appHost) && remoteInviteConfigured(remoteInviteSet),
      inviteRequired: true,
      inviteConfigured: remoteInviteConfigured(remoteInviteSet),
      authenticated: Boolean(c.get('userAddress')),
      userAddress: c.get('userAddress') || null,
      adminAvailable: !isRemoteRequest(c),
      listenHost: appHost,
    })
  })

  app.get('/api/config', c => {
    const config = configStore.loadRawConfig()
    return c.json({ dataPath: config.dataPath || '' })
  })

  app.post('/api/config', async c => {
    const body = await c.req.json()
    const patch = {}

    if (body.resetStorage) {
      patch.dataPath = ''
    } else if (body.dataPath !== undefined) {
      const resolved = resolveDataPathForSave(body.dataPath)
      if (resolved.error) return c.json({ error: resolved.error }, 400)
      patch.dataPath = resolved.dataPath
    }

    const { success } = configStore.saveNodeConfigPatch(patch)
    appendNodeLog({
      event: 'node:config:updated',
      message: 'Node config updated',
      data: { dataPath: getDataPath(configStore) },
    })
    await broadcastNodeStatus()
    return c.json({ success, dataPath: getDataPath(configStore) })
  })

  app.get('/api/config/data-path', c => {
    const config = configStore.getNodeConfig()
    const isDefault = !config.dataPath
    const dataPath = getDataPath(configStore)
    return c.json({ dataPath, isDefault })
  })

  app.get('/api/node/status', async c => {
    try {
      return c.json(await buildNodeStatus(engine, configStore, appPort))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/node/config', c => {
    const config = configStore.getNodeConfig()
    return c.json({
      ...config,
      dataPath: getDataPath(configStore),
      configuredDataPath: config.dataPath,
      isDefaultDataPath: !config.dataPath,
      currentHost: appHost,
      currentPort: appPort,
      remoteInvites: config.remoteInvites,
    })
  })

  app.post('/api/node/config', async c => {
    const body = await c.req.json()
    const patch = { ...body }

    if (body.resetStorage) {
      patch.dataPath = ''
    } else if (body.dataPath !== undefined) {
      const resolved = resolveDataPathForSave(body.dataPath)
      if (resolved.error) return c.json({ error: resolved.error }, 400)
      patch.dataPath = resolved.dataPath
    }

    const { success, config } = configStore.saveNodeConfigPatch(patch)
    engine.setMaxFileSize(config.maxFileSizeBytes)
    appendNodeLog({
      event: 'node:config:updated',
      message: 'Node daemon config updated',
      data: {
        dataPath: getDataPath(configStore),
        port: config.port,
        capacityBytes: config.capacityBytes,
        remoteInviteCount: config.remoteInvites.length,
      },
    })
    await broadcastNodeStatus()
    return c.json({ success, ...config, dataPath: getDataPath(configStore) })
  })

  app.get('/api/node/policy', c => {
    const config = configStore.getNodeConfig()
    return c.json({
      maxFileSizeBytes: config.maxFileSizeBytes,
    })
  })

  app.post('/api/node/policy', async c => {
    const body = await c.req.json()
    const { success, config } = configStore.saveNodeConfigPatch({
      maxFileSizeBytes: body.maxFileSizeBytes,
    })
    engine.setMaxFileSize(config.maxFileSizeBytes)
    const policy = {
      maxFileSizeBytes: config.maxFileSizeBytes,
    }
    appendNodeLog({
      event: 'node:policy:updated',
      message: 'Node storage limits updated',
      data: policy,
    })
    await broadcastNodeStatus()
    return c.json({ success, ...policy })
  })

  app.post('/api/node/policy/evaluate', async c => {
    const body = await c.req.json()
    const decision = evaluateStorageLimits(configStore.getNodeConfig(), body)
    return c.json(decision)
  })

  app.get('/api/node/logs', c => {
    const limit = Number(c.req.query('limit') || 100)
    const filter = c.req.query('filter') || 'all'
    const query = c.req.query('q') || ''
    const result = listFilteredNodeLogs(nodeLogger, { limit, filter, query })
    return c.json({
      logFile: nodeLogger.logFile,
      filter: result.filter,
      query: result.query,
      logs: result.logs,
    })
  })

  app.delete('/api/node/logs', c => {
    const success = nodeLogger.clear()
    const clearedAt = new Date().toISOString()
    wsBroadcast('node:logs:cleared', { clearedAt })
    return c.json({ success, clearedAt })
  })

  app.get('/api/node/diagnostics', async c => {
    try {
      const status = await buildNodeStatus(engine, configStore, appPort)
      return c.json({
        generatedAt: new Date().toISOString(),
        packageVersion: getPackageVersion(),
        platform: process.platform,
        nodeVersion: process.version,
        status,
        logFile: nodeLogger.logFile,
        logs: nodeLogger.list(200),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/admin/users', c => {
    return c.json({ users: engine.listUsers() })
  })

  app.post('/api/user/sync/start', async c => {
    try {
      const body = await c.req.json()
      const result = await engine.startUserSync(c.get('userAddress'), body)
      appendNodeLog({
        event: 'node:user-sync:started',
        message: 'User sync started',
        data: {
          ownerAddress: result.ownerAddress,
          syncName: result.syncName,
        },
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/user/sync/status', c => {
    try {
      return c.json(engine.getUserSyncStatus(c.get('userAddress')))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.delete('/api/admin/users/:address/data', async c => {
    const address = normalizeAddress(c.req.param('address'))
    if (!address) {
      return c.json({ error: 'valid address is required' }, 400)
    }
    try {
      const result = await engine.clearUserData(address)
      appendNodeLog({
        event: 'node:user-data:cleared',
        message: 'User data cleared',
        data: result,
      })
      await broadcastNodeStatus()
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/openapi.json', c => {
    return c.json(buildOpenApiSpec(appPort))
  })

  // --- 网络路由 ---
  app.get('/api/network-status', c => {
    return c.json(engine.getNetworkStatus())
  })

  app.get('/api/network', c => {
    return c.json(getNetworkAddresses(appPort))
  })

  // --- 节点保种路由 ---
  app.get('/api/node/holdings', c => {
    try {
      return c.json(engine.listHoldings())
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/node/holdings', async c => {
    try {
      const body = await c.req.json()
      const holding = await engine.addHolding(body)
      appendNodeLog({
        event: 'node:holding:added',
        message: 'Node holding added',
        data: { cid: holding.cid, size: holding.size },
      })
      await broadcastNodeStatus()
      return c.json({ success: true, holding })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/p2p/pull', async c => {
    try {
      const body = await c.req.json()
      const timeout =
        body.timeout === undefined ? undefined : Number(body.timeout)
      const result = await engine.pullByCid({
        ...body,
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
      })
      appendNodeLog({
        event: 'node:pull:success',
        message: 'P2P pull completed',
        data: { cid: result.cid, taskId: result.taskId },
      })
      await broadcastNodeStatus()
      return c.json({ success: true, ...result })
    } catch (err) {
      appendNodeLog({
        level: 'error',
        event: 'node:pull:error',
        message: err.message,
        data: { code: err.code || 'UNKNOWN' },
      })
      return errorJson(c, err)
    }
  })

  // --- 文件路由 ---
  app.get('/api/files', c => {
    return c.json(
      engine.listPublishedFiles({ ownerAddress: c.get('userAddress') })
    )
  })

  app.post('/api/publish', async c => {
    const req = c.env.incoming
    const result = await parseMultipartBusboy(
      req,
      configStore.getNodeConfig().maxFileSizeBytes
    )

    if (!result || !result.filename) {
      return c.json({ error: 'No file provided' }, 400)
    }

    try {
      const publishResult = await engine.publishFile(
        result.filePath,
        result.filename,
        { ownerAddress: c.get('userAddress') }
      )
      return c.json({ success: true, ...publishResult })
    } finally {
      fs.unlink(result.filePath, () => {})
    }
  })

  app.post('/api/download/check', async c => {
    const body = await c.req.json()
    if (!body.link) {
      return c.json({ error: 'link is required' }, 400)
    }

    const parsed = parseMostLink(body.link)
    if (parsed.errorCode) {
      return c.json(
        validationErrorPayload(parsed.errorCode, parsed.details),
        400
      )
    }

    const localAvailability = await engine.getLocalCidAvailability(body.link, {
      ownerAddress: c.get('userAddress'),
    })
    if (localAvailability) {
      return c.json({
        success: true,
        available: true,
        cid: parsed.cid,
        fileName: localAvailability.fileName,
        size: Number(localAvailability.size) || null,
        alreadyExists: true,
      })
    }

    if (engine.hasDownloadNameConflict(parsed.fileName)) {
      return c.json(
        {
          error: `已有同名文件: ${parsed.fileName}`,
          code: 'CONFLICT',
        },
        409
      )
    }

    try {
      const timeout =
        body.timeout === undefined ? undefined : Number(body.timeout)
      const result = await engine.checkDownloadAvailability(body.link, {
        ownerAddress: c.get('userAddress'),
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/download', async c => {
    const body = await c.req.json()
    if (!body.link) {
      return c.json({ error: 'link is required' }, 400)
    }

    const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const parsed = parseMostLink(body.link)
    if (parsed.errorCode) {
      return c.json(
        validationErrorPayload(parsed.errorCode, parsed.details),
        400
      )
    }

    const localAvailability = await engine.getLocalCidAvailability(body.link, {
      ownerAddress: c.get('userAddress'),
    })
    if (localAvailability) {
      console.log(
        `[MostBox] CID content already exists locally: ${parsed.cid}`
      )
      try {
        const result = await engine.downloadFile(body.link, taskId, {
          ownerAddress: c.get('userAddress'),
        })
        return c.json({ success: true, ...result })
      } catch (err) {
        return errorJson(c, err)
      }
    }

    if (engine.hasDownloadNameConflict(parsed.fileName)) {
      return c.json(
        {
          error: `已有同名文件: ${parsed.fileName}`,
          code: 'CONFLICT',
        },
        409
      )
    }

    engine
      .downloadFile(body.link, taskId, { ownerAddress: c.get('userAddress') })
      .catch(err => {
        if (err.message === 'Download cancelled') {
          wsBroadcast('download:cancelled', { taskId })
        } else {
          wsBroadcast('download:error', { taskId, error: err.message })
        }
      })

    return c.json({ success: true, taskId })
  })

  app.post('/api/download/cancel', async c => {
    const body = await c.req.json()
    if (!body.taskId) {
      return c.json({ error: 'taskId is required' }, 400)
    }
    engine.cancelDownload(body.taskId)
    return c.json({ success: true })
  })

  app.delete('/api/files/:cid', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    const result = await engine.deletePublishedFile(cid, {
      ownerAddress: c.get('userAddress'),
    })
    return c.json(result)
  })

  app.post('/api/files/:cid/cache', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    try {
      const body = await c.req.json().catch(() => ({}))
      const timeout =
        body.timeout === undefined ? undefined : Number(body.timeout)
      const result = await engine.cacheFile(cid, {
        ownerAddress: c.get('userAddress'),
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
        taskId: body.taskId,
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.post('/api/move', async c => {
    const body = await c.req.json()
    if (!body.cid || !body.newFileName) {
      return c.json({ error: 'cid and newFileName are required' }, 400)
    }
    const cidValidation = validateCidString(body.cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    const cleanFileName = sanitizeFilename(body.newFileName)
    if (
      !cleanFileName ||
      cleanFileName === 'unnamed' ||
      body.newFileName.length > 255
    ) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    try {
      const result = engine.moveFile(body.cid, cleanFileName, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.get('/api/files/:cid/download', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }

    const rangeHeader = c.req.header('range')

    try {
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10)
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined
          const offset = start
          const limit = end !== undefined ? end - start + 1 : undefined

          const result = await engine.readFileRaw(cid, {
            offset,
            limit,
            public: true,
          })
          const contentType = getMimeType(result.fileName)

          c.header('Content-Type', contentType)
          c.header('Content-Length', String(result.buffer.length))
          c.header(
            'Content-Range',
            `bytes ${offset}-${offset + result.buffer.length - 1}/${result.totalSize}`
          )
          c.header('Accept-Ranges', 'bytes')
          c.status(206)
          return c.body(result.buffer)
        }
      }

      const result = await engine.readFileRaw(cid, {
        public: true,
      })
      const contentType = getMimeType(result.fileName)
      c.header('Content-Type', contentType)
      c.header('Content-Length', String(result.totalSize))
      c.header('Accept-Ranges', 'bytes')
      c.header(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(result.fileName)}"`
      )
      return c.body(result.buffer)
    } catch (err) {
      if (err.message === 'File not found') {
        return c.json({ error: err.message }, 404)
      }
      return c.json({ error: err.message }, 400)
    }
  })

  // --- 回收站路由 ---
  app.get('/api/trash', c => {
    return c.json(engine.listTrashFiles({ ownerAddress: c.get('userAddress') }))
  })

  app.post('/api/trash/:cid/restore', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    try {
      const result = await engine.restoreTrashFile(cid, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, files: result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.delete('/api/trash/:cid', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    const result = await engine.permanentDeleteTrashFile(cid, {
      ownerAddress: c.get('userAddress'),
    })
    return c.json({ success: true, trashFiles: result })
  })

  app.delete('/api/trash', async c => {
    const result = await engine.emptyTrash({
      ownerAddress: c.get('userAddress'),
    })
    return c.json({ success: true, trashFiles: result })
  })

  // --- 收藏路由 ---
  app.post('/api/files/:cid/star', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    try {
      const result = engine.toggleStarred(cid, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  // --- 显示名路由 ---
  app.get('/api/display-name', c => {
    return c.json({ displayName: engine.getDisplayName() })
  })

  app.post('/api/display-name', async c => {
    const body = await c.req.json()
    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'name is required' }, 400)
    }
    const trimmed = body.name.trim()
    if (trimmed.length > 100) {
      return c.json({ error: 'Name too long (max 100 chars)' }, 400)
    }
    if (/[<>]/.test(trimmed)) {
      return c.json({ error: 'Name contains invalid characters' }, 400)
    }
    const success = engine.setDisplayName(trimmed)
    return c.json({ success, displayName: engine.getDisplayName() })
  })

  // --- 频道路由 ---
  app.post('/api/channels', async c => {
    const body = await c.req.json()
    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'name is required' }, 400)
    }
    try {
      const result = await engine.createChannel(
        body.name.trim(),
        body.type || 'personal',
        {
          ownerAddress: c.get('userAddress'),
          displayName: body.displayName,
          avatar: body.avatar,
          channelKey: body.channelKey,
          fingerprint: body.fingerprint,
          discover: true,
        }
      )
      return c.json({ success: !result.conflict, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/channels', c => {
    return c.json(
      engine.listChannels({
        ownerAddress: c.get('userAddress'),
        type: c.req.query('type'),
        excludeType: c.req.query('excludeType'),
      })
    )
  })

  const leaveChannelForRequest = async (c, channelIdentifier) => {
    const name = String(channelIdentifier || '').trim()
    if (!name) {
      return c.json({ error: '频道标识不能为空' }, 400)
    }
    try {
      const result = await engine.leaveChannel(name, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, channels: result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  }

  app.delete('/api/channels', async c => {
    const body = await c.req.json().catch(() => ({}))
    return leaveChannelForRequest(c, body.channelKey || body.name)
  })

  app.get('/api/channels/:name/messages', async c => {
    const name = c.req.param('name')
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    try {
      const messages = await engine.getChannelMessages(name, {
        limit,
        offset,
        ownerAddress: c.get('userAddress'),
      })
      return c.json(messages)
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.get('/api/channels/:name/members', c => {
    try {
      return c.json(
        engine.getChannelMembers(c.req.param('name'), {
          ownerAddress: c.get('userAddress'),
        })
      )
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.post('/api/channels/:name/messages', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    if (!body.content || !body.content.trim()) {
      return c.json({ error: 'content is required' }, 400)
    }
    if (!body.author || !body.authorName) {
      return c.json({ error: 'author and authorName are required' }, 400)
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.author)) {
      return c.json({ error: 'Invalid author format' }, 400)
    }
    if (normalizeAddress(body.author) !== c.get('userAddress')) {
      return c.json({ error: 'message author must match logged-in user' }, 403)
    }
    if (body.authorName.length > 50) {
      return c.json({ error: 'authorName too long' }, 400)
    }
    try {
      const message = await engine.sendMessage(
        name,
        body.content,
        body.author,
        body.authorName,
        {
          ownerAddress: c.get('userAddress'),
          attachment: body.attachment,
          avatar: body.avatar,
        }
      )
      return c.json({ success: true, message })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.get('/api/channels/:name/peers', c => {
    try {
      return c.json(
        engine.getChannelPeers(c.req.param('name'), {
          ownerAddress: c.get('userAddress'),
        })
      )
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.put('/api/channels/:name/remark', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    try {
      const remark = engine.setChannelRemark(name, body.remark, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, remark })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.put('/api/channels/:name/pin', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    try {
      const pinned = engine.setChannelPinned(name, Boolean(body.pinned), {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, pinned })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  // --- 文件夹重命名 ---
  app.post('/api/folder/rename', async c => {
    const body = await c.req.json()
    if (!body.oldPath || !body.newPath) {
      return c.json({ error: 'oldPath and newPath are required' }, 400)
    }
    if (body.oldPath.length > 500 || body.newPath.length > 500) {
      return c.json({ error: 'Path too long' }, 400)
    }
    if (body.oldPath.includes('..') || body.newPath.includes('..')) {
      return c.json({ error: 'Path traversal not allowed' }, 400)
    }
    try {
      const result = engine.renameFolder(body.oldPath, body.newPath, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  // --- 关机路由 ---
  app.post('/api/shutdown', c => {
    const clientIp = c.env.incoming?.socket?.remoteAddress || 'unknown'
    if (!isLoopbackRemoteAddress(clientIp)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    c.json({ success: true })
    console.log('[MostBox] Shutdown requested via API...')
    setTimeout(async () => {
      await engine.stop()
      if (serverInstanceRef.current) serverInstanceRef.current.close()
      console.log('[MostBox] Server stopped.')
      process.exit(0)
    }, 100)
    return c.body(null)
  })

  registerStaticRoutes(app)

  return {
    app,
    wsBroadcast,
    wsSendToChannel,
    broadcastNodeStatus,
    appendNodeLog,
    subscribeToChannel,
    unsubscribeFromChannel,
    cleanupWsSubscriptions,
    validateWebSocketRequest,
  }
}
