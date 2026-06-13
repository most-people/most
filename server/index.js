import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { serve } from '@hono/node-server'
import { MostBoxEngine } from './src/index.js'
import {
  DEFAULT_NODE_HOST,
  DEFAULT_NODE_PORT,
  createNodeConfigStore,
} from './src/node/config.js'
import { createNodeLogger } from './src/node/logs.js'
import {
  UPLOAD_TMP_DIR,
  createApp,
  getDataPath,
} from './src/http/app.js'

export { createApp } from './src/http/app.js'

const PORT = DEFAULT_NODE_PORT
const HOST = DEFAULT_NODE_HOST

function cleanUploadTempDir() {
  if (!fs.existsSync(UPLOAD_TMP_DIR)) return

  const staleFiles = fs.readdirSync(UPLOAD_TMP_DIR)
  for (const file of staleFiles) {
    try {
      fs.unlinkSync(path.join(UPLOAD_TMP_DIR, file))
    } catch (err) {
      console.warn('[MostBox] Failed to clean upload temp file:', err.message)
    }
  }
  console.log(`[MostBox] Cleaned ${staleFiles.length} stale upload temp files`)
}

function bindEngineEvents({
  engine,
  wsBroadcast,
  wsSendToChannel,
  appendNodeLog,
  broadcastNodeStatus,
}) {
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
  engine.on('seed:metrics', data => {
    wsBroadcast('seed:metrics', data)
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
  engine.on('user:metadata:updated', data => {
    appendNodeLog({
      event: 'node:user-sync:updated',
      message: 'User metadata synced',
      data,
    })
    wsBroadcast('user:metadata:updated', data)
    safeBroadcastNodeStatus()
  })

  return {
    markReady() {
      engineReadyForStatus = true
    },
  }
}

function createWebSocketServer({
  serverInstance,
  validateWebSocketRequest,
  subscribeToChannel,
  unsubscribeFromChannel,
  cleanupWsSubscriptions,
}) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', ws => {
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

  serverInstance.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) {
      socket.destroy()
      return
    }

    if (!validateWebSocketRequest(req)) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req)
    })
  })

  return wss
}

function bindShutdownSignals({ engine, wssRef, serverInstanceRef }) {
  async function shutdown(message) {
    if (message) console.log(message)
    await engine.stop()
    if (wssRef.current) wssRef.current.close()
    serverInstanceRef.current.close()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    shutdown('\n[MostBox] Shutting down...')
  })

  process.on('SIGTERM', () => {
    shutdown()
  })
}

// --- 主函数 ---
export async function main() {
  console.log('[MostBox] Starting core daemon...')
  cleanUploadTempDir()

  const configStore = createNodeConfigStore()
  const nodeLogger = createNodeLogger(configStore.configDir)
  const dataPath = getDataPath(configStore)
  console.log(`[MostBox] Storage: ${dataPath}`)

  const nodeConfig = configStore.getNodeConfig()
  const engine = new MostBoxEngine({
    dataPath,
    maxFileSize: nodeConfig.maxFileSizeBytes,
    capacityBytes: nodeConfig.capacityBytes,
  })

  const wssRef = { current: null }
  const serverInstanceRef = { current: null }

  const appRuntime = createApp(engine, {
    port: PORT,
    host: HOST,
    configStore,
    nodeLogger,
    wssRef,
    serverInstanceRef,
  })

  const engineEvents = bindEngineEvents({
    engine,
    wsBroadcast: appRuntime.wsBroadcast,
    wsSendToChannel: appRuntime.wsSendToChannel,
    appendNodeLog: appRuntime.appendNodeLog,
    broadcastNodeStatus: appRuntime.broadcastNodeStatus,
  })

  await engine.start()
  engineEvents.markReady()
  console.log('[MostBox] Engine ready')
  appRuntime.appendNodeLog({
    event: 'node:ready',
    message: 'Node daemon ready',
    data: { dataPath, port: PORT },
  })
  appRuntime.broadcastNodeStatus()

  serverInstanceRef.current = serve(
    { fetch: appRuntime.app.fetch, port: PORT, hostname: HOST },
    () => {
      const displayUrl = `http://localhost:${PORT}`
      console.log(`[MostBox] Server running at ${displayUrl}`)
    }
  )

  wssRef.current = createWebSocketServer({
    serverInstance: serverInstanceRef.current,
    validateWebSocketRequest: appRuntime.validateWebSocketRequest,
    subscribeToChannel: appRuntime.subscribeToChannel,
    unsubscribeFromChannel: appRuntime.unsubscribeFromChannel,
    cleanupWsSubscriptions: appRuntime.cleanupWsSubscriptions,
  })

  bindShutdownSignals({ engine, wssRef, serverInstanceRef })

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
