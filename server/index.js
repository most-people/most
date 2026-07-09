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
import { UPLOAD_TMP_DIR, createApp, getDataPath } from './src/http/app.js'

export { createApp } from './src/http/app.js'

export function parseRuntimeArgs(argv = process.argv.slice(2)) {
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--host') {
      options.host = String(argv[index + 1] || '').trim()
      index += 1
    } else if (arg.startsWith('--host=')) {
      options.host = arg.slice('--host='.length).trim()
    }
  }

  return options
}

function getRuntimeHost(nodeConfig, runtimeArgs) {
  return runtimeArgs.host || nodeConfig.host || DEFAULT_NODE_HOST
}

function getDisplayHost(host) {
  if (host === '0.0.0.0') return 'localhost'
  if (host === '::') return '[::1]'
  return host
}

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
  engine.on('channel:sync:available', data =>
    wsBroadcast('channel:sync:available', data)
  )
  engine.on('channel:presence', data =>
    wsSendToChannel(data.channelKey, 'channel:presence', data)
  )
  engine.on('channel:member-profile', data =>
    wsSendToChannel(data.channelKey, 'channel:member-profile', data)
  )
  engine.on('channel:voice', data =>
    wsSendToChannel(data.channelKey, 'channel:voice', data)
  )
  engine.on('channel:joined', data => wsBroadcast('channel:joined', data))
  engine.on('channel:left', data => wsBroadcast('channel:left', data))
  engine.on('user:metadata:updated', data => {
    appendNodeLog({
      event: 'node:user-metadata:updated',
      message: 'User metadata updated',
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

export function createWebSocketServer({
  engine,
  serverInstance,
  validateWebSocketRequest,
  getWebSocketUserAddress,
  subscribeToChannel,
  unsubscribeFromChannel,
  cleanupWsSubscriptions,
}) {
  const wss = new WebSocketServer({ noServer: true })
  let wsConnectionCounter = 0

  wss.on('connection', (ws, req) => {
    ws.userAddress = getWebSocketUserAddress(req)
    ws.presenceSourceId = `ws:${++wsConnectionCounter}`
    ws.on('error', () => {})
    ws.on('close', () => {
      cleanupWsSubscriptions(ws)
      try {
        engine.clearChannelPresenceSource(ws.presenceSourceId, {
          broadcast: true,
        })
      } catch {}
    })
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw)
        const { event, data = {} } = msg

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
          case 'channel:presence:join':
            if (data.channel && ws.userAddress) {
              engine.joinChannelPresence(data.channel, {
                ownerAddress: ws.userAddress,
                sourceId: ws.presenceSourceId,
                sessionId: data.sessionId,
                displayName: data.displayName,
                avatar: data.avatar,
                profileUpdatedAt: data.profileUpdatedAt,
              })
            }
            break
          case 'channel:presence:heartbeat':
            if (data.channel && ws.userAddress) {
              engine.heartbeatChannelPresence(data.channel, {
                ownerAddress: ws.userAddress,
                sourceId: ws.presenceSourceId,
                sessionId: data.sessionId,
              })
            }
            break
          case 'channel:presence:profile':
            if (data.channel && ws.userAddress) {
              engine.updateChannelPresenceProfile(data.channel, {
                ownerAddress: ws.userAddress,
                sourceId: ws.presenceSourceId,
                sessionId: data.sessionId,
                displayName: data.displayName,
                avatar: data.avatar,
                profileUpdatedAt: data.profileUpdatedAt,
              })
            }
            break
          case 'channel:presence:leave':
            if (data.channel && ws.userAddress) {
              engine.leaveChannelPresence(data.channel, {
                ownerAddress: ws.userAddress,
                sourceId: ws.presenceSourceId,
                sessionId: data.sessionId,
              })
            }
            break
          case 'channel:voice:join':
          case 'channel:voice:state':
          case 'channel:voice:heartbeat':
          case 'channel:voice:leave':
          case 'channel:voice:signal':
            if (data.channel && ws.userAddress) {
              engine.sendChannelVoiceEvent(
                data.channel,
                {
                  ...data,
                  event: event.replace('channel:voice:', ''),
                },
                {
                  ownerAddress: ws.userAddress,
                }
              )
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
  const runtimeArgs = parseRuntimeArgs()
  const port = DEFAULT_NODE_PORT
  const host = getRuntimeHost(nodeConfig, runtimeArgs)
  const engine = new MostBoxEngine({
    dataPath,
    maxFileSize: nodeConfig.maxFileSizeBytes,
    capacityBytes: nodeConfig.capacityBytes,
  })

  const wssRef = { current: null }
  const serverInstanceRef = { current: null }

  const appRuntime = createApp(engine, {
    port,
    host,
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
    data: { dataPath, host, port },
  })
  appRuntime.broadcastNodeStatus()

  serverInstanceRef.current = serve(
    { fetch: appRuntime.app.fetch, port, hostname: host },
    () => {
      const displayUrl = `http://${getDisplayHost(host)}:${port}`
      console.log(`[MostBox] Server running at ${displayUrl}`)
      if (host !== DEFAULT_NODE_HOST) {
        console.log(`[MostBox] Listening on ${host}:${port}`)
      }
    }
  )

  wssRef.current = createWebSocketServer({
    engine,
    serverInstance: serverInstanceRef.current,
    validateWebSocketRequest: appRuntime.validateWebSocketRequest,
    getWebSocketUserAddress: appRuntime.getWebSocketUserAddress,
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
