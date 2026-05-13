import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import Busboy from 'busboy'
import { WebSocketServer } from 'ws'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { MostBoxEngine } from './src/index.js'
import { parseMostLink, validateCidString } from './src/core/cid.js'
import { sanitizeFilename } from './src/utils/security.js'
import { MAX_FILE_SIZE } from './src/config.js'
import { createNodeConfigStore, evaluateNodePolicy } from './src/node/config.js'
import { createNodeLogger } from './src/node/logs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.MOSTBOX_PORT || process.env.PORT) || 1976
const HOST = process.env.MOSTBOX_HOST || '0.0.0.0'

const MAX_UPLOAD_SIZE = MAX_FILE_SIZE
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'most-box-uploads')

const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 120

// --- 配置 ---
const defaultConfigStore = createNodeConfigStore()
const defaultNodeLogger = createNodeLogger(defaultConfigStore.configDir)
const CONFIG_DIR = defaultConfigStore.configDir
const PACKAGE_JSON = readPackageJson()

function getApiErrorStatus(err) {
  switch (err.code) {
    case 'VALIDATION_ERROR':
    case 'PATH_SECURITY_ERROR':
    case 'FILE_SIZE_ERROR':
      return 400
    case 'PEER_NOT_FOUND':
      return 503
    case 'INTEGRITY_ERROR':
      return 422
    case 'PERMISSION_ERROR':
      return 403
    case 'ENGINE_NOT_INITIALIZED':
      return 503
    default:
      return 500
  }
}

function errorJson(c, err) {
  return c.json(
    {
      error: err.message,
      code: err.code || 'UNKNOWN',
    },
    getApiErrorStatus(err)
  )
}

function readPackageJson() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
    )
  } catch {
    return { version: '0.0.0' }
  }
}

function getDataPath(configStore = defaultConfigStore) {
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

function getNetworkAddresses(appPort) {
  const interfaces = os.networkInterfaces()
  const addresses = []
  const seen = new Set()

  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets) {
      if (net.family !== 'IPv4' || net.internal) continue
      if (seen.has(net.address)) continue
      seen.add(net.address)

      let type = 'lan'
      let label = '局域网'
      if (net.address.startsWith('100.')) {
        type = 'tailscale'
        label = 'Tailscale'
      } else if (
        name.toLowerCase().includes('zt') ||
        name.toLowerCase().includes('zerotier')
      ) {
        type = 'zerotier'
        label = 'ZeroTier'
      }

      addresses.push({ type, ip: net.address, label, iface: name })
    }
  }

  const localEntry = {
    type: 'local',
    ip: 'localhost',
    label: '本机',
    iface: 'loopback',
  }
  return { port: appPort, addresses: [localEntry, ...addresses] }
}

async function buildNodeStatus(engine, configStore, appPort, host) {
  const config = configStore.getNodeConfig()
  const storage = await engine.getStorageStats()
  const network = engine.getNetworkStatus()
  const holdings = engine.listHoldings()

  return {
    status: 'online',
    version: PACKAGE_JSON.version,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeId: engine.getNodeId(),
    host,
    port: appPort,
    listen: getNetworkAddresses(appPort),
    dataPath: getDataPath(configStore),
    config,
    policy: {
      allowOrders: config.allowOrders,
      maxFileSizeBytes: config.maxFileSizeBytes,
      minimumPriceUsdtPerGbMonth: config.minimumPriceUsdtPerGbMonth,
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

function buildOpenApiSpec(appPort) {
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
          summary: 'Get local order policy',
          responses: { 200: { description: 'Node policy' } },
        },
        post: {
          summary: 'Update local order policy',
          responses: { 200: { description: 'Updated policy' } },
        },
      },
      '/api/node/policy/evaluate': {
        post: {
          summary: 'Evaluate a local order candidate against node policy',
          responses: { 200: { description: 'Policy decision' } },
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
      '/api/storage': {
        get: {
          summary: 'Get storage statistics',
          responses: { 200: { description: 'Storage statistics' } },
        },
      },
      '/api/p2p/pull': {
        post: {
          summary: 'Pull a full file replica by CID and chunkMerkleRoot',
          responses: { 200: { description: 'Pull task result' } },
        },
      },
    },
  }
}

// --- 静态文件服务 ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function decodeFilenameFromHeader(headerStr) {
  if (!headerStr) return null

  const filenameStarMatch = headerStr.match(
    /filename\*=(?:UTF-8''|utf-8'')([^;\r\n]+)/i
  )
  if (filenameStarMatch) {
    return decodeURIComponent(filenameStarMatch[1])
  }

  const filenameMatch = headerStr.match(/filename="([^"]+)"/)
  if (filenameMatch) {
    const rawFilename = filenameMatch[1]
    try {
      const buf = Buffer.from(rawFilename, 'latin1')
      const decoded = buf.toString('utf8')
      if (decoded.includes('\ufffd')) {
        return rawFilename
      }
      return decoded
    } catch {
      return rawFilename
    }
  }

  const filenamePlainMatch = headerStr.match(/filename=([^;\r\n]+)/)
  if (filenamePlainMatch) {
    return filenamePlainMatch[1].trim()
  }
  return null
}

