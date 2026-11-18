import { randomBytes } from 'node:crypto'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { importer } from 'ipfs-unixfs-importer'
import { CID } from 'multiformats/cid'
import {
  CHANNEL_MESSAGE_LIMIT,
  CHANNEL_PROOF_VERSION,
  CHANNEL_PRESENCE_HEARTBEAT_MS,
  CHANNEL_PRESENCE_TIMEOUT_MS,
  CHANNELS_FILE,
  MAX_CHANNEL_FRAME_BYTES,
  MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME,
  buildChannelHelloMessages,
  chunkChannelScopeTopics,
  consumeChannelFrames,
  createChannelProofChallenge,
  createChannelRecord,
  formatChannelForResponse,
  normalizeChannelRemark,
  normalizeChannelId,
  normalizeChannelKey,
  normalizeChannelPresenceAddress,
  normalizeChannelPresenceAvatar,
  normalizeChannelPresenceDisplayName,
  normalizeChannelProofChallenge,
  normalizeChannelRecord,
  normalizeChannelScopeTopics,
  sortChannelMessages,
  uniqueStrings,
} from './channel-protocol.mjs'
import {
  channelTopics,
  channelWriterKeyPair,
  createChannelProof,
  resolveChannelHandle,
  verifyChannelProof,
} from './channel-keys-v2.mjs'
import { P2PPingManager } from './p2p-ping.mjs'
import {
  SIGNED_TS_FUTURE_LIMIT_MS,
  buildSignedEntry,
  isSignedEntry,
  readSignedMessageEntry,
  readSignedProfileEntry,
  signedProfileError,
  signedMessageError,
} from './channel-signed-entry.mjs'
import {
  createSignedPresenceFrame,
  readSignedPresenceFrame,
  presenceSession,
  signedPresenceError,
} from './channel-signed-presence.mjs'
import { canonicalJson } from '../shared/canonical-json.mjs'
import { attachCidDriveChannel, cidDriveName } from './cid-drive-exchange.mjs'
import {
  getInternalHoldingCleanupPaths,
  removeHoldingRecord,
} from './holding-records.mjs'

const fs =
  typeof globalThis.Bare === 'undefined'
    ? (await import('node:fs')).default
    : (await import('bare-fs')).default
const path =
  typeof globalThis.Bare === 'undefined'
    ? (await import('node:path')).default
    : (await import('bare-path')).default

const RuntimeURL =
  typeof globalThis.Bare === 'undefined'
    ? globalThis.URL
    : (await import('bare-url')).default

const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'
const MAX_PEERS = 64
const CONNECTION_TIMEOUT = 120000
const DOWNLOAD_DISCOVERY_TIMEOUT = 30000
const STREAM_READ_TIMEOUT = 10000
const FILE_WRITE_CHUNK_SIZE = 64 * 1024
const DOWNLOAD_POLL_INTERVAL_MIN = 500
const DOWNLOAD_POLL_INTERVAL_MAX = 2000
const DRIVE_UPDATE_INTERVAL = 2000
// Re-run the DHT lookup for a topic this often while a download has no source.
const TOPIC_LOOKUP_INTERVAL = 5000
const PROGRESS_THROTTLE = 500
const HOLDINGS_FILE = 'node-holdings.json'
const TRANSFERS_FILE = 'transfers.json'
const CID_TOPIC_JOIN_OPTIONS = Object.freeze({
  server: true,
  client: true,
})

const SWARM_BOOTSTRAP = [
  '88.99.3.86@node1.hyperdht.org:49737',
  '142.93.90.113@node2.hyperdht.org:49737',
  '138.68.147.8@node3.hyperdht.org:49737',
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const HEX_64_REGEX = /^[0-9a-f]{64}$/
// channel-keys.md §5: writer core keys accepted per channel from one hello.
const MAX_HELLO_WRITER_CORE_KEYS = 256

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

function createDummyBlockstore() {
  return {
    put: async (key, _value) => key,
    get: async () => {
      throw new Error('CID calculation blockstore is write-only')
    },
    has: async () => false,
  }
}

function ensureDirectory(dir) {
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath)
  } catch {}
}

function safeRm(filePath) {
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    safeUnlink(filePath)
  }
}

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

// Secret that names this node's own CID drives; losing it equals losing the
// drive data, so it lives with the store.
function loadOrCreateCidDriveSecret(storagePath) {
  const filePath = path.join(storagePath, 'cid-drive-secret')
  try {
    const existing = b4a.from(fs.readFileSync(filePath, 'utf8').trim(), 'hex')
    if (existing.byteLength === 32) return existing
  } catch {}
  const secret = randomBytes(32)
  atomicWrite(filePath, b4a.toString(secret, 'hex'))
  return secret
}

