import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { importer } from 'ipfs-unixfs-importer'
import { CID } from 'multiformats/cid'
import {
  CHANNEL_CANDIDATE_TTL,
  CHANNEL_DISCOVERY_TIMEOUT,
  CHANNEL_MESSAGE_LIMIT,
  CHANNEL_PRESENCE_HEARTBEAT_MS,
  CHANNEL_PRESENCE_TIMEOUT_MS,
  CHANNELS_FILE,
  DIAGNOSTIC_AUTHOR,
  DIAGNOSTIC_AUTHOR_NAME,
  assertValidChannelId,
  buildChannelKey,
  channelToCandidate,
  createChannelRecord,
  formatChannelForResponse,
  generateChannelChatDiscoveryKey,
  generateChannelDiscoveryKey,
  generateChannelIdDiscoveryKey,
  normalizeChannelRemark,
  normalizeChannelId,
  normalizeChannelKey,
  normalizeChannelMessage,
  normalizeChannelPresenceAddress,
  normalizeChannelPresenceAvatar,
  normalizeChannelPresenceDisplayName,
  normalizeChannelRecord,
  sortChannelMessages,
  uniqueStrings,
} from './channel-protocol.mjs'
import { removeHoldingRecord } from './holding-records.mjs'
import {
  getConnectionTopicSet,
  openFileDriveProtocol,
} from './file-drive-protocol.mjs'
import { openChannelControlProtocol } from './channel-control-protocol.mjs'
import { ensureStorageSchema } from './storage-schema.mjs'

const fs =
  typeof globalThis.Bare === 'undefined'
    ? (await import('node:fs')).default
    : (await import('bare-fs')).default
const path =
  typeof globalThis.Bare === 'undefined'
    ? (await import('node:path')).default
    : (await import('bare-path')).default

const FILE_CORESTORE_DIR = path.join('stores', 'files')
const CHANNEL_CORESTORE_DIR = path.join('stores', 'channels')
const DRIVE_ENTRY_SOURCE = Symbol('driveEntrySource')
const DRIVE_TRANSPORT = Symbol('driveTransport')
const DRIVE_BASE_SESSION = Symbol('driveBaseSession')
const HOLDINGS_SCHEMA_VERSION = 1
const MAX_REMOTE_CANDIDATES_PER_CID = 4
const MAX_UNVERIFIED_DRIVE_OPENS = 8
const MAX_PEERS = 64
const CONNECTION_TIMEOUT = 120000
const DOWNLOAD_TIMEOUT = 900000
const STREAM_READ_TIMEOUT = 10000
const FILE_WRITE_CHUNK_SIZE = 64 * 1024
const DOWNLOAD_POLL_INTERVAL_MIN = 500
const DOWNLOAD_POLL_INTERVAL_MAX = 2000
const DRIVE_UPDATE_INTERVAL = 2000
const PROGRESS_THROTTLE = 500
const HOLDINGS_FILE = 'node-holdings.json'
const PENDING_PURGES_FILE = 'pending-drive-purges.json'

async function purgeDriveLocalBlocks(drive) {
  await drive.ready()
  await drive.clearAll()
  await drive.core.clear(0, drive.core.length)
  await drive.close()
}

async function closeDriveSessions(drive) {
  if (!drive) return
  const baseDrive = drive[DRIVE_BASE_SESSION]
  await drive.close().catch(() => {})
  if (baseDrive && baseDrive !== drive) {
    await baseDrive.close().catch(() => {})
  }
}