async function parseMultipartBusboy(req) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(UPLOAD_TMP_DIR)) {
      fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true })
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: 1,
        fields: 0,
      },
    })

    const result = { filePath: null, filename: null }
    let fileSize = 0
    let writeStream = null
    let tempPath = null

    busboy.on('file', (name, stream, info) => {
      result.filename = decodeFilenameFromHeader(`filename="${info.filename}"`)
      tempPath = path.join(
        UPLOAD_TMP_DIR,
        `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      )
      writeStream = fs.createWriteStream(tempPath)

      stream.on('data', chunk => {
        fileSize += chunk.length
        if (fileSize > MAX_UPLOAD_SIZE) {
          stream.destroy()
          writeStream.destroy()
          fs.unlink(tempPath, () => {})
          reject(new Error('File too large'))
          return
        }
      })

      stream.on('error', () => {
        if (tempPath) fs.unlink(tempPath, () => {})
      })

      stream.pipe(writeStream)

      writeStream.on('finish', () => {
        result.filePath = tempPath
        resolve(result)
      })

      writeStream.on('error', err => {
        if (tempPath) fs.unlink(tempPath, () => {})
        reject(err)
      })
    })

    busboy.on('error', err => {
      if (tempPath) fs.unlink(tempPath, () => {})
      reject(err)
    })

    busboy.on('close', () => {
      if (!result.filename) {
        resolve(null)
      }
    })

    req.on('error', err => {
      if (tempPath) fs.unlink(tempPath, () => {})
      reject(err)
    })
    req.pipe(busboy)
  })
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

  // 将广播函数挂载到 engine 上供外部测试使用
  engine.wsBroadcast = wsBroadcast
  engine.wsSendToChannel = wsSendToChannel

  const app = new Hono()

  // CORS 中间件
  app.use(
    '/api/*',
    cors({
      origin: [
        'http://localhost:3000',
        'https://most.box',
        `http://localhost:${appPort}`,
      ],
      credentials: true,
    })
  )

  // 速率限制中间件
  app.use('/api/*', rateLimitMiddleware())

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
      return c.json(
        await buildNodeStatus(engine, configStore, appPort, appHost)
      )
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
      isDefaultDataPath: !config.dataPath && !process.env.MOSTBOX_DATA_PATH,
      envDataPath: process.env.MOSTBOX_DATA_PATH || null,
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
    appendNodeLog({
      event: 'node:config:updated',
      message: 'Node daemon config updated',
      data: {
        dataPath: getDataPath(configStore),
        capacityBytes: config.capacityBytes,
      },
    })
    await broadcastNodeStatus()
    return c.json({ success, ...config, dataPath: getDataPath(configStore) })
  })

  app.get('/api/node/policy', c => {
    const config = configStore.getNodeConfig()
    return c.json({
      allowOrders: config.allowOrders,
      maxFileSizeBytes: config.maxFileSizeBytes,
      minimumPriceUsdtPerGbMonth: config.minimumPriceUsdtPerGbMonth,
    })
  })

  app.post('/api/node/policy', async c => {
    const body = await c.req.json()
    const { success, config } = configStore.saveNodeConfigPatch({
      allowOrders: body.allowOrders,
      maxFileSizeBytes: body.maxFileSizeBytes,
      minimumPriceUsdtPerGbMonth: body.minimumPriceUsdtPerGbMonth,
    })
    const policy = {
      allowOrders: config.allowOrders,
      maxFileSizeBytes: config.maxFileSizeBytes,
      minimumPriceUsdtPerGbMonth: config.minimumPriceUsdtPerGbMonth,
    }
    appendNodeLog({
      event: 'node:policy:updated',
      message: 'Node order policy updated',
      data: policy,
    })
    await broadcastNodeStatus()
    return c.json({ success, ...policy })
  })

  app.post('/api/node/policy/evaluate', async c => {
    const body = await c.req.json()
    const decision = evaluateNodePolicy(configStore.getNodeConfig(), body)
    return c.json(decision)
  })

  app.get('/api/node/logs', c => {
    const limit = Number(c.req.query('limit') || 100)
    return c.json({
      logFile: nodeLogger.logFile,
      logs: nodeLogger.list(limit),
    })
  })

  app.delete('/api/node/logs', c => {
    const success = nodeLogger.clear()
    const clearedAt = new Date().toISOString()
    wsBroadcast('node:logs:cleared', { clearedAt })
    return c.json({ success, clearedAt })
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
    return c.json(engine.listPublishedFiles())
  })

  app.post('/api/publish', async c => {
    const req = c.env.incoming
    const result = await parseMultipartBusboy(req)

    if (!result || !result.filename) {
      return c.json({ error: 'No file provided' }, 400)
    }

    try {
      const publishResult = await engine.publishFile(
        result.filePath,
        result.filename,
        { localPath: null }
      )
      return c.json({ success: true, ...publishResult })
    } finally {
      fs.unlink(result.filePath, () => {})
    }
  })

  app.post('/api/download', async c => {
    const body = await c.req.json()
    if (!body.link) {
      return c.json({ error: 'link is required' }, 400)
    }

    const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const parsed = parseMostLink(body.link)
    if (parsed.error) {
      return c.json({ error: parsed.error }, 400)
    }

    const existingFile = engine
      .getPublishedFiles()
      .find(f => f.cid === parsed.cid)
    if (existingFile) {
      console.log(`[MostBox] File already exists: ${existingFile.fileName}`)
      return c.json({
        success: true,
        taskId,
        alreadyExists: true,
        fileName: existingFile.fileName,
      })
    }

    engine.downloadFile(body.link, taskId).catch(err => {
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
      return c.json({ error: cidValidation.error }, 400)
    }
    const result = await engine.deletePublishedFile(cid)
    return c.json(result)
  })

  app.post('/api/move', async c => {
    const body = await c.req.json()
    if (!body.cid || !body.newFileName) {
      return c.json({ error: 'cid and newFileName are required' }, 400)
    }
    const cidValidation = validateCidString(body.cid)
    if (!cidValidation.valid) {
      return c.json({ error: cidValidation.error }, 400)
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
      const result = engine.moveFile(body.cid, cleanFileName)
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/files/:cid/download', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json({ error: cidValidation.error }, 400)
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

          const result = await engine.readFileRaw(cid, { offset, limit })
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

      const result = await engine.readFileRaw(cid)
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
    return c.json(engine.listTrashFiles())
  })

  app.post('/api/trash/:cid/restore', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json({ error: cidValidation.error }, 400)
    }
    try {
      const result = engine.restoreTrashFile(cid)
      return c.json({ success: true, files: result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.delete('/api/trash/:cid', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json({ error: cidValidation.error }, 400)
    }
    const result = await engine.permanentDeleteTrashFile(cid)
    return c.json({ success: true, trashFiles: result })
  })

  app.delete('/api/trash', async c => {
    const result = await engine.emptyTrash()
    return c.json({ success: true, trashFiles: result })
  })

  // --- 收藏路由 ---
  app.post('/api/files/:cid/star', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json({ error: cidValidation.error }, 400)
    }
    try {
      const result = engine.toggleStarred(cid)
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  // --- 存储路由 ---
  app.get('/api/storage', async c => {
    const result = await engine.getStorageStats()
    return c.json(result)
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
        body.type || 'personal'
      )
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/channels', c => {
    return c.json(engine.listChannels())
  })

  app.delete('/api/channels/:name', async c => {
    const name = c.req.param('name')
    try {
      const result = await engine.leaveChannel(name)
      return c.json({ success: true, channels: result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/channels/:name/messages', async c => {
    const name = c.req.param('name')
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    try {
      const messages = await engine.getChannelMessages(name, { limit, offset })
      return c.json(messages)
    } catch (err) {
      return c.json({ error: err.message }, 400)
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
    if (body.authorName.length > 50) {
      return c.json({ error: 'authorName too long' }, 400)
    }
    try {
      const message = await engine.sendMessage(
        name,
        body.content,
        body.author,
        body.authorName
      )
      return c.json({ success: true, message })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/channels/:name/peers', c => {
    return c.json(engine.getChannelPeers(c.req.param('name')))
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
      const result = engine.renameFolder(body.oldPath, body.newPath)
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  // --- 关机路由 ---
  app.post('/api/shutdown', c => {
    const clientIp = c.env.incoming?.socket?.remoteAddress || 'unknown'
    const isLocalhost =
      clientIp === 'localhost' ||
      clientIp === '::1' ||
      clientIp === '::ffff:localhost' ||
      clientIp === '127.0.0.1' ||
      clientIp === '::ffff:127.0.0.1' ||
      clientIp.startsWith('::ffff:127.')
    if (!isLocalhost) {
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

  // --- 静态文件服务（SPA fallback） ---
  const publicDir = path.join(__dirname, '..', 'out')

  app.get('/static/*', serveStatic({ root: './out' }))
  app.get('/_next/*', serveStatic({ root: './out' }))

  app.all('/api/*', c => {
    return c.json({ error: 'Not found' }, 404)
  })

  app.get('*', async c => {
    const pathname = c.req.path
    const filePath = path.join(publicDir, pathname)
    const resolved = path.resolve(filePath)
    const resolvedPublic = path.resolve(publicDir)

    if (
      !resolved.startsWith(resolvedPublic + path.sep) &&
      resolved !== resolvedPublic
    ) {
      return c.json({ error: 'Not found' }, 404)
    }

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        const ext = path.extname(filePath)
        c.header('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
        return c.body(fs.readFileSync(filePath))
      }
      if (stat.isDirectory()) {
        const dirIndex = path.join(filePath, 'index.html')
        if (fs.existsSync(dirIndex)) {
          c.header('Content-Type', 'text/html; charset=utf-8')
          return c.body(fs.readFileSync(dirIndex, 'utf-8'))
        }
      }
    }

    const indexPath = path.join(publicDir, 'index.html')
    if (fs.existsSync(indexPath)) {
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.body(fs.readFileSync(indexPath, 'utf-8'))
    }

    return c.json({ error: 'Not found' }, 404)
  })

  return {
    app,
    wsBroadcast,
    wsSendToChannel,
    broadcastNodeStatus,
    appendNodeLog,
    subscribeToChannel,
    unsubscribeFromChannel,
    cleanupWsSubscriptions,
  }
}

// --- 主函数 ---
export async function main() {
  console.log('[MostBox] Starting core daemon...')

  if (fs.existsSync(UPLOAD_TMP_DIR)) {
    const staleFiles = fs.readdirSync(UPLOAD_TMP_DIR)
    for (const file of staleFiles) {
      try {
        fs.unlinkSync(path.join(UPLOAD_TMP_DIR, file))
      } catch (err) {
        console.warn('[MostBox] Failed to clean upload temp file:', err.message)
      }
    }
    console.log(
      `[MostBox] Cleaned ${staleFiles.length} stale upload temp files`
    )
  }

  const configStore = defaultConfigStore
  const nodeLogger = defaultNodeLogger
  const dataPath = getDataPath(configStore)
  console.log(`[MostBox] Storage: ${dataPath}`)

  const engine = new MostBoxEngine({ dataPath })

  const wssRef = { current: null }
  const serverInstanceRef = { current: null }

  const {
    app,
    wsBroadcast,
    wsSendToChannel,
    broadcastNodeStatus,
    appendNodeLog,
    subscribeToChannel,
    unsubscribeFromChannel,
    cleanupWsSubscriptions,
  } = createApp(engine, {
    port: PORT,
    host: HOST,
    configStore,
    nodeLogger,
    wssRef,
    serverInstanceRef,
  })

  let engineReadyForStatus = false
  const safeBroadcastNodeStatus = () => {
    if (engineReadyForStatus) {
      broadcastNodeStatus()
    }
  }

  engine.on('download:progress', data => wsBroadcast('download:progress', data))
  engine.on('download:status', data => wsBroadcast('download:status', data))
  engine.on('download:success', data => {
    wsBroadcast('download:success', data)
    appendNodeLog({
      event: 'node:download:success',
      message: 'Download verified and stored',
      data,
    })
    safeBroadcastNodeStatus()
  })
  engine.on('download:cancelled', data =>
    wsBroadcast('download:cancelled', data)
  )
  engine.on('publish:progress', data => wsBroadcast('publish:progress', data))
  engine.on('publish:success', data => {
    wsBroadcast('publish:success', data)
    appendNodeLog({
      event: 'node:publish:success',
      message: 'File published and seeding',
      data: { cid: data.cid, fileName: data.fileName },
    })
    safeBroadcastNodeStatus()
  })
  engine.on('connection', () => {
    wsBroadcast('network:status', engine.getNetworkStatus())
    safeBroadcastNodeStatus()
  })
  engine.on('holding:updated', data => {
    appendNodeLog({
      event: 'node:holding:updated',
      message: 'Holding metadata updated',
      data: { cid: data.cid, size: data.size },
    })
    safeBroadcastNodeStatus()
  })
  engine.on('holding:removed', data => {
    appendNodeLog({
      event: 'node:holding:removed',
      message: 'Holding metadata removed',
      data,
    })
    safeBroadcastNodeStatus()
  })
  engine.on('file:topic:joined', data => {
    appendNodeLog({
      event: 'node:topic:joined',
      message: 'CID topic joined',
      data,
    })
    safeBroadcastNodeStatus()
  })
  engine.on('channel:message', data =>
    wsSendToChannel(data.channel, 'channel:message', data)
  )
  engine.on('channel:peer:online', data =>
    wsBroadcast('channel:peer:online', data)
  )
  engine.on('channel:peer:offline', data =>
    wsBroadcast('channel:peer:offline', data)
  )
  engine.on('channel:joined', data => wsBroadcast('channel:joined', data))
  engine.on('channel:left', data => wsBroadcast('channel:left', data))

  await engine.start()
  engineReadyForStatus = true
  console.log('[MostBox] Engine ready')
  appendNodeLog({
    event: 'node:ready',
    message: 'Node daemon ready',
    data: { dataPath, port: PORT },
  })
  broadcastNodeStatus()

  serverInstanceRef.current = serve(
    { fetch: app.fetch, port: PORT, hostname: HOST },
    () => {
      const displayUrl = `http://localhost:${PORT}`
      console.log(`[MostBox] Server running at ${displayUrl}`)

      if (process.env.ELECTRON_APP) return

      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '', displayUrl], {
          detached: true,
          stdio: 'ignore',
        }).unref()
      } else {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
        spawn(cmd, [displayUrl], {
          detached: true,
          stdio: 'ignore',
        }).unref()
      }
    }
  )

  wssRef.current = new WebSocketServer({ noServer: true })
  wssRef.current.on('connection', ws => {
    ws.on('error', () => {})
    ws.on('close', () => {
      cleanupWsSubscriptions(ws)
    })
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw)
        const { event, data } = msg

        switch (event) {
          case 'register':
            ws.peerId = data.peerId
            break
          case 'channel:subscribe':
            if (data.channel) {
              subscribeToChannel(ws, data.channel)
            }
            break
          case 'channel:unsubscribe':
            if (data.channel) {
              unsubscribeFromChannel(ws, data.channel)
            }
            break
        }
      } catch (err) {
        console.error('[WS Message Error]', err.message)
      }
    })
  })

  serverInstanceRef.current.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/ws')) {
      wssRef.current.handleUpgrade(req, socket, head, ws => {
        wssRef.current.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  process.on('SIGINT', async () => {
    console.log('\n[MostBox] Shutting down...')
    await engine.stop()
    if (wssRef.current) wssRef.current.close()
    serverInstanceRef.current.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await engine.stop()
    if (wssRef.current) wssRef.current.close()
    serverInstanceRef.current.close()
    process.exit(0)
  })

  return engine
}

// 仅在直接运行时执行 main（通过 node server/index.js 或 CLI）
const isMain =
  process.argv[1] &&
  (import.meta.url === new URL(process.argv[1], 'file://').href ||
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
if (isMain) {
  main().catch(err => {
    console.error('[MostBox] Fatal error:', err)
    process.exit(1)
  })
}
