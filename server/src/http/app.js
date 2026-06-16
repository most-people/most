import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyAuthHeader } from '../utils/auth.js'
import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  createNodeConfigStore,
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
  isPublicListenHost,
  isRemoteAccessRequest,
} from './access.js'
import { buildNodeStatus } from './nodeStatus.js'
import { createRateLimitMiddleware } from './rateLimit.js'
import {
  isPublicFileDownloadPath,
  requiresUserAuth,
  isAdminApi,
} from './routePolicy.js'
import { registerStaticRoutes } from './staticFiles.js'
import { registerChannelRoutes } from './routes/channelRoutes.js'
import { registerFileRoutes } from './routes/fileRoutes.js'
import { registerNodeRoutes } from './routes/nodeRoutes.js'
import { registerSeedRoutes } from './routes/seedRoutes.js'

export { UPLOAD_TMP_DIR } from './uploads.js'

// --- 配置 ---
const defaultConfigStore = createNodeConfigStore()
const CONFIG_DIR = defaultConfigStore.configDir
const PORT = DEFAULT_NODE_PORT
const HOST = DEFAULT_NODE_HOST

export function getDataPath(configStore = defaultConfigStore) {
  return configStore.getDataPath()
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
  const trustPrivateNetwork =
    options.trustPrivateNetwork ?? isPublicListenHost(appHost)
  function getRemoteInviteSet() {
    const invites =
      options.remoteInvites === undefined
        ? configStore.getNodeConfig().remoteInvites
        : normalizeRemoteInvites(options.remoteInvites)
    return new Set(invites)
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
      local: isLocalRequest(c, { trustPrivateNetwork }),
    })
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
      const status = await buildNodeStatus(
        engine,
        configStore,
        appPort,
        appHost
      )
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
      local: isLocalUpgradeRequest(req, { trustPrivateNetwork }),
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
  app.use('/api/*', createRateLimitMiddleware())
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

  // --- API 路由注册 ---
  registerNodeRoutes(app, {
    engine,
    appPort,
    appHost,
    configStore,
    nodeLogger,
    getDataPath,
    getRemoteInviteSet,
    isRemoteRequest,
    appendNodeLog,
    broadcastNodeStatus,
    wsBroadcast,
    serverInstanceRef,
  })
  registerSeedRoutes(app, { engine, appendNodeLog, broadcastNodeStatus })
  registerFileRoutes(app, { engine, configStore, wsBroadcast })
  registerChannelRoutes(app, { engine })

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