const SWARM_BOOTSTRAP = [
  '88.99.3.86@node1.hyperdht.org:49737',
  '142.93.90.113@node2.hyperdht.org:49737',
  '138.68.147.8@node3.hyperdht.org:49737',
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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

function splitMostLink(link) {
  const value = String(link || '').trim()
  if (!value) throw new Error('most:// link is required')
  if (!value.startsWith('most://')) {
    throw new Error('Link must start with most://')
  }

  const rest = value.slice('most://'.length)
  const queryIndex = rest.indexOf('?')
  const authorityAndPath = queryIndex === -1 ? rest : rest.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : rest.slice(queryIndex + 1)

  const slashIndex = authorityAndPath.indexOf('/')
  if (slashIndex !== -1 && slashIndex !== authorityAndPath.length - 1) {
    throw new Error('most:// link cannot contain an extra path')
  }

  const cid = authorityAndPath.replace(/\/$/, '')
  let fileName = cid

  if (query) {
    for (const part of query.split('&')) {
      if (!part) continue
      const [rawKey, rawValue = ''] = part.split('=')
      const key = decodeURIComponent(rawKey)
      if (key !== 'filename') {
        throw new Error('most:// link only supports filename query')
      }
      const decoded = decodeURIComponent(rawValue.replace(/\+/g, '%20')).trim()
      if (decoded) fileName = decoded
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
    driveName: `drive-${parsed.toString()}`,
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

async function calculateCid(input) {
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
  } else {
    throw new Error('File content is required')
  }

  for await (const entry of importer(
    [
      {
        path: 'file',
        content,
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
  const ws = fs.createWriteStream(targetPath)
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
        onProgress(loaded)
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
  #fileStore = null
  #channelStore = null
  #swarm = null
  #chatSwarm = null
  #drives = new Map()
  #drivePromises = new Map()
  #remoteDrives = new Map()
  #remoteOffers = new Map()
  #remoteDrivePromises = new Map()
  #remoteDriveOpenCount = 0
  #remoteDriveOpenWaiters = []
  #pendingDrivePurges = new Set()
  #pendingDrivePurgeSessions = new Map()
  #fileProtocols = new Set()
  #discoveries = new Map()
  #channels = []
  #channelCores = new Map()
  #channelLocalCoreKey = new Map()
  #channelDiscoveries = new Map()
  #channelChatDiscoveries = new Map()
  #channelIdDiscoveries = new Map()
  #channelPeers = new Map()
  #channelCandidateCache = new Map()
  #channelStreams = new Set()
  #channelMessageCache = new Map()
  #channelPresenceSessions = new Map()
  #channelPresenceProfiles = new Map()
  #channelPresenceSweepTimer = null
  #channelPresenceTimeoutMs
  #channelPresenceSweepMs
  #holdings = []
  #seedStates = new Map()
  #transfers = []
  #logs = []
  #createSwarm
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
    this.#channelPresenceTimeoutMs =
      options.channelPresenceTimeoutMs || CHANNEL_PRESENCE_TIMEOUT_MS
    this.#channelPresenceSweepMs =
      options.channelPresenceSweepMs || CHANNEL_PRESENCE_HEARTBEAT_MS
    this.#node.storagePath = this.#storagePath
  }

  getSnapshot() {
    return {
      node: { ...this.#node, peerCount: this.#peerCount() },
      holdings: this.#holdings
        .filter(holding => holding.state === 'ready')
        .map(holding => this.#toMobileHolding(holding)),
      transfers: this.#transfers.map(transfer => ({ ...transfer })),
      channels: this.#channels.map(channel => this.#toMobileChannel(channel)),
      channelMessages: this.#snapshotChannelMessages(),
      channelPresence: this.#snapshotChannelPresence(),
      logs: this.#logs.map(log => ({ ...log })),
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

    ensureStorageSchema(this.#storagePath)
    ensureDirectory(this.#downloadPath)

    this.#fileStore = new Corestore(
      path.join(this.#storagePath, FILE_CORESTORE_DIR)
    )
    this.#channelStore = new Corestore(
      path.join(this.#storagePath, CHANNEL_CORESTORE_DIR)
    )
    try {
      await Promise.all([this.#fileStore.ready(), this.#channelStore.ready()])
      this.#holdings = this.#loadHoldings()
      this.#loadPendingDrivePurges()
      await this.#flushPendingDrivePurges()
    } catch (error) {
      const stores = [this.#fileStore, this.#channelStore]
      this.#fileStore = null
      this.#channelStore = null
      await Promise.allSettled(stores.map(store => store?.close()))
      throw error
    }

    this.#swarm = this.#createSwarm({
      maxPeers: MAX_PEERS,
      bootstrap: SWARM_BOOTSTRAP,
      firewall: () => false,
      connectionKeepAlive: 5000,
      randomPunchInterval: 20000,
      handshakeTimeout: CONNECTION_TIMEOUT,
    })

    this.#swarm.on('connection', (conn, info) => {
      conn.on('error', () => {})
      this.#fileStore.replicate(conn)
      this.#openFileDriveConnection(conn, info)
      this.#emitNetworkStatus()
    })
    this.#swarm.on('update', () => this.#emitNetworkStatus())
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
    })

    this.#chatSwarm.on('connection', (conn, info) => {
      conn.on('error', () => {})
      this.#channelStore.replicate(conn)
      this.#openChannelConnection(conn, info)
      this.#emitNetworkStatus()
    })
    this.#chatSwarm.on('update', () => this.#emitNetworkStatus())
    this.#chatSwarm.on('error', err => {
      const message = err && err.message ? err.message : 'Chat swarm error'
      this.#log('warn', message)
    })

    await this.#recoverStagingHoldings()
    for (const holding of this.#holdings.filter(
      item => item.state === 'ready'
    )) {
      const { topicHex, driveName } = getCidInfo(holding.cid)
      this.#seedStates.set(holding.cid, {
        status: 'queued',
        topic: topicHex,
        driveName,
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
    this.#log('info', 'MostBox mobile P2P core is ready')
    this.#emitSnapshot()

    for (const holding of this.#holdings.filter(
      item => item.state === 'ready'
    )) {
      this.#joinCidTopic(holding.cid, { server: true, client: false }).catch(
        err => {
          this.#setSeedState(holding.cid, {
            status: 'error',
            error: err.message,
          })
        }
      )
    }

    return this.getSnapshot()
  }

  async stop() {
    this.#node = { ...this.#node, status: 'stopping' }
    this.#emitSnapshot()
    this.#clearChannelPresenceRuntime({ broadcast: true })

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
    this.#channelIdDiscoveries.clear()
    this.#channelPeers.clear()
    this.#channelCandidateCache.clear()
    this.#channelStreams.clear()
    this.#channelMessageCache.clear()

    const fileDrives = new Set([
      ...this.#drives.values(),
      ...[...this.#remoteDrives.values()].flatMap(drives => [
        ...drives.values(),
      ]),
      ...this.#pendingDrivePurgeSessions.values(),
    ])
    await Promise.allSettled([...fileDrives].map(closeDriveSessions))
    this.#drives.clear()
    this.#drivePromises.clear()
    this.#remoteDrives.clear()
    this.#remoteOffers.clear()
    this.#remoteDrivePromises.clear()
    this.#pendingDrivePurgeSessions.clear()
    this.#remoteDriveOpenCount = 0
    while (this.#remoteDriveOpenWaiters.length) {
      this.#remoteDriveOpenWaiters.shift()?.()
    }
    this.#fileProtocols.clear()
    this.#discoveries.clear()

    await Promise.allSettled([
      this.#fileStore?.close(),
      this.#channelStore?.close(),
    ])
    this.#fileStore = null
    this.#channelStore = null

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

  listChannels() {
    this.#ensureReady()
    return this.#channels.map(channel => this.#toMobileChannel(channel))
  }

  async createChannel(input = {}) {
    this.#ensureReady()
    const requestedType = String(input.type || 'public').trim() || 'public'
    const channelId = assertValidChannelId(
      input.name || input.channelId,
      requestedType
    )
    const channelKey = buildChannelKey(channelId)
    const existing = this.#channels.find(
      channel => channel.channelKey === channelKey
    )

    if (existing) {
      await this.#openChannelRuntime(existing)
      await this.#joinChannelDiscoveryTopics(existing)
      this.#broadcastChannelHello()
      return this.#toMobileChannel(existing)
    }

    const localCandidates = this.#getLocalChannelCandidates(channelId)
    const remoteCandidates =
      input.discover === false
        ? []
        : await this.#discoverChannelCandidates(channelId, {
            timeout: input.discoveryTimeout,
          })
    const candidates = this.#mergeChannelCandidates([
      ...localCandidates,
      ...remoteCandidates,
    ])

    if (candidates.length > 0) {
      return this.#joinChannelFromCandidate(candidates[0], requestedType)
    }

    const channel = createChannelRecord(channelId, requestedType)
    this.#channels.push(channel)
    await this.#openChannelRuntime(channel)
    await this.#joinChannelDiscoveryTopics(channel)
    this.#cacheChannelCandidate(channelToCandidate(channel, true))
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
      this.#channelIdDiscoveries.get(channel.channelId),
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
    this.#channelIdDiscoveries.delete(channel.channelId)
    this.#channelCores.delete(channelKey)
    this.#channelLocalCoreKey.delete(channelKey)
    this.#channelPeers.delete(channelKey)
    this.#channelMessageCache.delete(channelKey)
    this.#clearChannelPresenceForChannel(channelKey)
    this.#clearChannelCandidate(channel)
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
          const entry = await core.get(i)
          if (!this.#isChannelActive(channel.channelKey)) return []
          if (entry && entry.type === 'message') {
            const message = this.#normalizeIncomingChannelMessage(entry)
            if (!message) continue
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
    this.#cacheChannelMessages(channel.channelKey, messages)
    if (!this.#isChannelActive(channel.channelKey)) {
      this.#channelMessageCache.delete(channel.channelKey)
      return []
    }
    this.#emitSnapshot()
    return messages
  }

  async sendChannelMessage(input = {}) {
    this.#ensureReady()
    const channelName = input.channelName || input.name
    const channel = this.#resolveChannel(channelName)
    const localKeyHex = this.#channelLocalCoreKey.get(channel.channelKey)
    const coresMap = this.#channelCores.get(channel.channelKey)
    const core = localKeyHex && coresMap ? coresMap.get(localKeyHex) : null
    if (!core) {
      throw new Error('Channel runtime is not initialized')
    }

    const message = normalizeChannelMessage(
      {
        content: input.content,
        author: input.author || DIAGNOSTIC_AUTHOR,
        authorName: input.authorName || DIAGNOSTIC_AUTHOR_NAME,
        attachment: input.attachment,
      },
      {
        timestamp: await this.#getNextChannelMessageTimestamp(
          channel.channelKey
        ),
        requireAttachment: Boolean(input.attachment),
      }
    )

    await core.append(message)
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

  joinChannelPresence(input = {}) {
    this.#ensureReady()
    const channel = this.#resolvePresenceChannel(input)
    const event = this.#upsertChannelPresenceSession(channel, {
      ...this.#normalizeLocalPresenceOptions(input),
      local: true,
    })
    if (event) {
      this.#broadcastChannelPresence(event)
    }
    this.#emitSnapshot()
    return this.#getChannelPresenceList(channel.channelKey)
  }

  heartbeatChannelPresence(input = {}) {
    this.#ensureReady()
    const channel = this.#resolvePresenceChannel(input)
    const options = {
      ...this.#normalizeLocalPresenceOptions(input, { includeProfile: false }),
      local: true,
    }
    const event =
      this.#touchChannelPresenceSession(channel, options) ||
      this.#formatChannelPresence(
        channel.channelKey,
        options.address,
        'heartbeat'
      )
    if (event) {
      this.#broadcastChannelPresence(event)
    }
    this.#emitSnapshot()
    return this.#getChannelPresenceList(channel.channelKey)
  }

  leaveChannelPresence(input = {}) {
    this.#ensureReady()
    const channel = this.#resolvePresenceChannel(input)
    const events = this.#removeChannelPresenceSessions(channel.channelKey, {
      ...this.#normalizeLocalPresenceOptions(input, { includeProfile: false }),
    })
    for (const event of events) {
      this.#broadcastChannelPresence(event)
    }
    this.#emitSnapshot()
    return this.#getChannelPresenceList(channel.channelKey)
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
    let operationCid = ''

    try {
      const source = this.#createFileSource(input)
      const result = await calculateCid(source)
      const cid = result.cid
      operationCid = cid
      const size = result.size || Number(input.size) || 0
      const { driveName } = getCidInfo(cid)
      const driveKey = `/${cid}`
      let existingHolding = this.#holdings.find(
        holding => holding.cid === cid && holding.state === 'ready'
      )
      let drive = await this.#getOrCreateDrive(driveName)

      this.#upsertTransfer({
        ...transfer,
        cid,
        link: buildMostLink(cid, fileName),
        progress: 30,
        message: 'Writing file into Hyperdrive',
      })

      const existingEntry = existingHolding
        ? await drive.entry(driveKey).catch(() => null)
        : null
      if (
        existingHolding &&
        existingEntry?.value?.blob &&
        (await drive.has(driveKey).catch(() => false))
      ) {
        await this.#joinCidTopic(cid, { server: true, client: false })
        const holding = this.#upsertHolding({
          ...existingHolding,
          fileName,
          localPath: source.filePath,
          source: 'published',
        })
        const completed = this.#upsertTransfer({
          ...transfer,
          cid,
          link: buildMostLink(cid, fileName),
          status: 'completed',
          progress: 100,
          message: 'Already published and seeding',
        })
        return { transfer: completed, holding: this.#toMobileHolding(holding) }
      }

      if (existingHolding) {
        await this.#purgeHolding(existingHolding)
        existingHolding = null
        drive = await this.#getOrCreateDrive(driveName)
      }
      this.#upsertHolding({
        cid,
        fileName,
        size,
        localPath: source.filePath,
        source: 'published',
        state: 'staging',
        transport: {
          type: 'hyperdrive',
          key: b4a.toString(drive.key, 'hex'),
          version: 0,
        },
      })
      if (source.buffer) {
        await writeBufferToDrive(drive, driveKey, source.buffer)
      } else {
        await pipeFileToDrive(source.filePath, drive, driveKey)
      }
      const sealed = this.#sealDrive(driveName, drive)
      drive = sealed.drive

      const holding = this.#upsertHolding({
        cid,
        fileName,
        size,
        localPath: source.filePath,
        source: 'published',
        state: 'ready',
        transport: sealed.transport,
      })
      await this.#joinCidTopic(cid, { server: true, client: false })

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
      await this.#discardStagingHolding(operationCid).catch(() => {})
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
    const { driveName } = getCidInfo(cid)
    const driveKey = `/${cid}`

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

    try {
      const existingHolding = this.#holdings.find(
        holding => holding.cid === cid && holding.state === 'ready'
      )
      const drive = existingHolding
        ? await this.#getOrCreateDrive(driveName)
        : null
      const existingEntry = existingHolding
        ? await drive.entry(driveKey).catch(() => null)
        : null

      if (
        existingHolding &&
        existingEntry?.value?.blob &&
        (await drive.has(driveKey).catch(() => false))
      ) {
        await this.#joinCidTopic(cid, { server: true, client: false })
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

      await this.#joinCidTopic(cid, { server: false, client: true })

      this.#upsertTransfer({
        ...transfer,
        progress: 10,
        message: 'Finding peers',
      })

      let lastCandidateError = null
      candidateLoop: while (true) {
        const entry = await this.#waitForDriveEntry(
          drive,
          driveKey,
          input.timeout || DOWNLOAD_TIMEOUT,
          requestId,
          cid
        )

        if (!entry) {
          if (lastCandidateError) throw lastCandidateError
          throw new Error('No online seed was found for this CID')
        }

        const sourceDrive = this.#getDriveEntrySource(entry, drive)
        const sourceTransport = this.#getDriveTransport(sourceDrive)
        if (!sourceTransport) {
          throw new Error('Peer did not provide a valid drive snapshot')
        }
        this.#drives.set(driveName, sourceDrive)
        const totalBytes = Number(entry?.value?.blob?.byteLength) || 0
        const savePath = uniqueSavePath(this.#downloadPath, fileName)
        const tempPath = `${savePath}.part`
        safeRm(tempPath)
        try {
          this.#upsertHolding({
            cid,
            fileName,
            size: totalBytes,
            localPath: savePath,
            source: 'downloaded',
            state: 'staging',
            transport: sourceTransport,
          })

          this.#upsertTransfer({
            ...transfer,
            progress: 20,
            message: 'Downloading file',
          })

          const readStream = sourceDrive.createReadStream(driveKey)
          let loaded = 0
          await pipeDriveToFile(readStream, tempPath, {
            timeout: STREAM_READ_TIMEOUT,
            onProgress: nextLoaded => {
              loaded = nextLoaded
              if (totalBytes > 0) {
                const progress = 20 + Math.round((loaded / totalBytes) * 60)
                this.#upsertTransfer({
                  ...transfer,
                  progress: Math.min(progress, 80),
                  message: 'Downloading file',
                })
              }
            },
          })

          this.#upsertTransfer({
            ...transfer,
            progress: 85,
            message: 'Verifying CID',
          })

          const downloaded = await calculateCid({ filePath: tempPath })
          if (downloaded.cid !== cid) {
            lastCandidateError = new Error(
              `File content CID mismatch. Expected ${cid}, got ${downloaded.cid}.`
            )
            await this.#rejectRemoteDriveCandidate(cid, sourceDrive)
            continue candidateLoop
          }

          fs.renameSync(tempPath, savePath)
          const savedSize =
            downloaded.size || totalBytes || fs.statSync(savePath).size || 0
          const holding = this.#upsertHolding({
            cid,
            fileName,
            size: savedSize,
            localPath: savePath,
            source: 'downloaded',
            state: 'ready',
            transport: sourceTransport,
          })
          await this.#joinCidTopic(cid, { server: true, client: false })

          const completed = this.#upsertTransfer({
            ...transfer,
            status: 'completed',
            progress: 100,
            message: `Downloaded to ${savePath}`,
          })

          this.#log('info', `Downloaded and seeding ${cid.slice(0, 16)}`)
          return {
            transfer: completed,
            holding: this.#toMobileHolding(holding),
            savedPath: savePath,
          }
        } finally {
          safeRm(tempPath)
        }
      }
    } catch (err) {
      await this.#discardStagingHolding(cid).catch(() => {})
      const failed = this.#upsertTransfer({
        ...transfer,
        status: 'failed',
        progress: 0,
        message: err instanceof Error ? err.message : 'Download failed',
      })
      this.#log('error', failed.message)
      throw err
    }
  }

  async deleteHolding(input = {}) {
    this.#ensureReady()
    const { cid } = getCidInfo(input.cid)
    const existing = this.#holdings.find(holding => holding.cid === cid)
    if (!existing) {
      throw new Error('This CID is not available in local holdings')
    }

    await this.#leaveCidTopic(cid)
    await this.#purgeHolding(existing)
    this.#log('info', `Deleted local holding ${cid.slice(0, 16)}`)

    return {
      cid,
      snapshot: this.getSnapshot(),
    }
  }

  async exportHolding(input = {}) {
    this.#ensureReady()
    const { cid, driveName } = getCidInfo(input.cid)
    const existing = this.#holdings.find(holding => holding.cid === cid)
    if (!existing) {
      throw new Error('This CID is not available in local holdings')
    }

    const fileName = sanitizeFilename(
      input.fileName || existing.fileName || cid
    )
    let exportPath = existing.localPath || ''
    let holding = existing

    if (!fileExists(exportPath)) {
      const drive = await this.#getOrCreateDrive(driveName)
      const driveKey = `/${cid}`
      const entry = await drive.entry(driveKey).catch(() => null)
      if (!entry) {
        throw new Error('Local Hyperdrive content is not available for export')
      }

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

  async #joinChannelFromCandidate(candidateInput, type = 'public') {
    const channelType = candidateInput.type || type
    const channelId = assertValidChannelId(
      candidateInput.channelId,
      channelType
    )
    const channelKey = buildChannelKey(channelId)
    const existing = this.#channels.find(
      channel => channel.channelKey === channelKey
    )

    if (existing) {
      await this.#mergeChannelWriterCoreKeys(
        existing,
        candidateInput.writerCoreKeys
      )
      await this.#joinChannelDiscoveryTopics(existing)
      this.#broadcastChannelHello()
      return this.#toMobileChannel(existing)
    }

    const channel = createChannelRecord(channelId, channelType, {
      createdAt: candidateInput.createdAt,
      lastMessageAt: candidateInput.lastMessageAt,
      writerCoreKeys: candidateInput.writerCoreKeys,
    })

    this.#channels.push(channel)
    await this.#openChannelRuntime(channel)
    await this.#joinChannelDiscoveryTopics(channel)
    this.#cacheChannelCandidate(channelToCandidate(channel, true))
    this.#saveChannels()
    this.#broadcastChannelHello()
    this.#log('info', `Joined channel ${channel.channelKey}`)
    this.#send('channel.joined', {
      channel: this.#toMobileChannel(channel),
      snapshot: this.getSnapshot(),
    })
    return this.#toMobileChannel(channel)
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

    const ns = this.#channelStore.namespace(`channel-${channel.channelKey}`)
    const localCore = channel.localWriterCoreKey
      ? ns.get({
          key: b4a.from(channel.localWriterCoreKey, 'hex'),
          valueEncoding: 'json',
        })
      : ns.get({
          name: `messages-${channel.writerId}`,
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
      const discovery = this.#chatSwarm.join(
        generateChannelDiscoveryKey(channel.channelKey),
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
        generateChannelChatDiscoveryKey(channel.channelKey),
        { server: true, client: true }
      )
      this.#channelChatDiscoveries.set(channel.channelKey, discovery)
      discovery.flushed?.().then(
        () => this.#emitSnapshot(),
        () => {}
      )
    }

    if (!this.#channelIdDiscoveries.has(channel.channelId)) {
      const discovery = this.#chatSwarm.join(
        generateChannelIdDiscoveryKey(channel.channelId),
        { server: true, client: true }
      )
      this.#channelIdDiscoveries.set(channel.channelId, discovery)
      discovery.flushed?.().then(
        () => this.#emitSnapshot(),
        () => {}
      )
    }
  }

  #getLocalChannelCandidates(channelId) {
    return this.#channels
      .filter(channel => channel.channelId === channelId)
      .map(channel => channelToCandidate(channel, true))
  }

  async #discoverChannelCandidates(channelId, options = {}) {
    const getCachedCandidates = () => {
      const now = Date.now()
      return [
        ...(this.#channelCandidateCache.get(channelId)?.values() || []),
      ].filter(
        candidate =>
          candidate.local ||
          !candidate.lastSeen ||
          now - candidate.lastSeen <= CHANNEL_CANDIDATE_TTL
      )
    }

    const timeout =
      Number(options.timeout) >= 0
        ? Number(options.timeout)
        : CHANNEL_DISCOVERY_TIMEOUT
    const hadDiscovery = this.#channelIdDiscoveries.has(channelId)
    if (!hadDiscovery) {
      const discovery = this.#chatSwarm.join(
        generateChannelIdDiscoveryKey(channelId),
        { server: true, client: true }
      )
      this.#channelIdDiscoveries.set(channelId, discovery)
    }

    await sleep(timeout)
    const candidates = getCachedCandidates()
    if (!hadDiscovery && !this.#channels.some(c => c.channelId === channelId)) {
      this.#channelIdDiscoveries.delete(channelId)
      this.#chatSwarm
        .leave(generateChannelIdDiscoveryKey(channelId))
        .catch(() => {})
    }
    return candidates
  }

  #mergeChannelCandidates(candidates) {
    const byKey = new Map()
    for (const candidate of candidates) {
      if (!candidate?.channelKey) continue
      const existing = byKey.get(candidate.channelKey)
      if (!existing) {
        byKey.set(candidate.channelKey, {
          ...candidate,
          writerCoreKeys: uniqueStrings(candidate.writerCoreKeys),
        })
        continue
      }
      byKey.set(candidate.channelKey, {
        ...existing,
        ...candidate,
        local: existing.local || candidate.local,
        writerCoreKeys: uniqueStrings([
          ...existing.writerCoreKeys,
          ...(candidate.writerCoreKeys || []),
        ]),
      })
    }
    return [...byKey.values()]
  }

  #cacheChannelCandidate(candidate) {
    const channelId = normalizeChannelId(candidate?.channelId)
    const channelKey = buildChannelKey(channelId)
    if (!channelId || !channelKey) return
    if (!this.#channelCandidateCache.has(channelId)) {
      this.#channelCandidateCache.set(channelId, new Map())
    }
    const cache = this.#channelCandidateCache.get(channelId)
    const existing = cache.get(channelKey)
    cache.set(channelKey, {
      ...existing,
      ...candidate,
      channelId,
      channelKey,
      writerCoreKeys: uniqueStrings([
        ...(existing?.writerCoreKeys || []),
        ...(candidate.writerCoreKeys || []),
      ]),
      lastSeen: Date.now(),
    })
  }

  #clearChannelCandidate(channel) {
    const channelId = normalizeChannelId(channel?.channelId)
    const channelKey = normalizeChannelKey(channel?.channelKey || channelId)
    const cache = this.#channelCandidateCache.get(channelId)
    if (!cache) return
    cache.delete(channelKey)
    if (cache.size === 0) {
      this.#channelCandidateCache.delete(channelId)
    }
  }

  #resolveChannel(channelKeyInput) {
    const key = normalizeChannelKey(channelKeyInput)
    const channel = this.#channels.find(
      item => item.channelKey === key || item.channelId === key
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

  #normalizeLocalPresenceOptions(input = {}, options = {}) {
    const address =
      normalizeChannelPresenceAddress(input.address) || DIAGNOSTIC_AUTHOR
    const result = {
      address,
      sessionId: input.sessionId || 'mobile-default',
      sourceId: 'local',
      lastSeen: Number(input.lastSeen) || Date.now(),
    }

    if (options.includeProfile !== false) {
      result.displayName = normalizeChannelPresenceDisplayName(
        input.displayName || input.authorName || DIAGNOSTIC_AUTHOR_NAME,
        address
      )
      if (Object.prototype.hasOwnProperty.call(input, 'avatar')) {
        result.avatar = normalizeChannelPresenceAvatar(input.avatar)
      }
      const profileUpdatedAt = Number(input.profileUpdatedAt)
      if (Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0) {
        result.profileUpdatedAt = Math.floor(profileUpdatedAt)
      }
    }

    return result
  }

  async #getNextChannelMessageTimestamp(channelKey) {
    const coresMap = this.#channelCores.get(channelKey)
    let maxTimestamp = 0

    if (coresMap) {
      for (const [, core] of coresMap) {
        for (let i = 0; i < core.length; i++) {
          try {
            const entry = await core.get(i)
            if (entry?.type === 'message') {
              maxTimestamp = Math.max(
                maxTimestamp,
                Number(entry.timestamp) || 0
              )
            }
          } catch {
            break
          }
        }
      }
    }

    return Math.max(Date.now(), maxTimestamp + 1)
  }

  #normalizeIncomingChannelMessage(entry) {
    if (!entry || entry.type !== 'message') return null
    try {
      return normalizeChannelMessage(
        {
          author: entry.author,
          authorName: entry.authorName,
          content: entry.content,
          attachment: entry.attachment,
        },
        {
          timestamp: Number(entry.timestamp) || Date.now(),
        }
      )
    } catch {
      return null
    }
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
          if (!entry || entry.type !== 'message') continue
          const message = this.#normalizeIncomingChannelMessage(entry)
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
    const coresMap = this.#channelCores.get(channelKey)
    if (!coresMap || !coreKeyHex || coresMap.has(coreKeyHex)) return

    try {
      const ns = this.#channelStore.namespace(`channel-${channelKey}`)
      const core = ns.get({
        key: b4a.from(coreKeyHex, 'hex'),
        valueEncoding: 'json',
      })
      await core.ready()
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

  #buildChannelHelloMessage(info) {
    const topicSet = getConnectionTopicSet(info)
    const channels = this.#channels
      .filter(channel => {
        if (!topicSet) return true
        const topics = [
          generateChannelDiscoveryKey(channel.channelKey),
          generateChannelChatDiscoveryKey(channel.channelKey),
          generateChannelIdDiscoveryKey(channel.channelId),
        ]
        return topics.some(topic => topicSet.has(b4a.toString(topic, 'hex')))
      })
      .map(channel => ({
        channelId: channel.channelId,
        channelKey: channel.channelKey,
        type: channel.type,
        createdAt: channel.createdAt,
        lastMessageAt: channel.lastMessageAt || '',
        writerCoreKeys: uniqueStrings([
          ...(channel.writerCoreKeys || []),
          this.#channelLocalCoreKey.get(channel.channelKey),
        ]),
      }))

    return {
      type: 'channel-hello',
      peerId: this.#nodeId(),
      authorName: this.#nodeId().slice(0, 4),
      channels,
    }
  }

  #sendChannelHello(record) {
    return Boolean(
      record?.protocol?.send(this.#buildChannelHelloMessage(record.info))
    )
  }

  #broadcastChannelHello() {
    for (const record of [...this.#channelStreams]) {
      this.#sendChannelHello(record)
    }
  }

  #sendChannelPresence(record, event) {
    if (!event || !this.#connectionSharesChannel(record?.info, event)) {
      return false
    }
    return Boolean(
      record?.protocol?.send({
        type: 'channel-presence',
        peerId: this.#nodeId(),
        channelId: event.channelId,
        channelKey: event.channelKey,
        address: event.address,
        status: event.status,
        displayName: event.displayName,
        avatar: event.avatar,
        profileUpdatedAt: event.profileUpdatedAt,
        lastSeen: event.lastSeen || Date.now(),
        sessionId: event.sessionId || 'default',
      })
    )
  }

  #sendCurrentChannelPresence(record) {
    for (const presences of this.#channelPresenceSessions.values()) {
      for (const session of presences.values()) {
        if (!session.local) continue
        this.#sendChannelPresence(
          record,
          this.#formatChannelPresence(
            session.channelKey,
            session.address,
            'online'
          )
        )
      }
    }
  }

  #broadcastChannelPresence(event) {
    for (const record of [...this.#channelStreams]) {
      this.#sendChannelPresence(record, event)
    }
  }

  #connectionSharesChannel(info, channelInput) {
    const topicSet = getConnectionTopicSet(info)
    if (!topicSet) return true
    const channelId = normalizeChannelId(
      channelInput?.channelId || channelInput?.channelKey || channelInput
    )
    if (!channelId) return false
    const channelKey = buildChannelKey(channelId)
    return [
      generateChannelDiscoveryKey(channelKey),
      generateChannelChatDiscoveryKey(channelKey),
      generateChannelIdDiscoveryKey(channelId),
    ].some(topic => topicSet.has(b4a.toString(topic, 'hex')))
  }

  #normalizePresenceSessionId(sessionId) {
    const value = String(sessionId || 'default')
      .trim()
      .slice(0, 100)
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
    const sessions = this.#channelPresenceSessions.get(channelKey)
    if (sessions) {
      const localAddresses = uniqueStrings(
        [...sessions.values()]
          .filter(session => session.local)
          .map(session => session.address)
      )
      this.#channelPresenceSessions.delete(channelKey)
      for (const address of localAddresses) {
        this.#broadcastChannelPresence(
          this.#formatChannelPresence(channelKey, address, 'offline')
        )
      }
    }
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

  #clearChannelPresenceRuntime(options = {}) {
    if (this.#channelPresenceSweepTimer) {
      clearInterval(this.#channelPresenceSweepTimer)
      this.#channelPresenceSweepTimer = null
    }
    if (options.broadcast) {
      for (const event of this.#removeChannelPresenceSessionsBySource(
        'local'
      )) {
        this.#broadcastChannelPresence(event)
      }
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

  #processChannelPresenceMessage(msg) {
    if (msg.type !== 'channel-presence') return null
    const peerId = String(msg.peerId || '').trim()
    if (!peerId || peerId === this.#nodeId()) return null
    const channelId = normalizeChannelId(msg.channelId || msg.channelKey)
    const channelKey = buildChannelKey(channelId)
    const localChannel = this.#channels.find(
      channel => channel.channelKey === channelKey
    )
    if (!localChannel) return peerId

    const address = normalizeChannelPresenceAddress(msg.address)
    if (!address) return peerId

    const status = String(msg.status || '').trim()
    const options = {
      address,
      sessionId: msg.sessionId,
      sourcePeerId: peerId,
      local: false,
      displayName: msg.displayName,
      avatar: msg.avatar,
      profileUpdatedAt: msg.profileUpdatedAt,
      lastSeen: Number(msg.lastSeen) || Date.now(),
    }
    let event = null
    let changed = false

    if (status === 'online') {
      event = this.#upsertChannelPresenceSession(localChannel, options)
      changed = true
    } else if (status === 'heartbeat') {
      event = this.#touchChannelPresenceSession(localChannel, options)
      changed = true
    } else if (status === 'profile') {
      event = this.#updateChannelPresenceProfile(localChannel, options)
      changed = true
    } else if (status === 'offline') {
      const events = this.#removeChannelPresenceSessions(
        localChannel.channelKey,
        options
      )
      event = events[events.length - 1] || null
      changed = true
    }

    if (changed) {
      this.#emitChannelPresenceSnapshot(event)
    }

    return peerId
  }

  async #processChannelHelloMessage(msg) {
    if (msg.type !== 'channel-hello') return null

    const remoteChannels = Array.isArray(msg.channels)
      ? msg.channels
          .filter(channel => channel && typeof channel === 'object')
          .map(channel => {
            const type = String(channel.type || 'public').trim() || 'public'
            const channelId = normalizeChannelId(channel.channelId)
            return {
              channelId,
              channelKey: buildChannelKey(channelId),
              type,
              createdAt:
                typeof channel.createdAt === 'string' ? channel.createdAt : '',
              lastMessageAt:
                typeof channel.lastMessageAt === 'string'
                  ? channel.lastMessageAt
                  : '',
              writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
            }
          })
          .filter(channel => channel.channelId && channel.channelKey)
      : []

    for (const remoteChannel of remoteChannels) {
      this.#cacheChannelCandidate({
        ...remoteChannel,
        local: false,
        peerId: msg.peerId,
      })

      const localChannel = this.#channels.find(
        channel => channel.channelKey === remoteChannel.channelKey
      )
      if (!localChannel) continue

      const peers = this.#channelPeers.get(localChannel.channelKey)
      if (peers && msg.peerId) {
        peers.set(msg.peerId, {
          peerId: msg.peerId,
          authorName: msg.authorName,
          lastSeen: Date.now(),
        })
      }

      await this.#mergeChannelWriterCoreKeys(
        localChannel,
        remoteChannel.writerCoreKeys
      )
    }

    this.#send('channel.status', {
      peerId: msg.peerId,
      snapshot: this.getSnapshot(),
    })
    return msg.peerId
  }

  #openChannelConnection(conn, info) {
    const record = {
      protocol: null,
      info,
      connectedPeerId: null,
      closed: false,
    }
    const cleanup = () => {
      if (record.closed) return
      record.closed = true
      this.#channelStreams.delete(record)
      if (!record.connectedPeerId) return
      for (const [, peers] of this.#channelPeers) {
        peers.delete(record.connectedPeerId)
      }
      const events = this.#removeChannelPresenceSessionsBySource(
        `peer:${record.connectedPeerId}`
      )
      if (events.length > 0) {
        this.#send('channel.presence', {
          presence: events[events.length - 1],
          snapshot: this.getSnapshot(),
        })
      }
      this.#send('channel.status', { snapshot: this.getSnapshot() })
      this.#emitSnapshot()
    }
    record.protocol = openChannelControlProtocol(conn, {
      onOpen: () => {
        this.#sendChannelHello(record)
        this.#sendCurrentChannelPresence(record)
      },
      onClose: cleanup,
      onMessage: async message => {
        try {
          const peerId =
            message.type === 'channel-presence'
              ? this.#processChannelPresenceMessage(message)
              : await this.#processChannelHelloMessage(message)
          if (peerId) record.connectedPeerId = peerId
        } catch (err) {
          this.#log('warn', `Failed to process channel hello: ${err.message}`)
        }
      },
    })
    if (!record.protocol) return null
    this.#channelStreams.add(record)
    conn.once('close', cleanup)
    conn.once('error', cleanup)
    return record
  }

  #ensureReady() {
    if (
      this.#node.status !== 'ready' ||
      !this.#fileStore ||
      !this.#channelStore ||
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
      const holding = this.#holdings.find(record => {
        try {
          return getCidInfo(record.cid).driveName === name
        } catch {
          return false
        }
      })
      let drive
      if (holding?.transport?.key) {
        const baseDrive = new Hyperdrive(
          this.#fileStore.session(),
          b4a.from(holding.transport.key, 'hex')
        )
        await baseDrive.ready()
        drive = baseDrive
        if (holding.transport.version > 0) {
          drive = baseDrive.checkout(holding.transport.version)
          Object.defineProperty(drive, DRIVE_BASE_SESSION, {
            value: baseDrive,
            configurable: true,
          })
        }
        Object.defineProperty(drive, DRIVE_TRANSPORT, {
          value: { ...holding.transport },
          configurable: true,
        })
      } else {
        drive = new Hyperdrive(
          this.#fileStore.namespace(`file-${createId('drive')}`)
        )
        await drive.ready()
      }
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

  #sealDrive(name, drive, version = drive.version) {
    const transport = {
      type: 'hyperdrive',
      key: b4a.toString(drive.key, 'hex'),
      version,
    }
    const snapshot = drive.checkout(version)
    Object.defineProperty(snapshot, DRIVE_BASE_SESSION, {
      value: drive,
      configurable: true,
    })
    Object.defineProperty(snapshot, DRIVE_TRANSPORT, {
      value: transport,
      configurable: true,
    })
    this.#drives.set(name, snapshot)
    return { drive: snapshot, transport }
  }

  #getDriveTransport(drive) {
    if (drive?.[DRIVE_TRANSPORT]) return { ...drive[DRIVE_TRANSPORT] }
    if (
      !drive?.key ||
      !Number.isSafeInteger(drive.version) ||
      drive.version <= 0
    ) {
      return null
    }
    return {
      type: 'hyperdrive',
      key: b4a.toString(drive.key, 'hex'),
      version: drive.version,
    }
  }

  #openFileDriveConnection(conn, info) {
    const record = { protocol: null, info }
    const protocol = openFileDriveProtocol(conn, {
      onRequest: cid => this.#getLocalFileOffer(cid, info),
      onOffer: offer => this.#registerRemoteDriveOffer(offer, record),
    })
    if (!protocol) return

    record.protocol = protocol
    this.#fileProtocols.add(record)
    const topicSet = getConnectionTopicSet(info)
    for (const [cid, discovery] of this.#discoveries) {
      if (!topicSet || topicSet.has(discovery.topic)) protocol.request(cid)
    }
    conn.once('close', () => {
      this.#fileProtocols.delete(record)
      this.#removeRemoteOffersForConnection(record)
    })
  }

  #getLocalFileOffer(cid, info) {
    let cidInfo
    try {
      cidInfo = getCidInfo(cid)
    } catch {
      return null
    }
    const topicSet = getConnectionTopicSet(info)
    if (topicSet && !topicSet.has(cidInfo.topicHex)) return null
    const holding = this.#holdings.find(
      record => record.cid === cidInfo.cid && record.state === 'ready'
    )
    if (!holding?.transport) return null
    return {
      type: 'offer',
      cid: holding.cid,
      driveKey: holding.transport.key,
      driveVersion: holding.transport.version,
    }
  }

  #registerRemoteDriveOffer(offer, record) {
    const cid = String(offer?.cid || '')
    const driveKeyHex = String(offer?.driveKey || '').toLowerCase()
    const driveVersion = Number(offer?.driveVersion)
    if (!/^[a-f0-9]{64}$/.test(driveKeyHex)) return
    if (!Number.isSafeInteger(driveVersion) || driveVersion <= 0) return

    let cidInfo
    try {
      cidInfo = getCidInfo(cid)
    } catch {
      return
    }
    if (!this.#discoveries.has(cidInfo.cid)) return
    const topicSet = getConnectionTopicSet(record.info)
    if (topicSet && !topicSet.has(cidInfo.topicHex)) return

    const localHolding = this.#holdings.find(item => item.cid === cidInfo.cid)
    if (
      localHolding?.transport?.key === driveKeyHex &&
      localHolding.transport.version === driveVersion
    ) {
      return
    }

    const conflictsWithLocalHolding = this.#holdings.some(
      item => item.transport?.key === driveKeyHex && item.cid !== cidInfo.cid
    )
    if (conflictsWithLocalHolding) return

    for (const [offeredCid, offeredCandidates] of this.#remoteOffers) {
      const conflictsWithRemoteOffer = [...offeredCandidates.values()].some(
        candidate =>
          candidate.offer.driveKey === driveKeyHex && offeredCid !== cidInfo.cid
      )
      if (conflictsWithRemoteOffer) return
    }

    let offers = this.#remoteOffers.get(cidInfo.cid)
    if (!offers) {
      offers = new Map()
      this.#remoteOffers.set(cidInfo.cid, offers)
    }
    const id = `${driveKeyHex}:${driveVersion}`
    const existing = offers.get(id)
    if (existing) {
      existing.sources.add(record)
      return
    }
    if (offers.size >= MAX_REMOTE_CANDIDATES_PER_CID) return
    offers.set(id, {
      offer: { cid: cidInfo.cid, driveKey: driveKeyHex, driveVersion },
      sources: new Set([record]),
    })
  }

  #getRemoteDriveCandidates(cid) {
    return [...(this.#remoteDrives.get(cid)?.values() || [])]
  }

  async #ensureRemoteDriveCandidates(cid) {
    const offers = this.#remoteOffers.get(cid)
    if (!offers?.size) return
    let drives = this.#remoteDrives.get(cid)
    if (!drives) {
      drives = new Map()
      this.#remoteDrives.set(cid, drives)
    }
    for (const [id, candidate] of offers) {
      if (drives.has(id) || this.#remoteDrivePromises.has(`${cid}:${id}`))
        continue
      const pending = this.#pendingDrivePurgeSessions.get(
        candidate.offer.driveKey
      )
      if (pending) {
        drives.set(id, pending)
        continue
      }
      const promiseKey = `${cid}:${id}`
      const openPromise = this.#withRemoteDriveOpenSlot(async () => {
        const baseDrive = new Hyperdrive(
          this.#fileStore.session(),
          b4a.from(candidate.offer.driveKey, 'hex')
        )
        await baseDrive.ready()
        const drive = baseDrive.checkout(candidate.offer.driveVersion)
        Object.defineProperty(drive, DRIVE_BASE_SESSION, {
          value: baseDrive,
          configurable: true,
        })
        Object.defineProperty(drive, DRIVE_TRANSPORT, {
          value: {
            type: 'hyperdrive',
            key: candidate.offer.driveKey,
            version: candidate.offer.driveVersion,
          },
          configurable: true,
        })
        drives.set(id, drive)
      })
      this.#remoteDrivePromises.set(promiseKey, openPromise)
      try {
        await openPromise
      } finally {
        this.#remoteDrivePromises.delete(promiseKey)
      }
    }
  }

  async #withRemoteDriveOpenSlot(operation) {
    if (this.#remoteDriveOpenCount >= MAX_UNVERIFIED_DRIVE_OPENS) {
      await new Promise(resolve => this.#remoteDriveOpenWaiters.push(resolve))
    }
    this.#remoteDriveOpenCount += 1
    try {
      return await operation()
    } finally {
      this.#remoteDriveOpenCount -= 1
      this.#remoteDriveOpenWaiters.shift()?.()
    }
  }

  #removeRemoteOffersForConnection(record) {
    for (const [cid, offers] of this.#remoteOffers) {
      for (const [id, candidate] of offers) {
        candidate.sources.delete(record)
        if (candidate.sources.size !== 0) continue
        offers.delete(id)
        const drives = this.#remoteDrives.get(cid)
        const drive = drives?.get(id)
        const selected = this.#drives.get(getCidInfo(cid).driveName)
        if (drive && drive !== selected) {
          drives.delete(id)
          closeDriveSessions(drive).catch(() => {})
        }
        if (drives?.size === 0) this.#remoteDrives.delete(cid)
      }
      if (offers.size === 0) this.#remoteOffers.delete(cid)
    }
  }

  async #rejectRemoteDriveCandidate(cid, drive) {
    const transport = this.#getDriveTransport(drive)
    if (!transport) {
      await closeDriveSessions(drive)
      return
    }
    const id = `${transport.key}:${transport.version}`
    const drives = this.#remoteDrives.get(cid)
    drives?.delete(id)
    if (drives?.size === 0) this.#remoteDrives.delete(cid)
    const offers = this.#remoteOffers.get(cid)
    offers?.delete(id)
    if (offers?.size === 0) this.#remoteOffers.delete(cid)
    const { driveName } = getCidInfo(cid)
    if (this.#drives.get(driveName) === drive) {
      this.#drives.delete(driveName)
    }
    const staging = this.#holdings.find(
      holding =>
        holding.cid === cid &&
        holding.state === 'staging' &&
        holding.transport.key === transport.key &&
        holding.transport.version === transport.version
    )
    if (staging) this.#removeHolding(cid)
    this.#pendingDrivePurgeSessions.delete(transport.key)
    this.#pendingDrivePurges.add(transport.key)
    this.#savePendingDrivePurges()
    await closeDriveSessions(drive)
  }

  #getDriveEntrySource(entry, fallbackDrive) {
    return entry?.[DRIVE_ENTRY_SOURCE] || fallbackDrive
  }

  #advertiseFileHolding(cid) {
    for (const record of this.#fileProtocols) {
      const offer = this.#getLocalFileOffer(cid, record.info)
      if (offer) record.protocol.offer(offer)
    }
  }

  #requestRemoteFileDrives(cid) {
    for (const record of this.#fileProtocols) {
      record.protocol.request(cid)
    }
  }

  async #joinCidTopic(cid, options = {}) {
    const { topic, topicHex, driveName } = getCidInfo(cid)
    const requestedServer = options.server !== false
    const requestedClient = options.client === true

    this.#setSeedState(cid, {
      status: 'joining',
      topic: topicHex,
      driveName,
      error: '',
    })

    const existing = this.#discoveries.get(cid)
    if (existing) {
      const nextServer = existing.server || requestedServer
      const nextClient = existing.client || requestedClient
      if (nextServer === existing.server && nextClient === existing.client) {
        this.#setSeedState(cid, {
          status: 'active',
          topic: topicHex,
          driveName,
          error: '',
        })
        return existing
      }

      await this.#swarm.leave(topic).catch(() => {})
      this.#discoveries.delete(cid)
    }

    const discovery = this.#swarm.join(topic, {
      server: existing?.server || requestedServer,
      client: existing?.client || requestedClient,
    })
    const record = {
      discovery,
      topic: topicHex,
      driveName,
      server: existing?.server || requestedServer,
      client: existing?.client || requestedClient,
    }
    this.#discoveries.set(cid, record)
    this.#requestRemoteFileDrives(cid)
    this.#setSeedState(cid, {
      status: 'active',
      topic: topicHex,
      driveName,
      error: '',
    })

    discovery.flushed?.().then(
      () => this.#emitSnapshot(),
      () => {}
    )

    return record
  }

  async #waitForDriveEntry(drive, driveKey, timeout, transferId, cid = null) {
    const startedAt = Date.now()
    let pollInterval = DOWNLOAD_POLL_INTERVAL_MIN
    let lastDriveUpdate = 0
    const getCandidateDrives = () =>
      [drive, ...(cid ? this.#getRemoteDriveCandidates(cid) : [])].filter(
        Boolean
      )
    const pendingUpdates = new WeakMap()
    const pendingEntries = new WeakMap()
    const updateCandidate = candidate => {
      const updateDrive = candidate[DRIVE_BASE_SESSION] || candidate
      let pending = pendingUpdates.get(updateDrive)
      if (!pending) {
        pending = updateDrive
          .update()
          .catch(() => {})
          .finally(() => pendingUpdates.delete(updateDrive))
        pendingUpdates.set(updateDrive, pending)
      }
      return Promise.race([pending, sleep(DOWNLOAD_POLL_INTERVAL_MIN)])
    }
    const markEntrySource = (entry, sourceDrive) => {
      if (entry) {
        Object.defineProperty(entry, DRIVE_ENTRY_SOURCE, {
          value: sourceDrive,
          configurable: true,
        })
      }
      return entry
    }
    const isReadableCandidate = async (candidate, entry) => {
      if (!entry?.value?.blob) return false
      if (candidate !== drive) return true
      return candidate.has(driveKey).catch(() => false)
    }
    const readCandidateEntry = candidate => {
      let pending = pendingEntries.get(candidate)
      if (!pending) {
        pending = candidate
          .entry(driveKey)
          .catch(() => null)
          .finally(() => pendingEntries.delete(candidate))
        pendingEntries.set(candidate, pending)
      }
      return Promise.race([
        pending,
        sleep(DOWNLOAD_POLL_INTERVAL_MIN).then(() => null),
      ])
    }
    const findReadableEntry = async () => {
      const candidates = getCandidateDrives()
      const entries = await Promise.all(candidates.map(readCandidateEntry))
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        const entry = entries[index]
        if (await isReadableCandidate(candidate, entry)) {
          return markEntrySource(entry, candidate)
        }
      }
      return null
    }

    if (cid) await this.#ensureRemoteDriveCandidates(cid)
    while (Date.now() - startedAt < timeout) {
      const now = Date.now()
      if (cid) await this.#ensureRemoteDriveCandidates(cid)
      if (now - lastDriveUpdate > DRIVE_UPDATE_INTERVAL) {
        lastDriveUpdate = now
        await Promise.allSettled(getCandidateDrives().map(updateCandidate))
      }

      const entry = await findReadableEntry()
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

    await Promise.allSettled(getCandidateDrives().map(updateCandidate))
    if (cid) await this.#ensureRemoteDriveCandidates(cid)
    return findReadableEntry()
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

  async #recoverStagingHoldings() {
    for (const holding of [...this.#holdings]) {
      if (holding.state !== 'staging') continue
      let valid = false
      let verifiedSize = holding.size
      const tempPath = path.join(
        this.#downloadPath,
        `.recover-${holding.cid}.part`
      )
      safeRm(tempPath)
      try {
        if (holding.transport.version > 0) {
          const drive = await this.#getOrCreateDrive(
            getCidInfo(holding.cid).driveName
          )
          const driveKey = `/${holding.cid}`
          const entry = await drive.entry(driveKey, { wait: false })
          if (
            entry?.value?.blob &&
            (await drive.has(driveKey).catch(() => false))
          ) {
            await pipeDriveToFile(drive.createReadStream(driveKey), tempPath, {
              timeout: STREAM_READ_TIMEOUT,
            })
            const calculated = await calculateCid({ filePath: tempPath })
            valid = calculated.cid === holding.cid
            verifiedSize = calculated.size || holding.size
          }
        }
      } catch {
        valid = false
      } finally {
        safeRm(tempPath)
      }
      if (valid) {
        this.#upsertHolding({
          ...holding,
          state: 'ready',
          size: verifiedSize,
        })
      } else {
        await this.#purgeHolding(holding)
      }
    }
  }

  async #discardStagingHolding(cid) {
    if (!cid) return
    const holding = this.#holdings.find(
      record => record.cid === cid && record.state === 'staging'
    )
    if (holding) await this.#purgeHolding(holding)
  }

  async #flushPendingDrivePurges() {
    const retainedKeys = new Set(
      this.#holdings.map(holding => holding.transport.key)
    )
    for (const key of [...this.#pendingDrivePurges]) {
      if (retainedKeys.has(key)) {
        this.#pendingDrivePurges.delete(key)
        continue
      }
      try {
        const drive = new Hyperdrive(
          this.#fileStore.session(),
          b4a.from(key, 'hex')
        )
        await purgeDriveLocalBlocks(drive)
        this.#pendingDrivePurges.delete(key)
      } catch {}
    }
    this.#savePendingDrivePurges()
  }

  #loadPendingDrivePurges() {
    const filePath = path.join(this.#storagePath, PENDING_PURGES_FILE)
    try {
      if (!fs.existsSync(filePath)) return
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      this.#pendingDrivePurges = new Set(
        Array.isArray(parsed?.keys)
          ? parsed.keys.filter(key => /^[a-f0-9]{64}$/.test(key))
          : []
      )
    } catch {
      this.#pendingDrivePurges.clear()
    }
  }

  #savePendingDrivePurges() {
    const filePath = path.join(this.#storagePath, PENDING_PURGES_FILE)
    if (this.#pendingDrivePurges.size === 0) {
      safeRm(filePath)
      return
    }
    atomicWrite(
      filePath,
      JSON.stringify({ schemaVersion: 1, keys: [...this.#pendingDrivePurges] })
    )
  }

  async #purgeHolding(holdingInput) {
    const holding =
      typeof holdingInput === 'string'
        ? this.#holdings.find(record => record.cid === holdingInput)
        : holdingInput
    if (!holding) return
    const { cid, driveName } = getCidInfo(holding.cid)
    let detached = this.#drives.get(driveName)
    this.#drives.delete(driveName)
    const candidates = this.#remoteDrives.get(cid)
    if (candidates) {
      for (const [id, candidate] of candidates) {
        const transport = this.#getDriveTransport(candidate)
        if (
          transport?.key === holding.transport.key &&
          transport.version === holding.transport.version
        ) {
          detached ||= candidate
          candidates.delete(id)
        }
      }
    }
    this.#removeHolding(cid)
    this.#pendingDrivePurges.add(holding.transport.key)
    if (detached) {
      detached.setActive(false)
      this.#pendingDrivePurgeSessions.set(holding.transport.key, detached)
    }
    this.#savePendingDrivePurges()
  }

  #normalizeHolding(record = {}) {
    const { cid, driveName } = getCidInfo(record.cid)
    const size = Number(record.size)
    if (!Number.isFinite(size) || size < 0) {
      throw new Error('Holding size must be a non-negative number')
    }
    const state = record.state === 'staging' ? 'staging' : 'ready'
    const transport =
      record.transport || this.#getDriveTransport(this.#drives.get(driveName))
    const key = String(transport?.key || '')
      .trim()
      .toLowerCase()
    const version = Number(transport?.version)
    if (!/^[a-f0-9]{64}$/.test(key)) {
      throw new Error('Holding transport key is required')
    }
    if (
      !Number.isSafeInteger(version) ||
      version < 0 ||
      (state === 'ready' && version <= 0)
    ) {
      throw new Error('Holding transport version is invalid')
    }
    return {
      cid,
      fileName: sanitizeFilename(record.fileName || cid),
      size,
      localPath: normalizeFileUri(record.localPath || ''),
      source: record.source === 'downloaded' ? 'downloaded' : 'published',
      state,
      transport: { type: 'hyperdrive', key, version },
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
    if (next.state === 'ready') {
      if (this.#pendingDrivePurges.delete(next.transport.key)) {
        this.#savePendingDrivePurges()
      }
      const pendingSession = this.#pendingDrivePurgeSessions.get(
        next.transport.key
      )
      pendingSession?.setActive(true)
      this.#pendingDrivePurgeSessions.delete(next.transport.key)
      this.#advertiseFileHolding(next.cid)
    }
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
      topic: getCidInfo(holding.cid).topicHex,
      status,
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
    }

    if (index === -1) {
      this.#transfers.unshift(next)
      this.#transfers = this.#transfers.slice(0, 20)
    } else {
      this.#transfers[index] = {
        ...this.#transfers[index],
        ...next,
      }
    }

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

  #loadHoldings() {
    const filePath = path.join(this.#storagePath, HOLDINGS_FILE)
    try {
      if (!fs.existsSync(filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (
        parsed?.schemaVersion !== HOLDINGS_SCHEMA_VERSION ||
        !Array.isArray(parsed.holdings)
      ) {
        throw new Error('Unsupported node holdings metadata')
      }
      const holdings = parsed.holdings.map(record =>
        this.#normalizeHolding(record)
      )
      const transportOwners = new Map()
      for (const holding of holdings) {
        const existingCid = transportOwners.get(holding.transport.key)
        if (existingCid && existingCid !== holding.cid) {
          throw new Error(
            'Snapshot drive key must not be shared across holdings'
          )
        }
        transportOwners.set(holding.transport.key, holding.cid)
      }
      return holdings
    } catch (err) {
      throw new Error(`Failed to load holdings: ${err.message}`)
    }
  }

  #saveHoldings() {
    const filePath = path.join(this.#storagePath, HOLDINGS_FILE)
    atomicWrite(
      filePath,
      JSON.stringify(
        { schemaVersion: HOLDINGS_SCHEMA_VERSION, holdings: this.#holdings },
        null,
        2
      )
    )
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
      return 'mobile'
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
