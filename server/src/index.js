/**
 * MostBoxEngine - 核心 P2P 引擎
 * 基于 Hyperswarm/Hyperdrive 的跨平台 P2P 文件共享引擎
 *
 * 架构设计：
 * - Hyperdrive: 只负责存储文件内容，key 使用 CID（解耦存储与目录结构）
 * - published-files.json: 维护文件元数据和显示路径（用户看到的文件夹结构）
 * - 移动/重命名只需更新 JSON，零成本，不修改 Hyperdrive
 */

import EventEmitter from 'eventemitter3'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { calculateCid, parseMostLink } from './core/cid.js'
import { normalizeChannelAttachment } from './core/channelAttachment.js'
import { getCidInfo } from './core/cidTopic.js'
import {
  sanitizeFilename,
  validateAndSanitizePath,
  validateFileSize,
  checkDirectoryWritable,
  formatFileSize,
} from './utils/security.js'
import {
  ValidationError,
  PathSecurityError,
  FileSizeError,
  PeerNotFoundError,
  IntegrityError,
  PermissionError,
  ConflictError,
  StorageCapacityError,
  EngineNotInitializedError,
} from './utils/errors.js'
import {
  GLOBAL_SHARED_SEED_STRING,
  MAX_FILE_SIZE,
  CONNECTION_TIMEOUT,
  DOWNLOAD_TIMEOUT,
  SWARM_BOOTSTRAP,
  MAX_PEERS,
  SWARM_KEEP_ALIVE_INTERVAL,
  SWARM_RANDOM_PUNCH_INTERVAL,
  DRIVE_ENTRY_TIMEOUT,
  STREAM_READ_TIMEOUT,
  FILE_WRITE_CHUNK_SIZE,
  DOWNLOAD_POLL_INTERVAL_MIN,
  DOWNLOAD_POLL_INTERVAL_MAX,
  DRIVE_UPDATE_INTERVAL,
  HOLDING_REJOIN_BATCH_SIZE,
  HOLDING_REJOIN_BATCH_DELAY,
  PROGRESS_THROTTLE,
  DEFAULT_READ_LIMIT,
  CHANNEL_NAME_MIN_LENGTH,
  CHANNEL_NAME_MAX_LENGTH,
  CHANNEL_NAME_REGEX,
  CHANNEL_NAME_PREFIX,
  CHANNEL_MESSAGE_LIMIT,
  MAX_MESSAGE_LENGTH,
} from './config.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const CHAT_FILE_ROOT = 'chat-file'
const TRANSIENT_CHANNEL_TYPES = new Set(['game'])
const DEFAULT_OWNER_BUCKET = '__local__'
const USER_SYNC_SCHEMA_VERSION = 1
const USER_SYNC_NAMESPACE_PREFIX = 'user.sync.'
const USER_SYNC_KEY_HEX_LENGTH = 64
const CHANNEL_FINGERPRINT_BYTES = 8
const CHANNEL_WRITER_ID_BYTES = 8
const CHANNEL_DISCOVERY_TIMEOUT = 600
const CHANNEL_CANDIDATE_TTL = 30 * 1000
const CHANNEL_KEY_SEPARATOR = '.'

function normalizeOwnerAddress(address) {
  const value = String(address || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : ''
}

function getOwnerBucketKey(address) {
  return normalizeOwnerAddress(address) || DEFAULT_OWNER_BUCKET
}

function normalizeMetadataBuckets(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  const buckets = {}
  for (const [rawOwner, records] of Object.entries(input)) {
    const ownerKey =
      rawOwner === DEFAULT_OWNER_BUCKET
        ? DEFAULT_OWNER_BUCKET
        : normalizeOwnerAddress(rawOwner)
    if (!ownerKey || !Array.isArray(records)) continue
    buckets[ownerKey] = records.map(record => ({ ...record }))
  }
  return buckets
}

function cloneMetadataRecord(record, ownerAddress = '') {
  return {
    ...record,
    ownerAddress:
      ownerAddress && ownerAddress !== DEFAULT_OWNER_BUCKET ? ownerAddress : '',
  }
}

function getPathBaseName(fileName) {
  const parts = String(fileName || '').split('/').filter(Boolean)
  return parts[parts.length - 1] || 'unnamed_file'
}

function getDisplayPathFolder(fileName) {
  const parts = String(fileName || '').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function buildMostLink(cid, fileName) {
  return `most://${cid}?filename=${encodeURIComponent(fileName)}`
}

function normalizeChannelDisplayName(input, fallbackAddress = '') {
  const value = String(input || '').trim()
  if (value) return value.slice(0, 50)
  return fallbackAddress ? fallbackAddress.slice(0, 10) : ''
}

function normalizeChannelAvatar(input) {
  const value = String(input || '').trim()
  return value ? value.slice(0, 4096) : ''
}

function normalizeChannelId(input) {
  return String(input || '').trim()
}

function createChannelFingerprint() {
  return crypto.randomBytes(CHANNEL_FINGERPRINT_BYTES).toString('hex')
}

function createChannelWriterId() {
  return crypto.randomBytes(CHANNEL_WRITER_ID_BYTES).toString('hex')
}

function buildChannelKey(channelId, fingerprint) {
  return `${channelId}${CHANNEL_KEY_SEPARATOR}${fingerprint}`
}

function normalizeChannelKey(input) {
  return String(input || '').trim()
}

function getChannelFingerprintFromKey(channelId, channelKey) {
  const prefix = `${channelId}${CHANNEL_KEY_SEPARATOR}`
  return channelKey.startsWith(prefix) ? channelKey.slice(prefix.length) : ''
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
}

function normalizeUserSyncKey(input) {
  const value = String(input || '').trim().replace(/^0x/i, '').toLowerCase()
  return /^[0-9a-f]+$/.test(value) && value.length === USER_SYNC_KEY_HEX_LENGTH
    ? value
    : ''
}

function deriveUserSyncId(syncTopicKey) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(syncTopicKey, 'hex'))
    .digest('hex')
    .slice(0, 24)
}

function getUserSyncName(syncId) {
  return `${USER_SYNC_NAMESPACE_PREFIX}${syncId}`
}