function atomicWrite(filePath, data) {
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, data, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function sanitizeFilename(name) {
  const text = String(name || '').trim()
  const cleaned = text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim()
  return cleaned || 'mostbox-file'
}

function parseLinkUrl(value) {
  try {
    return new RuntimeURL(value)
  } catch {
    try {
      return new RuntimeURL(value, 'https://most.box/')
    } catch {
      return null
    }
  }
}

function extractTailTarget(value) {
  const url = parseLinkUrl(value)
  if (!url) return value

  if (
    url.protocol === 'most:' &&
    (!url.pathname || (url.search && /^\/+$/u.test(url.pathname)))
  ) {
    return `${url.hostname}${url.search}`
  }

  const pathName = url.search ? url.pathname.replace(/\/+$/u, '') : url.pathname
  const tailPath = pathName.split('/').filter(Boolean).at(-1) || ''

  return `${tailPath}${url.search}`
}

function splitMostLink(link) {
  const value = String(link || '').trim()
  if (!value) throw new Error('Share link or CID is required')

  const tailTarget = extractTailTarget(value)
  const queryIndex = tailTarget.indexOf('?')
  const cid = queryIndex === -1 ? tailTarget : tailTarget.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : tailTarget.slice(queryIndex + 1)
  let fileName = cid
  let hasFileName = false

  if (query) {
    for (const part of query.split('&')) {
      if (!part) continue
      const separatorIndex = part.indexOf('=')
      const rawKey =
        separatorIndex === -1 ? part : part.slice(0, separatorIndex)
      const rawValue =
        separatorIndex === -1 ? '' : part.slice(separatorIndex + 1)
      const key = decodeURIComponent(rawKey)
      if (key !== 'filename') {
        throw new Error('Share links only support the filename query')
      }
      if (!hasFileName) {
        const decoded = decodeURIComponent(
          rawValue.replace(/\+/g, '%20')
        ).trim()
        if (decoded) fileName = decoded
        hasFileName = true
      }
    }
  }

  return {
    cid,
    fileName: sanitizeFilename(fileName),
  }
}

function getCidInfo(cid) {
  let parsed
  try {
    parsed = CID.parse(String(cid || ''))
  } catch {
    throw new Error('Invalid CID format')
  }

  if (parsed.version !== 1) {
    throw new Error('CID v1 required')
  }

  const topic = b4a.from(parsed.multihash.digest)
  if (topic.byteLength !== 32) {
    throw new Error('CID digest must be 32 bytes')
  }

  const topicHex = b4a.toString(topic, 'hex')
  return {
    cid: parsed.toString(),
    topic,
    topicHex,
    driveName: `drive-${topicHex}`,
  }
}

function buildMostLink(cid, fileName) {
  const cleanName = String(fileName || '').trim()
  if (!cleanName) return `most://${cid}`
  return `most://${cid}?filename=${encodeURIComponent(cleanName)}`
}

function normalizeFileUri(uri) {
  const value = String(uri || '').trim()
  if (value.startsWith('file://')) {
    return decodeURIComponent(value.slice('file://'.length))
  }
  return value
}

export async function calculateCid(input, onProgress) {
  const blockstore = createDummyBlockstore()
  let rootCid = null
  let size = 0
  let content

  if (input.buffer) {
    size = input.buffer.byteLength
    content = [input.buffer]
  } else if (input.filePath) {
    const filePath = normalizeFileUri(input.filePath)
    const stat = fs.statSync(filePath)
    size = stat.size || 0
    content = fs.createReadStream(filePath)
  } else if (input.stream) {
    content = input.stream
  } else {
    throw new Error('File content is required')
  }

  async function* trackedContent() {
    let loaded = 0
    let lastProgressAt = 0
    for await (const chunk of content) {
      loaded += chunk.byteLength
      const now = Date.now()
      if (
        onProgress &&
        (now - lastProgressAt >= PROGRESS_THROTTLE || loaded === size)
      ) {
        lastProgressAt = now
        onProgress(loaded, size)
      }
      yield chunk
    }
  }

  for await (const entry of importer(
    [
      {
        path: 'file',
        content: onProgress ? trackedContent() : content,
      },
    ],
    blockstore,
    {
      cidVersion: 1,
      rawLeaves: true,
      wrapWithDirectory: false,
    }
  )) {
    rootCid = entry.cid
  }

  if (!rootCid) {
    throw new Error('Failed to calculate CID: no root CID generated')
  }

  return {
    cid: rootCid.toString(),
    size,
  }
}

async function writeBufferToDrive(drive, driveKey, buffer) {
  const ws = drive.createWriteStream(driveKey)

  await new Promise((resolve, reject) => {
    let offset = 0
    let settled = false

    const fail = err => {
      if (settled) return
      settled = true
      ws.destroy(err)
      reject(err)
    }

    const writeMore = () => {
      try {
        while (offset < buffer.byteLength) {
          const chunk = buffer.subarray(offset, offset + FILE_WRITE_CHUNK_SIZE)
          offset += chunk.byteLength
          if (!ws.write(chunk)) {
            ws.once('drain', writeMore)
            return
          }
        }
        ws.end()
      } catch (err) {
        fail(err)
      }
    }

    ws.on('finish', () => {
      if (settled) return
      settled = true
      resolve()
    })
    ws.on('error', fail)
    writeMore()
  })
}

async function pipeFileToDrive(filePath, drive, driveKey) {
  const rs = fs.createReadStream(normalizeFileUri(filePath))
  const ws = drive.createWriteStream(driveKey)

  await new Promise((resolve, reject) => {
    let settled = false
    const fail = err => {
      if (settled) return
      settled = true
      rs.destroy(err)
      ws.destroy(err)
      reject(err)
    }
    const complete = () => {
      if (settled) return
      settled = true
      resolve()
    }

    rs.pipe(ws)
    rs.on('error', fail)
    ws.on('error', fail)
    ws.on('finish', complete)
  })
}

async function pipeDriveToFile(stream, targetPath, options = {}) {
  ensureDirectory(path.dirname(targetPath))
  const ws = fs.createWriteStream(targetPath, {
    flags: options.append ? 'a' : 'w',
  })
  const timeout = options.timeout ?? STREAM_READ_TIMEOUT
  const onProgress = options.onProgress || (() => {})

  await new Promise((resolve, reject) => {
    let settled = false
    let loaded = 0
    let lastProgressAt = 0
    let readTimer = null

    const clearReadTimer = () => {
      if (readTimer) {
        clearTimeout(readTimer)
        readTimer = null
      }
    }

    const fail = err => {
      if (settled) return
      settled = true
      clearReadTimer()
      stream.destroy(err)
      ws.destroy(err)
      reject(err)
    }

    const complete = () => {
      if (settled) return
      settled = true
      clearReadTimer()
      resolve()
    }

    const resetReadTimer = () => {
      clearReadTimer()
      if (timeout > 0) {
        readTimer = setTimeout(() => {
          fail(
            new Error(
              `Download stalled: no data received for ${timeout / 1000}s`
            )
          )
        }, timeout)
      }
    }

    resetReadTimer()

    stream.on('data', chunk => {
      resetReadTimer()
      loaded += chunk.byteLength
      const now = Date.now()
      if (now - lastProgressAt > PROGRESS_THROTTLE) {
        lastProgressAt = now
        try {
          onProgress(loaded)
        } catch (err) {
          fail(err)
        }
      }
    })

    stream.pipe(ws)
    stream.on('error', fail)
    ws.on('error', fail)
    ws.on('finish', complete)
  })
}

function uniqueSavePath(downloadPath, fileName) {
  const cleanName = sanitizeFilename(fileName)
  const ext = path.extname(cleanName)
  const base = ext ? cleanName.slice(0, -ext.length) : cleanName
  let candidate = path.join(downloadPath, cleanName)
  let index = 1

  while (fs.existsSync(candidate)) {
    candidate = path.join(downloadPath, `${base}-${index}${ext}`)
    index += 1
  }

  return candidate
}

export class MobileP2PCore {
  #storagePath
  #downloadPath
  #send
  #store = null
  #swarm = null
  #chatSwarm = null
  #drives = new Map()
  #drivePromises = new Map()
  #discoveries = new Map()
  #cancelledDownloads = new Set()
  #channels = []
  #channelCores = new Map()
  #channelCoresOpening = new Set()
  #channelLocalCoreKey = new Map()
  #channelDiscoveries = new Map()
  #channelChatDiscoveries = new Map()
  #channelPeers = new Map()
  #channelStreams = new Map()
  #channelMessageCache = new Map()
  #channelMessageQueues = new Map()
  #channelPresenceSessions = new Map()
  #channelPresenceProfiles = new Map()
  #channelPresenceSweepTimer = null
  #channelPresenceTimeoutMs
  #channelPresenceSweepMs
  #holdings = []
  #seedStates = new Map()
  #transfers = []
  #activeDownloadCids = new Set()
  #cidDriveSecret = null
  #cidDrivePeers = new Set()
  #cidDriveOffers = new Map()
  #cidDriveWants = new Map()
  #cidDriveOfferWaiters = new Set()
  #logs = []
  #createSwarm
  #relayThrough = null
  #p2pPingManager = null
  #p2pPing = null
  #node = {
    status: 'idle',
    peerCount: 0,
    storagePath: '',
    error: '',
  }

  constructor(options = {}) {
    this.#storagePath = normalizeFileUri(options.storagePath || '')
    this.#downloadPath = path.join(this.#storagePath, 'downloads')
    this.#send = options.send || (() => {})
    this.#createSwarm =
      options.createSwarm || (swarmOptions => new Hyperswarm(swarmOptions))
    this.#relayThrough = options.relayThrough || null
    this.#channelPresenceTimeoutMs =
      options.channelPresenceTimeoutMs || CHANNEL_PRESENCE_TIMEOUT_MS
    this.#channelPresenceSweepMs =
      options.channelPresenceSweepMs || CHANNEL_PRESENCE_HEARTBEAT_MS
    this.#node.storagePath = this.#storagePath
  }

  getSnapshot() {
    return {
      node: {
        ...this.#node,
        peerCount: this.#peerCount(),
        networkOnline: this.#swarm?.dht?.online !== false,
      },
      holdings: this.#holdings.map(holding => this.#toMobileHolding(holding)),
      transfers: this.#transfers.map(transfer => ({ ...transfer })),
      channels: this.#channels.map(channel => this.#toMobileChannel(channel)),
      channelMessages: this.#snapshotChannelMessages(),
      channelPresence: this.#snapshotChannelPresence(),
      logs: this.#logs.map(log => ({ ...log })),
      p2pPing: this.#p2pPing
        ? {
            ...this.#p2pPing,
            directions: Object.fromEntries(
              Object.entries(this.#p2pPing.directions || {}).map(
                ([direction, result]) => [direction, { ...result }]
              )
            ),
          }
        : null,
    }
  }

  async start() {
    if (this.#node.status === 'ready') return this.getSnapshot()

    this.#node = {
      ...this.#node,
      status: 'starting',
      error: '',
    }
    this.#emitSnapshot()

    if (!this.#storagePath) {
      throw new Error('P2P core storagePath is required')
    }

    ensureDirectory(this.#storagePath)
    ensureDirectory(this.#downloadPath)

    const primaryKey = b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING)
    this.#store = new Corestore(this.#storagePath, {
      primaryKey,
      unsafe: true,
    })
    await this.#store.ready()

    this.#swarm = this.#createSwarm({
      maxPeers: MAX_PEERS,
      bootstrap: SWARM_BOOTSTRAP,
      firewall: () => false,
      connectionKeepAlive: 5000,
      randomPunchInterval: 20000,
      handshakeTimeout: CONNECTION_TIMEOUT,
      relayThrough: this.#relayThrough,
    })

    this.#swarm.on('connection', conn => {
      conn.on('error', () => {})
      this.#store.replicate(conn)
      this.#attachCidDrivePeer(conn)
      this.#emitNetworkStatus()
    })
    this.#swarm.on('update', () => this.#emitNetworkStatus())
    this.#swarm.dht?.on?.('network-update', () => this.#emitNetworkStatus())
    this.#swarm.on('error', err => {
      const message = err && err.message ? err.message : 'Hyperswarm error'
      this.#log('warn', message)
    })

    this.#chatSwarm = this.#createSwarm({
      maxPeers: MAX_PEERS,
      bootstrap: SWARM_BOOTSTRAP,
      firewall: () => false,
      connectionKeepAlive: 5000,
      randomPunchInterval: 20000,
      handshakeTimeout: CONNECTION_TIMEOUT,
      relayThrough: this.#relayThrough,
    })

    this.#chatSwarm.on('connection', (conn, info) => {
      conn.on('error', () => {})
      this.#handleChannelConnection(conn, info).catch(() => {})
      this.#emitNetworkStatus()
    })
    this.#chatSwarm.on('update', () => this.#emitNetworkStatus())
    this.#chatSwarm.on('error', err => {
      const message = err && err.message ? err.message : 'Chat swarm error'
      this.#log('warn', message)
    })

    this.#p2pPingManager = new P2PPingManager({
      createSwarm: this.#createSwarm,
      swarmOptions: {
        maxPeers: 4,
        bootstrap: SWARM_BOOTSTRAP,
        firewall: () => false,
        connectionKeepAlive: 5000,
        randomPunchInterval: 20000,
        handshakeTimeout: CONNECTION_TIMEOUT,
        relayThrough: this.#relayThrough,
      },
      onUpdate: ping => {
        this.#p2pPing = ping
        this.#send('p2p.ping.status', {
          ping,
          snapshot: this.getSnapshot(),
        })
      },
    })

    this.#cidDriveSecret = loadOrCreateCidDriveSecret(this.#storagePath)
    this.#transfers = this.#loadTransfers()
    this.#holdings = this.#loadHoldings()
    for (const holding of this.#holdings) {
      this.#seedStates.set(holding.cid, {
        status: 'queued',
        topic: holding.topic,
        driveName: holding.driveName,
      })
    }

    this.#channels = this.#loadChannels()
    for (const channel of this.#channels) {
      await this.#openChannelRuntime(channel)
      await this.#joinChannelDiscoveryTopics(channel)
    }
    this.#startChannelPresenceSweeper()

    this.#node = {
      ...this.#node,
      status: 'ready',
      error: '',
    }
    this.#log('info', 'MostBox Android P2P core is ready')
    this.#emitSnapshot()

    for (const holding of [...this.#holdings]) {
      this.#restoreHolding(holding.cid).catch(err => {
        this.#setSeedState(holding.cid, {
          status: 'error',
          localAvailable: false,
          error: err.message,
        })
      })
    }

    return this.getSnapshot()
  }

  async stop() {
    this.#node = { ...this.#node, status: 'stopping' }
    this.#emitSnapshot()
    this.#clearChannelPresenceRuntime()

    if (this.#p2pPingManager) {
      await this.#p2pPingManager.destroy()
      this.#p2pPingManager = null
    }
    this.#p2pPing = null

    if (this.#swarm) {
      await this.#swarm.destroy()
      this.#swarm = null
    }

    if (this.#chatSwarm) {
      await this.#chatSwarm.destroy()
      this.#chatSwarm = null
    }

    for (const [, coresMap] of this.#channelCores) {
      await Promise.allSettled([...coresMap.values()].map(core => core.close()))
    }
    this.#channelCores.clear()
    this.#channelLocalCoreKey.clear()
    this.#channelDiscoveries.clear()
    this.#channelChatDiscoveries.clear()
    this.#channelPeers.clear()
    this.#channelStreams.clear()
    this.#channelMessageCache.clear()
    this.#channelMessageQueues.clear()

    await Promise.allSettled(
      [...this.#drives.values()].map(drive => drive.close())
    )
    this.#drives.clear()
    this.#drivePromises.clear()
    this.#discoveries.clear()
    this.#cidDrivePeers.clear()
    this.#cidDriveOffers.clear()
    this.#cidDriveWants.clear()

    if (this.#store) {
      await this.#store.close()
      this.#store = null
    }

    this.#node = {
      ...this.#node,
      status: 'idle',
      peerCount: 0,
      error: '',
    }
    this.#emitSnapshot()
  }

  listHoldings() {
    return this.getSnapshot().holdings
  }

  async startP2PPing(input = {}) {
    this.#ensureReady()
    return this.#p2pPingManager.start(input)
  }

  getP2PPing(input = {}) {
    this.#ensureReady()
    const id = String(input.id || '')
    return id ? this.#p2pPingManager.get(id) : this.#p2pPing
  }

  cancelP2PPing(input = {}) {
    this.#ensureReady()
    const id = String(input.id || this.#p2pPing?.id || '')
    if (id) this.#p2pPingManager.cancel(id)
    this.#p2pPing = null
    return null
  }

  listChannels() {
    this.#ensureReady()
    return this.#channels.map(channel => this.#toMobileChannel(channel))
  }

  async createChannel(input = {}) {
    this.#ensureReady()
    const requestedType = String(input.type || 'public').trim() || 'public'
    const resolved = resolveChannelHandle(input.name || input.channelId)
    if (!resolved) throw new Error('Invalid channel credential or name')
    const existing = this.#channels.find(
      channel => channel.channelKey === resolved.channelKey
    )

    if (existing) {
      await this.#openChannelRuntime(existing)
      await this.#joinChannelDiscoveryTopics(existing)
      this.#broadcastChannelHello()
      return this.#toMobileChannel(existing)
    }

    const channel = createChannelRecord(resolved, requestedType)
    this.#channels.push(channel)
    await this.#openChannelRuntime(channel)
    await this.#joinChannelDiscoveryTopics(channel)
    this.#saveChannels()
    this.#broadcastChannelHello()
    this.#log('info', `Joined channel ${channel.channelKey}`)
    this.#send('channel.joined', {
      channel: this.#toMobileChannel(channel),
      snapshot: this.getSnapshot(),
    })
    return this.#toMobileChannel(channel)
  }

  async leaveChannel(input = {}) {
    this.#ensureReady()
    const channel = this.#resolveChannel(input.channelName || input.name)
    const channelKey = channel.channelKey
    const coresMap = this.#channelCores.get(channelKey)
    const discoveries = [
      this.#channelDiscoveries.get(channelKey),
      this.#channelChatDiscoveries.get(channelKey),
    ].filter(Boolean)

    for (const discovery of discoveries) {
      try {
        await discovery.destroy?.()
      } catch {}
    }

    if (coresMap) {
      await Promise.allSettled([...coresMap.values()].map(core => core.close()))
    }

    this.#channelDiscoveries.delete(channelKey)
    this.#channelChatDiscoveries.delete(channelKey)
    this.#channelCores.delete(channelKey)
    this.#channelLocalCoreKey.delete(channelKey)
    this.#channelPeers.delete(channelKey)
    this.#channelMessageCache.delete(channelKey)
    this.#clearChannelPresenceForChannel(channelKey)
    this.#channels = this.#channels.filter(
      item => item.channelKey !== channelKey
    )
    this.#saveChannels()
    this.#emitSnapshot()
    this.#send('channel.left', {
      channelKey,
      snapshot: this.getSnapshot(),
    })
    this.#log('info', `Left channel ${channelKey}`)
    return {
      channelKey,
      snapshot: this.getSnapshot(),
    }
  }

  async setChannelRemark(input = {}) {
    this.#ensureReady()
    const channel = this.#resolveChannel(input.channelName || input.name)
    channel.remark = normalizeChannelRemark(input.remark)
    this.#saveChannels()
    this.#emitSnapshot()
    this.#send('channel.updated', {
      channel: this.#toMobileChannel(channel),
      snapshot: this.getSnapshot(),
    })
    return this.#toMobileChannel(channel)
  }

  async setChannelPinned(input = {}) {
    this.#ensureReady()
    const channel = this.#resolveChannel(input.channelName || input.name)
    channel.pinned = input.pinned === true
    this.#saveChannels()
    this.#emitSnapshot()
    this.#send('channel.updated', {
      channel: this.#toMobileChannel(channel),
      snapshot: this.getSnapshot(),
    })
    return this.#toMobileChannel(channel)
  }

  async getChannelMessages(input = {}) {
    this.#ensureReady()
    const channelName =
      typeof input === 'string' ? input : input.channelName || input.name
    const channel = this.#resolveChannel(channelName)
    const limit = typeof input === 'object' ? input.limit : undefined
    const offset = typeof input === 'object' ? input.offset : undefined
    const coresMap = this.#channelCores.get(channel.channelKey)
    if (!coresMap || coresMap.size === 0) {
      throw new Error('Channel runtime is not initialized')
    }

    const allMessages = []
    for (const [coreKeyHex, core] of coresMap) {
      for (let i = 0; i < core.length; i++) {
        try {
          // Only blocks held locally: a writer whose block has not arrived
          // may be offline, and waiting would hang the read.
          const entry = await core.get(i, { wait: false })
          if (entry === null) break
          if (!this.#isChannelActive(channel.channelKey)) return []
          const message = readSignedMessageEntry(entry, channel.channelKey)
          if (message) {
            allMessages.push({
              ...message,
              _coreKey: coreKeyHex,
              _index: i,
            })
          }
        } catch {
          if (!this.#isChannelActive(channel.channelKey)) return []
          break
        }
      }
    }

    if (!this.#isChannelActive(channel.channelKey)) return []

    const messages = sortChannelMessages(
      allMessages,
      limit || CHANNEL_MESSAGE_LIMIT,
      offset || 0
    )
    if (!this.#isChannelActive(channel.channelKey)) return []
    if (!offset) this.#cacheChannelMessages(channel.channelKey, messages)
    if (!this.#isChannelActive(channel.channelKey)) {
      this.#channelMessageCache.delete(channel.channelKey)
      return []
    }
    this.#emitSnapshot()
    return messages
  }

  // Rebuild from locally readable signed blocks. Profiles are not chat
  // messages and must not move the conversation preview or unread cursor.
  async getChannelMemberProfiles({ channelName }) {
    this.#ensureReady()
    const channel = this.#resolveChannel(channelName)
    const cores = this.#channelCores.get(channel.channelKey)
    if (!cores) throw new Error('Channel runtime is not initialized')
    const updates = []
    const now = Date.now()
    for (const [writer, core] of cores) {
      for (let index = 0; index < core.length; index++) {
        const entry = await core.get(index, { wait: false })
        if (!entry) break
        const patch = readSignedProfileEntry(entry, channel.channelKey, now)
        if (patch) updates.push({ patch, writer, index })
      }
    }
    const members = new Map()
    updates.sort(
      (a, b) =>
        a.patch.profileUpdatedAt - b.patch.profileUpdatedAt ||
        (a.writer < b.writer ? -1 : a.writer > b.writer ? 1 : a.index - b.index)
    )
    for (const { patch } of updates) {
      const previous = members.get(patch.address)
      if (previous?.profileUpdatedAt === patch.profileUpdatedAt) continue
      const member = { ...previous, ...patch }
      if (member.tag === null) delete member.tag
      members.set(member.address, member)
    }
    return [...members.values()]
  }

  updateChannelMemberProfile(input) {
    return this.#enqueueChannelWrite(input, 'profile')
  }

  sendChannelMessage(input = {}) {
    return this.#enqueueChannelWrite(input, 'message')
  }

  async #enqueueChannelWrite(input, kind) {
    this.#ensureReady()
    const channel = this.#resolveChannel(input.channelName || input.name)
    const key = channel.channelKey
    const store = this.#store
    const previous = this.#channelMessageQueues.get(key) || Promise.resolve()
    const pending = previous
      .catch(() => {})
      .then(() => {
        if (this.#store !== store) throw new Error('P2P core is not ready')
        return this.#writeChannelEntry(input, kind)
      })
    const completed = pending.then(
      () => {},
      () => {}
    )
    this.#channelMessageQueues.set(key, completed)
    try {
      return await pending
    } finally {
      if (this.#channelMessageQueues.get(key) === completed)
        this.#channelMessageQueues.delete(key)
    }
  }

  async #writeChannelEntry(input, kind) {
    this.#ensureReady()
    const channelName = input.channelName || input.name
    const channel = this.#resolveChannel(channelName)
    const localKeyHex = this.#channelLocalCoreKey.get(channel.channelKey)
    const coresMap = this.#channelCores.get(channel.channelKey)
    const core = localKeyHex && coresMap ? coresMap.get(localKeyHex) : null
    if (!core) {
      throw new Error('Channel runtime is not initialized')
    }

    // The app signs the body with its device key; this core checks it and
    // never edits it (signatures.md §4.6).
    const { signed } = input
    const validate =
      kind === 'profile' ? signedProfileError : signedMessageError
    const error = validate(signed, { channelId: channel.channelKey })
    if (error) throw new Error(`Invalid signed ${kind}: ${error}`)
    const { body } = signed

    for (let index = core.length - 1; index >= 0; index--) {
      const entry = await core.get(index, { wait: false })
      if (!isSignedEntry(entry)) continue
      if (entry.body?.author !== body.author || entry.body?.id !== body.id)
        continue
      if (canonicalJson(entry.body) !== canonicalJson(body))
        throw new Error('clientMessageId already identifies another message')
      if (kind === 'profile') return
      return readSignedMessageEntry(entry, channel.channelKey)
    }

    const entry = buildSignedEntry(
      signed,
      await this.#getNextChannelMessageTimestamp(channel.channelKey)
    )
    await core.append(entry)
    if (kind === 'profile') return
    const message = readSignedMessageEntry(entry, channel.channelKey)
    if (!this.#isChannelActive(channel.channelKey)) return message

    channel.lastMessageAt = new Date(message.timestamp).toISOString()
    this.#saveChannels()
    this.#cacheChannelMessages(channel.channelKey, [
      ...(this.#channelMessageCache.get(channel.channelKey) || []),
      message,
    ])
    this.#broadcastChannelHello()
    return message
  }

  getChannelPresence(input = {}) {
    this.#ensureReady()
    const channel = this.#resolvePresenceChannel(input)
    this.#pruneStaleChannelPresence()
    return this.#getChannelPresenceList(channel.channelKey)
  }

  #applyPresence(channel, body, session) {
    switch (body.status) {
      case 'online':
        return this.#upsertChannelPresenceSession(channel, session)
      case 'heartbeat':
        return this.#touchChannelPresenceSession(channel, session)
      case 'profile':
        return this.#updateChannelPresenceProfile(channel, session)
      case 'offline':
        return this.#removeChannelPresenceSessions(
          channel.channelKey,
          session
        ).at(-1)
    }
  }

  #acceptLocalPresence(input, status) {
    this.#ensureReady()
    const channel = this.#resolvePresenceChannel(input)
    const error = signedPresenceError(input.signed, {
      channelId: channel.channelKey,
      status,
    })
    if (error) throw new Error(error)
    const frame = createSignedPresenceFrame(
      JSON.parse(JSON.stringify(input.signed))
    )
    this.#applyPresence(channel, frame.body, {
      ...presenceSession(frame.body, 'local'),
      local: true,
      frame,
    })
    this.#broadcastChannelPresence(frame)
    this.#emitSnapshot()
    return this.#getChannelPresenceList(channel.channelKey)
  }

  joinChannelPresence(input = {}) {
    return this.#acceptLocalPresence(input, 'online')
  }

  heartbeatChannelPresence(input = {}) {
    return this.#acceptLocalPresence(input, 'heartbeat')
  }

  leaveChannelPresence(input = {}) {
    return this.#acceptLocalPresence(input, 'offline')
  }

  async publishFile(input = {}, requestId = createId('publish')) {
    this.#ensureReady()
    const fileName = sanitizeFilename(input.name || input.fileName)
    const transfer = this.#upsertTransfer({
      id: requestId,
      kind: 'publish',
      status: 'running',
      fileName,
      progress: 5,
      message: 'Calculating UnixFS CID',
    })

    try {
      const source = this.#createFileSource(input)
      const result = await calculateCid(source, (loaded, total) => {
        this.#patchTransfer(requestId, {
          progress: total > 0 ? 5 + Math.round((loaded / total) * 20) : 25,
          message: 'Calculating UnixFS CID',
        })
      })
      const cid = result.cid
      const size = result.size || Number(input.size) || 0
      const { driveName } = this.#getCidInfo(cid)
      const driveKey = `/${cid}`
      const drive = await this.#getOrCreateDrive(driveName)

      this.#upsertTransfer({
        ...transfer,
        cid,
        link: buildMostLink(cid, fileName),
        progress: 30,
        message: 'Writing file into Hyperdrive',
      })

      if (!(await this.#hasLocalCidContent(drive, driveKey))) {
        if (source.buffer) {
          await writeBufferToDrive(drive, driveKey, source.buffer)
        } else {
          await pipeFileToDrive(source.filePath, drive, driveKey)
        }
      }

      await this.#joinCidTopic(cid)
      const holding = this.#upsertHolding({
        cid,
        fileName,
        size,
        driveName,
        localPath: source.filePath,
        source: 'published',
      })

      const completed = this.#upsertTransfer({
        ...transfer,
        cid,
        link: buildMostLink(cid, fileName),
        status: 'completed',
        progress: 100,
        message: 'Published and seeding',
      })

      this.#log('info', `Published ${fileName} as ${cid.slice(0, 16)}`)
      return {
        transfer: completed,
        holding: this.#toMobileHolding(holding),
      }
    } catch (err) {
      const failed = this.#upsertTransfer({
        ...transfer,
        status: 'failed',
        progress: 0,
        message: err instanceof Error ? err.message : 'Publish failed',
      })
      this.#log('error', failed.message)
      throw err
    }
  }

  async downloadLink(input = {}, requestId = createId('download')) {
    this.#ensureReady()
    const parsed = splitMostLink(input.link)
    const cid = parsed.cid
    const fileName = sanitizeFilename(parsed.fileName)
    const { driveName } = this.#getCidInfo(cid)
    const driveKey = `/${cid}`
    const tempPath = path.join(this.#downloadPath, `${cid}.part`)

    if (this.#activeDownloadCids.has(cid)) {
      throw new Error('A download for this CID is already running')
    }

    this.#cancelledDownloads.delete(requestId)
    const transfer = this.#upsertTransfer({
      id: requestId,
      kind: 'download',
      status: 'running',
      fileName,
      cid,
      link: buildMostLink(cid, fileName),
      progress: 5,
      message: 'Connecting to CID topic',
    })

    this.#activeDownloadCids.add(cid)
    try {
      const drive = await this.#getOrCreateDrive(driveName)
      const existingHolding = this.#holdings.find(
        holding => holding.cid === cid
      )
      if (
        existingHolding &&
        (await this.#hasLocalCidContent(drive, driveKey))
      ) {
        await this.#joinCidTopic(cid)
        const completed = this.#upsertTransfer({
          ...transfer,
          status: 'completed',
          progress: 100,
          message: 'Already available in local holdings',
        })
        this.#log('info', `CID already exists locally ${cid.slice(0, 16)}`)
        return {
          transfer: completed,
          holding: this.#toMobileHolding(existingHolding),
          savedPath: existingHolding.localPath || '',
          alreadyExists: true,
        }
      }

      await this.#joinCidTopic(cid)

      this.#upsertTransfer({
        ...transfer,
        progress: 10,
        message: 'Finding peers',
      })

      const discoveryDeadline =
        Date.now() + (input.timeout || DOWNLOAD_DISCOVERY_TIMEOUT)
      const triedKeys = new Set()
      let sourceMismatch = null
      let totalBytes = 0
      let savePath = ''
      let downloaded = null
      for (;;) {
        const source = await this.#waitForRemoteCidDrive(
          cid,
          discoveryDeadline - Date.now(),
          requestId,
          triedKeys
        )
        if (!source) {
          throw (
            sourceMismatch || new Error('No online seed was found for this CID')
          )
        }
        try {
          const entry = source.entry
          totalBytes = Number(entry?.value?.blob?.byteLength) || 0
          savePath = uniqueSavePath(this.#downloadPath, fileName)
          let resumeBytes = fileExists(tempPath)
            ? fs.statSync(tempPath).size
            : 0
          if (resumeBytes > totalBytes) {
            safeRm(tempPath)
            resumeBytes = 0
          }

          this.#upsertTransfer({
            ...transfer,
            progress: 20,
            phase: 'downloading',
            totalBytes,
            completedBytes: resumeBytes,
            message: resumeBytes
              ? 'Resuming downloaded bytes'
              : 'Downloading file',
          })

          const readStream = source.drive.createReadStream(driveKey, {
            start: resumeBytes,
          })
          let loaded = 0
          await pipeDriveToFile(readStream, tempPath, {
            timeout: STREAM_READ_TIMEOUT,
            append: resumeBytes > 0,
            onProgress: nextLoaded => {
              this.#assertDownloadActive(requestId)
              loaded = resumeBytes + nextLoaded
              if (totalBytes > 0) {
                const progress = 20 + Math.round((loaded / totalBytes) * 60)
                this.#upsertTransfer({
                  ...transfer,
                  progress: Math.min(progress, 80),
                  completedBytes: loaded,
                  message: 'Downloading file',
                })
              }
            },
          })

          this.#assertDownloadActive(requestId)

          this.#upsertTransfer({
            ...transfer,
            progress: 85,
            phase: 'verifying',
            completedBytes: totalBytes,
            message: 'Verifying CID',
          })

          downloaded = await calculateCid(
            { filePath: tempPath },
            (loaded, total) => {
              this.#assertDownloadActive(requestId)
              this.#patchTransfer(requestId, {
                progress:
                  total > 0 ? 85 + Math.round((loaded / total) * 10) : 95,
                message: 'Verifying CID',
              })
            }
          )
          this.#assertDownloadActive(requestId)
          if (downloaded.cid !== cid) {
            safeRm(tempPath)
            sourceMismatch = new Error(
              `File content CID mismatch. Expected ${cid}, got ${downloaded.cid}.`
            )
            this.#log(
              'warn',
              `Seed drive ${source.keyHex.slice(0, 16)} served wrong content for ${cid.slice(0, 16)}`
            )
            // Resumed bytes came from an earlier attempt, so the mismatch
            // may be the cache's; retry this source from byte 0.
            if (resumeBytes > 0) triedKeys.delete(source.keyHex)
            continue
          }
          break
        } finally {
          if (!source.local) await source.drive.close().catch(() => {})
        }
      }

      fs.renameSync(tempPath, savePath)

      if (!(await this.#hasLocalCidContent(drive, driveKey))) {
        await pipeFileToDrive(savePath, drive, driveKey)
      }

      await this.#joinCidTopic(cid)
      const savedSize =
        downloaded.size || totalBytes || fs.statSync(savePath).size || 0
      const holding = this.#upsertHolding({
        cid,
        fileName,
        size: savedSize,
        driveName,
        localPath: savePath,
        source: 'downloaded',
      })

      const completed = this.#upsertTransfer({
        ...transfer,
        status: 'completed',
        progress: 100,
        message: `Downloaded to ${savePath}`,
        phase: 'completed',
        completedBytes: savedSize,
        totalBytes: savedSize,
      })

      this.#log('info', `Downloaded and seeding ${cid.slice(0, 16)}`)
      return {
        transfer: completed,
        holding: this.#toMobileHolding(holding),
        savedPath: savePath,
      }
    } catch (err) {
      if (tempPath && this.#cancelledDownloads.has(requestId)) safeRm(tempPath)
      const drive = this.#drives.get(driveName)
      if (!drive || !(await this.#hasLocalCidContent(drive, driveKey))) {
        await this.#leaveCidTopic(cid)
        if (this.#holdings.some(holding => holding.cid === cid)) {
          this.#setSeedState(cid, {
            status: 'error',
            localAvailable: false,
            error: 'Local CID content is missing; publish or download it again',
          })
        }
      }
      const failed = this.#upsertTransfer({
        ...transfer,
        status: 'failed',
        progress: 0,
        message: err instanceof Error ? err.message : 'Download failed',
      })
      this.#log('error', failed.message)
      throw err
    } finally {
      this.#cancelledDownloads.delete(requestId)
      this.#activeDownloadCids.delete(cid)
    }
  }

  async cancelDownload(input = {}) {
    this.#ensureReady()
    const { cid } = getCidInfo(input.cid)
    const transfers = this.#transfers.filter(
      transfer =>
        transfer.kind === 'download' &&
        transfer.cid === cid &&
        transfer.status === 'running'
    )

    for (const transfer of transfers) {
      this.#cancelledDownloads.add(transfer.id)
      this.#patchTransfer(transfer.id, {
        status: 'failed',
        progress: 0,
        message: 'Download cancelled',
      })
    }

    if (transfers.length > 0) await this.#leaveCidTopic(cid)
    return { cid, snapshot: this.getSnapshot() }
  }

  async deleteHolding(input = {}) {
    this.#ensureReady()
    const { cid, driveName } = this.#getCidInfo(input.cid)
    const existing = this.#holdings.find(holding => holding.cid === cid)
    if (!existing) {
      throw new Error('This CID is not available in local holdings')
    }

    await this.#leaveCidTopic(cid)
    await this.#clearLocalCidContent(cid, driveName)

    for (const cleanupPath of getInternalHoldingCleanupPaths(
      {
        localPath: existing.localPath,
        downloadPath: this.#downloadPath,
      },
      path
    )) {
      if (fileExists(cleanupPath)) safeRm(cleanupPath)
    }

    this.#removeHolding(cid)
    this.#log('info', `Deleted local holding ${cid.slice(0, 16)}`)

    return {
      cid,
      snapshot: this.getSnapshot(),
    }
  }

  async exportHolding(input = {}) {
    this.#ensureReady()
    const { cid, driveName } = this.#getCidInfo(input.cid)
    const existing = this.#holdings.find(holding => holding.cid === cid)
    if (!existing) {
      throw new Error('This CID is not available in local holdings')
    }

    const fileName = sanitizeFilename(
      input.fileName || existing.fileName || cid
    )
    let exportPath = existing.localPath || ''
    let holding = existing
    const drive = await this.#getOrCreateDrive(driveName)
    const driveKey = `/${cid}`
    if (!(await this.#hasLocalCidContent(drive, driveKey))) {
      await this.#leaveCidTopic(cid)
      this.#setSeedState(cid, {
        status: 'error',
        localAvailable: false,
        error: 'Local CID content is missing; publish or download it again',
      })
      throw new Error('Local Hyperdrive content is not available for export')
    }

    const cachedContent = fileExists(exportPath)
      ? await calculateCid({ filePath: exportPath }).catch(() => null)
      : null

    if (cachedContent?.cid !== cid) {
      exportPath = uniqueSavePath(this.#downloadPath, fileName)
      const tempPath = `${exportPath}.part`
      safeRm(tempPath)

      try {
        await pipeDriveToFile(drive.createReadStream(driveKey), tempPath, {
          timeout: STREAM_READ_TIMEOUT,
        })

        const exported = await calculateCid({ filePath: tempPath })
        if (exported.cid !== cid) {
          throw new Error(
            `Exported file CID mismatch. Expected ${cid}, got ${exported.cid}.`
          )
        }

        fs.renameSync(tempPath, exportPath)
        holding = this.#upsertHolding({
          ...existing,
          fileName,
          size: exported.size || existing.size,
          localPath: exportPath,
        })
      } catch (err) {
        safeRm(tempPath)
        throw err
      }
    }

    this.#log('info', `Prepared ${fileName} for export`)
    return {
      filePath: exportPath,
      fileName,
      size: holding.size,
      holding: this.#toMobileHolding(holding),
    }
  }

  async #openChannelRuntime(channel) {
    const existingMap = this.#channelCores.get(channel.channelKey)
    if (
      channel.localWriterCoreKey &&
      existingMap?.has(channel.localWriterCoreKey)
    ) {
      this.#channelLocalCoreKey.set(
        channel.channelKey,
        channel.localWriterCoreKey
      )
      for (const writerCoreKey of channel.writerCoreKeys || []) {
        if (
          writerCoreKey &&
          writerCoreKey !== channel.localWriterCoreKey &&
          !existingMap.has(writerCoreKey)
        ) {
          await this.#openRemoteChannelCore(channel.channelKey, writerCoreKey)
        }
      }
      return
    }

    const ns = this.#store.namespace(`channel-${channel.channelKey}`)
    const generation = Number.isInteger(channel.writerGeneration)
      ? channel.writerGeneration
      : 0
    channel.writerGeneration = generation
    const keyPair = channelWriterKeyPair(
      this.#cidDriveSecret,
      channel.channelKey,
      generation
    )
    // Explicit manifest: the core key is the manifest hash, so pinning its
    // version keeps this node's writer core key stable across library updates.
    const localCore = ns.get({
      keyPair,
      manifest: { version: 1, signers: [{ publicKey: keyPair.publicKey }] },
      valueEncoding: 'json',
    })
    await localCore.ready()

    const localWriterCoreKey = b4a.toString(localCore.key, 'hex')
    channel.localWriterCoreKey = localWriterCoreKey
    channel.writerCoreKeys = uniqueStrings([
      ...(Array.isArray(channel.writerCoreKeys) ? channel.writerCoreKeys : []),
      localWriterCoreKey,
    ])

    if (!this.#channelCores.has(channel.channelKey)) {
      this.#channelCores.set(channel.channelKey, new Map())
    }
    this.#channelCores
      .get(channel.channelKey)
      .set(localWriterCoreKey, localCore)
    this.#channelLocalCoreKey.set(channel.channelKey, localWriterCoreKey)
    if (!this.#channelPeers.has(channel.channelKey)) {
      this.#channelPeers.set(channel.channelKey, new Map())
    }
    this.#setupChannelAppendListener(localCore, channel.channelKey)

    for (const writerCoreKey of channel.writerCoreKeys) {
      if (writerCoreKey && writerCoreKey !== localWriterCoreKey) {
        await this.#openRemoteChannelCore(channel.channelKey, writerCoreKey)
      }
    }
  }

  async #mergeChannelWriterCoreKeys(channel, writerCoreKeys = []) {
    const nextKeys = uniqueStrings(writerCoreKeys)
      .filter(key => HEX_64_REGEX.test(key))
      .slice(0, MAX_HELLO_WRITER_CORE_KEYS)
    if (nextKeys.length === 0) return false

    const previous = new Set(channel.writerCoreKeys || [])
    let changed = false
    for (const writerCoreKey of nextKeys) {
      if (!previous.has(writerCoreKey)) {
        previous.add(writerCoreKey)
        changed = true
      }
      if (writerCoreKey !== this.#channelLocalCoreKey.get(channel.channelKey)) {
        await this.#openRemoteChannelCore(channel.channelKey, writerCoreKey)
      }
    }
    if (changed) {
      channel.writerCoreKeys = [...previous]
      this.#saveChannels()
    }
    return changed
  }

  async #joinChannelDiscoveryTopics(channel) {
    if (!this.#channelDiscoveries.has(channel.channelKey)) {
      const discovery = this.#swarm.join(
        channelTopics(b4a.from(channel.secretKey, 'hex')).replication,
        { server: true, client: true }
      )
      this.#channelDiscoveries.set(channel.channelKey, discovery)
      discovery.flushed?.().then(
        () => this.#emitSnapshot(),
        () => {}
      )
    }

    if (!this.#channelChatDiscoveries.has(channel.channelKey)) {
      const discovery = this.#chatSwarm.join(
        channelTopics(b4a.from(channel.secretKey, 'hex')).chat,
        { server: true, client: true }
      )
      this.#channelChatDiscoveries.set(channel.channelKey, discovery)
      discovery.flushed?.().then(
        () => this.#emitSnapshot(),
        () => {}
      )
    }
  }

  #resolveChannel(channelKeyInput) {
    const key = normalizeChannelKey(channelKeyInput)
    const resolvedKey = resolveChannelHandle(key)?.channelKey
    const channel = this.#channels.find(
      item =>
        item.channelKey === key ||
        item.channelId === key ||
        item.channelKey === resolvedKey
    )
    if (!channel) throw new Error('Channel does not exist')
    return channel
  }

  #resolvePresenceChannel(input = {}) {
    const channelName =
      typeof input === 'string'
        ? input
        : input.channelName || input.channel || input.name
    return this.#resolveChannel(channelName)
  }

  #isChannelActive(channelKey) {
    return this.#channels.some(channel => channel.channelKey === channelKey)
  }

  async #getNextChannelMessageTimestamp(channelKey) {
    const coresMap = this.#channelCores.get(channelKey)
    const now = Date.now()
    const limit = now + SIGNED_TS_FUTURE_LIMIT_MS
    let maxTimestamp = 0

    if (coresMap) {
      for (const [, core] of coresMap) {
        for (let i = 0; i < core.length; i++) {
          try {
            // A missing peer block must not prevent this writer sending offline.
            const entry = await core.get(i, { wait: false })
            if (entry === null) break
            if (
              entry.ts <= limit &&
              (readSignedMessageEntry(entry, channelKey) ||
                readSignedProfileEntry(entry, channelKey, now))
            ) {
              maxTimestamp = Math.max(maxTimestamp, entry.ts)
            }
          } catch {
            break
          }
        }
      }
    }

    return Math.max(now, maxTimestamp + 1)
  }

  #setupChannelAppendListener(core, channelKey) {
    let lastCoreLength = core.length
    core.on('append', async () => {
      if (core.length <= lastCoreLength) return
      if (!this.#isChannelActive(channelKey)) {
        lastCoreLength = core.length
        return
      }

      for (let i = lastCoreLength; i < core.length; i++) {
        try {
          const entry = await core.get(i)
          if (!this.#isChannelActive(channelKey)) {
            lastCoreLength = core.length
            return
          }
          const message = readSignedMessageEntry(entry, channelKey)
          if (!message) continue
          const channel = this.#channels.find(c => c.channelKey === channelKey)
          if (!channel) {
            lastCoreLength = core.length
            return
          }
          const entryTime = Number(message.timestamp) || Date.now()
          const currentTime = Date.parse(channel.lastMessageAt || '') || 0
          if (entryTime > currentTime) {
            if (!this.#isChannelActive(channelKey)) {
              lastCoreLength = core.length
              return
            }
            channel.lastMessageAt = new Date(entryTime).toISOString()
            this.#saveChannels()
          }
          if (!this.#isChannelActive(channelKey)) {
            lastCoreLength = core.length
            return
          }
          this.#cacheChannelMessages(channelKey, [
            ...(this.#channelMessageCache.get(channelKey) || []),
            message,
          ])
          if (!this.#isChannelActive(channelKey)) {
            this.#channelMessageCache.delete(channelKey)
            lastCoreLength = core.length
            return
          }
          this.#send('channel.message', {
            channel: channelKey,
            channelKey,
            channelId: channel?.channelId || '',
            message,
            snapshot: this.getSnapshot(),
          })
          if (!this.#isChannelActive(channelKey)) {
            lastCoreLength = core.length
            return
          }
          this.#emitSnapshot()
        } catch (err) {
          this.#log('warn', `Failed to read channel message: ${err.message}`)
        }
      }

      lastCoreLength = core.length
    })
  }

  async #openRemoteChannelCore(channelKey, coreKeyHex) {
    // Hellos can arrive back to back; open each remote core only once.
    const openingKey = `${channelKey}:${coreKeyHex}`
    if (this.#channelCoresOpening.has(openingKey)) return
    this.#channelCoresOpening.add(openingKey)
    try {
      await this.#openRemoteChannelCoreOnce(channelKey, coreKeyHex)
    } finally {
      this.#channelCoresOpening.delete(openingKey)
    }
  }

  async #openRemoteChannelCoreOnce(channelKey, coreKeyHex) {
    const coresMap = this.#channelCores.get(channelKey)
    if (!coresMap || !coreKeyHex || coresMap.has(coreKeyHex)) return

    try {
      const ns = this.#store.namespace(`channel-${channelKey}`)
      const core = ns.get({
        key: b4a.from(coreKeyHex, 'hex'),
        valueEncoding: 'json',
      })
      await core.ready()
      // Fetch every block, now and as the writer appends; history reads
      // only use local blocks and do not request missing ones.
      core.download({ start: 0, end: -1 })
      const normalizedCoreKey = b4a.toString(core.key, 'hex')
      coresMap.set(normalizedCoreKey, core)
      this.#setupChannelAppendListener(core, channelKey)
      const channel = this.#channels.find(c => c.channelKey === channelKey)
      if (channel && !channel.writerCoreKeys?.includes(normalizedCoreKey)) {
        channel.writerCoreKeys = uniqueStrings([
          ...(channel.writerCoreKeys || []),
          normalizedCoreKey,
        ])
        this.#saveChannels()
      }
    } catch (err) {
      this.#log('warn', `Failed to open remote channel core: ${err.message}`)
    }
  }

  #addChannelTopicMapping(topicMap, topic, channelIdInput) {
    const channelId = normalizeChannelId(channelIdInput)
    const [topicHex] = normalizeChannelScopeTopics([b4a.toString(topic, 'hex')])
    if (!channelId || !topicHex) return
    const channelIds = topicMap.get(topicHex) || new Set()
    channelIds.add(channelId)
    topicMap.set(topicHex, channelIds)
  }

  #getChannelTopicMap() {
    const topicMap = new Map()
    for (const [channelKey] of this.#channelChatDiscoveries) {
      const channel = this.#channels.find(
        item => item.channelKey === channelKey
      )
      if (!channel) continue
      this.#addChannelTopicMapping(
        topicMap,
        channelTopics(b4a.from(channel.secretKey, 'hex')).chat,
        channel.channelKey
      )
    }
    return topicMap
  }

  #getVerifiedChannelTopics(stream) {
    const record = this.#channelStreams.get(stream)
    const topicMap = this.#getChannelTopicMap()
    let topics = []
    try {
      topics = Array.isArray(record?.info?.topics) ? record.info.topics : []
    } catch {}
    return normalizeChannelScopeTopics(
      topics.map(topic =>
        typeof topic === 'string' ? topic : b4a.toString(topic, 'hex')
      )
    ).filter(topicHex => topicMap.has(topicHex))
  }

  #getAuthorizedChannelIds(stream) {
    const record = this.#channelStreams.get(stream)
    const topicMap = this.#getChannelTopicMap()
    const channelIds = new Set()
    for (const topicHex of record?.authorizedTopics || []) {
      for (const channelId of topicMap.get(topicHex) || []) {
        channelIds.add(channelId)
      }
    }
    return channelIds
  }

  #getChannelProofPublicKeys(stream) {
    const record = this.#channelStreams.get(stream)
    return {
      localPublicKey: this.#chatSwarm?.keyPair?.publicKey,
      remotePublicKey: stream?.remotePublicKey || record?.info?.publicKey,
    }
  }

  #sendChannelProofChallenge(stream) {
    const record = this.#channelStreams.get(stream)
    if (!record) return false
    if (record.localChallenge) return true
    if (!stream || stream.destroyed || stream.writableEnded) {
      this.#removeChannelStream(stream)
      return false
    }

    try {
      record.localChallenge = createChannelProofChallenge()
      stream.write(
        b4a.from(
          `${JSON.stringify({
            type: 'channel-proof-challenge',
            version: CHANNEL_PROOF_VERSION,
            challenge: record.localChallenge,
          })}\n`
        )
      )
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #sendAvailableChannelProofs(stream) {
    const record = this.#channelStreams.get(stream)
    if (!record?.remoteChallenge) return true
    if (!stream || stream.destroyed || stream.writableEnded) {
      this.#removeChannelStream(stream)
      return false
    }

    const topicMap = this.#getChannelTopicMap()
    const topics = new Set([
      ...this.#getVerifiedChannelTopics(stream),
      ...record.remoteClaimedTopics,
    ])
    const { localPublicKey, remotePublicKey } =
      this.#getChannelProofPublicKeys(stream)
    const proofs = []
    for (const topic of topics) {
      if (record.proofSentTopics.has(topic)) continue
      const channelKey = topicMap.get(topic)?.values().next().value
      const key = channelKey ? this.#channelSecretKey(channelKey) : null
      if (!key) continue
      const proofBytes = createChannelProof({
        key,
        topic,
        challenge: record.remoteChallenge,
        proverPublicKey: localPublicKey,
        verifierPublicKey: remotePublicKey,
      })
      if (!proofBytes) continue
      const proof = b4a.toString(proofBytes, 'hex')
      record.proofSentTopics.add(topic)
      proofs.push({ topic, proof })
    }

    try {
      for (
        let index = 0;
        index < proofs.length;
        index += MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME
      ) {
        stream.write(
          b4a.from(
            `${JSON.stringify({
              type: 'channel-proof',
              version: CHANNEL_PROOF_VERSION,
              challenge: record.remoteChallenge,
              proofs: proofs.slice(
                index,
                index + MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME
              ),
            })}\n`
          )
        )
      }
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #channelSecretKey(channelKey) {
    const channel = this.#channels.find(item => item.channelKey === channelKey)
    return channel?.secretKey ? b4a.from(channel.secretKey, 'hex') : null
  }

  #isChannelAllowedForStream(stream, channelKey) {
    return this.#getAuthorizedChannelIds(stream).has(
      normalizeChannelKey(channelKey)
    )
  }

  #buildChannelHelloMessages(stream) {
    const authorized = this.#getAuthorizedChannelIds(stream)
    const selectedChannels = this.#channels.filter(channel =>
      authorized.has(channel.channelKey)
    )
    // On the wire a channel is identified only by its public ID.
    const channels = selectedChannels.map(channel => ({
      channelId: channel.channelKey,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerCoreKeys: uniqueStrings([
        ...(channel.writerCoreKeys || []),
        this.#channelLocalCoreKey.get(channel.channelKey),
      ]),
    }))

    return buildChannelHelloMessages(
      {
        type: 'channel-hello',
        peerId: this.#nodeId(),
        authorName: this.#nodeId().slice(0, 4),
      },
      channels,
      MAX_CHANNEL_FRAME_BYTES
    )
  }

  #removeChannelStream(stream) {
    this.#channelStreams.delete(stream)
  }

  #sendChannelScopes(stream) {
    if (!stream || stream.destroyed || stream.writableEnded) {
      this.#removeChannelStream(stream)
      return false
    }
    try {
      for (const topics of chunkChannelScopeTopics(
        this.#getVerifiedChannelTopics(stream)
      )) {
        stream.write(
          b4a.from(`${JSON.stringify({ type: 'channel-scope', topics })}\n`)
        )
      }
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #sendChannelHello(stream, options = {}) {
    if (!stream || stream.destroyed || stream.writableEnded) {
      this.#removeChannelStream(stream)
      return false
    }
    if (options.sendScope !== false) {
      if (!this.#sendChannelProofChallenge(stream)) return false
      if (!this.#sendChannelScopes(stream)) return false
      if (!this.#sendAvailableChannelProofs(stream)) return false
    }
    if (this.#getAuthorizedChannelIds(stream).size === 0) return true
    try {
      for (const message of this.#buildChannelHelloMessages(stream)) {
        stream.write(b4a.from(`${JSON.stringify(message)}\n`))
      }
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #broadcastChannelHello() {
    for (const stream of [...this.#channelStreams.keys()]) {
      this.#sendChannelHello(stream)
    }
  }

  #sendChannelPresence(stream, frame) {
    if (!stream || stream.destroyed || stream.writableEnded) {
      this.#removeChannelStream(stream)
      return false
    }
    if (!this.#isChannelAllowedForStream(stream, frame.body.channelId))
      return true
    try {
      stream.write(b4a.from(JSON.stringify(frame) + '\n'))
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #sendCurrentChannelPresence(stream) {
    this.#pruneStaleChannelPresence()
    for (const sessions of this.#channelPresenceSessions.values()) {
      for (const session of sessions.values()) {
        if (session.frame) this.#sendChannelPresence(stream, session.frame)
      }
    }
  }

  #broadcastChannelPresence(event) {
    for (const stream of [...this.#channelStreams.keys()]) {
      this.#sendChannelPresence(stream, event)
    }
  }

  #normalizePresenceSessionId(sessionId) {
    const value = String(sessionId || 'default')
      .trim()
      .slice(0, 120)
    return value || 'default'
  }

  #normalizePresenceSourceId(options = {}) {
    const sourceId = String(options.sourceId || '').trim()
    if (sourceId) return sourceId.slice(0, 160)
    const sourcePeerId = String(options.sourcePeerId || '').trim()
    if (sourcePeerId) return `peer:${sourcePeerId}`.slice(0, 180)
    return 'local'
  }

  #getPresenceSessionKey(options = {}) {
    return [
      this.#normalizePresenceSourceId(options),
      normalizeChannelPresenceAddress(options.address),
      this.#normalizePresenceSessionId(options.sessionId),
    ].join(':')
  }

  #getChannelPresenceSessionMap(channelKey) {
    if (!this.#channelPresenceSessions.has(channelKey)) {
      this.#channelPresenceSessions.set(channelKey, new Map())
    }
    return this.#channelPresenceSessions.get(channelKey)
  }

  #getChannelPresenceProfileMap(channelKey) {
    if (!this.#channelPresenceProfiles.has(channelKey)) {
      this.#channelPresenceProfiles.set(channelKey, new Map())
    }
    return this.#channelPresenceProfiles.get(channelKey)
  }

  #isChannelPresenceAddressOnline(channelKey, address) {
    const normalizedAddress = normalizeChannelPresenceAddress(address)
    if (!normalizedAddress) return false
    const sessions = this.#channelPresenceSessions.get(channelKey)
    if (!sessions) return false
    return [...sessions.values()].some(
      session => session.address === normalizedAddress
    )
  }

  #getChannelPresenceList(channelKey) {
    const sessions = this.#channelPresenceSessions.get(channelKey)
    if (!sessions) return []
    const addresses = uniqueStrings(
      [...sessions.values()].map(session => session.address)
    )
    return addresses
      .map(address => this.#formatChannelPresence(channelKey, address))
      .filter(Boolean)
  }

  #formatChannelPresence(
    channelKey,
    address,
    status = 'online',
    eventSessionId = ''
  ) {
    const normalizedAddress = normalizeChannelPresenceAddress(address)
    if (!normalizedAddress) return null
    const sessions = [
      ...(this.#channelPresenceSessions.get(channelKey)?.values() || []),
    ].filter(session => session.address === normalizedAddress)
    const profile = this.#channelPresenceProfiles
      .get(channelKey)
      ?.get(normalizedAddress)
    const lastSeen = Math.max(
      0,
      Number(profile?.lastSeen) || 0,
      ...sessions.map(session => Number(session.lastSeen) || 0)
    )
    return {
      channelKey,
      channelId:
        this.#channels.find(channel => channel.channelKey === channelKey)
          ?.channelId || channelKey,
      address: normalizedAddress,
      displayName: profile?.displayName || undefined,
      avatar: profile?.avatar || undefined,
      profileUpdatedAt: profile?.profileUpdatedAt || undefined,
      lastSeen,
      online: sessions.length > 0,
      local: sessions.some(session => session.local),
      status,
      sessionId:
        eventSessionId ||
        sessions.find(session => session.address === normalizedAddress)
          ?.sessionId ||
        'default',
    }
  }

  #upsertChannelPresenceProfile(
    channelKey,
    address,
    options = {},
    now = Date.now()
  ) {
    const normalizedAddress = normalizeChannelPresenceAddress(address)
    if (!normalizedAddress) return false
    const hasDisplayName = Object.prototype.hasOwnProperty.call(
      options,
      'displayName'
    )
    const hasAvatar = Object.prototype.hasOwnProperty.call(options, 'avatar')
    const profileUpdatedAt = Number(options.profileUpdatedAt)
    const hasProfileUpdatedAt =
      Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0
    if (!hasDisplayName && !hasAvatar && !hasProfileUpdatedAt) return false

    const profiles = this.#getChannelPresenceProfileMap(channelKey)
    const previous = profiles.get(normalizedAddress)
    const nextUpdatedAt = hasProfileUpdatedAt
      ? Math.floor(profileUpdatedAt)
      : now
    if (
      previous?.profileUpdatedAt &&
      hasProfileUpdatedAt &&
      nextUpdatedAt < previous.profileUpdatedAt
    ) {
      return false
    }

    const next = {
      address: normalizedAddress,
      displayName: previous?.displayName || '',
      avatar: previous?.avatar || '',
      profileUpdatedAt: nextUpdatedAt,
      lastSeen: now,
    }
    if (hasDisplayName) {
      next.displayName = normalizeChannelPresenceDisplayName(
        options.displayName,
        normalizedAddress
      )
    }
    if (hasAvatar) {
      next.avatar = normalizeChannelPresenceAvatar(options.avatar)
    }

    const changed =
      !previous ||
      previous.displayName !== next.displayName ||
      previous.avatar !== next.avatar ||
      previous.profileUpdatedAt !== next.profileUpdatedAt
    profiles.set(normalizedAddress, next)
    return changed
  }

  #upsertChannelPresenceSession(channel, options = {}) {
    const address = normalizeChannelPresenceAddress(options.address)
    if (!address) return null
    const now = Number(options.lastSeen) || Date.now()
    const channelKey = channel.channelKey
    const wasOnline = this.#isChannelPresenceAddressOnline(channelKey, address)
    const session = {
      sessionId: this.#normalizePresenceSessionId(options.sessionId),
      sourceId: this.#normalizePresenceSourceId(options),
      address,
      channelKey,
      lastSeen: now,
      frame: options.frame,
      local: options.local === true,
      sourcePeerId: String(options.sourcePeerId || '').trim(),
    }
    this.#getChannelPresenceSessionMap(channelKey).set(
      this.#getPresenceSessionKey(session),
      session
    )
    const profileChanged = this.#upsertChannelPresenceProfile(
      channelKey,
      address,
      options,
      now
    )
    if (!wasOnline) {
      return this.#formatChannelPresence(channelKey, address, 'online')
    }
    if (profileChanged) {
      return this.#formatChannelPresence(channelKey, address, 'profile')
    }
    return null
  }

  #touchChannelPresenceSession(channel, options = {}) {
    const address = normalizeChannelPresenceAddress(options.address)
    if (!address) return null
    const channelKey = channel.channelKey
    const sessionKey = this.#getPresenceSessionKey({
      ...options,
      address,
    })
    const sessions = this.#getChannelPresenceSessionMap(channelKey)
    const existing = sessions.get(sessionKey)
    if (!existing) {
      return this.#upsertChannelPresenceSession(channel, {
        ...options,
        address,
      })
    }
    existing.frame = options.frame
    existing.lastSeen = Number(options.lastSeen) || Date.now()
    sessions.set(sessionKey, existing)
    return null
  }

  #updateChannelPresenceProfile(channel, options = {}) {
    const address = normalizeChannelPresenceAddress(options.address)
    if (!address) return null
    const now = Number(options.lastSeen) || Date.now()
    const changed = this.#upsertChannelPresenceProfile(
      channel.channelKey,
      address,
      options,
      now
    )
    if (
      changed &&
      this.#isChannelPresenceAddressOnline(channel.channelKey, address)
    ) {
      return this.#formatChannelPresence(channel.channelKey, address, 'profile')
    }
    return null
  }

  #removeChannelPresenceSessions(channelKey, options = {}) {
    const address = normalizeChannelPresenceAddress(options.address)
    const sourceId = this.#normalizePresenceSourceId(options)
    const sessionId = options.sessionId
      ? this.#normalizePresenceSessionId(options.sessionId)
      : ''
    const sessions = this.#channelPresenceSessions.get(channelKey)
    if (!sessions || (!address && !sourceId)) return []

    const touchedAddresses = new Set()
    const lastSessionByAddress = new Map()
    for (const [key, session] of [...sessions]) {
      if (address && session.address !== address) continue
      if (sourceId && session.sourceId !== sourceId) continue
      if (sessionId && session.sessionId !== sessionId) continue
      touchedAddresses.add(session.address)
      lastSessionByAddress.set(session.address, session)
      sessions.delete(key)
    }
    if (sessions.size === 0) {
      this.#channelPresenceSessions.delete(channelKey)
    }

    return [...touchedAddresses]
      .filter(item => !this.#isChannelPresenceAddressOnline(channelKey, item))
      .map(item =>
        this.#formatChannelPresence(
          channelKey,
          item,
          'offline',
          lastSessionByAddress.get(item)?.sessionId
        )
      )
      .filter(Boolean)
  }

  #clearChannelPresenceForChannel(channelKey) {
    this.#channelPresenceSessions.delete(channelKey)
    this.#channelPresenceProfiles.delete(channelKey)
  }

  #removeChannelPresenceSessionsBySource(sourceId) {
    const normalizedSourceId = String(sourceId || '').trim()
    if (!normalizedSourceId) return []
    const events = []
    for (const [channelKey, sessions] of [...this.#channelPresenceSessions]) {
      const touchedAddresses = new Set()
      const lastSessionByAddress = new Map()
      for (const [key, session] of [...sessions]) {
        if (session.sourceId !== normalizedSourceId) continue
        touchedAddresses.add(session.address)
        lastSessionByAddress.set(session.address, session)
        sessions.delete(key)
      }
      if (sessions.size === 0) {
        this.#channelPresenceSessions.delete(channelKey)
      }
      for (const address of touchedAddresses) {
        if (!this.#isChannelPresenceAddressOnline(channelKey, address)) {
          const event = this.#formatChannelPresence(
            channelKey,
            address,
            'offline',
            lastSessionByAddress.get(address)?.sessionId
          )
          if (event) events.push(event)
        }
      }
    }
    return events
  }

  #pruneStaleChannelPresence(now = Date.now()) {
    const events = []
    for (const [channelKey, sessions] of [...this.#channelPresenceSessions]) {
      const touchedAddresses = new Set()
      const lastSessionByAddress = new Map()
      for (const [key, session] of [...sessions]) {
        if (now - session.lastSeen <= this.#channelPresenceTimeoutMs) continue
        touchedAddresses.add(session.address)
        lastSessionByAddress.set(session.address, session)
        sessions.delete(key)
      }
      if (sessions.size === 0) {
        this.#channelPresenceSessions.delete(channelKey)
      }
      for (const address of touchedAddresses) {
        if (!this.#isChannelPresenceAddressOnline(channelKey, address)) {
          const event = this.#formatChannelPresence(
            channelKey,
            address,
            'offline',
            lastSessionByAddress.get(address)?.sessionId
          )
          if (event) events.push(event)
        }
      }
    }
    return events
  }

  #startChannelPresenceSweeper() {
    if (this.#channelPresenceSweepTimer) return
    this.#channelPresenceSweepTimer = setInterval(() => {
      const events = this.#pruneStaleChannelPresence()
      if (events.length > 0) {
        this.#send('channel.presence', {
          presence: events[events.length - 1],
          snapshot: this.getSnapshot(),
        })
        this.#emitSnapshot()
      }
    }, this.#channelPresenceSweepMs)
    this.#channelPresenceSweepTimer.unref?.()
  }

  #clearChannelPresenceRuntime() {
    if (this.#channelPresenceSweepTimer) {
      clearInterval(this.#channelPresenceSweepTimer)
      this.#channelPresenceSweepTimer = null
    }
    this.#channelPresenceSessions.clear()
    this.#channelPresenceProfiles.clear()
  }

  #emitChannelPresenceSnapshot(event = null) {
    this.#send('channel.presence', {
      presence: event,
      snapshot: this.getSnapshot(),
    })
    this.#emitSnapshot()
  }

  #processChannelScopeMessage(stream, msg) {
    if (msg.type !== 'channel-scope') return false
    if (
      !Array.isArray(msg.topics) ||
      msg.topics.length > MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME
    ) {
      throw new RangeError('Invalid channel scope frame')
    }

    const record = this.#channelStreams.get(stream)
    if (!record) return true
    const topicMap = this.#getChannelTopicMap()
    for (const topicHex of normalizeChannelScopeTopics(msg.topics)) {
      if (!topicMap.has(topicHex)) continue
      record.remoteClaimedTopics.add(topicHex)
    }
    this.#sendAvailableChannelProofs(stream)
    return true
  }

  #processChannelProofChallengeMessage(stream, msg) {
    if (msg.type !== 'channel-proof-challenge') return false
    const record = this.#channelStreams.get(stream)
    if (!record || msg.version !== CHANNEL_PROOF_VERSION) return true

    const challenge = normalizeChannelProofChallenge(msg.challenge)
    if (!challenge) return true
    if (record.remoteChallenge && record.remoteChallenge !== challenge) {
      return true
    }
    record.remoteChallenge = challenge
    this.#sendAvailableChannelProofs(stream)
    return true
  }

  #processChannelProofMessage(stream, msg) {
    if (msg.type !== 'channel-proof') return false
    const record = this.#channelStreams.get(stream)
    if (
      !record ||
      msg.version !== CHANNEL_PROOF_VERSION ||
      normalizeChannelProofChallenge(msg.challenge) !== record.localChallenge ||
      !Array.isArray(msg.proofs) ||
      msg.proofs.length > MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME
    ) {
      return true
    }

    const topicMap = this.#getChannelTopicMap()
    const expectedTopics = new Set([
      ...this.#getVerifiedChannelTopics(stream),
      ...record.remoteClaimedTopics,
    ])
    const { localPublicKey, remotePublicKey } =
      this.#getChannelProofPublicKeys(stream)
    let changed = false
    for (const item of msg.proofs) {
      const [topic] = normalizeChannelScopeTopics([item?.topic])
      if (
        !topic ||
        !expectedTopics.has(topic) ||
        record.authorizedTopics.has(topic)
      ) {
        continue
      }
      const channelKeys = topicMap.get(topic) || []
      const valid = [...channelKeys].some(channelKey => {
        const key = this.#channelSecretKey(channelKey)
        return (
          key &&
          verifyChannelProof(
            {
              key,
              topic,
              challenge: record.localChallenge,
              proverPublicKey: remotePublicKey,
              verifierPublicKey: localPublicKey,
            },
            String(item?.proof || '')
          )
        )
      })
      if (!valid) continue
      record.authorizedTopics.add(topic)
      changed = true
    }

    if (changed) {
      this.#sendChannelHello(stream, { sendScope: false })
      this.#sendCurrentChannelPresence(stream)
    }
    return true
  }

  #processChannelPresenceMessage(stream, msg, sourceId) {
    const channel = this.#channels.find(
      item => item.channelKey === msg.body?.channelId
    )
    if (
      !channel ||
      !this.#isChannelAllowedForStream(stream, channel.channelKey)
    )
      return
    if (!readSignedPresenceFrame(msg, { channelId: channel.channelKey })) return
    const event = this.#applyPresence(
      channel,
      msg.body,
      presenceSession(msg.body, sourceId)
    )
    this.#emitChannelPresenceSnapshot(event)
  }

  async #processChannelHelloMessage(stream, msg) {
    if (msg.type !== 'channel-hello') return null
    const peerId = String(msg.peerId || '').trim()
    if (!peerId || peerId === this.#nodeId()) return null

    const authorized = this.#getAuthorizedChannelIds(stream)
    // v2: channelId on the wire is the 64-hex public channel ID.
    const remoteChannels = (Array.isArray(msg.channels) ? msg.channels : [])
      .filter(channel => channel && typeof channel === 'object')
      .map(channel => ({
        channelKey: normalizeChannelKey(channel.channelId),
        writerCoreKeys: Array.isArray(channel.writerCoreKeys)
          ? channel.writerCoreKeys
          : [],
      }))
      .filter(
        channel =>
          HEX_64_REGEX.test(channel.channelKey) &&
          authorized.has(channel.channelKey)
      )
    if (remoteChannels.length === 0) return null

    let writerKeysChanged = false
    for (const remoteChannel of remoteChannels) {
      const localChannel = this.#channels.find(
        channel => channel.channelKey === remoteChannel.channelKey
      )
      if (!localChannel) continue

      const peers = this.#channelPeers.get(localChannel.channelKey)
      if (peers) {
        peers.set(peerId, {
          peerId,
          authorName: msg.authorName,
          lastSeen: Date.now(),
        })
      }

      if (
        await this.#mergeChannelWriterCoreKeys(
          localChannel,
          remoteChannel.writerCoreKeys
        )
      ) {
        writerKeysChanged = true
      }
    }
    // Pass newly learned writer cores on, so peers connected only through
    // this node also learn them (chat.md §4).
    if (writerKeysChanged) this.#broadcastChannelHello()

    this.#send('channel.status', {
      peerId,
      snapshot: this.getSnapshot(),
    })
    return peerId
  }

  async #handleChannelConnection(conn, info = {}) {
    const stream = conn
    const presenceSourceId = 'stream:' + b4a.toString(randomBytes(16), 'hex')
    let connectedPeerId = null
    let readBuffer = b4a.alloc(0)
    let closed = false

    this.#channelStreams.set(stream, {
      info,
      remoteClaimedTopics: new Set(),
      authorizedTopics: new Set(),
      proofSentTopics: new Set(),
      localChallenge: '',
      remoteChallenge: '',
    })
    const handleTopic = () => {
      if (!closed) this.#sendChannelHello(stream)
    }
    info?.on?.('topic', handleTopic)
    if (!this.#sendChannelHello(stream)) {
      info?.removeListener?.('topic', handleTopic)
      return
    }
    this.#sendCurrentChannelPresence(stream)

    stream.on('data', async data => {
      let lines
      try {
        const result = consumeChannelFrames(readBuffer, data)
        readBuffer = result.remainder
        lines = result.frames
      } catch (err) {
        this.#log('warn', `Rejected channel data: ${err.message}`)
        stream.destroy?.()
        return
      }

      for (const line of lines) {
        if (!line) continue
        try {
          const message = JSON.parse(line)
          if (this.#processChannelScopeMessage(stream, message)) continue
          if (this.#processChannelProofChallengeMessage(stream, message)) {
            continue
          }
          if (this.#processChannelProofMessage(stream, message)) continue
          if (message.type === 'channel-presence') {
            this.#processChannelPresenceMessage(
              stream,
              message,
              presenceSourceId
            )
            continue
          }
          const peerId = await this.#processChannelHelloMessage(stream, message)
          if (peerId) connectedPeerId = peerId
        } catch (err) {
          this.#log('warn', `Failed to process channel hello: ${err.message}`)
        }
      }
    })

    const cleanup = () => {
      if (closed) return
      closed = true
      info?.removeListener?.('topic', handleTopic)
      this.#removeChannelStream(stream)
      if (connectedPeerId) {
        for (const peers of this.#channelPeers.values())
          peers.delete(connectedPeerId)
      }
      const events =
        this.#removeChannelPresenceSessionsBySource(presenceSourceId)
      if (events.length > 0) {
        this.#send('channel.presence', {
          presence: events[events.length - 1],
          snapshot: this.getSnapshot(),
        })
      }
      this.#send('channel.status', { snapshot: this.getSnapshot() })
      this.#emitSnapshot()
    }

    stream.on('close', cleanup)
    stream.on('error', cleanup)
  }

  #ensureReady() {
    if (
      this.#node.status !== 'ready' ||
      !this.#store ||
      !this.#swarm ||
      !this.#chatSwarm
    ) {
      throw new Error('P2P core is not ready')
    }
  }

  #createFileSource(input) {
    if (input.contentBase64) {
      return { buffer: b4a.from(input.contentBase64, 'base64') }
    }
    if (input.filePath || input.uri) {
      return { filePath: normalizeFileUri(input.filePath || input.uri) }
    }
    throw new Error('File content or file path is required')
  }

  async #getOrCreateDrive(name) {
    if (this.#drives.has(name)) return this.#drives.get(name)
    if (this.#drivePromises.has(name)) return this.#drivePromises.get(name)

    const promise = (async () => {
      const drive = new Hyperdrive(this.#store.namespace(name))
      await drive.ready()
      this.#drives.set(name, drive)
      return drive
    })()

    this.#drivePromises.set(name, promise)
    try {
      return await promise
    } finally {
      this.#drivePromises.delete(name)
    }
  }

  #getCidInfo(cid) {
    const info = getCidInfo(cid)
    return {
      ...info,
      driveName: cidDriveName(this.#cidDriveSecret, info.topicHex),
    }
  }

  #attachCidDrivePeer(stream) {
    const peer = attachCidDriveChannel(stream, {
      onWant: (topic, from) => {
        this.#answerCidDriveWant(topic, from).catch(() => {})
      },
      onHave: (topic, driveKey) => {
        const topicHex = b4a.toString(topic, 'hex')
        if (!this.#cidDriveWants.has(topicHex)) return
        this.#cidDriveOffers.get(topicHex)?.add(b4a.toString(driveKey, 'hex'))
        for (const wake of this.#cidDriveOfferWaiters) wake()
      },
      onClose: closed => this.#cidDrivePeers.delete(closed),
    })
    if (!peer) return
    this.#cidDrivePeers.add(peer)
    for (const topicHex of this.#cidDriveWants.keys()) {
      peer.want(b4a.from(topicHex, 'hex'))
    }
  }

  // Answer only for content this node seeds: joined topic plus a holding whose
  // /<cid> is readable from its own drive.
  async #answerCidDriveWant(topic, peer) {
    const topicHex = b4a.toString(topic, 'hex')
    let cid = null
    for (const [joinedCid, discovery] of this.#discoveries) {
      if (discovery.topic === topicHex) cid = joinedCid
    }
    if (!cid || !this.#holdings.some(holding => holding.cid === cid)) return
    const drive = await this.#getOrCreateDrive(this.#getCidInfo(cid).driveName)
    if (await this.#hasLocalCidContent(drive, `/${cid}`)) {
      peer.have(topic, drive.key)
    }
  }

  /**
   * Waits for a peer that offers a drive with /<cid>. Keys in `triedKeys` are
   * skipped, and every returned key is added to it. The caller closes the
   * returned read-only drive.
   */
  async #waitForRemoteCidDrive(cid, timeout, transferId, triedKeys) {
    const { topic, topicHex } = this.#getCidInfo(cid)
    // This node's own drive is only written after verification; it is tried
    // first, is not closed by the caller, and goes through the same CID check.
    const own = await this.#getOrCreateDrive(this.#getCidInfo(cid).driveName)
    const ownKeyHex = b4a.toString(own.key, 'hex')
    if (
      !triedKeys.has(ownKeyHex) &&
      (await this.#hasLocalCidContent(own, `/${cid}`))
    ) {
      triedKeys.add(ownKeyHex)
      const entry = await own.entry(`/${cid}`, { wait: false })
      if (entry) return { drive: own, entry, keyHex: ownKeyHex, local: true }
    }
    const deadline = Date.now() + Math.max(0, Number(timeout) || 0)
    const offers = this.#cidDriveOffers.get(topicHex) || new Set()
    this.#cidDriveOffers.set(topicHex, offers)
    this.#cidDriveWants.set(
      topicHex,
      (this.#cidDriveWants.get(topicHex) || 0) + 1
    )
    let lastWantAt = 0
    let lastLookupAt = Date.now()

    try {
      while (Date.now() < deadline) {
        this.#assertDownloadActive(transferId)
        if (Date.now() - lastWantAt >= DRIVE_UPDATE_INTERVAL) {
          lastWantAt = Date.now()
          for (const peer of this.#cidDrivePeers) peer.want(topic)
        }

        const keyHex = [...offers].find(key => !triedKeys.has(key))
        // Hyperswarm looks a topic up again only every 10 minutes. A seed
        // that announced after our first lookup (e.g. a link shared right
        // after publishing) would never be found within the timeout.
        if (!keyHex && Date.now() - lastLookupAt >= TOPIC_LOOKUP_INTERVAL) {
          lastLookupAt = Date.now()
          this.#discoveries
            .get(cid)
            ?.discovery.refresh()
            .catch(() => {})
        }
        if (!keyHex) {
          const hasPeers = this.#peerCount() > 0
          const elapsed = Math.round((deadline - Date.now()) / 1000)
          this.#patchTransfer(transferId, {
            progress: hasPeers ? 15 : 10,
            message: hasPeers
              ? `Waiting for seeds (${elapsed}s)`
              : `Finding peers (${elapsed}s)`,
          })
          await new Promise(resolve => {
            const wake = () => {
              clearTimeout(timer)
              this.#cidDriveOfferWaiters.delete(wake)
              resolve()
            }
            const timer = setTimeout(wake, DOWNLOAD_POLL_INTERVAL_MIN)
            this.#cidDriveOfferWaiters.add(wake)
          })
          continue
        }
        triedKeys.add(keyHex)

        const drive = new Hyperdrive(
          this.#store.session(),
          b4a.from(keyHex, 'hex')
        )
        try {
          await drive.ready()
          const entry = await this.#waitForDriveEntry(
            drive,
            `/${cid}`,
            Math.min(STREAM_READ_TIMEOUT, deadline - Date.now()),
            transferId
          )
          if (entry) return { drive, entry, keyHex }
        } catch (err) {
          if (this.#cancelledDownloads.has(transferId)) {
            await drive.close().catch(() => {})
            throw err
          }
        }
        await drive.close().catch(() => {})
      }
      return null
    } finally {
      const remaining = this.#cidDriveWants.get(topicHex) - 1
      if (remaining > 0) {
        this.#cidDriveWants.set(topicHex, remaining)
      } else {
        this.#cidDriveWants.delete(topicHex)
        this.#cidDriveOffers.delete(topicHex)
      }
    }
  }

  // One-time move from the v1 shared-key drive. Only content that recomputes
  // to its CID is copied; anything else stays missing and reports an error.
  async #migrateLegacyCidDrive(cid, drive) {
    const driveKey = `/${cid}`
    const legacy = new Hyperdrive(
      this.#store.namespace(getCidInfo(cid).driveName)
    )
    try {
      await legacy.ready()
      if (!(await this.#hasLocalCidContent(legacy, driveKey))) return
      const actual = await calculateCid({
        stream: legacy.createReadStream(driveKey, { wait: false }),
      })
      if (actual.cid !== cid) return
      await new Promise((resolve, reject) => {
        const writeStream = drive.createWriteStream(driveKey)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
        legacy
          .createReadStream(driveKey, { wait: false })
          .on('error', reject)
          .pipe(writeStream)
      })
      await legacy.clear(driveKey).catch(() => {})
      this.#log('info', `Migrated ${cid.slice(0, 16)} to its own seed drive`)
    } catch (err) {
      this.#log('warn', `Failed to migrate ${cid.slice(0, 16)}: ${err.message}`)
    } finally {
      await legacy.close().catch(() => {})
    }
  }

  async #clearLocalCidContent(cid, driveName) {
    try {
      const drive = await this.#getOrCreateDrive(driveName)
      // Hyperdrive metadata is replicated; del() would publish a tombstone to peers.
      await drive.clear(`/${cid}`)
    } catch {
      // Content may not exist locally.
    }
  }

  async #hasLocalCidContent(drive, driveKey) {
    try {
      const entry = await drive.entry(driveKey, { wait: false })
      return Boolean(entry?.value?.blob) && (await drive.has(driveKey))
    } catch {
      return false
    }
  }

  async #restoreHolding(cid) {
    const { driveName } = this.#getCidInfo(cid)
    const drive = await this.#getOrCreateDrive(driveName)
    if (!(await this.#hasLocalCidContent(drive, `/${cid}`))) {
      await this.#migrateLegacyCidDrive(cid, drive)
    }
    if (!(await this.#hasLocalCidContent(drive, `/${cid}`))) {
      this.#setSeedState(cid, {
        status: 'error',
        localAvailable: false,
        error: 'Local CID content is missing; publish or download it again',
      })
      return
    }
    await this.#joinCidTopic(cid)
  }

  async #joinCidTopic(cid) {
    const { topic, topicHex, driveName } = this.#getCidInfo(cid)

    this.#setSeedState(cid, {
      status: 'joining',
      topic: topicHex,
      driveName,
      error: '',
    })

    const drive = await this.#getOrCreateDrive(driveName)
    const localAvailable = await this.#hasLocalCidContent(drive, `/${cid}`)

    const existing = this.#discoveries.get(cid)
    if (existing) {
      this.#setSeedState(cid, {
        status: localAvailable ? 'active' : 'joining',
        localAvailable,
        topic: topicHex,
        driveName,
        error: '',
      })
      return existing
    }

    const discovery = this.#swarm.join(topic, CID_TOPIC_JOIN_OPTIONS)
    const record = {
      discovery,
      topic: topicHex,
      driveName,
      server: true,
      client: true,
    }
    this.#discoveries.set(cid, record)
    this.#setSeedState(cid, {
      status: localAvailable ? 'active' : 'joining',
      localAvailable,
      topic: topicHex,
      driveName,
      error: '',
    })

    const warnIncompleteAnnouncement = () => {
      if (
        this.#discoveries.get(cid) !== record ||
        !this.#swarm ||
        this.#swarm.destroyed
      )
        return
      this.#log('warn', `CID topic announcement did not complete: ${cid}`)
    }
    discovery.flushed?.().then(announced => {
      if (announced === false) warnIncompleteAnnouncement()
      else this.#emitSnapshot()
    }, warnIncompleteAnnouncement)

    return record
  }

  async #waitForDriveEntry(drive, driveKey, timeout, transferId) {
    const startedAt = Date.now()
    let pollInterval = DOWNLOAD_POLL_INTERVAL_MIN
    let lastDriveUpdate = 0

    while (Date.now() - startedAt < timeout) {
      this.#assertDownloadActive(transferId)
      const now = Date.now()
      if (now - lastDriveUpdate > DRIVE_UPDATE_INTERVAL) {
        lastDriveUpdate = now
        await drive.update().catch(() => {})
      }

      const entry = await drive.entry(driveKey).catch(() => null)
      if (entry) return entry

      const hasPeers = this.#peerCount() > 0
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      this.#patchTransfer(transferId, {
        progress: hasPeers ? 15 : 10,
        message: hasPeers
          ? `Syncing metadata (${elapsed}s)`
          : `Finding peers (${elapsed}s)`,
      })

      pollInterval = hasPeers
        ? Math.min(pollInterval + 200, DOWNLOAD_POLL_INTERVAL_MAX)
        : DOWNLOAD_POLL_INTERVAL_MIN
      await sleep(pollInterval)
    }

    this.#assertDownloadActive(transferId)
    await drive.update().catch(() => {})
    return drive.entry(driveKey).catch(() => null)
  }

  #assertDownloadActive(transferId) {
    if (this.#cancelledDownloads.has(transferId)) {
      throw new Error('Download cancelled')
    }
  }

  async #leaveCidTopic(cid) {
    const { topic } = getCidInfo(cid)
    const existing = this.#discoveries.get(cid)
    if (!existing) {
      this.#clearSeedState(cid)
      return
    }

    await this.#swarm.leave(topic).catch(() => {})
    this.#discoveries.delete(cid)
    this.#clearSeedState(cid)
  }

  #normalizeHolding(record = {}) {
    const { cid, topicHex, driveName } = this.#getCidInfo(record.cid)
    const size = Number(record.size)
    if (!Number.isFinite(size) || size < 0) {
      throw new Error('Holding size must be a non-negative number')
    }
    return {
      cid,
      fileName: sanitizeFilename(record.fileName || cid),
      size,
      topic: record.topic || topicHex,
      driveName,
      localPath: normalizeFileUri(record.localPath || ''),
      source: record.source === 'downloaded' ? 'downloaded' : 'published',
      createdAt: record.createdAt || nowIso(),
      updatedAt: record.updatedAt || nowIso(),
    }
  }

  #upsertHolding(record) {
    const holding = this.#normalizeHolding(record)
    const index = this.#holdings.findIndex(item => item.cid === holding.cid)
    const now = nowIso()
    const next =
      index === -1
        ? { ...holding, createdAt: now, updatedAt: now }
        : { ...this.#holdings[index], ...holding, updatedAt: now }

    if (index === -1) {
      this.#holdings.unshift(next)
    } else {
      this.#holdings[index] = next
    }

    this.#saveHoldings()
    this.#emitSnapshot()
    return next
  }

  #removeHolding(cid) {
    const result = removeHoldingRecord(this.#holdings, cid)
    if (!result.removed) return false
    this.#holdings = result.holdings
    this.#saveHoldings()
    this.#clearSeedState(cid)
    return true
  }

  #toMobileHolding(holding) {
    const seedState = this.#seedStates.get(holding.cid)
    const status =
      seedState?.status ||
      (this.#discoveries.has(holding.cid) ? 'active' : 'queued')

    return {
      cid: holding.cid,
      fileName: holding.fileName,
      size: holding.size,
      status,
      localAvailable: seedState?.localAvailable === true,
      topicJoined: status === 'active' && this.#discoveries.has(holding.cid),
      peerCount: this.#peerCount(),
      source: holding.source,
      shareLink: buildMostLink(holding.cid, holding.fileName),
      localPath: holding.localPath || '',
    }
  }

  #toMobileChannel(channel) {
    return {
      ...formatChannelForResponse(
        channel,
        (this.#channelPeers.get(channel.channelKey) || new Map()).size
      ),
      remark: channel.remark || '',
      pinned: channel.pinned === true,
    }
  }

  #cacheChannelMessages(channelKey, messages = []) {
    const normalized = sortChannelMessages(messages, CHANNEL_MESSAGE_LIMIT, 0)
    this.#channelMessageCache.set(channelKey, normalized)
  }

  #snapshotChannelMessages() {
    return Object.fromEntries(
      [...this.#channelMessageCache.entries()].map(([channelKey, messages]) => [
        channelKey,
        messages.map(message => ({ ...message })),
      ])
    )
  }

  #snapshotChannelPresence() {
    return Object.fromEntries(
      [...this.#channelPresenceSessions.keys()].map(channelKey => [
        channelKey,
        this.#getChannelPresenceList(channelKey).map(presence => ({
          ...presence,
        })),
      ])
    )
  }

  #upsertTransfer(transfer) {
    const index = this.#transfers.findIndex(item => item.id === transfer.id)
    const next = {
      id: transfer.id,
      kind: transfer.kind,
      status: transfer.status,
      fileName: transfer.fileName,
      cid: transfer.cid,
      link: transfer.link,
      progress: transfer.progress,
      message: transfer.message,
      phase: transfer.phase ?? this.#transfers[index]?.phase,
      totalBytes: transfer.totalBytes ?? this.#transfers[index]?.totalBytes,
      completedBytes:
        transfer.completedBytes ?? this.#transfers[index]?.completedBytes,
    }

    if (index === -1) {
      this.#transfers.unshift(next)
      const active = this.#transfers.filter(item => item.status === 'running')
      const history = this.#transfers.filter(item => item.status !== 'running')
      this.#transfers = [...active, ...history.slice(0, 20)]
    } else {
      this.#transfers[index] = {
        ...this.#transfers[index],
        ...next,
      }
    }

    atomicWrite(
      path.join(this.#storagePath, TRANSFERS_FILE),
      JSON.stringify(this.#transfers, null, 2)
    )
    this.#emitSnapshot()
    return this.#transfers.find(item => item.id === transfer.id)
  }

  #patchTransfer(id, patch) {
    const current = this.#transfers.find(item => item.id === id)
    if (!current) return null
    return this.#upsertTransfer({
      ...current,
      ...patch,
    })
  }

  #setSeedState(cid, patch) {
    const current = this.#seedStates.get(cid) || {}
    this.#seedStates.set(cid, {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    })
    this.#emitSnapshot()
  }

  #clearSeedState(cid) {
    this.#seedStates.delete(cid)
    this.#emitSnapshot()
  }

  #loadTransfers() {
    const filePath = path.join(this.#storagePath, TRANSFERS_FILE)
    try {
      if (!fs.existsSync(filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!Array.isArray(parsed)) return []
      const transfers = parsed
        .filter(
          record =>
            record &&
            typeof record.id === 'string' &&
            ['publish', 'download'].includes(record.kind) &&
            [
              'running',
              'queued',
              'waitingCore',
              'completed',
              'failed',
            ].includes(record.status)
        )
        .map(record => {
          const interrupted = ['running', 'queued', 'waitingCore'].includes(
            record.status
          )
          return {
            id: record.id,
            kind: record.kind,
            status: interrupted ? 'failed' : record.status,
            fileName: sanitizeFilename(record.fileName),
            phase: ['downloading', 'verifying', 'completed'].includes(
              record.phase
            )
              ? record.phase
              : undefined,
            totalBytes:
              Number.isSafeInteger(record.totalBytes) && record.totalBytes >= 0
                ? record.totalBytes
                : undefined,
            completedBytes:
              Number.isSafeInteger(record.completedBytes) &&
              record.completedBytes >= 0
                ? record.completedBytes
                : undefined,
            cid: typeof record.cid === 'string' ? record.cid : undefined,
            link: typeof record.link === 'string' ? record.link : undefined,
            progress: interrupted
              ? 0
              : Math.max(0, Math.min(100, Number(record.progress) || 0)),
            message: interrupted
              ? 'Transfer interrupted by core restart; retry to continue'
              : String(record.message || ''),
          }
        })
        .slice(0, 20)
      atomicWrite(filePath, JSON.stringify(transfers, null, 2))
      return transfers
    } catch (err) {
      this.#log('warn', `Failed to load transfers: ${err.message}`)
      return []
    }
  }

  #loadHoldings() {
    const filePath = path.join(this.#storagePath, HOLDINGS_FILE)
    try {
      if (!fs.existsSync(filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!Array.isArray(parsed)) return []
      return parsed.map(record => this.#normalizeHolding(record))
    } catch (err) {
      this.#log('warn', `Failed to load holdings: ${err.message}`)
      return []
    }
  }

  #saveHoldings() {
    const filePath = path.join(this.#storagePath, HOLDINGS_FILE)
    atomicWrite(filePath, JSON.stringify(this.#holdings, null, 2))
  }

  #loadChannels() {
    const filePath = path.join(this.#storagePath, CHANNELS_FILE)
    try {
      if (!fs.existsSync(filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!Array.isArray(parsed)) return []
      return parsed.map(record => normalizeChannelRecord(record))
    } catch (err) {
      this.#log('warn', `Failed to load channels: ${err.message}`)
      return []
    }
  }

  #saveChannels() {
    const filePath = path.join(this.#storagePath, CHANNELS_FILE)
    atomicWrite(filePath, JSON.stringify(this.#channels, null, 2))
    this.#emitSnapshot()
  }

  #nodeId() {
    try {
      return b4a.toString(this.#swarm.keyPair.publicKey, 'hex')
    } catch {
      return 'android'
    }
  }

  #peerCount() {
    return (
      (this.#swarm?.connections?.size || 0) +
      (this.#chatSwarm?.connections?.size || 0)
    )
  }

  #emitNetworkStatus() {
    this.#node.peerCount = this.#peerCount()
    this.#send('network.status', {
      peerCount: this.#node.peerCount,
      snapshot: this.getSnapshot(),
    })
    this.#emitSnapshot()
  }

  #log(level, message) {
    this.#logs = [
      {
        id: createId('log'),
        time: nowIso(),
        level,
        message,
      },
      ...this.#logs,
    ].slice(0, 50)
    this.#emitSnapshot()
  }

  #emitSnapshot() {
    this.#node.peerCount = this.#peerCount()
    this.#send('snapshot', this.getSnapshot())
  }
}