function getSyncTimestamp(input, fallback = Date.now()) {
  const numeric = Number(input)
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)
  const parsed = Date.parse(String(input || ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getNextSyncTimestamp(previous) {
  return Math.max(Date.now(), getSyncTimestamp(previous, 0) + 1)
}

function createOfflineSwarm() {
  return {
    connections: new Set(),
    keyPair: {
      publicKey: crypto.randomBytes(32),
    },
    on() {},
    join() {
      return {}
    },
    leave() {
      return Promise.resolve()
    },
    destroy() {
      return Promise.resolve()
    },
  }
}

export class MostBoxEngine extends EventEmitter {
  #store = null
  #swarm = null
  #drives = new Map()
  #publishedFiles = {}
  #holdings = []
  #trashFiles = {}
  #initialized = false
  #options = null
  #activeDownloads = new Map()
  #drivePromises = new Map()
  #fileDiscoveries = new Map()
  #fileMonitors = new Map()
  #seedStates = new Map()
  #holdingResumeTask = null

  #channels = []
  #channelCores = new Map()
  #channelLocalCoreKey = new Map()
  #channelDiscoveries = new Map()
  #channelChatDiscoveries = new Map()
  #channelIdDiscoveries = new Map()
  #channelPeers = new Map()
  #channelCandidateCache = new Map()

  #userSyncSessions = new Map()
  #userSyncCores = new Map()
  #userSyncCoreOffsets = new Map()
  #userSyncDiscoveries = new Map()
  #userSyncMetadata = { sessions: {}, clocks: {} }

  #chatSwarm = null

  /**
   * 创建新的 MostBoxEngine 实例
   * @param {object} options - 配置选项
   * @param {string} options.dataPath - 存储 P2P 数据的路径（必填）
   * @param {string} [options.downloadPath] - 默认下载路径（可选，默认为 dataPath/downloads）
   * @param {number} [options.maxFileSize] - 最大文件大小（字节）（默认：10GB）
   * @param {number} [options.capacityBytes] - 节点存储容量上限（字节）（默认：100GB）
   * @param {boolean} [options.disableNetwork] - 测试用：跳过真实 Hyperswarm 网络
   */
  constructor(options) {
    super()

    if (!options || !options.dataPath) {
      throw new Error('dataPath is required')
    }

    this.#options = {
      dataPath: options.dataPath,
      downloadPath:
        options.downloadPath || path.join(options.dataPath, 'downloads'),
      maxFileSize: options.maxFileSize || MAX_FILE_SIZE,
      capacityBytes: options.capacityBytes || 100 * 1024 * 1024 * 1024,
      downloadTimeout: options.downloadTimeout || DOWNLOAD_TIMEOUT,
      disableNetwork: options.disableNetwork === true,
    }
  }

  /**
   * 初始化引擎 — 必须在调用其他方法之前调用
   */
  async start() {
    if (this.#initialized) {
      return
    }

    const { dataPath } = this.#options

    console.log(`[MostBox] Initializing engine...`)
    console.log(`[MostBox] Storage path: ${dataPath}`)

    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
    }

    const GLOBAL_SHARED_SEED = b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING)
    this.#store = new Corestore(dataPath, {
      primaryKey: GLOBAL_SHARED_SEED,
      unsafe: true,
    })

    try {
      await this.#store.ready()
      console.log(`[MostBox] Corestore ready`)
    } catch (err) {
      if (
        err.message &&
        err.message.includes('Another corestore is stored here')
      ) {
        console.log(`[MostBox] Resetting corrupt storage...`)
        fs.rmSync(dataPath, { recursive: true, force: true })
        fs.mkdirSync(dataPath, { recursive: true })
        this.#store = new Corestore(dataPath, {
          primaryKey: GLOBAL_SHARED_SEED,
          unsafe: true,
        })
        await this.#store.ready()
        console.log(`[MostBox] Corestore reset and ready`)
      } else if (err.message && err.message.includes('Invalid device file')) {
        throw new Error(`存储文件损坏，请关闭其他访问 ${dataPath} 的程序后重试`)
      } else if (
        err.message &&
        err.message.includes('File descriptor could not be locked')
      ) {
        throw new Error(
          `存储文件被锁定，请关闭其他访问 ${dataPath} 的程序后重试`
        )
      } else {
        throw err
      }
    }

    console.log(`[MostBox] Initializing Hyperswarm...`)
    if (this.#options.disableNetwork) {
      this.#swarm = createOfflineSwarm()
      this.#chatSwarm = createOfflineSwarm()
    } else {
      this.#swarm = new Hyperswarm({
        maxPeers: MAX_PEERS,
        bootstrap: SWARM_BOOTSTRAP,
        firewall: () => false,
        connectionKeepAlive: SWARM_KEEP_ALIVE_INTERVAL,
        randomPunchInterval: SWARM_RANDOM_PUNCH_INTERVAL,
        handshakeTimeout: CONNECTION_TIMEOUT,
      })
    }

    this.#swarm.on('error', err => {
      if (
        err.code === 'SSL_ERROR' ||
        err.message?.includes('handshake') ||
        err.message?.includes('ECONNRESET')
      ) {
        console.warn('[MostBox] Network warning (non-critical):', err.message)
        return
      }
      console.error('[MostBox] Swarm error:', err.message)
      this.emit('error', err)
    })

    this.#swarm.on('connection', (conn, _info) => {
      conn.on('error', err => {
        if (err.code === 'SSL_ERROR' || err.message?.includes('handshake')) {
          return
        }
      })

      this.#store.replicate(conn)
      this.emit('connection', conn)
    })

    if (!this.#options.disableNetwork) {
      this.#chatSwarm = new Hyperswarm({
        maxPeers: MAX_PEERS,
        bootstrap: SWARM_BOOTSTRAP,
        firewall: () => false,
        connectionKeepAlive: SWARM_KEEP_ALIVE_INTERVAL,
        randomPunchInterval: SWARM_RANDOM_PUNCH_INTERVAL,
        handshakeTimeout: CONNECTION_TIMEOUT,
      })
    }

    this.#chatSwarm.on('error', err => {
      if (
        err.code === 'SSL_ERROR' ||
        err.message?.includes('handshake') ||
        err.message?.includes('ECONNRESET')
      ) {
        console.warn(
          '[MostBox] Chat swarm warning (non-critical):',
          err.message
        )
        return
      }
      console.error('[MostBox] Chat swarm error:', err.message)
      this.emit('error', err)
    })

    this.#chatSwarm.on('connection', (conn, _info) => {
      conn.on('error', err => {
        if (err.code === 'SSL_ERROR' || err.message?.includes('handshake')) {
          return
        }
      })

      this.#handleChannelConnection(conn).catch(() => {})
    })

    this.#publishedFiles = this.#loadPublishedMetadata()
    console.log(
      `[MostBox] Loaded ${this.#countBucketRecords(this.#publishedFiles)} published files`
    )

    this.#holdings = this.#loadHoldingsMetadata()
    console.log(`[MostBox] Loaded ${this.#holdings.length} node holdings`)

    for (const holding of this.#holdings) {
      this.#setSeedState(holding.cid, {
        status: 'queued',
        topic: holding.topic,
        driveName: holding.driveName,
      })
    }

    this.#trashFiles = this.#loadTrashMetadata()
    console.log(
      `[MostBox] Loaded ${this.#countBucketRecords(this.#trashFiles)} trash files`
    )

    this.#channels = this.#loadChannelsMetadata()
    console.log(`[MostBox] Loaded ${this.#channels.length} channels`)

    for (const channel of this.#channels) {
      try {
        await this.#openChannelRuntime(channel)
        await this.#joinChannelDiscoveryTopics(channel)
        console.log(`[MostBox] Rejoined channel: ${channel.channelKey}`)
      } catch (err) {
        console.warn(
          `[MostBox] Failed to rejoin channel ${channel.channelKey}:`,
          err.message
        )
      }
    }

    this.#userSyncMetadata = this.#loadUserSyncMetadata()

    this.#initialized = true
    console.log(`[MostBox] Engine initialized successfully`)
    this.emit('ready')
    this.#resumeHoldingsInBackground()

    return this
  }

  /**
   * 停止引擎并清理资源
   */
  async stop() {
    if (!this.#initialized) {
      return
    }

    for (const task of this.#activeDownloads.values()) {
      task.aborted = true
      if (task.readStream) task.readStream.destroy()
      if (task.writeStream) task.writeStream.destroy()
    }
    this.#activeDownloads.clear()

    await Promise.allSettled(
      [...this.#fileMonitors.values()].map(item => this.#closeFileMonitor(item))
    )
    this.#fileMonitors.clear()
    await Promise.allSettled([...this.#drives.values()].map(d => d.close()))
    this.#drives.clear()
    this.#fileDiscoveries.clear()
    this.#seedStates.clear()
    this.#holdingResumeTask = null

    if (this.#swarm) {
      await this.#swarm.destroy()
      this.#swarm = null
    }

    if (this.#chatSwarm) {
      await this.#chatSwarm.destroy()
      this.#chatSwarm = null
    }

    for (const [, coresMap] of this.#channelCores) {
      for (const [, core] of coresMap) {
        try {
          await core.close()
        } catch (err) {
          console.warn('[MostBox] Failed to close channel core:', err.message)
        }
      }
    }
    this.#channelCores.clear()
    this.#channelLocalCoreKey.clear()
    this.#channelDiscoveries.clear()
    this.#channelChatDiscoveries.clear()
    this.#channelIdDiscoveries.clear()
    this.#channelPeers.clear()
    this.#channelCandidateCache.clear()
    this.#channels = []

    for (const [, coresMap] of this.#userSyncCores) {
      for (const [, core] of coresMap) {
        try {
          await core.close()
        } catch (err) {
          console.warn('[MostBox] Failed to close user sync core:', err.message)
        }
      }
    }
    this.#userSyncSessions.clear()
    this.#userSyncCores.clear()
    this.#userSyncCoreOffsets.clear()
    this.#userSyncDiscoveries.clear()

    if (this.#store) {
      await this.#store.close()
      this.#store = null
    }

    this.#initialized = false
    this.emit('stopped')
  }

  /**
   * 获取节点的公钥
   * @returns {string} 节点 ID（十六进制字符串）
   */
  getNodeId() {
    this.#ensureInitialized()
    return b4a.toString(this.#swarm.keyPair.publicKey, 'hex')
  }

  /**
   * 获取当前网络状态
   * @returns {{ peers: number, status: string }}
   */
  getNetworkStatus() {
    this.#ensureInitialized()
    const appConnections = this.#swarm.connections.size
    const chatConnections = this.#chatSwarm.connections.size
    const total = appConnections + chatConnections
    return {
      peers: total,
      appPeers: appConnections,
      chatPeers: chatConnections,
      status: total > 0 ? 'connected' : 'waiting',
    }
  }

  /**
   * 将内容发布到 P2P 网络
   * Hyperdrive 中存储 key 为 '/' + cid，metadata 中存储 displayName（用户看到的路径）
   * @param {string|Buffer} content - 文件路径（字符串）或内容（Buffer）
   * @param {string} [fileName] - 文件名（Buffer 输入时必填）
   * @param {object} [options] - 发布选项
   * @returns {Promise<{ cid: string, link: string, fileName: string }>}
   */
  async publishFile(content, fileName, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    let cleanPath = null
    let safeFileName
    let fileSize

    if (Buffer.isBuffer(content)) {
      if (!fileName) {
        throw new Error('fileName is required when publishing Buffer content')
      }
      safeFileName = sanitizeFilename(fileName)
      fileSize = content.length
    } else {
      cleanPath = content
      const pathValidation = validateAndSanitizePath(cleanPath)
      if (pathValidation.error) {
        throw new PathSecurityError(pathValidation.error)
      }
      cleanPath = pathValidation.cleanPath

      const sizeValidation = await validateFileSize(
        cleanPath,
        this.#options.maxFileSize
      )
      if (!sizeValidation.valid) {
        throw new FileSizeError(sizeValidation.error, sizeValidation.size)
      }
      fileSize = sizeValidation.size

      safeFileName = sanitizeFilename(fileName || path.basename(cleanPath))
    }

    if (fileSize > this.#options.maxFileSize) {
      const maxGB = Math.round(this.#options.maxFileSize / (1024 * 1024 * 1024))
      throw new FileSizeError(
        `File size exceeds limit of ${maxGB} GB`,
        fileSize
      )
    }

    this.#checkCapacity(fileSize)

    this.emit('publish:progress', {
      stage: 'calculating-cid',
      file: safeFileName,
    })

    const { cid: rootCid } = await calculateCid(content)
    const cidString = rootCid.toString()
    const { driveName: name } = this.#getCidInfo(cidString)
    const publishedBucket = this.#getPublishedBucket(ownerAddress, true)
    // 检查相同内容是否已存在
    const existingIndex = publishedBucket.findIndex(f => f.cid === cidString)
    if (existingIndex !== -1) {
      const existing = publishedBucket[existingIndex]
      await this.#joinCidTopicInternal(cidString, {
        server: true,
        client: false,
      })
      this.#upsertHolding({
        cid: cidString,
        fileName: existing.fileName,
        size: fileSize,
        driveName: name,
        source: 'published',
      })
      return {
        cid: cidString,
        link: `most://${cidString}?filename=${encodeURIComponent(existing.fileName)}`,
        fileName: existing.fileName,
        alreadyExists: true,
      }
    }

    this.#assertDisplayNameAvailable(safeFileName, {
      ownerAddress,
    })

    // 获取或创建该 CID 对应的 drive
    let drive = this.#drives.get(name)

    if (!drive) {
      drive = await this.#getOrCreateDrive(name, {
        server: true,
        client: false,
      })
    }
    await this.#joinCidTopicInternal(cidString, {
      server: true,
      client: false,
    })

    this.emit('publish:progress', { stage: 'uploading', file: safeFileName })

    // Hyperdrive 中用 CID 作为 key 存储（解耦目录结构）
    const driveKey = '/' + cidString

    const ws = drive.createWriteStream(driveKey)

    if (Buffer.isBuffer(content)) {
      let offset = 0
      const waitForDrain = () =>
        new Promise(resolve => ws.once('drain', resolve))

      try {
        while (offset < content.length) {
          const chunk = content.slice(offset, offset + FILE_WRITE_CHUNK_SIZE)
          const canContinue = ws.write(chunk)
          offset += chunk.length
          if (!canContinue && offset < content.length) {
            await waitForDrain()
          }
        }
        ws.end()
        await new Promise((resolve, reject) => {
          ws.on('finish', resolve)
          ws.on('error', reject)
        })
      } catch (err) {
        ws.destroy()
        throw err
      }
    } else {
      const rs = fs.createReadStream(cleanPath)
      await new Promise((resolve, reject) => {
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })
    }

    // 存储 displayName（用户看到的文件夹路径），不存储 drivePath
    const now = Date.now()
    const fileRecord = {
      fileName: safeFileName,
      cid: cidString,
      driveName: name,
      size: fileSize,
      source: 'published',
      publishedAt: new Date(now).toISOString(),
      starred: false,
      syncUpdatedAt: now,
    }
    publishedBucket.push(fileRecord)
    this.#savePublishedMetadata()
    this.#upsertHolding({
      cid: cidString,
      fileName: safeFileName,
      size: fileSize,
      driveName: name,
      source: 'published',
    })

    const result = {
      cid: cidString,
      link: `most://${cidString}?filename=${encodeURIComponent(safeFileName)}`,
      fileName: safeFileName,
    }

    this.emit('publish:success', result)
    this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
      file: this.#formatFileForSync(fileRecord, 'active'),
    })
    return result
  }

  /**
   * 从 P2P 网络下载文件
   * @param {string} link - most:// 链接
   * @param {string} [taskId] - 用于取消的任务 ID
   * @param {object} [options] - 下载选项
   * @param {number} [options.timeout] - 等待 P2P 内容的超时时间（毫秒）
   * @param {number} [options.streamReadTimeout] - 下载流无进度超时时间（毫秒）
   * @returns {Promise<{ taskId: string, fileName: string, savedPath: string, alreadyExists?: boolean }>}
   */
  async downloadFile(link, taskId = null, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    taskId =
      taskId || `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const downloadTimeout = options.timeout || this.#options.downloadTimeout
    const streamReadTimeout = options.streamReadTimeout ?? STREAM_READ_TIMEOUT

    console.log(
      `[MostBox] Starting download for link: ${link} (taskId: ${taskId})`
    )

    const taskState = { aborted: false, readStream: null, writeStream: null }
    this.#activeDownloads.set(taskId, taskState)

    try {
      const parsed = parseMostLink(link)
      if (parsed.error) {
        throw new ValidationError(parsed.error)
      }
      const cidString = parsed.cid
      console.log(`[MostBox] Parsed CID: ${cidString}`)
      const { driveName: name } = this.#getCidInfo(cidString)
      const linkFileName = sanitizeFilename(parsed.fileName)

      const localContent = await this.#getLocalCidContent(cidString, {
        ownerAddress,
        public: true,
        allowHoldingFallback: true,
      })
      if (localContent) {
        const existingFile = localContent.fileRecord
        console.log(
          `[MostBox] CID content already exists locally: ${cidString}`
        )
        const existingHolding = this.#holdings.find(
          item => item.cid === cidString
        )
        await this.#joinCidTopicInternal(cidString, {
          server: true,
          client: false,
        })
        this.#upsertHolding({
          cid: cidString,
          fileName:
            existingHolding?.fileName || existingFile?.fileName || linkFileName,
          size:
            existingHolding?.size ??
            (Number.isFinite(localContent.size) ? localContent.size : 0),
          driveName: existingFile?.driveName || name,
          source: existingHolding?.source || 'published',
        })
        return {
          taskId,
          fileName: linkFileName,
          alreadyExists: true,
        }
      }

      this.#assertDisplayNameAvailable(linkFileName, {
        ownerAddress,
        excludeCid: cidString,
      })

      if (taskState.aborted) throw new Error('Download cancelled')

      let drive = this.#drives.get(name)

      if (!drive) {
        console.log(`[MostBox] Creating new drive: ${name}`)
        drive = await this.#getOrCreateDrive(name, {
          server: true,
          client: true,
        })

        this.emit('download:status', { taskId, status: 'connecting' })
      } else {
        console.log(`[MostBox] Using existing drive: ${name}`)
      }
      await this.#joinCidTopicInternal(cidString, {
        server: false,
        client: true,
      })

      if (taskState.aborted) throw new Error('Download cancelled')

      this.emit('download:status', { taskId, status: 'finding-peers' })

      console.log(
        `[MostBox] Waiting for drive entry /${cidString} (timeout: ${downloadTimeout / 1000}s)...`
      )
      const driveKey = '/' + cidString
      const entry = await this.#waitForDriveEntry(
        drive,
        driveKey,
        downloadTimeout,
        taskId,
        taskState
      )

      if (!entry) {
        console.log(`[MostBox] Expected drive entry ${driveKey} not found`)

        const peerCount = this.#swarm.connections.size
        let errorMessage = `Expected file ${driveKey} was not found. `

        if (peerCount === 0) {
          errorMessage +=
            'Could not connect to any peers. This may be due to:\n'
          errorMessage += '1. Network firewall blocking P2P connections\n'
          errorMessage += '2. DHT bootstrap nodes unreachable\n'
          errorMessage += '3. NAT traversal failed (try port forwarding)\n'
          errorMessage += '4. No peers are currently sharing this file'
        } else {
          errorMessage += `Connected to ${peerCount} peers but no file data was found. This may be due to:\n`
          errorMessage += '1. Publisher node offline\n'
          errorMessage += '2. File may have been removed by publisher\n'
          errorMessage += '3. File link may be invalid or corrupted'
        }

        throw new PeerNotFoundError(errorMessage)
      }

      if (taskState.aborted) throw new Error('Download cancelled')

      console.log(
        `[MostBox] Found expected entry ${driveKey}, starting download...`
      )

      const targetDir = this.#options.downloadPath

      const writableCheck = await checkDirectoryWritable(targetDir)
      if (!writableCheck.writable) {
        throw new PermissionError(writableCheck.error)
      }

      // 下载文件
      const entries = [entry]
      for (const entry of entries) {
        const cleanKey = entry.key.replace(/^[\/\\]/, '')
        const sanitizedFileName = linkFileName
          ? sanitizeFilename(linkFileName)
          : sanitizeFilename(cleanKey)

        let totalBytes = 0
        try {
          const stat = await drive.entry(entry.key)
          if (stat && stat.value && stat.value.blob) {
            totalBytes = stat.value.blob.byteLength || 0
          }
        } catch {
          // 忽略
        }

        if (totalBytes > 0) {
          this.#checkCapacity(totalBytes)
        }

        const savePath = path.join(targetDir, sanitizedFileName)
        fs.mkdirSync(path.dirname(savePath), { recursive: true })
        if (fs.existsSync(savePath)) {
          throw new ConflictError(`已有同名文件: ${sanitizedFileName}`)
        }

        this.emit('download:status', {
          taskId,
          status: 'downloading',
          file: sanitizedFileName,
          size: totalBytes ? formatFileSize(totalBytes) : null,
        })

        const rs = drive.createReadStream(entry.key)
        const ws = fs.createWriteStream(savePath)

        taskState.readStream = rs
        taskState.writeStream = ws

        let loadedBytes = 0
        let lastProgressUpdate = 0

        await new Promise((resolve, reject) => {
          let settled = false
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
            rs.destroy(err)
            ws.destroy()
            fs.unlink(savePath, () => {})
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
            if (streamReadTimeout > 0) {
              readTimer = setTimeout(() => {
                fail(
                  new Error(
                    `Download stalled: no data received for ${streamReadTimeout / 1000}s`
                  )
                )
              }, streamReadTimeout)
            }
          }

          resetReadTimer()

          rs.on('data', chunk => {
            if (taskState.aborted) {
              fail(new Error('Download cancelled'))
              return
            }
            resetReadTimer()
            loadedBytes += chunk.length
            const now = Date.now()
            if (
              totalBytes > 0 &&
              now - lastProgressUpdate > PROGRESS_THROTTLE
            ) {
              lastProgressUpdate = now
              const percent = Math.round((loadedBytes / totalBytes) * 100)
              this.emit('download:progress', {
                taskId,
                loaded: loadedBytes,
                total: totalBytes,
                percent,
              })
            }
          })

          rs.pipe(ws)
          ws.on('finish', complete)
          ws.on('error', fail)
          rs.on('error', fail)
          rs.on('close', () => {
            if (taskState.aborted) {
              fail(new Error('Download cancelled'))
            }
          })
          ws.on('close', () => {
            if (taskState.aborted) {
              fail(new Error('Download cancelled'))
            }
          })
        })

        if (taskState.aborted) throw new Error('Download cancelled')

        this.emit('download:status', { taskId, status: 'verifying' })

        const { cid: downloadedCid } = await calculateCid(savePath)
        const downloadedCidString = downloadedCid.toString()

        if (downloadedCidString !== cidString) {
          fs.unlinkSync(savePath)
          throw new IntegrityError(
            `File content CID mismatch. Expected ${cidString}, got ${downloadedCidString}.`
          )
        }

        // Write file content to Hyperdrive for seeding to other peers
        const driveKey = '/' + cidString
        const existingEntry = await drive.entry(driveKey)
        if (!existingEntry) {
          const readStream = fs.createReadStream(savePath)
          const writeStream = drive.createWriteStream(driveKey)
          await new Promise((resolve, reject) => {
            readStream.pipe(writeStream)
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
            readStream.on('error', reject)
          })
          const verifyEntry = await drive.entry(driveKey)
          if (!verifyEntry || !verifyEntry.value || !verifyEntry.value.blob) {
            throw new IntegrityError(
              `Failed to write file to Hyperdrive for seeding: ${driveKey}`
            )
          }
        }
        await this.#joinCidTopicInternal(cidString, {
          server: true,
          client: false,
        })

        const result = {
          taskId,
          fileName: sanitizedFileName,
          savedPath: savePath,
        }

        const publishedBucket = this.#getPublishedBucket(ownerAddress, true)
        const existingIndex = publishedBucket.findIndex(
          f => f.cid === cidString
        )
        this.#assertDisplayNameAvailable(sanitizedFileName, {
          ownerAddress,
          excludeCid: cidString,
        })
        const savedSize = totalBytes || fs.statSync(savePath).size
        const syncUpdatedAt =
          existingIndex !== -1
            ? getNextSyncTimestamp(publishedBucket[existingIndex].syncUpdatedAt)
            : Date.now()
        if (existingIndex !== -1) {
          const existing = publishedBucket[existingIndex]
          existing.fileName = sanitizedFileName
          existing.driveName = name
          existing.size = savedSize
          existing.source = 'downloaded'
          existing.publishedAt = new Date(syncUpdatedAt).toISOString()
          existing.syncUpdatedAt = syncUpdatedAt
        } else {
          publishedBucket.push({
            fileName: sanitizedFileName,
            cid: cidString,
            driveName: name,
            size: savedSize,
            source: 'downloaded',
            publishedAt: new Date(syncUpdatedAt).toISOString(),
            starred: false,
            syncUpdatedAt,
          })
        }
        this.#savePublishedMetadata()
        this.#upsertHolding({
          cid: cidString,
          fileName: sanitizedFileName,
          size: savedSize,
          driveName: name,
          source: 'downloaded',
        })

        this.emit('download:success', result)
        const syncedFile = publishedBucket.find(file => file.cid === cidString)
        this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
          file: this.#formatFileForSync(syncedFile, 'active'),
        })
        return result
      }
    } finally {
      this.#activeDownloads.delete(taskId)
    }
  }

  /**
   * 快速检查 most:// 链接对应的 CID 内容是否已在本机可读。
   */
  async getLocalCidAvailability(link, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const parsed = parseMostLink(link)
    if (parsed.error) {
      throw new ValidationError(parsed.error)
    }

    const localContent = await this.#getLocalCidContent(parsed.cid, {
      ownerAddress,
      public: true,
      allowHoldingFallback: true,
    })
    if (!localContent) {
      return null
    }

    return {
      available: true,
      cid: parsed.cid,
      fileName: sanitizeFilename(parsed.fileName),
      size: localContent.size,
      alreadyExists: true,
    }
  }

  /**
   * 检测 most:// 链接当前是否能找到可下载内容，但不读取文件内容。
   * @param {string} link - most:// 链接
   * @param {object} [options] - 检测选项
   * @param {number} [options.timeout] - 等待 P2P 内容的超时时间（毫秒）
   * @returns {Promise<{ available: boolean, cid: string, fileName: string, size: number|null, alreadyExists?: boolean }>}
   */
  async checkDownloadAvailability(link, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const timeout = options.timeout || DRIVE_ENTRY_TIMEOUT
    const parsed = parseMostLink(link)
    if (parsed.error) {
      throw new ValidationError(parsed.error)
    }

    const cidString = parsed.cid
    const { driveName: name } = this.#getCidInfo(cidString)
    const localContent = await this.#getLocalCidContent(cidString, {
      ownerAddress,
      public: true,
      allowHoldingFallback: true,
    })
    if (localContent) {
      return {
        available: true,
        cid: cidString,
        fileName: sanitizeFilename(parsed.fileName),
        size: localContent.size,
        alreadyExists: true,
      }
    }

    const writableCheck = await checkDirectoryWritable(
      this.#options.downloadPath
    )
    if (!writableCheck.writable) {
      throw new PermissionError(writableCheck.error)
    }

    let drive = this.#drives.get(name)

    if (!drive) {
      drive = await this.#getOrCreateDrive(name, {
        server: true,
        client: true,
      })
    }

    await this.#joinCidTopicInternal(cidString, {
      server: false,
      client: true,
    })

    const driveKey = '/' + cidString
    const entry = await this.#waitForDriveEntry(drive, driveKey, timeout)

    if (!entry) {
      throw new PeerNotFoundError(
        '当前没有发现可下载的在线种子，请稍后重试或确认发布者在线'
      )
    }

    let size = null
    try {
      const stat = await drive.entry(entry.key)
      if (stat?.value?.blob) {
        size = stat.value.blob.byteLength || 0
      }
    } catch {}

    return {
      available: true,
      cid: cidString,
      fileName: parsed.fileName,
      size,
    }
  }

  /**
   * 列出所有已发布文件
   * @param {object} [options] - 筛选选项
   * @param {boolean} [options.starred] - 按收藏状态筛选
   * @returns {Array<{ fileName: string, cid: string, link: string, publishedAt: string, starred: boolean }>}
   */
  listPublishedFiles(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    let files = this.#getPublishedBucket(ownerAddress)

    if (options.starred === true) {
      files = files.filter(f => f.starred === true)
    }

    return files.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}?filename=${encodeURIComponent(f.fileName)}`,
      publishedAt: f.publishedAt,
      size: Number(f.size) || 0,
      starred: f.starred || false,
      ownerAddress: ownerAddress || '',
      localAvailable: this.#holdings.some(holding => holding.cid === f.cid),
      seedStatus: this.#seedStates.get(f.cid)?.status || '',
      holdingSize:
        Number(this.#holdings.find(holding => holding.cid === f.cid)?.size) ||
        0,
    }))
  }

  /**
   * 切换文件的收藏状态
   * @param {string} cid - 文件的 CID
   * @returns {object} 更新后的文件信息
   */
  toggleStarred(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
    const index = files.findIndex(f => f.cid === cid)
    if (index === -1) {
      throw new Error('File not found')
    }
    files[index].starred = !files[index].starred
    files[index].syncUpdatedAt = getNextSyncTimestamp(files[index].syncUpdatedAt)
    this.#savePublishedMetadata()
    this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
      file: this.#formatFileForSync(files[index], 'active'),
    })
    return {
      cid,
      starred: files[index].starred,
    }
  }

  /**
   * 删除已发布文件 — 移至回收站而非永久删除
   * @param {string} cid - 要删除文件的 CID
   * @returns {Promise<Array>} 更新后的已发布文件列表
   */
  async deletePublishedFile(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
    const trashFiles = this.#getTrashBucket(ownerAddress, true)
    const index = files.findIndex(f => f.cid === cid)
    if (index !== -1) {
      const fileRecord = files[index]
      const holding = this.#holdings.find(item => item.cid === fileRecord.cid)
      const syncUpdatedAt = getNextSyncTimestamp(fileRecord.syncUpdatedAt)

      const trashRecord = {
        fileName: fileRecord.fileName,
        cid: fileRecord.cid,
        driveName:
          fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName,
        size: holding?.size ?? fileRecord.size ?? 0,
        source: holding?.source || 'published',
        publishedAt: fileRecord.publishedAt,
        starred: fileRecord.starred || false,
        deletedAt: new Date(syncUpdatedAt).toISOString(),
        syncUpdatedAt,
      }
      trashFiles.push(trashRecord)
      this.#saveTrashMetadata()

      files.splice(index, 1)
      this.#setPublishedBucket(ownerAddress, files)
      this.#savePublishedMetadata()
      this.#appendUserSyncOpSoon(ownerAddress, 'file:trash', {
        file: this.#formatFileForSync(trashRecord, 'trash'),
      })

      if (!this.#hasPublishedReference(fileRecord.cid)) {
        await this.#leaveCidTopic(fileRecord.cid)
        await this.#closeDriveForSeed(
          fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName
        )
        this.#removeHolding(fileRecord.cid)
      }
    }
    return this.listPublishedFiles({ ownerAddress })
  }

  /**
   * 列出回收站中的所有文件
   * @returns {Array} 回收站文件
   */
  listTrashFiles(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.#getTrashBucket(ownerAddress)
    return files.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}?filename=${encodeURIComponent(f.fileName)}`,
      publishedAt: f.publishedAt,
      size: Number(f.size) || 0,
      starred: f.starred || false,
      ownerAddress: ownerAddress || '',
      deletedAt: f.deletedAt,
      localAvailable: this.#holdings.some(holding => holding.cid === f.cid),
      seedStatus: this.#seedStates.get(f.cid)?.status || '',
      holdingSize:
        Number(this.#holdings.find(holding => holding.cid === f.cid)?.size) ||
        0,
    }))
  }

  /**
   * 从回收站恢复文件
   * @param {string} cid - 要恢复文件的 CID
   * @returns {Promise<Array>} 更新后的已发布文件列表
   */
  async restoreTrashFile(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const trashFiles = this.#getTrashBucket(ownerAddress)
    const publishedFiles = this.#getPublishedBucket(ownerAddress, true)
    const index = trashFiles.findIndex(f => f.cid === cid)
    if (index === -1) {
      throw new Error('File not found in trash')
    }

    const fileRecord = trashFiles[index]

    const { driveName } = this.#getCidInfo(fileRecord.cid)

    const existingIndex = publishedFiles.findIndex(
      f => f.cid === fileRecord.cid
    )
    if (existingIndex !== -1) {
      trashFiles.splice(index, 1)
      this.#setTrashBucket(ownerAddress, trashFiles)
      this.#saveTrashMetadata()
      this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
        file: this.#formatFileForSync(publishedFiles[existingIndex], 'active'),
      })
      return this.listPublishedFiles({ ownerAddress })
    }

    this.#assertDisplayNameAvailable(fileRecord.fileName, {
      ownerAddress,
      excludeCid: fileRecord.cid,
    })

    const syncUpdatedAt = getNextSyncTimestamp(fileRecord.syncUpdatedAt)
    const publishedRecord = {
      fileName: fileRecord.fileName,
      cid: fileRecord.cid,
      driveName,
      publishedAt: fileRecord.publishedAt,
      starred: fileRecord.starred || false,
      size: Number(fileRecord.size) || 0,
      source: fileRecord.source || 'synced',
      syncUpdatedAt,
    }
    publishedFiles.push(publishedRecord)
    this.#savePublishedMetadata()

    trashFiles.splice(index, 1)
    this.#setTrashBucket(ownerAddress, trashFiles)
    this.#saveTrashMetadata()

    const localContent = await this.#getLocalCidContent(fileRecord.cid, {
      ownerAddress,
      allowHoldingFallback: true,
    })
    if (localContent) {
      await this.#joinCidTopicInternal(fileRecord.cid, {
        server: true,
        client: false,
      })
      this.#upsertHolding({
        cid: fileRecord.cid,
        fileName: fileRecord.fileName,
        size: localContent.size || Number(fileRecord.size) || 0,
        driveName,
        source: fileRecord.source || 'published',
      })
    }
    this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
      file: this.#formatFileForSync(publishedRecord, 'active'),
    })

    return this.listPublishedFiles({ ownerAddress })
  }

  /**
   * 永久删除回收站中的文件
   * @param {string} cid - 要永久删除文件的 CID
   * @returns {Promise<Array>} 更新后的回收站列表
   */
  async permanentDeleteTrashFile(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const trashFiles = this.#getTrashBucket(ownerAddress)
    const index = trashFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      const fileRecord = trashFiles[index]
      const driveName =
        fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName

      trashFiles.splice(index, 1)
      this.#setTrashBucket(ownerAddress, trashFiles)
      this.#saveTrashMetadata()
      this.#appendUserSyncOpSoon(ownerAddress, 'file:delete', {
        cid: fileRecord.cid,
        syncUpdatedAt: getNextSyncTimestamp(fileRecord.syncUpdatedAt),
      })

      if (!this.#hasAnyUserReference(fileRecord.cid)) {
        try {
          const drive = await this.#getOrCreateDrive(driveName)
          await drive.del('/' + fileRecord.cid)
        } catch {
          // 文件可能不存在于驱动器中
        }
        await this.#closeDriveForSeed(driveName)
        await this.#leaveCidTopic(fileRecord.cid)
        this.#removeHolding(fileRecord.cid)
      }
    }
    return this.listTrashFiles({ ownerAddress })
  }

  /**
   * 清空回收站 — 永久删除所有回收站文件
   * @returns {Promise<Array>} 清空后的回收站列表
   */
  async emptyTrash(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const removedTrash = [...this.#getTrashBucket(ownerAddress)]
    this.#setTrashBucket(ownerAddress, [])
    this.#saveTrashMetadata()
    for (const fileRecord of removedTrash) {
      this.#appendUserSyncOpSoon(ownerAddress, 'file:delete', {
        cid: fileRecord.cid,
        syncUpdatedAt: getNextSyncTimestamp(fileRecord.syncUpdatedAt),
      })
      if (this.#hasAnyUserReference(fileRecord.cid)) continue
      const driveName =
        fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName
      try {
        const drive = await this.#getOrCreateDrive(driveName)
        await drive.del('/' + fileRecord.cid)
      } catch {
        // 文件可能不存在
      }
      await this.#closeDriveForSeed(driveName)
      await this.#leaveCidTopic(fileRecord.cid)
      this.#removeHolding(fileRecord.cid)
    }

    return this.listTrashFiles({ ownerAddress })
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<{ total: number, used: number, free: number, fileCount: number, trashCount: number }>}
   */
  async getStorageStats(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    let totalSize = 0
    let freeSize = 0
    const { dataPath } = this.#options

    try {
      const stats = fs.statfsSync(dataPath)
      totalSize = stats.bsize * stats.blocks
      freeSize = stats.bsize * stats.bfree
    } catch {
      try {
        fs.statSync(dataPath)
        totalSize = 0
        freeSize = 0
      } catch {
        totalSize = 0
        freeSize = 0
      }
    }

    let usedSize = 0
    const calculateDirSize = dirPath => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name)
          if (entry.isDirectory()) {
            if (entry.name !== 'db') {
              calculateDirSize(fullPath)
            }
          } else {
            try {
              const stat = fs.statSync(fullPath)
              usedSize += stat.size
            } catch {
              // 跳过无法访问的文件
            }
          }
        }
      } catch {
        // 跳过无法访问的目录
      }
    }

    calculateDirSize(dataPath)

    return {
      total: totalSize,
      used: usedSize,
      free: freeSize,
      fileCount: ownerAddress
        ? this.#getPublishedBucket(ownerAddress).length
        : this.#countBucketRecords(this.#publishedFiles),
      trashCount: ownerAddress
        ? this.#getTrashBucket(ownerAddress).length
        : this.#countBucketRecords(this.#trashFiles),
    }
  }

  /**
   * 移动/重命名已发布文件
   * 只更新 metadata 中的 displayName，不修改 Hyperdrive
   * @param {string} cid - 要移动文件的 CID
   * @param {string} newFileName - 新文件路径
   * @returns {object} 更新后的文件信息
   */
  moveFile(cid, newFileName, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
    const index = files.findIndex(f => f.cid === cid)
    if (index === -1) {
      throw new Error('File not found')
    }
    const safeFileName = sanitizeFilename(newFileName)
    this.#assertDisplayNameAvailable(safeFileName, {
      ownerAddress,
      excludeCid: cid,
    })
    files[index].fileName = safeFileName
    files[index].syncUpdatedAt = getNextSyncTimestamp(files[index].syncUpdatedAt)
    files[index].publishedAt = new Date(files[index].syncUpdatedAt).toISOString()
    this.#savePublishedMetadata()
    this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
      file: this.#formatFileForSync(files[index], 'active'),
    })
    return {
      cid,
      fileName: safeFileName,
      link: `most://${cid}?filename=${encodeURIComponent(safeFileName)}`,
    }
  }

  /**
   * 重命名文件夹（重命名文件夹内的所有文件 displayName）
   * 只更新 metadata，不修改 Hyperdrive
   * @param {string} oldPath - 当前文件夹路径
   * @param {string} newPath - 新文件夹路径
   * @returns {object} 更新后的文件信息
   */
  renameFolder(oldPath, newPath, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const prefix = oldPath + '/'
    const updates = []
    const files = this.#getPublishedBucket(ownerAddress)

    for (const file of files) {
      if (file.fileName.startsWith(prefix)) {
        const remainder = file.fileName.substring(prefix.length)
        const newFileName = sanitizeFilename(
          remainder ? newPath + '/' + remainder : newPath
        )
        updates.push({ file, newFileName })
      }
    }

    for (const { file, newFileName } of updates) {
      this.#assertDisplayNameAvailable(newFileName, {
        ownerAddress,
        excludeCid: file.cid,
      })
    }

    const updatedFiles = updates.map(({ file, newFileName }) => {
      file.fileName = newFileName
      file.syncUpdatedAt = getNextSyncTimestamp(file.syncUpdatedAt)
      file.publishedAt = new Date(file.syncUpdatedAt).toISOString()
      return {
        cid: file.cid,
        fileName: file.fileName,
        link: `most://${file.cid}?filename=${encodeURIComponent(file.fileName)}`,
      }
    })

    if (updatedFiles.length > 0) {
      this.#savePublishedMetadata()
      for (const { file } of updates) {
        this.#appendUserSyncOpSoon(ownerAddress, 'file:upsert', {
          file: this.#formatFileForSync(file, 'active'),
        })
      }
    }

    return { files: updatedFiles }
  }

  /**
   * 取消正在进行的下载
   * @param {string} taskId - 要取消下载的任务 ID
   */
  cancelDownload(taskId) {
    const task = this.#activeDownloads.get(taskId)
    if (task) {
      task.aborted = true
      const err = new Error('Download cancelled')
      if (task.readStream) task.readStream.destroy(err)
      if (task.writeStream) task.writeStream.destroy()
    }
  }

  hasDownloadNameConflict(fileName) {
    this.#ensureInitialized()
    const sanitizedFileName = sanitizeFilename(fileName)
    const savePath = path.join(this.#options.downloadPath, sanitizedFileName)
    return fs.existsSync(savePath)
  }

  setMaxFileSize(maxFileSize) {
    const parsed = Number(maxFileSize)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ValidationError('maxFileSize must be a non-negative number')
    }
    this.#options.maxFileSize = Math.floor(parsed)
  }

  getPublishedFiles(options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    return ownerAddress
      ? this.#getPublishedBucket(ownerAddress)
      : this.#allPublishedRecords()
  }

  listUsers() {
    this.#ensureInitialized()
    const users = new Map()
    const ensure = address => {
      const ownerAddress = normalizeOwnerAddress(address)
      if (!ownerAddress) return null
      if (!users.has(ownerAddress)) {
        users.set(ownerAddress, {
          address: ownerAddress,
          fileCount: 0,
          trashCount: 0,
          cidCount: 0,
          cids: new Set(),
        })
      }
      return users.get(ownerAddress)
    }

    for (const [ownerAddress, files] of Object.entries(this.#publishedFiles)) {
      const entry = ensure(ownerAddress)
      if (!entry) continue
      entry.fileCount += files.length
      for (const file of files) {
        entry.cids.add(file.cid)
      }
    }
    for (const [ownerAddress, files] of Object.entries(this.#trashFiles)) {
      const entry = ensure(ownerAddress)
      if (!entry) continue
      entry.trashCount += files.length
      for (const file of files) {
        entry.cids.add(file.cid)
      }
    }

    return [...users.values()].map(user => ({
      address: user.address,
      fileCount: user.fileCount,
      trashCount: user.trashCount,
      cidCount: user.cids.size,
    }))
  }

  async clearUserData(ownerAddressInput) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }

    const result = await this.#clearUserDataInternal(ownerAddress)

    return {
      ownerAddress,
      ...result,
    }
  }

  /**
   * 列出当前节点持有的可做种文件副本
   * @returns {Array}
   */
  listHoldings() {
    this.#ensureInitialized()
    return this.#holdings.map(holding => {
      const seedState = this.#seedStates.get(holding.cid)
      const status =
        seedState?.status ||
        (this.#fileDiscoveries.has(holding.cid) ? 'active' : 'queued')
      return {
        ...holding,
        joined: status === 'active' && this.#fileDiscoveries.has(holding.cid),
        seedStatus: status,
        seedError: seedState?.error,
        seedStatusUpdatedAt: seedState?.updatedAt,
        ...this.#getFileRuntimeStats(holding.cid),
        link: `most://${holding.cid}?filename=${encodeURIComponent(holding.fileName || holding.cid)}`,
      }
    })
  }

  /**
   * 手动记录节点已持有的文件副本
   * @param {object} record - 持有记录
   */
  async addHolding(record) {
    this.#ensureInitialized()
    const holding = this.#normalizeHolding(record)
    await this.#joinCidTopicInternal(holding.cid, {
      server: true,
      client: false,
    })
    return this.#upsertHolding(holding)
  }

  /**
   * 按 CID digest topic 拉取完整文件副本
   * @param {object} input - 拉取参数
   * @param {string} [input.link] - most:// 链接
   * @param {string} [input.cid] - 文件 CID
   * @param {string} [input.fileName] - 保存文件名
   * @param {string} [input.taskId] - 下载任务 ID
   * @param {number} [input.timeout] - 等待 P2P 内容的超时时间
   */
  async pullByCid(input = {}) {
    this.#ensureInitialized()

    if (input.link) {
      const parsed = parseMostLink(input.link)
      if (parsed.error) {
        throw new ValidationError(parsed.error)
      }
      const result = await this.downloadFile(input.link, input.taskId || null, {
        timeout: input.timeout,
        ownerAddress: input.ownerAddress,
      })
      return {
        ...result,
        cid: parsed.cid,
      }
    }

    const cid = input.cid
    if (!cid) {
      throw new ValidationError('cid is required')
    }

    this.#getCidInfo(cid)
    const fileName = sanitizeFilename(input.fileName || `${cid}.bin`)
    const link = `most://${cid}?filename=${encodeURIComponent(fileName)}`
    const result = await this.downloadFile(link, input.taskId || null, {
      timeout: input.timeout,
      ownerAddress: input.ownerAddress,
    })

    return {
      ...result,
      cid,
    }
  }

  /**
   * 按 CID digest 加入文件 topic
   * @param {string} cid - 文件 CID
   * @param {object} [options] - Hyperswarm join 选项
   */
  async joinCidTopic(cid, options = {}) {
    this.#ensureInitialized()
    return this.#joinCidTopicInternal(cid, options)
  }

  /**
   * 用内存复制流连接两个本地引擎，供本地集成测试和诊断使用。
   */
  replicateWith(peerEngine) {
    this.#ensureInitialized()
    peerEngine.#ensureInitialized()

    const left = this.#store.replicate(true, { live: true })
    const right = peerEngine.#store.replicate(false, { live: true })

    left.on('error', () => {})
    right.on('error', () => {})
    left.pipe(right).pipe(left)
    this.#exchangeUserSyncSessions(peerEngine).catch(() => {})
    peerEngine.#exchangeUserSyncSessions(this).catch(() => {})

    return {
      close: () => {
        left.destroy()
        right.destroy()
      },
    }
  }

  /**
   * 启动当前账号的隐藏 user.sync 元数据同步。
   */
  async startUserSync(ownerAddressInput, input = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }

    const syncTopicKey = normalizeUserSyncKey(input.syncTopicKey)
    const syncCipherKey = normalizeUserSyncKey(input.syncCipherKey)
    const syncMacKey = normalizeUserSyncKey(input.syncMacKey)
    if (!syncTopicKey || !syncCipherKey || !syncMacKey) {
      throw new ValidationError('valid user sync keys are required')
    }

    const syncId = deriveUserSyncId(syncTopicKey)
    const syncName = getUserSyncName(syncId)
    const persisted = this.#userSyncMetadata.sessions?.[ownerAddress]
    const session = {
      ownerAddress,
      syncId,
      syncName,
      syncTopicKey,
      syncCipherKey,
      syncMacKey,
      writerId:
        persisted?.syncId === syncId && persisted?.writerId
          ? persisted.writerId
          : createChannelWriterId(),
      localWriterCoreKey:
        persisted?.syncId === syncId ? persisted.localWriterCoreKey || '' : '',
      writerCoreKeys:
        persisted?.syncId === syncId
          ? uniqueStrings(persisted.writerCoreKeys)
          : [],
      startedAt: new Date().toISOString(),
    }

    this.#userSyncSessions.set(ownerAddress, session)
    await this.#openUserSyncRuntime(session)
    await this.#joinUserSyncDiscovery(session)
    this.#persistUserSyncSession(session)
    await this.#appendUserSyncSnapshot(ownerAddress, 'start')

    return this.getUserSyncStatus(ownerAddress)
  }

  getUserSyncStatus(ownerAddressInput) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }
    const session = this.#userSyncSessions.get(ownerAddress)
    if (!session) {
      const persisted = this.#userSyncMetadata.sessions?.[ownerAddress]
      return {
        enabled: false,
        ownerAddress,
        syncName: persisted?.syncName || '',
        syncId: persisted?.syncId || '',
        peerCount: 0,
        writerCoreKeys: uniqueStrings(persisted?.writerCoreKeys),
        localWriterCoreKey: persisted?.localWriterCoreKey || '',
        lastSyncedAt: persisted?.lastSyncedAt || '',
      }
    }

    return {
      enabled: true,
      ownerAddress,
      syncName: session.syncName,
      syncId: session.syncId,
      peerCount: this.#chatSwarm?.connections?.size || 0,
      writerCoreKeys: uniqueStrings(session.writerCoreKeys),
      localWriterCoreKey: session.localWriterCoreKey,
      lastSyncedAt:
        this.#userSyncMetadata.sessions?.[ownerAddress]?.lastSyncedAt || '',
    }
  }

  async cacheFile(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const fileRecord = this.#getPublishedBucket(ownerAddress).find(
      item => item.cid === cid
    )
    if (!fileRecord) {
      throw new Error('File not found')
    }
    const result = await this.pullByCid({
      cid,
      fileName: fileRecord.fileName,
      ownerAddress,
      timeout: options.timeout,
      taskId: options.taskId,
    })
    return result
  }

  /**
   * 读取已发布文件的内容（用于预览）
   * Hyperdrive 中用 CID 作为 key 存储
   * @param {string} cid - 文件的 CID
   * @param {number} [offset=0] - 读取起始位置
   * @param {number} [limit=10000] - 最大读取字节数
   */
  async readFileContent(
    cid,
    offset = 0,
    limit = DEFAULT_READ_LIMIT,
    options = {}
  ) {
    this.#ensureInitialized()
    if (typeof offset === 'object' && offset !== null) {
      options = offset
      offset = 0
      limit = DEFAULT_READ_LIMIT
    }
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const localContent = await this.#getLocalCidContent(cid, {
      ownerAddress,
      public: options.public,
    })
    if (!localContent) {
      throw new Error('File not found')
    }

    const driveKey = '/' + cid
    const { drive } = localContent

    const chunks = []
    const stream = drive.createReadStream(driveKey, {
      start: offset,
      end: offset + limit - 1,
    })

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Stream read timeout')),
        STREAM_READ_TIMEOUT
      )
    })

    const readPromise = (async () => {
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
    })()

    await Promise.race([readPromise, timeoutPromise])

    const content = Buffer.concat(chunks).toString('utf8')
    const hasMore =
      chunks.length > 0 && chunks[chunks.length - 1].length === limit

    return { content, hasMore }
  }

  /**
   * 读取已发布文件的原始内容（用于预览/下载）
   * Hyperdrive 中用 CID 作为 key 存储
   * @param {string} cid - 文件的 CID
   * @param {object} [options] - 选项
   * @param {number} [options.offset=0] - 读取起始位置
   * @param {number} [options.limit] - 最大读取字节数，不指定则读取到末尾
   * @param {number} [options.timeout=10000] - 流读取超时（毫秒）
   * @returns {Promise<{buffer: Buffer, fileName: string, totalSize: number}>}
   */
  async readFileRaw(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const localContent = await this.#getLocalCidContent(cid, {
      ownerAddress,
      public: options.public,
    })
    if (!localContent) {
      throw new Error('File not found')
    }

    const driveKey = '/' + cid
    const { drive, entry, fileRecord } = localContent

    const totalSize = entry.value.blob.byteLength || 0

    const { offset = 0, limit, timeout = STREAM_READ_TIMEOUT } = options
    const effectiveLimit =
      limit === undefined || limit === null
        ? totalSize - offset
        : Math.min(limit, totalSize - offset)

    if (effectiveLimit <= 0) {
      return {
        buffer: Buffer.alloc(0),
        fileName: fileRecord.fileName,
        totalSize,
      }
    }

    const chunks = []
    const stream = drive.createReadStream(driveKey, {
      start: offset,
      end: offset + effectiveLimit - 1,
    })

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stream read timeout')), timeout)
    })

    const readPromise = (async () => {
      try {
        for await (const chunk of stream) {
          chunks.push(chunk)
        }
      } catch (err) {
        if (err.message !== 'Stream read timeout') {
          throw err
        }
      }
    })()

    await Promise.race([readPromise, timeoutPromise])
    await readPromise.catch(() => {})

    const buffer = Buffer.concat(chunks)
    return { buffer, fileName: fileRecord.fileName, totalSize }
  }

  async #hasLocalDriveContent(drive, key) {
    try {
      return await drive.has(key)
    } catch {
      return false
    }
  }

  async #getLocalCidContent(cid, options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const ownerRecord = this.#getPublishedBucket(ownerAddress).find(
      f => f.cid === cid
    )
    const fileRecord =
      ownerRecord ||
      (options.public
        ? this.#allPublishedRecords().find(f => f.cid === cid)
        : null)
    if (!options.allowHoldingFallback && !fileRecord) {
      return null
    }
    const holding = this.#holdings.find(item => item.cid === cid)
    const { driveName } = this.#getCidInfo(cid)
    const drive = await this.#getOrCreateDrive(
      fileRecord?.driveName || holding?.driveName || driveName,
      { server: true, client: false }
    )
    const driveKey = '/' + cid

    try {
      const entry = await drive.entry(driveKey, { wait: false })
      if (!entry?.value?.blob) {
        return null
      }
      const hasContent = await this.#hasLocalDriveContent(drive, driveKey)
      if (!hasContent) {
        return null
      }

      const size =
        Number(entry.value.blob.byteLength) ||
        Number(fileRecord?.size) ||
        Number(holding?.size) ||
        0
      return {
        drive,
        entry,
        size,
        fileRecord: fileRecord || {
          cid,
          fileName: holding?.fileName || cid,
          driveName: holding?.driveName || driveName,
          size,
          ownerAddress,
        },
      }
    } catch {
      return null
    }
  }

  // --- 频道管理 ---

  /**
   * 创建或加入频道。channelId 是用户输入的短 ID，channelKey 是内部唯一身份。
   * @param {string} channelIdInput - 用户可见短频道 ID
   * @param {string} [type='personal'] - 频道类型
   * @returns {Promise<object>}
   */
  async createChannel(channelIdInput, type = 'personal', options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const channelId = normalizeChannelId(channelIdInput)
    const channelType = String(type || 'personal').trim() || 'personal'
    const selectedChannelKey = normalizeChannelKey(options.channelKey)
    const selectedFingerprint = String(options.fingerprint || '').trim()

    if (channelId.includes('.') && channelType !== 'game') {
      throw new Error('点号为系统保留，不能用于手动频道 ID')
    }
    if (channelType === 'game' && !/^game\.[a-z0-9]+\.[a-z0-9]+$/.test(channelId)) {
      throw new Error('游戏频道必须使用 game.<gameId>.<roomCode> 格式')
    }
    if (channelType !== 'game' && !CHANNEL_NAME_REGEX.test(channelId)) {
      throw new Error('频道名只能包含字母、数字、下划线和连字符')
    }
    if (channelId.length < CHANNEL_NAME_MIN_LENGTH) {
      throw new Error(`频道名至少 ${CHANNEL_NAME_MIN_LENGTH} 个字符`)
    }
    if (channelId.length > CHANNEL_NAME_MAX_LENGTH) {
      throw new Error(`频道名最多 ${CHANNEL_NAME_MAX_LENGTH} 个字符`)
    }

    if (selectedChannelKey || selectedFingerprint) {
      const channelKey =
        selectedChannelKey || buildChannelKey(channelId, selectedFingerprint)
      const existing = this.#channels.find(c => c.channelKey === channelKey)
      if (existing) {
        await this.#mergeChannelWriterCoreKeys(
          existing,
          options.writerCoreKeys
        )
        if (this.#upsertChannelMember(existing, options)) {
          existing.syncUpdatedAt = getNextSyncTimestamp(existing.syncUpdatedAt)
          this.#saveChannelsMetadata()
          this.#appendUserSyncChannelUpsertSoon(existing, ownerAddress)
        }
        return this.#formatChannelForResponse(existing, ownerAddress)
      }

      const candidate = this.#getCachedChannelCandidate(channelId, channelKey)
      if (!candidate) {
        throw new Error('未发现该频道候选，请重新搜索频道')
      }
      return this.#joinChannelFromCandidate(candidate, channelType, options)
    }

    const localCandidates = this.#getLocalChannelCandidates(channelId)
    const remoteCandidates = options.discover
      ? await this.#discoverChannelCandidates(channelId, {
          timeout: options.discoveryTimeout,
        })
      : []
    const candidates = this.#mergeChannelCandidates([
      ...localCandidates,
      ...remoteCandidates,
    ])

    if (candidates.length > 1) {
      return {
        conflict: true,
        channelId,
        candidates: candidates.map(candidate =>
          this.#formatChannelCandidateForResponse(candidate, ownerAddress)
        ),
      }
    }

    if (candidates.length === 1) {
      const candidate = candidates[0]
      if (candidate.local) {
        const existing = this.#channels.find(
          channel => channel.channelKey === candidate.channelKey
        )
        if (existing && this.#upsertChannelMember(existing, options)) {
          existing.syncUpdatedAt = getNextSyncTimestamp(existing.syncUpdatedAt)
          this.#saveChannelsMetadata()
          this.#appendUserSyncChannelUpsertSoon(existing, ownerAddress)
        }
        if (existing) return this.#formatChannelForResponse(existing, ownerAddress)
        const joined = await this.#joinChannelFromCandidate(
          candidate,
          channelType,
          options
        )
        const joinedChannel = this.#resolveChannel(joined.channelKey, ownerAddress)
        this.#appendUserSyncChannelUpsertSoon(joinedChannel, ownerAddress)
        return joined
      }
      const joined = await this.#joinChannelFromCandidate(
        candidate,
        channelType,
        options
      )
      const joinedChannel = this.#resolveChannel(joined.channelKey, ownerAddress)
      this.#appendUserSyncChannelUpsertSoon(joinedChannel, ownerAddress)
      return joined
    }

    const channelInfo = await this.#createLocalChannel(channelId, channelType, {
      ...options,
      ownerAddress,
    })

    console.log(`[MostBox] Channel created: ${channelInfo.channelKey}`)
    this.emit('channel:joined', {
      channel: channelInfo.channelKey,
      channelKey: channelInfo.channelKey,
      channelId: channelInfo.channelId,
      key: channelInfo.channelKey,
    })
    this.#appendUserSyncChannelUpsertSoon(channelInfo, ownerAddress)

    return this.#formatChannelForResponse(channelInfo, ownerAddress)
  }

  /**
   * 通过已发现候选加入频道。
   * @param {string} channelIdInput - 用户可见短频道 ID
   * @param {object|string|null} candidateInput - 候选对象或 channelKey
   * @returns {Promise<object>}
   */
  async joinChannel(channelIdInput, candidateInput = null, options = {}) {
    this.#ensureInitialized()
    const channelId = normalizeChannelId(channelIdInput)
    const candidate =
      candidateInput && typeof candidateInput === 'object'
        ? candidateInput
        : candidateInput
          ? { channelKey: String(candidateInput), channelId }
          : null

    if (!candidate?.channelKey && !candidate?.fingerprint) {
      return this.createChannel(channelId, options.type || 'group', options)
    }

    const channelKey =
      normalizeChannelKey(candidate.channelKey) ||
      buildChannelKey(channelId, String(candidate.fingerprint || '').trim())
    const existing = this.#channels.find(c => c.channelKey === channelKey)
    if (existing) {
      await this.#mergeChannelWriterCoreKeys(existing, candidate.writerCoreKeys)
      if (this.#upsertChannelMember(existing, options)) {
        existing.syncUpdatedAt = getNextSyncTimestamp(existing.syncUpdatedAt)
        this.#saveChannelsMetadata()
        this.#appendUserSyncChannelUpsertSoon(existing, options.ownerAddress)
      }
      return this.#formatChannelForResponse(existing, options.ownerAddress)
    }

    const cached = this.#getCachedChannelCandidate(channelId, channelKey)
    const joined = await this.#joinChannelFromCandidate(cached || candidate, 'group', {
      ...options,
      channelKey,
    })
    const joinedChannel = this.#resolveChannel(
      joined.channelKey,
      options.ownerAddress
    )
    this.#appendUserSyncChannelUpsertSoon(joinedChannel, options.ownerAddress)
    return joined
  }

  /**
   * 离开频道
   * @param {string} channelKeyInput - 内部频道 key，或本地唯一短频道 ID
   * @returns {Promise<string[]>} 剩余频道列表
   */
  async leaveChannel(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const channel = this.#resolveChannel(channelKeyInput, ownerAddress)
    const index = this.#channels.findIndex(c => c.channelKey === channel.channelKey)
    if (index === -1) {
      throw new Error('频道不存在')
    }

    if (ownerAddress && Array.isArray(channel.members)) {
      channel.members = channel.members.filter(
        member => normalizeOwnerAddress(member?.address) !== ownerAddress
      )
      const syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
      channel.syncUpdatedAt = syncUpdatedAt
      this.#appendUserSyncChannelLeaveSoon(channel, ownerAddress, syncUpdatedAt)
      if (channel.members.length > 0) {
        this.#saveChannelsMetadata()
        return this.listChannels({ ownerAddress })
      }
    }

    const appDiscovery = this.#channelDiscoveries.get(channel.channelKey)
    if (appDiscovery && this.#swarm) {
      this.#channelDiscoveries.delete(channel.channelKey)
      this.#swarm.leave(this.#generateChannelDiscoveryKey(channel.channelKey)).catch(err => {
        console.warn(
          `[MostBox] Failed to leave app swarm for ${channel.channelKey}:`,
          err.message
        )
      })
    }

    const chatDiscovery = this.#channelChatDiscoveries.get(channel.channelKey)
    if (chatDiscovery && this.#chatSwarm) {
      this.#channelChatDiscoveries.delete(channel.channelKey)
      const chatDiscoveryKey = this.#generateChannelChatDiscoveryKey(
        channel.channelKey
      )
      this.#chatSwarm.leave(chatDiscoveryKey).catch(err => {
        console.warn(
          `[MostBox] Failed to leave chat swarm for ${channel.channelKey}:`,
          err.message
        )
      })
    }

    const hasSameIdChannel = this.#channels.some(
      (item, itemIndex) =>
        itemIndex !== index && item.channelId === channel.channelId
    )
    if (!hasSameIdChannel) {
      const idDiscovery = this.#channelIdDiscoveries.get(channel.channelId)
      if (idDiscovery && this.#chatSwarm) {
        this.#channelIdDiscoveries.delete(channel.channelId)
        this.#chatSwarm
          .leave(this.#generateChannelIdDiscoveryKey(channel.channelId))
          .catch(err => {
            console.warn(
              `[MostBox] Failed to leave channel ID discovery for ${channel.channelId}:`,
              err.message
            )
          })
      }
    }

    const coresMap = this.#channelCores.get(channel.channelKey)
    if (coresMap) {
      for (const [, core] of coresMap) {
        try {
          await core.close()
        } catch (err) {
          console.warn(
            `[MostBox] Failed to close channel core for ${channel.channelKey}:`,
            err.message
          )
        }
      }
      this.#channelCores.delete(channel.channelKey)
    }
    this.#channelLocalCoreKey.delete(channel.channelKey)

    this.#channelPeers.delete(channel.channelKey)
    this.#channels.splice(index, 1)
    this.#saveChannelsMetadata()

    console.log(`[MostBox] Left channel: ${channel.channelKey}`)
    this.emit('channel:left', {
      channel: channel.channelKey,
      channelKey: channel.channelKey,
      channelId: channel.channelId,
      name: channel.channelId,
    })

    return this.listChannels({ ownerAddress })
  }

  setChannelRemark(channelKeyInput, remark, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    if (!ownerAddress) {
      throw new Error('需要登录才能设置备注')
    }

    const channel = this.#resolveChannel(channelKeyInput, ownerAddress)

    const trimmed = (remark || '').trim()
    if (trimmed.length > 50) {
      throw new Error('备注最多 50 个字符')
    }

    if (!channel.remarks) {
      channel.remarks = {}
    }

    if (trimmed) {
      channel.remarks[ownerAddress] = trimmed
    } else {
      delete channel.remarks[ownerAddress]
    }

    channel.syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
    this.#saveChannelsMetadata()
    this.#appendUserSyncChannelUpsertSoon(channel, ownerAddress)
    return trimmed
  }

  setChannelPinned(channelKeyInput, pinned, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    if (!ownerAddress) {
      throw new Error('需要登录才能设置置顶')
    }

    const channel = this.#resolveChannel(channelKeyInput, ownerAddress)
    this.#assertChannelMember(channel.channelKey, ownerAddress)

    if (!channel.pinnedBy) {
      channel.pinnedBy = {}
    }

    if (pinned) {
      channel.pinnedBy[ownerAddress] = true
    } else {
      delete channel.pinnedBy[ownerAddress]
    }

    channel.syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
    this.#saveChannelsMetadata()
    this.#appendUserSyncChannelUpsertSoon(channel, ownerAddress)
    return Boolean(channel.pinnedBy[ownerAddress])
  }

  /**
   * 列出所有频道
   * @returns {Array<{ channelId: string, channelKey: string, name: string, createdAt: string, lastMessageAt: string, type: string, peerCount: number, remark: string, pinned: boolean }>}
   */
  listChannels(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const type = String(options.type || '').trim()
    const excludeType = String(options.excludeType || '').trim()

    return this.#channels
      .filter(c => {
        if (!ownerAddress) return true
        return this.#channelHasMember(c, ownerAddress)
      })
      .filter(c => {
        if (type) return c.type === type
        if (excludeType) return c.type !== excludeType
        return true
      })
      .map(c => this.#formatChannelForResponse(c, ownerAddress))
  }

  getChannelMembers(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)

    return this.#getChannelMembers(channel)
  }

  /**
   * 获取频道消息
   * @param {string} channelKeyInput - 内部频道 key，或本地唯一短频道 ID
   * @param {object} [options] - 选项
   * @param {number} [options.limit=100] - 消息数量
   * @param {number} [options.offset=0] - 偏移量
   * @returns {Promise<Array>}
   */
  async getChannelMessages(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)

    const { limit = CHANNEL_MESSAGE_LIMIT, offset = 0 } = options

    const coresMap = this.#channelCores.get(channel.channelKey)
    if (!coresMap || coresMap.size === 0) {
      throw new Error('频道未初始化')
    }

    const allMessages = []
    for (const [coreKeyHex, core] of coresMap) {
      for (let i = 0; i < core.length; i++) {
        try {
          const entry = await core.get(i)
          if (entry && entry.type === 'message') {
            allMessages.push({
              ...entry,
              _coreKey: coreKeyHex,
              _index: i,
            })
          }
        } catch {
          break
        }
      }
    }

    const seen = new Set()
    const unique = allMessages.filter(m => {
      const key = `${m._coreKey}:${m.author}:${m.timestamp}:${m.content}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    unique.sort((a, b) => a.timestamp - b.timestamp)

    const total = unique.length
    const start = Math.max(0, total - offset - limit)
    const end = total - offset

    return unique
      .slice(start, end)
      .map(({ _coreKey, _index, ...msg }) =>
        this.#normalizeChannelMessageForResponse(channel.channelKey, msg)
      )
  }

  /**
   * 发送消息到频道
   * @param {string} channelKeyInput - 内部频道 key，或本地唯一短频道 ID
   * @param {string} content - 消息内容
   * @param {string} author - 作者 address
   * @param {string} authorName - 作者显示名
   * @param {object} [options.attachment] - 附件元数据
   * @returns {Promise<object>}
   */
  async sendMessage(channelKeyInput, content, author, authorName, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)

    const localKeyHex = this.#channelLocalCoreKey.get(channel.channelKey)
    const coresMap = this.#channelCores.get(channel.channelKey)
    const core = localKeyHex && coresMap ? coresMap.get(localKeyHex) : null
    if (!core) {
      throw new Error('频道未初始化或无可写 core')
    }

    if (!content || !content.trim()) {
      throw new Error('消息内容不能为空')
    }

    const trimmed = content.trim()
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`消息内容不能超过 ${MAX_MESSAGE_LENGTH} 字符`)
    }
    const attachment = normalizeChannelAttachment(options.attachment)
    if (attachment && trimmed !== attachment.link) {
      throw new ValidationError('attachment content must match link')
    }
    if (
      channel &&
      this.#upsertChannelMember(channel, {
        ownerAddress: options.ownerAddress,
        displayName: authorName,
        avatar: options.avatar,
      })
    ) {
      this.#saveChannelsMetadata()
    }

    const message = {
      type: 'message',
      author,
      authorName,
      content: trimmed,
      timestamp: Date.now(),
    }
    if (attachment) {
      message.attachment = attachment
    }

    await core.append(message)
    if (channel) {
      channel.lastMessageAt = new Date(message.timestamp).toISOString()
      this.#saveChannelsMetadata()
    }

    return this.#normalizeChannelMessageForResponse(channel.channelKey, message)
  }

  /**
   * 获取频道内在线用户
   * @param {string} channelKeyInput - 内部频道 key，或本地唯一短频道 ID
   * @returns {Array<{ peerId: string, authorName: string, lastSeen: number }>}
   */
  getChannelPeers(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)

    const peers = this.#channelPeers.get(channel.channelKey)
    if (!peers) {
      return []
    }

    return [...peers.values()].map(p => ({
      peerId: p.peerId,
      authorName: p.authorName,
      lastSeen: p.lastSeen,
    }))
  }

  /**
   * 获取显示名
   * @returns {string|null}
   */
  getDisplayName() {
    try {
      const configPath = this.#getConfigPath()
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return config.displayName || null
      }
    } catch {}
    return null
  }

  /**
   * 设置显示名
   * @param {string} name - 显示名
   */
  setDisplayName(name) {
    try {
      const configPath = this.#getConfigPath()
      const config = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : {}
      config.displayName = name.trim()
      const tmpPath = configPath + '.tmp'
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
      fs.renameSync(tmpPath, configPath)
      return true
    } catch {
      return false
    }
  }

  // --- 私有方法 ---

  #resolveChannel(identifier, ownerAddress = '') {
    const value = normalizeChannelKey(identifier)
    const owner = normalizeOwnerAddress(ownerAddress)
    let channel = this.#channels.find(c => c.channelKey === value)
    if (channel) return channel

    const matches = this.#channels.filter(c => c.channelId === value)
    const visibleMatches = owner
      ? matches.filter(c => this.#channelHasMember(c, owner))
      : matches
    if (visibleMatches.length === 1) return visibleMatches[0]
    if (visibleMatches.length > 1) {
      throw new Error('频道 ID 存在多个候选，请使用 channelKey')
    }
    throw new Error('频道不存在')
  }

  async #createLocalChannel(channelId, type = 'personal', options = {}) {
    const fingerprint =
      String(options.fingerprint || '').trim() || createChannelFingerprint()
    const channelKey = buildChannelKey(channelId, fingerprint)
    const writerId = String(options.writerId || '').trim() || createChannelWriterId()
    const ns = this.#store.namespace(`channel-${channelKey}`)
    const localCore = ns.get({
      name: `messages-${writerId}`,
      valueEncoding: 'json',
    })
    await localCore.ready()
    const localWriterCoreKey = b4a.toString(localCore.key, 'hex')
    const writerCoreKeys = uniqueStrings([
      ...(Array.isArray(options.writerCoreKeys) ? options.writerCoreKeys : []),
      localWriterCoreKey,
    ])
    const channelInfo = {
      channelId,
      fingerprint,
      channelKey,
      name: channelId,
      type: String(type || 'personal').trim() || 'personal',
      createdAt: options.createdAt || new Date().toISOString(),
      lastMessageAt: options.lastMessageAt || '',
      writerId,
      localWriterCoreKey,
      writerCoreKeys,
      members: [],
      syncUpdatedAt: Date.now(),
    }

    this.#upsertChannelMember(channelInfo, options)
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const remark = String(options.remark || '').trim()
    if (ownerAddress && remark) {
      channelInfo.remarks = { [ownerAddress]: remark.slice(0, 50) }
    }

    this.#channels.push(channelInfo)
    await this.#openChannelRuntime(channelInfo)
    await this.#joinChannelDiscoveryTopics(channelInfo)
    this.#cacheChannelCandidate(this.#channelToCandidate(channelInfo, true))
    this.#saveChannelsMetadata()
    return channelInfo
  }

  async #joinChannelFromCandidate(candidateInput, type = 'group', options = {}) {
    const channelId = normalizeChannelId(
      candidateInput.channelId || options.channelId
    )
    const channelKey = normalizeChannelKey(candidateInput.channelKey)
    const fingerprint =
      String(candidateInput.fingerprint || '').trim() ||
      getChannelFingerprintFromKey(channelId, channelKey)
    if (!channelId || !fingerprint) {
      throw new Error('频道候选缺少身份信息')
    }
    const expectedChannelKey = buildChannelKey(channelId, fingerprint)
    if (channelKey && channelKey !== expectedChannelKey) {
      throw new Error('频道候选身份格式不匹配')
    }

    const existing = this.#channels.find(
      channel => channel.channelKey === expectedChannelKey
    )
    if (existing) {
      if (this.#upsertChannelMember(existing, options)) {
        this.#saveChannelsMetadata()
      }
      return this.#formatChannelForResponse(existing, options.ownerAddress)
    }

    const hasSameIdLocal = this.#channels.some(
      channel => channel.channelId === channelId
    )
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const remark =
      ownerAddress && hasSameIdLocal && !String(options.remark || '').trim()
        ? `${channelId}-网络`
        : options.remark
    const channelInfo = await this.#createLocalChannel(channelId, candidateInput.type || type, {
      ...options,
      ownerAddress,
      fingerprint,
      createdAt: candidateInput.createdAt,
      lastMessageAt: candidateInput.lastMessageAt,
      writerCoreKeys: candidateInput.writerCoreKeys,
      remark,
    })

    console.log(`[MostBox] Joined channel: ${channelInfo.channelKey}`)
    this.emit('channel:joined', {
      channel: channelInfo.channelKey,
      channelKey: channelInfo.channelKey,
      channelId: channelInfo.channelId,
      key: channelInfo.channelKey,
    })

    return this.#formatChannelForResponse(channelInfo, ownerAddress)
  }

  async #openChannelRuntime(channel) {
    const ns = this.#store.namespace(`channel-${channel.channelKey}`)
    const localCore = channel.localWriterCoreKey
      ? ns.get({
          key: b4a.from(channel.localWriterCoreKey, 'hex'),
          valueEncoding: 'json',
        })
      : ns.get({
          name: `messages-${channel.writerId || createChannelWriterId()}`,
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
    this.#channelCores.get(channel.channelKey).set(localWriterCoreKey, localCore)
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
      this.#saveChannelsMetadata()
    }
    return changed
  }

  async #joinChannelDiscoveryTopics(channel) {
    if (!this.#channelDiscoveries.has(channel.channelKey)) {
      const appDiscovery = this.#swarm.join(
        this.#generateChannelDiscoveryKey(channel.channelKey),
        { server: true, client: true }
      )
      this.#channelDiscoveries.set(channel.channelKey, appDiscovery)
    }

    if (!this.#channelChatDiscoveries.has(channel.channelKey)) {
      const chatDiscovery = this.#chatSwarm.join(
        this.#generateChannelChatDiscoveryKey(channel.channelKey),
        { server: true, client: true }
      )
      this.#channelChatDiscoveries.set(channel.channelKey, chatDiscovery)
    }

    if (!this.#channelIdDiscoveries.has(channel.channelId)) {
      const idDiscovery = this.#chatSwarm.join(
        this.#generateChannelIdDiscoveryKey(channel.channelId),
        { server: true, client: true }
      )
      this.#channelIdDiscoveries.set(channel.channelId, idDiscovery)
    }
  }

  #getLocalChannelCandidates(channelId, options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    return this.#channels
      .filter(channel => channel.channelId === channelId)
      .filter(channel => {
        if (!ownerAddress) return true
        return this.#channelHasMember(channel, ownerAddress)
      })
      .map(channel => this.#channelToCandidate(channel, true))
  }

  async #discoverChannelCandidates(channelId, options = {}) {
    if (this.#options.disableNetwork) return []
    const timeout =
      Number(options.timeout) >= 0
        ? Number(options.timeout)
        : CHANNEL_DISCOVERY_TIMEOUT
    const hadDiscovery = this.#channelIdDiscoveries.has(channelId)
    if (!hadDiscovery) {
      const discovery = this.#chatSwarm.join(
        this.#generateChannelIdDiscoveryKey(channelId),
        { server: true, client: true }
      )
      this.#channelIdDiscoveries.set(channelId, discovery)
    }
    await sleep(timeout)
    const now = Date.now()
    const candidates = [
      ...(this.#channelCandidateCache.get(channelId)?.values() || []),
    ].filter(
      candidate =>
        candidate.local ||
        !candidate.lastSeen ||
        now - candidate.lastSeen <= CHANNEL_CANDIDATE_TTL
    )
    if (!hadDiscovery && !this.#channels.some(c => c.channelId === channelId)) {
      this.#channelIdDiscoveries.delete(channelId)
      this.#chatSwarm
        .leave(this.#generateChannelIdDiscoveryKey(channelId))
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
          onlineCount: Number(candidate.onlineCount) || (candidate.local ? 0 : 1),
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
        onlineCount:
          Math.max(Number(existing.onlineCount) || 0, 0) +
          (candidate.local ? 0 : 1),
      })
    }
    return [...byKey.values()]
  }

  #channelToCandidate(channel, local = false) {
    return {
      channelId: channel.channelId,
      fingerprint: channel.fingerprint,
      channelKey: channel.channelKey,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
      local,
      onlineCount: local ? 0 : 1,
    }
  }

  #cacheChannelCandidate(candidate) {
    if (!candidate?.channelId || !candidate?.channelKey) return
    if (!this.#channelCandidateCache.has(candidate.channelId)) {
      this.#channelCandidateCache.set(candidate.channelId, new Map())
    }
    const cache = this.#channelCandidateCache.get(candidate.channelId)
    const existing = cache.get(candidate.channelKey)
    cache.set(candidate.channelKey, {
      ...existing,
      ...candidate,
      writerCoreKeys: uniqueStrings([
        ...(existing?.writerCoreKeys || []),
        ...(candidate.writerCoreKeys || []),
      ]),
      onlineCount: Math.max(Number(existing?.onlineCount) || 0, 0) + 1,
      lastSeen: Date.now(),
    })
  }

  #getCachedChannelCandidate(channelId, channelKey) {
    const candidate = this.#channelCandidateCache.get(channelId)?.get(channelKey)
    if (candidate) return candidate
    const local = this.#channels.find(channel => channel.channelKey === channelKey)
    return local ? this.#channelToCandidate(local, true) : null
  }

  #formatChannelCandidateForResponse(candidate, ownerAddress = '') {
    const owner = normalizeOwnerAddress(ownerAddress)
    const localChannel = this.#channels.find(
      channel => channel.channelKey === candidate.channelKey
    )
    const remark =
      localChannel && owner
        ? localChannel.remarks?.[owner] || ''
        : candidate.local
          ? ''
          : `${candidate.channelId}-网络`
    return {
      channelId: candidate.channelId,
      fingerprint: candidate.fingerprint,
      channelKey: candidate.channelKey,
      name: candidate.channelId,
      type: candidate.type || 'public',
      createdAt: candidate.createdAt || '',
      lastMessageAt: candidate.lastMessageAt || '',
      remark,
      local: Boolean(candidate.local),
      onlineCount: Number(candidate.onlineCount) || 0,
    }
  }

  #formatChannelForResponse(channel, ownerAddress = '') {
    const owner = normalizeOwnerAddress(ownerAddress)
    return {
      name: channel.channelId,
      channelId: channel.channelId,
      fingerprint: channel.fingerprint,
      channelKey: channel.channelKey,
      key: channel.channelKey,
      coreKey: channel.localWriterCoreKey,
      localWriterCoreKey: channel.localWriterCoreKey,
      writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      type: channel.type,
      peerCount: (this.#channelPeers.get(channel.channelKey) || new Map()).size,
      remark: owner && channel.remarks ? channel.remarks[owner] || '' : '',
      pinned: Boolean(owner && channel.pinnedBy?.[owner]),
    }
  }

  #ensureInitialized() {
    if (!this.#initialized) {
      throw new EngineNotInitializedError()
    }
  }

  #assertChannelMember(name, ownerAddress) {
    const normalizedOwner = normalizeOwnerAddress(ownerAddress)
    if (!normalizedOwner) return

    const channel = this.#resolveChannel(name)
    if (!this.#channelHasMember(channel, normalizedOwner)) {
      throw new PermissionError('未加入该频道')
    }
  }

  #channelHasMember(channel, ownerAddress) {
    const normalizedOwner = normalizeOwnerAddress(ownerAddress)
    if (!normalizedOwner || !Array.isArray(channel?.members)) return false
    return channel.members.some(
      member => normalizeOwnerAddress(member?.address) === normalizedOwner
    )
  }

  #upsertChannelMember(channel, options = {}) {
    const address = normalizeOwnerAddress(options.ownerAddress)
    if (!address) return false

    if (!Array.isArray(channel.members)) {
      channel.members = []
    }

    const displayName = normalizeChannelDisplayName(options.displayName, address)
    const avatar = normalizeChannelAvatar(options.avatar)
    const existing = channel.members.find(
      member => normalizeOwnerAddress(member?.address) === address
    )

    if (existing) {
      let changed = false
      if (existing.address !== address) {
        existing.address = address
        changed = true
      }
      if (displayName && existing.displayName !== displayName) {
        existing.displayName = displayName
        changed = true
      }
      if (avatar && existing.avatar !== avatar) {
        existing.avatar = avatar
        changed = true
      }
      if (!existing.joinedAt) {
        existing.joinedAt = new Date().toISOString()
        changed = true
      }
      return changed
    }

    const member = {
      address,
      displayName,
      joinedAt: new Date().toISOString(),
    }
    if (avatar) {
      member.avatar = avatar
    }
    channel.members.push(member)
    return true
  }

  #getChannelMembers(channel) {
    const members = Array.isArray(channel?.members) ? channel.members : []
    return members
      .map((member, index) => ({
        address: normalizeOwnerAddress(member?.address),
        displayName: normalizeChannelDisplayName(
          member?.displayName,
          normalizeOwnerAddress(member?.address)
        ),
        avatar: normalizeChannelAvatar(member?.avatar),
        joinedAt: String(member?.joinedAt || ''),
        _index: index,
      }))
      .filter(member => member.address && member.joinedAt)
      .sort((a, b) => {
        const timeDiff =
          new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
        return timeDiff || a._index - b._index
      })
      .map(({ _index, ...member }) =>
        member.avatar ? member : { ...member, avatar: undefined }
      )
  }

  #normalizeChannelMessageForResponse(channelKey, message) {
    const channel = this.#channels.find(item => item.channelKey === channelKey)
    const authorAddress = normalizeOwnerAddress(message?.author)
    const member = Array.isArray(channel?.members)
      ? channel.members.find(
          item => normalizeOwnerAddress(item?.address) === authorAddress
        )
      : null
    const avatar = normalizeChannelAvatar(member?.avatar)
    const baseMessage = avatar && message?.avatar !== avatar
      ? { ...message, avatar }
      : message
    const attachment = baseMessage?.attachment
    if (!attachment?.cid || !attachment.fileName) {
      return baseMessage
    }

    const oldFileName = sanitizeFilename(String(attachment.fileName))
    const channelPathName = channel?.channelId || channelKey
    const channelPrefix = `${CHAT_FILE_ROOT}/${channelPathName}/`
    const fileName = oldFileName.startsWith(channelPrefix)
      ? oldFileName
      : `${channelPrefix}${getPathBaseName(oldFileName)}`
    const link = buildMostLink(attachment.cid, fileName)
    const content =
      typeof baseMessage.content === 'string' &&
      (baseMessage.content === attachment.link ||
        parseMostLink(baseMessage.content).cid === attachment.cid)
        ? link
        : baseMessage.content

    if (
      fileName === attachment.fileName &&
      link === attachment.link &&
      content === baseMessage.content
    ) {
      return baseMessage
    }

    return {
      ...baseMessage,
      content,
      attachment: {
        ...attachment,
        fileName,
        link,
      },
    }
  }

  #getCidInfo(cid) {
    return getCidInfo(cid)
  }

  #setSeedState(cid, patch = {}) {
    const previous = this.#seedStates.get(cid) || {}
    const next = {
      ...previous,
      cid,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    this.#seedStates.set(cid, next)
    this.emit('seed:state', next)
    return next
  }

  #clearSeedState(cid) {
    if (this.#seedStates.delete(cid)) {
      this.emit('seed:state:removed', { cid })
    }
  }

  #getUserSyncNamespace(session) {
    return this.#store.namespace(session.syncName)
  }

  async #openUserSyncRuntime(session) {
    const ns = this.#getUserSyncNamespace(session)
    const localCore = session.localWriterCoreKey
      ? ns.get({
          key: b4a.from(session.localWriterCoreKey, 'hex'),
          valueEncoding: 'json',
        })
      : ns.get({
          name: `writer-${session.writerId}`,
          valueEncoding: 'json',
        })
    await localCore.ready()
    session.localWriterCoreKey = b4a.toString(localCore.key, 'hex')
    session.writerCoreKeys = uniqueStrings([
      ...session.writerCoreKeys,
      session.localWriterCoreKey,
    ])

    if (!this.#userSyncCores.has(session.ownerAddress)) {
      this.#userSyncCores.set(session.ownerAddress, new Map())
    }
    this.#userSyncCores
      .get(session.ownerAddress)
      .set(session.localWriterCoreKey, localCore)
    this.#setupUserSyncAppendListener(
      localCore,
      session,
      session.localWriterCoreKey
    )

    for (const writerCoreKey of session.writerCoreKeys) {
      if (writerCoreKey && writerCoreKey !== session.localWriterCoreKey) {
        await this.#openRemoteUserSyncCore(session, writerCoreKey)
      }
    }
  }

  async #joinUserSyncDiscovery(session) {
    if (this.#userSyncDiscoveries.has(session.ownerAddress)) return
    const discoveryKey = this.#generateUserSyncDiscoveryKey(session.syncId)
    const appDiscovery = this.#swarm.join(discoveryKey, {
      server: true,
      client: true,
    })
    const chatDiscovery = this.#chatSwarm.join(
      discoveryKey,
      { server: true, client: true }
    )
    this.#userSyncDiscoveries.set(session.ownerAddress, {
      appDiscovery,
      chatDiscovery,
    })
  }

  async #openRemoteUserSyncCore(session, writerCoreKey) {
    const normalizedCoreKey = String(writerCoreKey || '').trim()
    if (
      !normalizedCoreKey ||
      normalizedCoreKey === session.localWriterCoreKey
    ) {
      return null
    }
    if (!this.#userSyncCores.has(session.ownerAddress)) {
      this.#userSyncCores.set(session.ownerAddress, new Map())
    }
    const coresMap = this.#userSyncCores.get(session.ownerAddress)
    if (coresMap.has(normalizedCoreKey)) return coresMap.get(normalizedCoreKey)

    const ns = this.#getUserSyncNamespace(session)
    const core = ns.get({
      key: b4a.from(normalizedCoreKey, 'hex'),
      valueEncoding: 'json',
    })
    await core.ready()
    coresMap.set(normalizedCoreKey, core)
    session.writerCoreKeys = uniqueStrings([
      ...session.writerCoreKeys,
      normalizedCoreKey,
    ])
    this.#persistUserSyncSession(session)
    this.#setupUserSyncAppendListener(core, session, normalizedCoreKey)
    return core
  }

  #setupUserSyncAppendListener(core, session, coreKey) {
    const offsetKey = `${session.ownerAddress}:${coreKey}`
    let processing = false
    const processEntries = async () => {
      if (processing) return
      processing = true
      try {
        let index = this.#userSyncCoreOffsets.get(offsetKey) || 0
        while (index < core.length) {
          const entry = await core.get(index)
          await this.#applyUserSyncEntry(session, entry)
          index += 1
          this.#userSyncCoreOffsets.set(offsetKey, index)
        }
      } finally {
        processing = false
      }
    }

    core.on('append', () => {
      processEntries().catch(err => {
        console.warn('[MostBox] Failed to process user sync entry:', err.message)
      })
    })
    processEntries().catch(err => {
      console.warn('[MostBox] Failed to process user sync entries:', err.message)
    })
  }

  #encodeUserSyncEntry(session, op) {
    const nonce = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(session.syncCipherKey, 'hex'),
      nonce
    )
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(op), 'utf8'),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()
    const body = `${nonce.toString('hex')}.${encrypted.toString('hex')}.${tag.toString('hex')}`
    const mac = crypto
      .createHmac('sha256', Buffer.from(session.syncMacKey, 'hex'))
      .update(body)
      .digest('hex')

    return {
      type: 'user-sync-op',
      schemaVersion: USER_SYNC_SCHEMA_VERSION,
      ownerAddress: session.ownerAddress,
      syncId: session.syncId,
      writerCoreKeys: uniqueStrings(session.writerCoreKeys),
      body,
      mac,
      createdAt: new Date(op.timestamp).toISOString(),
    }
  }

  #decodeUserSyncEntry(session, entry) {
    if (
      !entry ||
      entry.type !== 'user-sync-op' ||
      entry.syncId !== session.syncId ||
      entry.ownerAddress !== session.ownerAddress ||
      Number(entry.schemaVersion) !== USER_SYNC_SCHEMA_VERSION
    ) {
      return null
    }

    const expectedMac = crypto
      .createHmac('sha256', Buffer.from(session.syncMacKey, 'hex'))
      .update(String(entry.body || ''))
      .digest('hex')
    if (expectedMac !== entry.mac) return null

    const [nonceHex, encryptedHex, tagHex] = String(entry.body || '').split('.')
    if (!nonceHex || !encryptedHex || !tagHex) return null

    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(session.syncCipherKey, 'hex'),
        Buffer.from(nonceHex, 'hex')
      )
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
      ])
      return JSON.parse(decrypted.toString('utf8'))
    } catch {
      return null
    }
  }

  async #appendUserSyncOp(ownerAddressInput, kind, payload = {}) {
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    const session = this.#userSyncSessions.get(ownerAddress)
    if (!session?.localWriterCoreKey) return null
    const coresMap = this.#userSyncCores.get(ownerAddress)
    const core = coresMap?.get(session.localWriterCoreKey)
    if (!core) return null

    const op = {
      opId: `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      schemaVersion: USER_SYNC_SCHEMA_VERSION,
      kind,
      ownerAddress,
      timestamp: Date.now(),
      payload,
    }
    this.#markUserSyncClockForOp(op)
    await core.append(this.#encodeUserSyncEntry(session, op))
    this.#touchUserSyncSession(session)
    return op
  }

  #appendUserSyncOpSoon(ownerAddress, kind, payload = {}) {
    this.#appendUserSyncOp(ownerAddress, kind, payload).catch(err => {
      console.warn('[MostBox] Failed to append user sync op:', err.message)
    })
  }

  async #appendUserSyncSnapshot(ownerAddressInput, reason = 'snapshot') {
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!this.#userSyncSessions.has(ownerAddress)) return null
    const files = this.#getPublishedBucket(ownerAddress).map(file =>
      this.#formatFileForSync(file, 'active')
    )
    const trashFiles = this.#getTrashBucket(ownerAddress).map(file =>
      this.#formatFileForSync(file, 'trash')
    )
    const channels = this.#channels
      .filter(channel => this.#channelHasMember(channel, ownerAddress))
      .map(channel => this.#formatChannelForSync(channel, ownerAddress))
      .filter(Boolean)
    return this.#appendUserSyncOp(ownerAddress, 'snapshot', {
      reason,
      files,
      trashFiles,
      channels,
    })
  }

  async #applyUserSyncEntry(session, entry) {
    const op = this.#decodeUserSyncEntry(session, entry)
    if (!op || op.ownerAddress !== session.ownerAddress) return false
    if (Array.isArray(entry.writerCoreKeys)) {
      await this.#mergeUserSyncWriterCoreKeys(session, entry.writerCoreKeys)
    }
    return this.#applyUserSyncOp(session, op)
  }

  async #applyUserSyncOp(session, op) {
    let changedFiles = false
    let changedChannels = false
    if (op.kind === 'snapshot') {
      const payload = op.payload || {}
      for (const file of Array.isArray(payload.files) ? payload.files : []) {
        changedFiles =
          this.#applyUserSyncFileRecord(
            session.ownerAddress,
            file,
            'active',
            getSyncTimestamp(file.syncUpdatedAt, op.timestamp)
          ) || changedFiles
      }
      for (const file of Array.isArray(payload.trashFiles) ? payload.trashFiles : []) {
        changedFiles =
          this.#applyUserSyncFileRecord(
            session.ownerAddress,
            file,
            'trash',
            getSyncTimestamp(file.syncUpdatedAt, op.timestamp)
          ) || changedFiles
      }
      for (const channel of Array.isArray(payload.channels) ? payload.channels : []) {
        changedChannels =
          (await this.#applyUserSyncChannelRecord(
            session.ownerAddress,
            channel,
            getSyncTimestamp(channel.syncUpdatedAt, op.timestamp)
          )) || changedChannels
      }
    } else if (op.kind === 'file:upsert') {
      changedFiles = this.#applyUserSyncFileRecord(
        session.ownerAddress,
        op.payload?.file,
        'active',
        getSyncTimestamp(op.payload?.file?.syncUpdatedAt, op.timestamp)
      )
    } else if (op.kind === 'file:trash') {
      changedFiles = this.#applyUserSyncFileRecord(
        session.ownerAddress,
        op.payload?.file,
        'trash',
        getSyncTimestamp(op.payload?.file?.syncUpdatedAt, op.timestamp)
      )
    } else if (op.kind === 'file:delete') {
      changedFiles = await this.#applyUserSyncFileDelete(
        session.ownerAddress,
        op.payload?.cid,
        getSyncTimestamp(op.payload?.syncUpdatedAt, op.timestamp)
      )
    } else if (op.kind === 'channel:upsert') {
      changedChannels = await this.#applyUserSyncChannelRecord(
        session.ownerAddress,
        op.payload?.channel,
        getSyncTimestamp(op.payload?.channel?.syncUpdatedAt, op.timestamp)
      )
    } else if (op.kind === 'channel:leave') {
      changedChannels = this.#applyUserSyncChannelLeave(
        session.ownerAddress,
        op.payload?.channelKey,
        getSyncTimestamp(op.payload?.syncUpdatedAt, op.timestamp)
      )
    }

    if (changedFiles) {
      this.#savePublishedMetadata()
      this.#saveTrashMetadata()
      this.emit('user:metadata:updated', {
        ownerAddress: session.ownerAddress,
        scope: 'files',
      })
    }
    if (changedChannels) {
      this.#saveChannelsMetadata()
      this.emit('user:metadata:updated', {
        ownerAddress: session.ownerAddress,
        scope: 'channels',
      })
    }
    if (changedFiles || changedChannels) {
      this.#touchUserSyncSession(session)
    }
    return changedFiles || changedChannels
  }

  async #mergeUserSyncWriterCoreKeys(session, writerCoreKeys = []) {
    const nextKeys = uniqueStrings(writerCoreKeys)
    if (nextKeys.length === 0) return false
    const previous = new Set(session.writerCoreKeys || [])
    let changed = false
    for (const writerCoreKey of nextKeys) {
      if (!previous.has(writerCoreKey)) {
        previous.add(writerCoreKey)
        changed = true
      }
      if (writerCoreKey !== session.localWriterCoreKey) {
        await this.#openRemoteUserSyncCore(session, writerCoreKey)
      }
    }
    if (changed) {
      session.writerCoreKeys = [...previous]
      this.#persistUserSyncSession(session)
    }
    return changed
  }

  async #exchangeUserSyncSessions(peerEngine) {
    for (const session of this.#userSyncSessions.values()) {
      const peerSession = peerEngine.#userSyncSessions.get(session.ownerAddress)
      if (!peerSession || peerSession.syncId !== session.syncId) continue
      await this.#mergeUserSyncWriterCoreKeys(
        session,
        peerSession.writerCoreKeys
      )
      await peerEngine.#mergeUserSyncWriterCoreKeys(
        peerSession,
        session.writerCoreKeys
      )
    }
  }

  #formatFileForSync(file, state = 'active') {
    const cid = String(file?.cid || '').trim()
    if (!cid) return null
    const { driveName } = this.#getCidInfo(cid)
    const syncUpdatedAt = getSyncTimestamp(
      file.syncUpdatedAt || file.deletedAt || file.publishedAt
    )
    return {
      cid,
      fileName: sanitizeFilename(file.fileName || cid),
      driveName: file.driveName || driveName,
      size: Number(file.size) || 0,
      source: String(file.source || (state === 'active' ? 'published' : 'trash')),
      publishedAt:
        typeof file.publishedAt === 'string'
          ? file.publishedAt
          : new Date(syncUpdatedAt).toISOString(),
      deletedAt:
        typeof file.deletedAt === 'string'
          ? file.deletedAt
          : state === 'trash'
            ? new Date(syncUpdatedAt).toISOString()
            : '',
      starred: Boolean(file.starred),
      syncUpdatedAt,
    }
  }

  #formatChannelForSync(channel, ownerAddress) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (
      !channel ||
      !owner ||
      TRANSIENT_CHANNEL_TYPES.has(channel.type) ||
      !this.#channelHasMember(channel, owner)
    ) {
      return null
    }
    return {
      channelId: channel.channelId,
      fingerprint: channel.fingerprint,
      channelKey: channel.channelKey,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
      member: this.#getChannelMembers(channel).find(
        member => member.address === owner
      ),
      remark: channel.remarks?.[owner] || '',
      pinned: Boolean(channel.pinnedBy?.[owner]),
      syncUpdatedAt: getSyncTimestamp(
        channel.syncUpdatedAt || channel.lastMessageAt || channel.createdAt
      ),
    }
  }

  #appendUserSyncChannelUpsertSoon(channel, ownerAddress) {
    const owner = normalizeOwnerAddress(ownerAddress)
    const record = this.#formatChannelForSync(channel, owner)
    if (!record) return
    this.#appendUserSyncOpSoon(owner, 'channel:upsert', { channel: record })
  }

  #appendUserSyncChannelLeaveSoon(channel, ownerAddress, syncUpdatedAt = Date.now()) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (!owner || !channel || TRANSIENT_CHANNEL_TYPES.has(channel.type)) return
    this.#appendUserSyncOpSoon(owner, 'channel:leave', {
      channelKey: channel.channelKey,
      syncUpdatedAt,
    })
  }

  #normalizeSyncFileRecord(record, state, timestamp) {
    if (!record || typeof record !== 'object') return null
    const cid = String(record.cid || '').trim()
    if (!cid) return null
    let driveName = ''
    try {
      driveName = this.#getCidInfo(cid).driveName
    } catch {
      return null
    }
    const fileName = sanitizeFilename(record.fileName || cid)
    if (!fileName || fileName === 'unnamed') return null
    const syncUpdatedAt = getSyncTimestamp(record.syncUpdatedAt, timestamp)
    return {
      cid,
      fileName,
      driveName: record.driveName || driveName,
      size: Number(record.size) || 0,
      source: String(record.source || (state === 'active' ? 'synced' : 'trash')),
      publishedAt:
        typeof record.publishedAt === 'string'
          ? record.publishedAt
          : new Date(syncUpdatedAt).toISOString(),
      deletedAt:
        typeof record.deletedAt === 'string'
          ? record.deletedAt
          : state === 'trash'
            ? new Date(syncUpdatedAt).toISOString()
            : '',
      starred: Boolean(record.starred),
      syncUpdatedAt,
    }
  }

  #applyUserSyncFileRecord(ownerAddress, record, state, timestamp) {
    const normalized = this.#normalizeSyncFileRecord(record, state, timestamp)
    if (!normalized) return false
    const entityKey = `file:${normalized.cid}`
    if (!this.#shouldApplyUserSyncEntity(ownerAddress, entityKey, normalized.syncUpdatedAt)) {
      return false
    }

    const publishedFiles = [...this.#getPublishedBucket(ownerAddress)]
    const trashFiles = [...this.#getTrashBucket(ownerAddress)]
    let changed = false

    const publishedIndex = publishedFiles.findIndex(
      file => file.cid === normalized.cid
    )
    const trashIndex = trashFiles.findIndex(file => file.cid === normalized.cid)
    const localHolding = this.#holdings.find(
      holding => holding.cid === normalized.cid
    )
    const localSource = localHolding?.source || 'synced'

    if (state === 'active') {
      const nextRecord = {
        fileName: normalized.fileName,
        cid: normalized.cid,
        driveName: normalized.driveName,
        size: normalized.size,
        source: localSource,
        publishedAt: normalized.publishedAt,
        starred: normalized.starred,
        syncUpdatedAt: normalized.syncUpdatedAt,
      }
      if (publishedIndex === -1) {
        publishedFiles.push(nextRecord)
        changed = true
      } else if (
        JSON.stringify(publishedFiles[publishedIndex]) !==
        JSON.stringify(nextRecord)
      ) {
        publishedFiles[publishedIndex] = nextRecord
        changed = true
      }
      if (trashIndex !== -1) {
        trashFiles.splice(trashIndex, 1)
        changed = true
      }
    } else {
      const nextRecord = {
        fileName: normalized.fileName,
        cid: normalized.cid,
        driveName: normalized.driveName,
        size: normalized.size,
        source: localSource,
        publishedAt: normalized.publishedAt,
        starred: normalized.starred,
        deletedAt: normalized.deletedAt || new Date(normalized.syncUpdatedAt).toISOString(),
        syncUpdatedAt: normalized.syncUpdatedAt,
      }
      if (trashIndex === -1) {
        trashFiles.push(nextRecord)
        changed = true
      } else if (
        JSON.stringify(trashFiles[trashIndex]) !== JSON.stringify(nextRecord)
      ) {
        trashFiles[trashIndex] = nextRecord
        changed = true
      }
      if (publishedIndex !== -1) {
        publishedFiles.splice(publishedIndex, 1)
        changed = true
      }
    }

    if (changed) {
      this.#setPublishedBucket(ownerAddress, publishedFiles)
      this.#setTrashBucket(ownerAddress, trashFiles)
      this.#setUserSyncClock(ownerAddress, entityKey, normalized.syncUpdatedAt)
    }
    return changed
  }

  async #applyUserSyncFileDelete(ownerAddress, cidInput, timestamp) {
    const cid = String(cidInput || '').trim()
    if (!cid) return false
    const syncUpdatedAt = getSyncTimestamp(timestamp)
    const entityKey = `file:${cid}`
    if (!this.#shouldApplyUserSyncEntity(ownerAddress, entityKey, syncUpdatedAt)) {
      return false
    }

    const publishedFiles = this.#getPublishedBucket(ownerAddress).filter(
      file => file.cid !== cid
    )
    const trashFiles = this.#getTrashBucket(ownerAddress).filter(
      file => file.cid !== cid
    )
    const changed =
      publishedFiles.length !== this.#getPublishedBucket(ownerAddress).length ||
      trashFiles.length !== this.#getTrashBucket(ownerAddress).length
    this.#setPublishedBucket(ownerAddress, publishedFiles)
    this.#setTrashBucket(ownerAddress, trashFiles)
    this.#setUserSyncClock(ownerAddress, entityKey, syncUpdatedAt)
    if (changed && !this.#hasAnyUserReference(cid)) {
      await this.#cleanupUnreferencedCids([cid])
    }
    return changed
  }

  async #applyUserSyncChannelRecord(ownerAddress, record, timestamp) {
    if (!record || typeof record !== 'object') return false
    const channelId = normalizeChannelId(record.channelId)
    const fingerprint = String(record.fingerprint || '').trim()
    const expectedChannelKey =
      channelId && fingerprint ? buildChannelKey(channelId, fingerprint) : ''
    const recordChannelKey = normalizeChannelKey(record.channelKey)
    if (recordChannelKey && recordChannelKey !== expectedChannelKey) {
      return false
    }
    const channelKey = recordChannelKey || expectedChannelKey
    if (!channelId || !fingerprint || !channelKey) return false
    const syncUpdatedAt = getSyncTimestamp(record.syncUpdatedAt, timestamp)
    const entityKey = `channel:${channelKey}`
    if (!this.#shouldApplyUserSyncEntity(ownerAddress, entityKey, syncUpdatedAt)) {
      return false
    }

    let channel = this.#channels.find(item => item.channelKey === channelKey)
    let changed = false
    if (!channel) {
      channel = {
        channelId,
        fingerprint,
        channelKey,
        name: channelId,
        createdAt:
          typeof record.createdAt === 'string'
            ? record.createdAt
            : new Date(syncUpdatedAt).toISOString(),
        lastMessageAt:
          typeof record.lastMessageAt === 'string' ? record.lastMessageAt : '',
        type: String(record.type || 'personal').trim() || 'personal',
        writerId: createChannelWriterId(),
        localWriterCoreKey: '',
        writerCoreKeys: uniqueStrings(record.writerCoreKeys),
        members: [],
        syncUpdatedAt,
      }
      this.#channels.push(channel)
      changed = true
    } else {
      const nextKeys = uniqueStrings([
        ...(channel.writerCoreKeys || []),
        ...(record.writerCoreKeys || []),
      ])
      if (nextKeys.length !== (channel.writerCoreKeys || []).length) {
        channel.writerCoreKeys = nextKeys
        changed = true
      }
      if (record.lastMessageAt && record.lastMessageAt !== channel.lastMessageAt) {
        channel.lastMessageAt = record.lastMessageAt
        changed = true
      }
      channel.syncUpdatedAt = syncUpdatedAt
    }

    if (
      this.#upsertChannelMember(channel, {
        ownerAddress,
        displayName:
          record.member?.displayName || record.remark || '',
        avatar: record.member?.avatar || '',
      })
    ) {
      changed = true
    }
    if (record.remark !== undefined) {
      channel.remarks = channel.remarks || {}
      const remark = String(record.remark || '').slice(0, 50)
      if (remark) channel.remarks[ownerAddress] = remark
      else delete channel.remarks[ownerAddress]
      changed = true
    }
    channel.pinnedBy = channel.pinnedBy || {}
    if (record.pinned) {
      channel.pinnedBy[ownerAddress] = true
    } else {
      delete channel.pinnedBy[ownerAddress]
    }
    this.#setUserSyncClock(ownerAddress, entityKey, syncUpdatedAt)

    if (!this.#channelLocalCoreKey.get(channel.channelKey)) {
      await this.#openChannelRuntime(channel)
      await this.#joinChannelDiscoveryTopics(channel)
      changed = true
      this.emit('channel:joined', {
        channel: channel.channelKey,
        channelKey: channel.channelKey,
        channelId: channel.channelId,
        key: channel.channelKey,
      })
    }
    return changed
  }

  #applyUserSyncChannelLeave(ownerAddress, channelKeyInput, timestamp) {
    const channelKey = normalizeChannelKey(channelKeyInput)
    if (!channelKey) return false
    const syncUpdatedAt = getSyncTimestamp(timestamp)
    const entityKey = `channel:${channelKey}`
    if (!this.#shouldApplyUserSyncEntity(ownerAddress, entityKey, syncUpdatedAt)) {
      return false
    }
    const channel = this.#channels.find(item => item.channelKey === channelKey)
    if (!channel) {
      this.#setUserSyncClock(ownerAddress, entityKey, syncUpdatedAt)
      return false
    }
    const before = channel.members?.length || 0
    channel.members = (channel.members || []).filter(
      member => normalizeOwnerAddress(member?.address) !== ownerAddress
    )
    if (channel.remarks) delete channel.remarks[ownerAddress]
    if (channel.pinnedBy) delete channel.pinnedBy[ownerAddress]
    this.#setUserSyncClock(ownerAddress, entityKey, syncUpdatedAt)
    const changed = before !== channel.members.length
    if (channel.members.length === 0) {
      this.#channels = this.#channels.filter(item => item.channelKey !== channelKey)
    }
    if (changed) {
      this.emit('channel:left', {
        channel: channelKey,
        channelKey,
        channelId: channel.channelId,
        name: channel.channelId,
      })
    }
    return changed
  }

  #getUserSyncClock(ownerAddress, entityKey) {
    const owner = normalizeOwnerAddress(ownerAddress)
    return Number(this.#userSyncMetadata.clocks?.[owner]?.[entityKey]) || 0
  }

  #setUserSyncClock(ownerAddress, entityKey, timestamp) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (!owner || !entityKey) return
    this.#userSyncMetadata.clocks = this.#userSyncMetadata.clocks || {}
    this.#userSyncMetadata.clocks[owner] =
      this.#userSyncMetadata.clocks[owner] || {}
    this.#userSyncMetadata.clocks[owner][entityKey] = Math.max(
      this.#getUserSyncClock(owner, entityKey),
      getSyncTimestamp(timestamp)
    )
    this.#saveUserSyncMetadata()
  }

  #shouldApplyUserSyncEntity(ownerAddress, entityKey, timestamp) {
    return getSyncTimestamp(timestamp) > this.#getUserSyncClock(ownerAddress, entityKey)
  }

  #markUserSyncClockForOp(op) {
    const ownerAddress = normalizeOwnerAddress(op.ownerAddress)
    if (!ownerAddress) return
    if (op.kind === 'file:upsert' || op.kind === 'file:trash') {
      const cid = op.payload?.file?.cid
      const timestamp = getSyncTimestamp(
        op.payload?.file?.syncUpdatedAt,
        op.timestamp
      )
      if (cid) this.#setUserSyncClock(ownerAddress, `file:${cid}`, timestamp)
    } else if (op.kind === 'file:delete') {
      const cid = op.payload?.cid
      const timestamp = getSyncTimestamp(
        op.payload?.syncUpdatedAt,
        op.timestamp
      )
      if (cid) this.#setUserSyncClock(ownerAddress, `file:${cid}`, timestamp)
    } else if (op.kind === 'channel:upsert') {
      const channelKey = op.payload?.channel?.channelKey
      const timestamp = getSyncTimestamp(
        op.payload?.channel?.syncUpdatedAt,
        op.timestamp
      )
      if (channelKey) {
        this.#setUserSyncClock(ownerAddress, `channel:${channelKey}`, timestamp)
      }
    } else if (op.kind === 'channel:leave') {
      const channelKey = op.payload?.channelKey
      const timestamp = getSyncTimestamp(
        op.payload?.syncUpdatedAt,
        op.timestamp
      )
      if (channelKey) {
        this.#setUserSyncClock(ownerAddress, `channel:${channelKey}`, timestamp)
      }
    }
  }

  #persistUserSyncSession(session) {
    this.#userSyncMetadata.sessions = this.#userSyncMetadata.sessions || {}
    this.#userSyncMetadata.sessions[session.ownerAddress] = {
      ownerAddress: session.ownerAddress,
      syncId: session.syncId,
      syncName: session.syncName,
      writerId: session.writerId,
      localWriterCoreKey: session.localWriterCoreKey,
      writerCoreKeys: uniqueStrings(session.writerCoreKeys),
      startedAt: session.startedAt,
      lastSyncedAt:
        this.#userSyncMetadata.sessions?.[session.ownerAddress]?.lastSyncedAt ||
        '',
      updatedAt: new Date().toISOString(),
    }
    this.#saveUserSyncMetadata()
  }

  #touchUserSyncSession(session) {
    this.#persistUserSyncSession(session)
    const persisted = this.#userSyncMetadata.sessions?.[session.ownerAddress]
    if (persisted) {
      persisted.lastSyncedAt = new Date().toISOString()
      this.#saveUserSyncMetadata()
    }
  }

  #getFileRuntimeStats(cid) {
    const state = this.#fileMonitors.get(cid)
    if (!state) {
      return {
        peerCount: 0,
        lastServedAt: null,
        totalServedBytes: 0,
      }
    }

    return {
      peerCount: state.peerCount || 0,
      lastServedAt: state.lastServedAt || null,
      totalServedBytes: state.totalServedBytes || 0,
    }
  }

  async #ensureFileMonitor(cid, drive = null) {
    const existing = this.#fileMonitors.get(cid)
    if (existing) return existing

    const { driveName } = this.#getCidInfo(cid)
    const monitoredDrive = drive || (await this.#getOrCreateDrive(driveName))
    const monitor = monitoredDrive.monitor('/' + cid)
    const state = {
      cid,
      monitor,
      peerCount: 0,
      lastServedAt: null,
      totalServedBytes: 0,
      uploadBytes: 0,
      uploadBlocks: 0,
      lastMetricsEmittedAt: 0,
      cleanup: null,
    }
    this.#fileMonitors.set(cid, state)

    const emitMetrics = (force = false) => {
      const now = Date.now()
      if (!force && now - state.lastMetricsEmittedAt < 1000) return
      state.lastMetricsEmittedAt = now
      this.emit('seed:metrics', {
        cid,
        ...this.#getFileRuntimeStats(cid),
      })
    }

    const updatePeerCount = () => {
      const nextPeerCount = Number(monitor.peers) || 0
      if (nextPeerCount !== state.peerCount) {
        state.peerCount = nextPeerCount
        emitMetrics(true)
      }
    }

    const updateTransferStats = () => {
      updatePeerCount()
      const uploadStats = monitor.uploadStats || {}
      const uploadBytes = Number(uploadStats.monitoringBytes) || 0
      const uploadBlocks = Number(uploadStats.blocks) || 0
      const servedMore =
        uploadBytes > state.uploadBytes || uploadBlocks > state.uploadBlocks

      if (servedMore) {
        state.lastServedAt = new Date().toISOString()
        state.totalServedBytes = uploadBytes
      }

      state.uploadBytes = uploadBytes
      state.uploadBlocks = uploadBlocks
      if (servedMore) emitMetrics()
    }

    monitor.on('update', updateTransferStats)
    try {
      await monitor.ready()
      const blobs = monitor.blobs
      const onPeerUpdate = () => {
        updatePeerCount()
      }
      blobs?.core?.on('peer-add', onPeerUpdate)
      blobs?.core?.on('peer-remove', onPeerUpdate)
      state.cleanup = () => {
        blobs?.core?.off('peer-add', onPeerUpdate)
        blobs?.core?.off('peer-remove', onPeerUpdate)
      }
      updateTransferStats()
    } catch (err) {
      this.#fileMonitors.delete(cid)
      monitor.off('update', updateTransferStats)
      await monitor.close().catch(() => {})
      throw err
    }

    return state
  }

  async #closeFileMonitor(state) {
    if (!state) return
    try {
      state.cleanup?.()
      await state.monitor.close()
    } catch {}
  }

  #resumeHoldingsInBackground() {
    if (this.#holdingResumeTask || this.#holdings.length === 0) {
      return
    }

    const holdings = [...this.#holdings]
    this.#holdingResumeTask = (async () => {
      for (
        let index = 0;
        index < holdings.length && this.#initialized;
        index += HOLDING_REJOIN_BATCH_SIZE
      ) {
        const batch = holdings.slice(index, index + HOLDING_REJOIN_BATCH_SIZE)
        await Promise.allSettled(
          batch.map(async holding => {
            if (!this.#holdings.some(current => current.cid === holding.cid)) {
              return
            }
            await this.#joinCidTopicInternal(holding.cid, {
              server: true,
              client: false,
            })
            console.log(`[MostBox] Rejoined CID topic: ${holding.cid}`)
          })
        )

        if (
          index + HOLDING_REJOIN_BATCH_SIZE < holdings.length &&
          this.#initialized
        ) {
          await sleep(HOLDING_REJOIN_BATCH_DELAY)
        }
      }
    })()
      .catch(err => {
        console.warn('[MostBox] Failed to resume holdings:', err.message)
      })
      .finally(() => {
        this.#holdingResumeTask = null
      })
  }

  #normalizeHolding(record = {}) {
    const cid = record.cid
    if (!cid) {
      throw new ValidationError('cid is required')
    }

    const { topicHex, driveName } = this.#getCidInfo(cid)
    if (record.topic && record.topic !== topicHex) {
      throw new ValidationError('topic must match CID digest')
    }

    const size = Number(record.size)
    if (!Number.isFinite(size) || size < 0) {
      throw new ValidationError('size must be a non-negative number')
    }

    return {
      cid,
      fileName: record.fileName || cid,
      size,
      topic: topicHex,
      driveName,
      source: record.source || 'manual',
    }
  }

  #upsertHolding(record) {
    const holding = this.#normalizeHolding(record)
    const now = new Date().toISOString()
    const index = this.#holdings.findIndex(f => f.cid === holding.cid)
    const next =
      index === -1
        ? { ...holding, createdAt: now, updatedAt: now }
        : { ...this.#holdings[index], ...holding, updatedAt: now }

    if (index === -1) {
      this.#holdings.push(next)
    } else {
      this.#holdings[index] = next
    }

    this.#saveHoldingsMetadata()
    this.emit('holding:updated', next)
    this.#ensureFileMonitor(next.cid).catch(err => {
      this.#setSeedState(next.cid, {
        status: 'error',
        error: err.message,
      })
    })
    const seedState = this.#seedStates.get(next.cid)
    return {
      ...next,
      joined: this.#fileDiscoveries.has(next.cid),
      seedStatus:
        seedState?.status ||
        (this.#fileDiscoveries.has(next.cid) ? 'active' : 'queued'),
      seedError: seedState?.error,
      seedStatusUpdatedAt: seedState?.updatedAt,
      ...this.#getFileRuntimeStats(next.cid),
    }
  }

  #removeHolding(cid) {
    const before = this.#holdings.length
    this.#holdings = this.#holdings.filter(holding => holding.cid !== cid)
    if (this.#holdings.length !== before) {
      this.#saveHoldingsMetadata()
      this.emit('holding:removed', { cid })
    }
    this.#closeFileMonitor(this.#fileMonitors.get(cid))
    this.#fileMonitors.delete(cid)
    this.#clearSeedState(cid)
  }

  async #joinCidTopicInternal(cid, options = {}) {
    const { topic, topicHex, driveName } = this.#getCidInfo(cid)
    const requestedServer = options.server !== false
    const requestedClient = options.client === true
    this.#setSeedState(cid, {
      status: 'joining',
      topic: topicHex,
      driveName,
      error: undefined,
    })

    try {
      const drive = await this.#getOrCreateDrive(driveName)

      const existing = this.#fileDiscoveries.get(cid)
      if (existing) {
        const nextServer = existing.server || requestedServer
        const nextClient = existing.client || requestedClient
        const needsRoleUpgrade =
          nextServer !== existing.server || nextClient !== existing.client

        if (!needsRoleUpgrade) {
          if (this.#holdings.some(holding => holding.cid === cid)) {
            this.#ensureFileMonitor(cid, drive).catch(err => {
              this.#setSeedState(cid, {
                status: 'error',
                error: err.message,
              })
            })
          }
          this.#setSeedState(cid, {
            status: 'active',
            topic: topicHex,
            driveName,
            error: undefined,
          })
          return {
            cid,
            topic: topicHex,
            driveName,
            joined: true,
          }
        }

        await this.#swarm.leave(topic).catch(err => {
          console.warn(
            `[MostBox] Failed to upgrade CID topic role for ${cid}:`,
            err.message
          )
        })
        this.#fileDiscoveries.delete(cid)
      }

      const server = existing?.server || requestedServer
      const client = existing?.client || requestedClient
      const discovery = this.#swarm.join(topic, {
        server,
        client,
      })

      this.#fileDiscoveries.set(cid, {
        discovery,
        topic: topicHex,
        driveName,
        server,
        client,
      })
      this.#setSeedState(cid, {
        status: 'active',
        topic: topicHex,
        driveName,
        error: undefined,
      })
      if (this.#holdings.some(holding => holding.cid === cid)) {
        this.#ensureFileMonitor(cid, drive).catch(err => {
          this.#setSeedState(cid, {
            status: 'error',
            error: err.message,
          })
        })
      }
      this.emit('file:topic:joined', { cid, topic: topicHex, driveName })

      return {
        cid,
        topic: topicHex,
        driveName,
        joined: true,
      }
    } catch (err) {
      this.#setSeedState(cid, {
        status: 'error',
        topic: topicHex,
        driveName,
        error: err.message,
      })
      throw err
    }
  }

  async #leaveCidTopic(cid) {
    const existing = this.#fileDiscoveries.get(cid)
    if (!existing || !this.#swarm) {
      this.#setSeedState(cid, { status: 'paused' })
      return
    }

    this.#fileDiscoveries.delete(cid)
    this.#swarm.leave(b4a.from(existing.topic, 'hex')).catch(err => {
      console.warn(`[MostBox] Failed to leave CID topic ${cid}:`, err.message)
    })
    this.#setSeedState(cid, {
      status: 'paused',
      topic: existing.topic,
      driveName: existing.driveName,
    })
  }

  async #closeDriveForSeed(driveName) {
    const drive = this.#drives.get(driveName)
    if (!drive) {
      return null
    }

    await drive.close()
    this.#drives.delete(driveName)
    return drive
  }

  #getOwnerKey(ownerAddress) {
    return getOwnerBucketKey(ownerAddress)
  }

  #getPublishedBucket(ownerAddress, create = false) {
    const ownerKey = this.#getOwnerKey(ownerAddress)
    if (!this.#publishedFiles[ownerKey] && create) {
      this.#publishedFiles[ownerKey] = []
    }
    return this.#publishedFiles[ownerKey] || []
  }

  #getTrashBucket(ownerAddress, create = false) {
    const ownerKey = this.#getOwnerKey(ownerAddress)
    if (!this.#trashFiles[ownerKey] && create) {
      this.#trashFiles[ownerKey] = []
    }
    return this.#trashFiles[ownerKey] || []
  }

  #setPublishedBucket(ownerAddress, records) {
    const ownerKey = this.#getOwnerKey(ownerAddress)
    const next = Array.isArray(records) ? records : []
    if (next.length === 0) {
      delete this.#publishedFiles[ownerKey]
    } else {
      this.#publishedFiles[ownerKey] = next
    }
  }

  #setTrashBucket(ownerAddress, records) {
    const ownerKey = this.#getOwnerKey(ownerAddress)
    const next = Array.isArray(records) ? records : []
    if (next.length === 0) {
      delete this.#trashFiles[ownerKey]
    } else {
      this.#trashFiles[ownerKey] = next
    }
  }

  #allPublishedRecords() {
    return Object.entries(this.#publishedFiles).flatMap(([owner, records]) =>
      records.map(record => cloneMetadataRecord(record, owner))
    )
  }

  #allTrashRecords() {
    return Object.entries(this.#trashFiles).flatMap(([owner, records]) =>
      records.map(record => cloneMetadataRecord(record, owner))
    )
  }

  #countBucketRecords(buckets) {
    return Object.values(buckets || {}).reduce(
      (sum, records) => sum + (Array.isArray(records) ? records.length : 0),
      0
    )
  }

  #collectUserCids(ownerAddress) {
    const cids = new Set()
    for (const file of this.#getPublishedBucket(ownerAddress)) {
      cids.add(file.cid)
    }
    for (const file of this.#getTrashBucket(ownerAddress)) {
      cids.add(file.cid)
    }
    return cids
  }

  #removeUserFromChannels(ownerAddress) {
    const normalizedOwner = normalizeOwnerAddress(ownerAddress)
    if (!normalizedOwner) return

    this.#channels = this.#channels
      .map(channel => {
        const remarks = channel.remarks
          ? Object.fromEntries(
              Object.entries(channel.remarks).filter(
                ([address]) => normalizeOwnerAddress(address) !== normalizedOwner
              )
            )
          : undefined
        const pinnedBy = channel.pinnedBy
          ? Object.fromEntries(
              Object.entries(channel.pinnedBy).filter(
                ([address]) => normalizeOwnerAddress(address) !== normalizedOwner
              )
            )
          : undefined
        return {
          ...channel,
          remarks:
            remarks && Object.keys(remarks).length > 0 ? remarks : undefined,
          pinnedBy:
            pinnedBy && Object.keys(pinnedBy).length > 0 ? pinnedBy : undefined,
          members: Array.isArray(channel.members)
            ? channel.members.filter(
                member =>
                  normalizeOwnerAddress(member?.address) !== normalizedOwner
              )
            : [],
        }
      })
      .filter(channel => channel.members.length > 0)
  }

  async #cleanupUnreferencedCids(cids) {
    let removedReplicas = 0
    for (const cid of cids) {
      if (this.#hasAnyUserReference(cid)) continue
      const driveName = this.#getCidInfo(cid).driveName
      try {
        const drive = await this.#getOrCreateDrive(driveName)
        await drive.del('/' + cid)
      } catch {}
      await this.#closeDriveForSeed(driveName)
      await this.#leaveCidTopic(cid)
      this.#removeHolding(cid)
      removedReplicas += 1
    }
    return removedReplicas
  }

  async #clearUserDataInternal(ownerAddress) {
    const affectedCids = this.#collectUserCids(ownerAddress)
    const removedFiles = this.#getPublishedBucket(ownerAddress).length
    const removedTrashFiles = this.#getTrashBucket(ownerAddress).length

    this.#setPublishedBucket(ownerAddress, [])
    this.#setTrashBucket(ownerAddress, [])
    this.#removeUserFromChannels(ownerAddress)
    this.#savePublishedMetadata()
    this.#saveTrashMetadata()
    this.#saveChannelsMetadata()

    const removedReplicas = await this.#cleanupUnreferencedCids(affectedCids)
    return {
      removedFiles,
      removedTrashFiles,
      removedReplicas,
    }
  }

  #assertDisplayNameAvailable(fileName, options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
    const safeFileName = sanitizeFilename(fileName)
    const folder = getDisplayPathFolder(safeFileName)
    const baseName = getPathBaseName(safeFileName)
    const conflict = files.find(file => {
      if (
        options.excludeCid &&
        file.cid === options.excludeCid
      ) {
        return false
      }
      const existingFileName = sanitizeFilename(file.fileName)
      return (
        getDisplayPathFolder(existingFileName) === folder &&
        getPathBaseName(existingFileName) === baseName
      )
    })
    if (conflict) {
      throw new ConflictError(`已有同名文件: ${safeFileName}`)
    }
  }

  #hasPublishedReference(cid) {
    return this.#allPublishedRecords().some(file => file.cid === cid)
  }

  #hasAnyUserReference(cid) {
    return (
      this.#allPublishedRecords().some(file => file.cid === cid) ||
      this.#allTrashRecords().some(file => file.cid === cid)
    )
  }

  #getUsedBytes() {
    return this.#holdings.reduce((sum, h) => sum + (h.size || 0), 0)
  }

  #checkCapacity(additionalBytes) {
    const used = this.#getUsedBytes()
    const capacity = this.#options.capacityBytes
    if (used + additionalBytes > capacity) {
      const usedGB = (used / (1024 * 1024 * 1024)).toFixed(2)
      const capacityGB = (capacity / (1024 * 1024 * 1024)).toFixed(2)
      throw new StorageCapacityError(
        `Storage capacity exceeded: used ${usedGB} GB, capacity ${capacityGB} GB`
      )
    }
  }

  async #getOrCreateDrive(name, _options = { server: true, client: false }) {
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
      const drive = await promise
      return drive
    } finally {
      this.#drivePromises.delete(name)
    }
  }

  #getMetadataPath() {
    return path.join(this.#options.dataPath, 'published-files.json')
  }

  #getHoldingsMetadataPath() {
    return path.join(this.#options.dataPath, 'node-holdings.json')
  }

  #getTrashMetadataPath() {
    return path.join(this.#options.dataPath, 'trash-files.json')
  }

  #getUserSyncMetadataPath() {
    return path.join(this.#options.dataPath, 'user-sync.json')
  }

  #atomicWrite(filePath, data) {
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, data, 'utf-8')
    fs.renameSync(tmpPath, filePath)
  }

  #loadPublishedMetadata() {
    try {
      const metadataPath = this.#getMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const data = fs.readFileSync(metadataPath, 'utf-8')
        const parsed = JSON.parse(data)
        const buckets = normalizeMetadataBuckets(parsed)
        for (const records of Object.values(buckets)) {
          for (const record of records) {
            record.starred = record.starred || false
          }
        }
        return buckets
      }
    } catch (err) {
      console.warn(
        'Failed to load published metadata, using empty list:',
        err.message
      )
    }
    return []
  }

  #savePublishedMetadata() {
    try {
      const metadataPath = this.#getMetadataPath()
      this.#atomicWrite(
        metadataPath,
        JSON.stringify(this.#publishedFiles, null, 2)
      )
    } catch (err) {
      console.error('Failed to save published metadata:', err.message)
    }
  }

  #loadHoldingsMetadata() {
    try {
      const metadataPath = this.#getHoldingsMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const data = fs.readFileSync(metadataPath, 'utf-8')
        const parsed = JSON.parse(data)
        return parsed.map(record => this.#normalizeHolding(record))
      }
    } catch (err) {
      console.warn(
        'Failed to load node holdings metadata, using empty list:',
        err.message
      )
    }
    return []
  }

  #saveHoldingsMetadata() {
    try {
      const metadataPath = this.#getHoldingsMetadataPath()
      this.#atomicWrite(metadataPath, JSON.stringify(this.#holdings, null, 2))
    } catch (err) {
      console.error('Failed to save node holdings metadata:', err.message)
    }
  }

  #loadTrashMetadata() {
    try {
      const metadataPath = this.#getTrashMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const data = fs.readFileSync(metadataPath, 'utf-8')
        return normalizeMetadataBuckets(JSON.parse(data))
      }
    } catch (err) {
      console.warn(
        'Failed to load trash metadata, using empty list:',
        err.message
      )
    }
    return []
  }

  #saveTrashMetadata() {
    try {
      const metadataPath = this.#getTrashMetadataPath()
      this.#atomicWrite(metadataPath, JSON.stringify(this.#trashFiles, null, 2))
    } catch (err) {
      console.error('Failed to save trash metadata:', err.message)
    }
  }

  #loadUserSyncMetadata() {
    try {
      const metadataPath = this.#getUserSyncMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
        const sessions = {}
        for (const [owner, session] of Object.entries(parsed.sessions || {})) {
          const ownerAddress = normalizeOwnerAddress(owner)
          const syncId = String(session?.syncId || '').trim()
          if (!ownerAddress || !syncId) continue
          sessions[ownerAddress] = {
            ownerAddress,
            syncId,
            syncName: String(session.syncName || getUserSyncName(syncId)),
            writerId: String(session.writerId || ''),
            localWriterCoreKey: String(session.localWriterCoreKey || ''),
            writerCoreKeys: uniqueStrings(session.writerCoreKeys),
            startedAt: String(session.startedAt || ''),
            lastSyncedAt: String(session.lastSyncedAt || ''),
            updatedAt: String(session.updatedAt || ''),
          }
        }

        const clocks = {}
        for (const [owner, records] of Object.entries(parsed.clocks || {})) {
          const ownerAddress = normalizeOwnerAddress(owner)
          if (!ownerAddress || !records || typeof records !== 'object') continue
          clocks[ownerAddress] = {}
          for (const [entityKey, timestamp] of Object.entries(records)) {
            const value = Number(timestamp)
            if (entityKey && Number.isFinite(value) && value > 0) {
              clocks[ownerAddress][entityKey] = value
            }
          }
        }

        return { sessions, clocks }
      }
    } catch (err) {
      console.warn(
        'Failed to load user sync metadata, using empty state:',
        err.message
      )
    }
    return { sessions: {}, clocks: {} }
  }

  #saveUserSyncMetadata() {
    try {
      const metadataPath = this.#getUserSyncMetadataPath()
      this.#atomicWrite(
        metadataPath,
        JSON.stringify(this.#userSyncMetadata, null, 2)
      )
    } catch (err) {
      console.error('Failed to save user sync metadata:', err.message)
    }
  }

  #getChannelsMetadataPath() {
    return path.join(this.#options.dataPath, 'channels.json')
  }

  #getConfigPath() {
    return path.join(this.#options.dataPath, 'channel-config.json')
  }

  #loadChannelsMetadata() {
    try {
      const metadataPath = this.#getChannelsMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const data = fs.readFileSync(metadataPath, 'utf-8')
        const channels = JSON.parse(data)
        if (!Array.isArray(channels)) return []
        return channels
          .filter(channel => channel && typeof channel === 'object')
          .map(channel => {
            const channelId = normalizeChannelId(channel.channelId)
            const fingerprint = String(channel.fingerprint || '').trim()
            const expectedChannelKey =
              channelId && fingerprint
                ? buildChannelKey(channelId, fingerprint)
                : ''
            const channelKey = normalizeChannelKey(channel.channelKey)
            return {
              ...channel,
              channelId,
              fingerprint,
              channelKey,
              expectedChannelKey,
              name: channelId,
              writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
            }
          })
          .filter(
            channel =>
              CHANNEL_NAME_REGEX.test(channel.channelId) &&
              channel.fingerprint &&
              channel.channelKey === channel.expectedChannelKey &&
              channel.writerId &&
              channel.localWriterCoreKey
          )
          .map(({ expectedChannelKey: _expectedChannelKey, ...channel }) => channel)
      }
    } catch (err) {
      console.warn(
        'Failed to load channels metadata, using empty list:',
        err.message
      )
    }
    return []
  }

  #saveChannelsMetadata() {
    try {
      const metadataPath = this.#getChannelsMetadataPath()
      const persistentChannels = this.#channels
        .filter(channel => !TRANSIENT_CHANNEL_TYPES.has(channel?.type))
        .map(channel => ({
          channelId: channel.channelId,
          fingerprint: channel.fingerprint,
          channelKey: channel.channelKey,
          name: channel.channelId,
          type: channel.type,
          createdAt: channel.createdAt,
          lastMessageAt: channel.lastMessageAt || '',
          writerId: channel.writerId,
          localWriterCoreKey: channel.localWriterCoreKey,
          writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
          members: Array.isArray(channel.members) ? channel.members : [],
          remarks: channel.remarks,
          pinnedBy: channel.pinnedBy,
        }))
      this.#atomicWrite(
        metadataPath,
        JSON.stringify(persistentChannels, null, 2)
      )
    } catch (err) {
      console.error('Failed to save channels metadata:', err.message)
    }
  }

  #generateChannelDiscoveryKey(channelKey) {
    const hash = crypto
      .createHash('sha256')
      .update(`${CHANNEL_NAME_PREFIX}channel:${channelKey}`)
      .digest()
    return hash
  }

  #generateChannelChatDiscoveryKey(channelKey) {
    const hash = crypto
      .createHash('sha256')
      .update(`${CHANNEL_NAME_PREFIX}channel:${channelKey}:chat`)
      .digest()
    return hash
  }

  #generateChannelIdDiscoveryKey(channelId) {
    const hash = crypto
      .createHash('sha256')
      .update(`${CHANNEL_NAME_PREFIX}id:${channelId}:candidates`)
      .digest()
    return hash
  }

  #generateUserSyncDiscoveryKey(syncId) {
    const hash = crypto
      .createHash('sha256')
      .update(`${CHANNEL_NAME_PREFIX}${USER_SYNC_NAMESPACE_PREFIX}${syncId}`)
      .digest()
    return hash
  }

  #setupChannelAppendListener(core, channelKey) {
    let lastCoreLength = core.length
    core.on('append', async () => {
      if (core.length > lastCoreLength) {
        for (let i = lastCoreLength; i < core.length; i++) {
          try {
            const entry = await core.get(i)
            if (entry && entry.type === 'message') {
              const channel = this.#channels.find(
                c => c.channelKey === channelKey
              )
              if (channel) {
                const entryTime = Number(entry.timestamp) || Date.now()
                const currentTime = Date.parse(channel.lastMessageAt || '') || 0
                if (entryTime > currentTime) {
                  channel.lastMessageAt = new Date(entryTime).toISOString()
                  this.#saveChannelsMetadata()
                }
              }
              this.emit('channel:message', {
                channel: channelKey,
                channelKey,
                channelId: channel?.channelId || '',
                message: this.#normalizeChannelMessageForResponse(
                  channelKey,
                  entry
                ),
              })
            }
          } catch (err) {
            console.error(
              `[MostBox] Failed to read channel message from ${channelKey}:`,
              err.message
            )
            continue
          }
        }
        lastCoreLength = core.length
      }
    })
  }

  async #openRemoteChannelCore(channelKey, coreKeyHex) {
    const coresMap = this.#channelCores.get(channelKey)
    if (!coresMap) return
    if (coresMap.has(coreKeyHex)) return

    try {
      const ns = this.#store.namespace(`channel-${channelKey}`)
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
        this.#saveChannelsMetadata()
      }
      console.log(
        `[MostBox] Opened remote channel core ${normalizedCoreKey.slice(0, 8)}... for ${channelKey}`
      )
    } catch (err) {
      console.warn(
        `[MostBox] Failed to open remote channel core for ${channelKey}:`,
        err.message
      )
    }
  }

  async #handleChannelConnection(conn) {
    const stream = conn
    let connectedPeerId = null

    const channels = this.#channels.map(channel => ({
      channelId: channel.channelId,
      fingerprint: channel.fingerprint,
      channelKey: channel.channelKey,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerCoreKeys: uniqueStrings([
        ...(channel.writerCoreKeys || []),
        this.#channelLocalCoreKey.get(channel.channelKey),
      ]),
    }))
    const userSyncSessions = [...this.#userSyncSessions.values()].map(
      session => ({
        ownerAddress: session.ownerAddress,
        syncId: session.syncId,
        syncName: session.syncName,
        writerCoreKeys: uniqueStrings(session.writerCoreKeys),
      })
    )

    const helloMessage = JSON.stringify({
      type: 'channel-hello',
      peerId: this.getNodeId(),
      authorName: this.getNodeId().slice(0, 4),
      channels,
      userSyncSessions,
    })

    try {
      stream.write(helloMessage)
    } catch {
      return
    }

    stream.on('data', async data => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'channel-hello') {
          connectedPeerId = msg.peerId

          const remoteChannels = Array.isArray(msg.channels)
            ? msg.channels
                .filter(channel => channel && typeof channel === 'object')
                .map(channel => ({
                  channelId: normalizeChannelId(channel.channelId),
                  fingerprint: String(channel.fingerprint || '').trim(),
                  channelKey: normalizeChannelKey(channel.channelKey),
                  type: String(channel.type || 'public').trim() || 'public',
                  createdAt:
                    typeof channel.createdAt === 'string'
                      ? channel.createdAt
                      : '',
                  lastMessageAt:
                    typeof channel.lastMessageAt === 'string'
                      ? channel.lastMessageAt
                      : '',
                  writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
                }))
                .filter(
                  channel =>
                    channel.channelId &&
                    channel.fingerprint &&
                    channel.channelKey
                )
            : []

          for (const remoteChannel of remoteChannels) {
            this.#cacheChannelCandidate({
              ...remoteChannel,
              local: false,
              peerId: msg.peerId,
              onlineCount: 1,
            })

            const localChannel = this.#channels.find(
              channel => channel.channelKey === remoteChannel.channelKey
            )
            if (!localChannel) continue

            const peers = this.#channelPeers.get(localChannel.channelKey)
            if (peers) {
              peers.set(msg.peerId, {
                peerId: msg.peerId,
                authorName: msg.authorName,
                lastSeen: Date.now(),
              })
            }

            for (const writerCoreKey of remoteChannel.writerCoreKeys) {
              if (
                writerCoreKey &&
                writerCoreKey !== this.#channelLocalCoreKey.get(localChannel.channelKey)
              ) {
                await this.#openRemoteChannelCore(
                  localChannel.channelKey,
                  writerCoreKey
                )
              }
            }
          }

          const remoteUserSyncSessions = Array.isArray(msg.userSyncSessions)
            ? msg.userSyncSessions
                .filter(session => session && typeof session === 'object')
                .map(session => ({
                  ownerAddress: normalizeOwnerAddress(session.ownerAddress),
                  syncId: String(session.syncId || '').trim(),
                  writerCoreKeys: uniqueStrings(session.writerCoreKeys),
                }))
                .filter(session => session.ownerAddress && session.syncId)
            : []

          for (const remoteSession of remoteUserSyncSessions) {
            const localSession = this.#userSyncSessions.get(
              remoteSession.ownerAddress
            )
            if (!localSession || localSession.syncId !== remoteSession.syncId) {
              continue
            }
            await this.#mergeUserSyncWriterCoreKeys(
              localSession,
              remoteSession.writerCoreKeys
            )
          }

          this.emit('channel:peer:online', {
            peerId: msg.peerId,
            authorName: msg.authorName,
          })
        }
      } catch (err) {
        console.warn(`[MostBox] Failed to process channel data:`, err.message)
      }
    })

    stream.on('close', () => {
      if (connectedPeerId) {
        for (const [, peers] of this.#channelPeers) {
          if (peers.has(connectedPeerId)) {
            const peer = peers.get(connectedPeerId)
            peers.delete(connectedPeerId)
            this.emit('channel:peer:offline', {
              peerId: connectedPeerId,
              authorName: peer?.authorName,
            })
          }
        }
      }
    })
  }

  /**
   * 等待指定 Hyperdrive key 从对等节点或本地可用。
   * @param {Hyperdrive} drive - 要检查的驱动器
   * @param {string} key - 期望的 Hyperdrive key，固定为 /<cid>
   * @param {number} timeout - 最大等待时间（毫秒）
   * @param {string} [taskId] - 用于取消的任务 ID
   * @param {object} [taskState] - 任务状态对象
   * @returns {Promise<object|null>} - Hyperdrive entry
   */
  async #waitForDriveEntry(
    drive,
    key,
    timeout,
    taskId = null,
    taskState = null
  ) {
    const startTime = Date.now()
    let pollInterval = DOWNLOAD_POLL_INTERVAL_MIN
    let lastPeerCount = 0
    let lastStatus = ''
    let bootstrapNodesChecked = false
    let lastUpdateTime = 0

    try {
      const localEntry = await drive.entry(key)
      if (localEntry) {
        console.log(`[MostBox] Found expected entry ${key} locally`)
        if (taskId) this.emit('download:status', { taskId, status: 'syncing' })
        return localEntry
      }
    } catch {}

    const tryUpdateDrive = async () => {
      const now = Date.now()
      if (now - lastUpdateTime > DRIVE_UPDATE_INTERVAL) {
        lastUpdateTime = now
        try {
          await drive.update()
        } catch {}
      }
    }

    while (Date.now() - startTime < timeout) {
      if (taskState && taskState.aborted) {
        throw new Error('Download cancelled')
      }

      const currentTime = Date.now()
      const elapsed = Math.round((currentTime - startTime) / 1000)

      const currentPeerCount = this.#swarm.connections.size
      const hasPeers = currentPeerCount > 0

      if (currentPeerCount !== lastPeerCount) {
        console.log(
          `[MostBox] Peer count changed: ${lastPeerCount} -> ${currentPeerCount} (elapsed: ${elapsed}s)`
        )
        lastPeerCount = currentPeerCount
      }

      await tryUpdateDrive()

      try {
        const entry = await drive.entry(key)
        if (entry) {
          console.log(`[MostBox] Found ${key} after ${elapsed}s`)
          if (taskId) {
            this.emit('download:status', { taskId, status: 'syncing' })
          }
          return entry
        }
      } catch {}

      if (hasPeers) {
        const newStatus = 'syncing'
        if (lastStatus !== newStatus) {
          if (taskId) {
            this.emit('download:status', { taskId, status: newStatus })
          }
          lastStatus = newStatus
        }
        pollInterval = Math.min(pollInterval + 200, DOWNLOAD_POLL_INTERVAL_MAX)
      } else {
        const newStatus = 'finding-peers'
        if (lastStatus !== newStatus) {
          if (taskId) {
            this.emit('download:status', { taskId, status: newStatus })
          }
          lastStatus = newStatus
        }
        pollInterval = DOWNLOAD_POLL_INTERVAL_MIN

        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(
            `[MostBox] Still waiting for peers... (elapsed: ${elapsed}s, timeout: ${timeout / 1000}s)`
          )

          if (!bootstrapNodesChecked && elapsed >= 60) {
            bootstrapNodesChecked = true
            console.log(
              `[MostBox] No peers found after 60s. This may indicate:`
            )
            console.log(
              `[MostBox] 1. Network/firewall blocking P2P connections`
            )
            console.log(`[MostBox] 2. DHT bootstrap nodes unreachable`)
            console.log(`[MostBox] 3. Publisher node offline`)
            console.log(`[MostBox] 4. NAT traversal failed`)
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    console.log(
      `[MostBox] Timeout reached after ${timeout / 1000}s, making final attempt...`
    )

    await tryUpdateDrive()

    try {
      const entry = await drive.entry(key)
      if (entry) {
        console.log(`[MostBox] Found ${key} on final attempt`)
        return entry
      }
    } catch (err) {
      console.log(`[MostBox] Final attempt failed: ${err.message}`)
    }

    const peerCount = this.#swarm.connections.size
    console.log(`[MostBox] Diagnostic information:`)
    console.log(`[MostBox] - Expected key: ${key}`)
    console.log(`[MostBox] - Peer count: ${peerCount}`)
    console.log(`[MostBox] - Bootstrap nodes: ${SWARM_BOOTSTRAP.length}`)
    console.log(`[MostBox] - Timeout: ${timeout / 1000}s`)

    if (peerCount === 0) {
      console.log(
        `[MostBox] Suggestion: Check network connectivity and firewall settings`
      )
    } else {
      console.log(
        `[MostBox] Suggestion: Publisher may be offline or file may have been removed`
      )
    }

    return null
  }
}

// 重新导出工具函数
export * from './config.js'
export * from './core/cid.js'
export * from './utils/errors.js'
export * from './utils/security.js'
