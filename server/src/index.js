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
import * as dagPb from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Duplex } from 'node:stream'

import {
  calculateCid,
  calculateDirectoryCid,
  parseMostLink,
  buildMostLink,
} from './core/cid.js'
import { normalizeChannelAttachment } from './core/channelAttachment.js'
import { normalizeChannelVoiceEvent } from './core/channelVoice.js'
import { getCidInfo } from './core/cidTopic.js'
import {
  TRANSIENT_CHANNEL_TYPES,
  CHANNEL_DISCOVERY_TIMEOUT,
  CHANNEL_CANDIDATE_TTL,
  normalizeChannelDisplayName,
  normalizeChannelAvatar,
  normalizeChannelId,
  createChannelWriterId,
  buildChannelKey,
  normalizeChannelKey,
  isSpecialChannel,
  uniqueStrings,
} from './core/channelIdentity.js'
import { getPathBaseName, getDisplayPathFolder } from './core/displayPath.js'
import {
  normalizeOwnerAddress,
  getOwnerBucketKey,
  normalizeMetadataBuckets,
  cloneMetadataRecord,
} from './core/ownerMetadata.js'
import { getSyncTimestamp, getNextSyncTimestamp } from './core/syncTimestamp.js'
import { createOfflineSwarm } from './node/offlineSwarm.js'
import {
  sanitizeFilename,
  validateAndSanitizePath,
  validateFileSize,
  checkDirectoryWritable,
  formatFileSize,
} from './utils/security.js'
import {
  CHAT_VISIBLE_LABEL_MAX_CODE_POINTS,
  normalizeChatMemberTagPatch,
  normalizeLocalizedChatTag,
  normalizeVisibleChatLabel,
} from './utils/chatLabels.js'
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
const CHANNEL_PRESENCE_HEARTBEAT_MS = 15 * 1000
const CHANNEL_PRESENCE_TIMEOUT_MS = 45 * 1000
const CHANNEL_MEMBER_JOINED_EVENT = 'channel.member.joined'
const CHANNEL_MEMBER_PROFILE_UPDATED_EVENT = 'channel.member.profile.updated'
const CHANNEL_MEMBER_PROFILE_TIME_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const CHANNEL_MENTION_LIMIT = 20
const CLIENT_MESSAGE_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasOwnProperty(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key)
}

function normalizeClientMessageId(input, { strict = false } = {}) {
  if (input === undefined || input === null || input === '') {
    if (strict) throw new ValidationError('Invalid clientMessageId')
    return ''
  }
  if (typeof input !== 'string' || !CLIENT_MESSAGE_ID_REGEX.test(input.trim())) {
    if (strict) {
      throw new ValidationError('Invalid clientMessageId')
    }
    return ''
  }
  return input.trim().toLowerCase()
}

function normalizeChannelMentionList(input, content, options = {}) {
  const { strict = false, attachment = null } = options
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    if (strict) throw new ValidationError('mentions must be an array')
    return []
  }
  if (attachment && input.length > 0) {
    if (strict) throw new ValidationError('attachment messages cannot include mentions')
    return []
  }
  if (strict && input.length > CHANNEL_MENTION_LIMIT) {
    throw new ValidationError(`mentions cannot exceed ${CHANNEL_MENTION_LIMIT}`)
  }

  const normalized = []
  let previousEnd = -1
  const sourceContent = String(content || '')
  const candidates = strict ? input : input.slice(0, CHANNEL_MENTION_LIMIT)

  for (const item of candidates) {
    const address = normalizeOwnerAddress(item?.address)
    const label = normalizeVisibleChatLabel(item?.label)
    const start = Number(item?.start)
    const end = Number(item?.end)
    const valid =
      address &&
      label &&
      Array.from(label).length <= CHAT_VISIBLE_LABEL_MAX_CODE_POINTS &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end > start &&
      end <= sourceContent.length &&
      start >= previousEnd &&
      sourceContent.slice(start, end) === `@${label}`

    if (!valid) {
      if (strict) throw new ValidationError('Invalid mention')
      continue
    }

    normalized.push({ address, label, start, end })
    previousEnd = end
  }

  return normalized
}

function isChannelHistoryEntry(entry) {
  return entry?.type === 'message' || entry?.type === 'system'
}

function isChannelMemberProfileEventEntry(entry) {
  return (
    entry?.type === 'system' &&
    String(entry?.event || '').trim() === CHANNEL_MEMBER_PROFILE_UPDATED_EVENT &&
    String(entry?.content || '').trim() === CHANNEL_MEMBER_PROFILE_UPDATED_EVENT
  )
}

function getChannelHistoryDedupeKey(message) {
  const type = String(message?.type || '')
  const event = String(message?.event || '')
  const author = normalizeOwnerAddress(message?.author)
  const content = String(message?.content || '').trim()

  if (isChannelMemberProfileEventEntry(message)) {
    const memberAddress = normalizeOwnerAddress(message?.member?.address)
    const profileUpdatedAt = Number(message?.member?.profileUpdatedAt)
    if (memberAddress && Number.isFinite(profileUpdatedAt)) {
      return `${type}:${event}:${memberAddress}:${Math.floor(profileUpdatedAt)}`
    }
  }

  if (type === 'system' && event === CHANNEL_MEMBER_JOINED_EVENT && author) {
    return `${type}:${event}:${author}:${content}`
  }

  return [
    message?._coreKey || '',
    type,
    event,
    message?.author || '',
    message?.timestamp || '',
    content,
  ].join(':')
}

function createMemoryDuplexPair() {
  let left
  let right

  left = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      if (!right.destroyed) right.push(chunk)
      callback()
    },
    final(callback) {
      if (!right.destroyed) right.push(null)
      callback()
    },
  })

  right = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      if (!left.destroyed) left.push(chunk)
      callback()
    },
    final(callback) {
      if (!left.destroyed) left.push(null)
      callback()
    },
  })

  left.on('close', () => {
    if (!right.destroyed) right.destroy()
  })
  right.on('close', () => {
    if (!left.destroyed) left.destroy()
  })

  return [left, right]
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
  #channelStreams = new Set()
  #channelPresenceSessions = new Map()
  #channelPresenceProfiles = new Map()
  #channelPresenceSweepTimer = null

  #accountMetadata = { profiles: {} }

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

  getChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    this.#pruneStaleChannelPresence()
    return this.#getChannelPresenceList(channel.channelKey)
  }

  sendChannelVoiceEvent(channelKeyInput, input = {}, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const event = normalizeChannelVoiceEvent(channel.channelKey, input, options)
    this.#broadcastChannelVoice(event)
    this.emit('channel:voice', event)
    return event
  }

  joinChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const event = this.#upsertChannelPresenceSession(channel, {
      ...options,
      address: options.ownerAddress,
      local: true,
    })
    if (event) {
      this.#broadcastChannelPresence(event)
    }
    return this.#getChannelPresenceList(channel.channelKey)
  }

  heartbeatChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const event = this.#touchChannelPresenceSession(channel, {
      ...options,
      address: options.ownerAddress,
      local: true,
    })
    this.#broadcastChannelPresence(
      event ||
        this.#formatChannelPresence(
          channel.channelKey,
          options.ownerAddress,
          'heartbeat'
        )
    )
    return this.#getChannelPresenceList(channel.channelKey)
  }

  updateChannelPresenceProfile(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const event = this.#updateChannelPresenceProfile(channel, {
      ...options,
      address: options.ownerAddress,
      local: true,
    })
    if (event) {
      this.#broadcastChannelPresence(event)
    }
    return this.#getChannelPresenceList(channel.channelKey)
  }

  leaveChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const events = this.#removeChannelPresenceSessions(channel.channelKey, {
      ...options,
      address: options.ownerAddress,
    })
    events.forEach(event => this.#broadcastChannelPresence(event))
    return this.#getChannelPresenceList(channel.channelKey)
  }

  clearChannelPresenceSource(sourceId, options = {}) {
    this.#ensureInitialized()
    const events = this.#removeChannelPresenceSessionsBySource(sourceId)
    if (options.broadcast) {
      events.forEach(event => this.#broadcastChannelPresence(event))
    }
    return events
  }

  pruneChannelPresence() {
    this.#ensureInitialized()
    return this.#pruneStaleChannelPresence()
  }

  #isClosedSessionError(err) {
    if (!err || typeof err !== 'object') return false
    const code = String(err.code || '')
    const message = String(err.message || '')
    return (
      code === 'SESSION_CLOSED' ||
      message.includes('SESSION_CLOSED') ||
      message.includes('closed session')
    )
  }

  async #reopenChannelLocalWriter(channel) {
    const channelKey = channel.channelKey
    const localKeyHex =
      this.#channelLocalCoreKey.get(channelKey) || channel.localWriterCoreKey
    const coresMap = this.#channelCores.get(channelKey)
    const staleCore = localKeyHex && coresMap ? coresMap.get(localKeyHex) : null

    if (staleCore) {
      coresMap.delete(localKeyHex)
      await staleCore.close().catch(() => {})
    }
    this.#channelLocalCoreKey.delete(channelKey)

    await this.#openChannelRuntime(channel)

    const reopenedKeyHex = this.#channelLocalCoreKey.get(channelKey)
    const reopenedCore = reopenedKeyHex
      ? this.#channelCores.get(channelKey)?.get(reopenedKeyHex)
      : null
    if (!reopenedCore) {
      throw new Error('频道未初始化或无可写 core')
    }
    return reopenedCore
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

    this.#chatSwarm.on('connection', (conn, info) => {
      conn.on('error', err => {
        if (err.code === 'SSL_ERROR' || err.message?.includes('handshake')) {
          return
        }
      })

      this.#handleChannelConnection(conn, info).catch(() => {})
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

    this.#accountMetadata = this.#loadAccountMetadata()

    this.#initialized = true
    console.log(`[MostBox] Engine initialized successfully`)
    this.emit('ready')
    this.#resumeHoldingsInBackground()
    this.#startChannelPresenceSweeper()

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
    this.#channelStreams.clear()
    this.#clearChannelPresenceRuntime()
    this.#channels = []

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
    const addToLibrary = options.addToLibrary !== false

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
    const publishedBucket = addToLibrary
      ? this.#getPublishedBucket(ownerAddress, true)
      : []
    // 检查相同内容是否已存在
    const existingIndex = publishedBucket.findIndex(f => f.cid === cidString)
    const repairingMissingContent = existingIndex !== -1
    if (existingIndex !== -1) {
      const existing = publishedBucket[existingIndex]
      const existingContent = await this.#getLocalCidContent(cidString, {
        ownerAddress,
        public: true,
        allowHoldingFallback: true,
      })
      if (existingContent) {
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
          link: buildMostLink(cidString, existing.fileName),
          fileName: existing.fileName,
          alreadyExists: true,
        }
      }
    }

    if (addToLibrary) {
      this.#assertDisplayNameAvailable(safeFileName, {
        ownerAddress,
        excludeCid: repairingMissingContent ? cidString : undefined,
      })
    }

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
    try {
      await this.#writeDriveFile(drive, driveKey, content, cleanPath)
    } catch (err) {
      if (!this.#isClosedSessionError(err)) {
        throw err
      }
      drive = await this.#reopenDrive(name, {
        server: true,
        client: false,
      })
      await this.#writeDriveFile(drive, driveKey, content, cleanPath)
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
    if (addToLibrary) {
      if (repairingMissingContent) {
        publishedBucket[existingIndex] = fileRecord
      } else {
        publishedBucket.push(fileRecord)
      }
      this.#savePublishedMetadata()
    }
    this.#upsertHolding({
      cid: cidString,
      fileName: safeFileName,
      size: fileSize,
      driveName: name,
      source: 'published',
    })

    const result = {
      cid: cidString,
      link: buildMostLink(cidString, safeFileName),
      fileName: safeFileName,
    }

    this.emit('publish:success', result)
    return result
  }

  async shareFolder(folderPath, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const safeFolderPath = sanitizeFilename(folderPath || '')
    if (!safeFolderPath) {
      throw new ValidationError('folder path is required')
    }

    const prefix = `${safeFolderPath}/`
    const folderRecords = this.#getPublishedBucket(ownerAddress)
      .filter(file => {
        if ((file.kind || 'file') === 'collection') return false
        const safeFileName = sanitizeFilename(file.fileName || '')
        return (
          safeFileName.startsWith(prefix) &&
          safeFileName.slice(prefix.length).length > 0
        )
      })
      .sort((left, right) =>
        sanitizeFilename(left.fileName || '').localeCompare(
          sanitizeFilename(right.fileName || '')
        )
      )

    if (folderRecords.length === 0) {
      throw new ValidationError('folder has no files')
    }

    const files = []
    for (const file of folderRecords) {
      const safeFileName = sanitizeFilename(file.fileName || '')
      const relativePath = safeFileName.slice(prefix.length)
      let raw
      try {
        raw = await this.readFileRaw(file.cid, { ownerAddress })
      } catch {
        throw new ValidationError(
          `Folder file is not locally available: ${safeFileName}`
        )
      }
      files.push({
        path: `${safeFolderPath}/${relativePath}`,
        content: raw.buffer,
      })
    }

    return this.publishCollection(files, safeFolderPath, {
      ownerAddress,
      addToLibrary: false,
      seedChildFiles: false,
    })
  }

  async publishCollection(files, collectionName, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const addToLibrary = options.addToLibrary !== false
    const seedChildFiles = options.seedChildFiles !== false
    if (!Array.isArray(files) || files.length === 0) {
      throw new ValidationError('collection files are required')
    }

    const directory = await calculateDirectoryCid(files)
    const cidString = directory.cid.toString()
    const safeCollectionName = sanitizeFilename(
      collectionName || directory.rootPath || cidString
    )
    const { driveName: name } = this.#getCidInfo(cidString)
    const publishedBucket = addToLibrary
      ? this.#getPublishedBucket(ownerAddress, true)
      : []
    const existingIndex = publishedBucket.findIndex(f => f.cid === cidString)
    const repairingMissingContent = existingIndex !== -1

    if (existingIndex !== -1) {
      const existingContent = await this.#getLocalCidContent(cidString, {
        ownerAddress,
        public: true,
        allowHoldingFallback: true,
      })
      if (existingContent) {
        await this.#joinCidTopicInternal(cidString, {
          server: true,
          client: false,
        })
        this.#upsertHolding({
          cid: cidString,
          fileName: publishedBucket[existingIndex].fileName,
          kind: 'collection',
          size: 0,
          driveName: name,
          source: 'published',
        })
        return {
          kind: 'collection',
          cid: cidString,
          link: buildMostLink(
            cidString,
            publishedBucket[existingIndex].fileName
          ),
          fileName: publishedBucket[existingIndex].fileName,
          size: directory.totalSize,
          fileCount: directory.files.length,
          files: directory.files,
          alreadyExists: true,
        }
      }
    }

    if (addToLibrary) {
      this.#assertDisplayNameAvailable(safeCollectionName, {
        ownerAddress,
        excludeCid: repairingMissingContent ? cidString : undefined,
      })
    }

    const rootPath = directory.rootPath || ''
    if (seedChildFiles) {
      for (const file of files) {
        const rawPath = String(file?.path || '').replace(/\\/g, '/')
        const childPath =
          rootPath && rawPath.startsWith(`${rootPath}/`)
            ? rawPath.slice(rootPath.length + 1)
            : rawPath
        await this.publishFile(file.content, childPath, {
          ownerAddress,
          addToLibrary: false,
        })
      }
    }

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

    for (const [blockCid, block] of directory.blocks.entries()) {
      const driveKey =
        blockCid === cidString ? `/${blockCid}` : `/.unixfs/${blockCid}`
      await this.#writeDriveFile(drive, driveKey, block)
    }

    const now = Date.now()
    const fileRecord = {
      kind: 'collection',
      fileName: safeCollectionName,
      cid: cidString,
      driveName: name,
      size: directory.totalSize,
      fileCount: directory.files.length,
      source: 'published',
      publishedAt: new Date(now).toISOString(),
      starred: false,
      syncUpdatedAt: now,
    }
    if (addToLibrary) {
      if (repairingMissingContent) {
        publishedBucket[existingIndex] = fileRecord
      } else {
        publishedBucket.push(fileRecord)
      }
      this.#savePublishedMetadata()
    }
    this.#upsertHolding({
      cid: cidString,
      fileName: safeCollectionName,
      kind: 'collection',
      size: 0,
      driveName: name,
      source: 'published',
    })

    const result = {
      kind: 'collection',
      cid: cidString,
      link: buildMostLink(cidString, safeCollectionName),
      fileName: safeCollectionName,
      size: directory.totalSize,
      fileCount: directory.files.length,
      files: directory.files,
    }

    this.emit('publish:success', result)
    return result
  }

  /**
   * 从 P2P 网络下载文件
   * @param {string} link - most:// 链接
   * @param {string} [taskId] - 用于取消的任务 ID
   * @param {object} [options] - 下载选项
   * @param {number} [options.timeout] - 等待 P2P 内容的超时时间（毫秒）
   * @param {number} [options.streamReadTimeout] - 下载流无进度超时时间（毫秒）
   * @returns {Promise<{ taskId: string, fileName: string, savedPath?: string, localAvailable?: boolean, alreadyExists?: boolean }>}
   */
  async downloadFile(link, taskId = null, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const addToLibrary = options.addToLibrary !== false

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
      if (parsed.errorCode) {
        throw new ValidationError(
          parsed.errorCode,
          parsed.errorCode,
          parsed.details
        )
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
        const localCollection =
          localContent.fileRecord?.kind === 'collection'
            ? await this.#readCollectionFromDrive(
                cidString,
                localContent.drive,
                linkFileName
              )
            : await this.#tryReadCollectionFromDrive(
                cidString,
                localContent.drive,
                linkFileName
              )
        if (localCollection) {
          if (
            this.#isCollectionPublishedInOwnerLibrary(
              localCollection,
              ownerAddress
            )
          ) {
            return {
              kind: 'collection',
              taskId,
              cid: localCollection.cid,
              fileName: localCollection.fileName,
              fileCount: localCollection.fileCount,
              files: localCollection.files,
              localAvailable: true,
              alreadyExists: true,
            }
          }
          return this.#downloadCollectionFiles(localCollection, taskId, {
            ...options,
            ownerAddress,
            fileName: linkFileName,
          })
        }

        const existingFile = localContent.fileRecord
        const publishedBucket = this.#getPublishedBucket(ownerAddress, true)
        const existingIndex = publishedBucket.findIndex(
          f => f.cid === cidString
        )
        const alreadyInOwnerLibrary = existingIndex !== -1
        console.log(
          `[MostBox] CID content already exists locally: ${cidString}`
        )
        const existingHolding = this.#holdings.find(
          item => item.cid === cidString
        )
        const localSize =
          Number(existingHolding?.size) ||
          (Number.isFinite(localContent.size) ? localContent.size : 0)
        if (addToLibrary && !alreadyInOwnerLibrary) {
          this.#assertDisplayNameAvailable(linkFileName, {
            ownerAddress,
            excludeCid: cidString,
          })
          const syncUpdatedAt = Date.now()
          publishedBucket.push({
            fileName: linkFileName,
            cid: cidString,
            driveName: existingFile?.driveName || name,
            size: localSize,
            source: 'downloaded',
            publishedAt: new Date(syncUpdatedAt).toISOString(),
            starred: false,
            syncUpdatedAt,
          })
          this.#savePublishedMetadata()
        }
        await this.#joinCidTopicInternal(cidString, {
          server: true,
          client: false,
        })
        this.#upsertHolding({
          cid: cidString,
          fileName:
            existingHolding?.fileName ||
            (alreadyInOwnerLibrary ? existingFile?.fileName : linkFileName) ||
            linkFileName,
          size: localSize,
          driveName: existingFile?.driveName || name,
          source:
            existingHolding?.source ||
            (alreadyInOwnerLibrary ? existingFile?.source : 'downloaded') ||
            'downloaded',
        })
        return {
          taskId,
          fileName: linkFileName,
          localAvailable: true,
          alreadyExists: alreadyInOwnerLibrary,
        }
      }

      if (addToLibrary) {
        this.#assertDisplayNameAvailable(linkFileName, {
          ownerAddress,
          excludeCid: cidString,
        })
      }

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

      const remoteCollection = await this.#tryReadCollectionFromDrive(
        cidString,
        drive,
        linkFileName
      )
      if (remoteCollection) {
        return this.#downloadCollectionFiles(remoteCollection, taskId, {
          ...options,
          ownerAddress,
          fileName: linkFileName,
        })
      }

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

        const publishedBucket = addToLibrary
          ? this.#getPublishedBucket(ownerAddress, true)
          : []
        const existingIndex = publishedBucket.findIndex(
          f => f.cid === cidString
        )
        if (addToLibrary) {
          this.#assertDisplayNameAvailable(sanitizedFileName, {
            ownerAddress,
            excludeCid: cidString,
          })
        }
        const savedSize = totalBytes || fs.statSync(savePath).size
        const syncUpdatedAt =
          existingIndex !== -1
            ? getNextSyncTimestamp(publishedBucket[existingIndex].syncUpdatedAt)
            : Date.now()
        if (addToLibrary) {
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
        }
        this.#upsertHolding({
          cid: cidString,
          fileName: sanitizedFileName,
          size: savedSize,
          driveName: name,
          source: 'downloaded',
        })

        if (!options.suppressSuccessEvent) {
          this.emit('download:success', result)
        }
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
    if (parsed.errorCode) {
      throw new ValidationError(
        parsed.errorCode,
        parsed.errorCode,
        parsed.details
      )
    }

    const localContent = await this.#getLocalCidContent(parsed.cid, {
      ownerAddress,
      public: true,
      allowHoldingFallback: true,
    })
    if (!localContent) {
      return null
    }

    const collection = await this.#tryReadCollectionFromDrive(
      parsed.cid,
      localContent.drive,
      sanitizeFilename(parsed.fileName)
    )
    if (collection) {
      return {
        available: true,
        ...this.#withCollectionFileStates(collection),
        localAvailable: true,
        alreadyExists: this.#isCollectionPublishedInOwnerLibrary(
          collection,
          ownerAddress
        ),
      }
    }

    return {
      available: true,
      cid: parsed.cid,
      fileName: sanitizeFilename(parsed.fileName),
      size: localContent.size,
      localAvailable: true,
      alreadyExists: this.#getPublishedBucket(ownerAddress).some(
        f => f.cid === parsed.cid
      ),
    }
  }

  async getCollection(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const localContent = await this.#getLocalCidContent(cid, {
      ownerAddress,
      public: true,
      allowHoldingFallback: true,
    })
    if (!localContent) {
      throw new Error('Collection not found')
    }

    const collection = await this.#readCollectionFromDrive(
      cid,
      localContent.drive,
      localContent.fileRecord?.fileName || cid
    )
    return this.#withCollectionFileStates(collection)
  }

  /**
   * 检测 most:// 链接当前是否能找到可下载内容，但不读取文件内容。
   * @param {string} link - most:// 链接
   * @param {object} [options] - 检测选项
   * @param {number} [options.timeout] - 等待 P2P 内容的超时时间（毫秒）
   * @returns {Promise<{ available: boolean, cid: string, fileName: string, size: number|null, localAvailable?: boolean, alreadyExists?: boolean }>}
   */
  async checkDownloadAvailability(link, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const timeout = options.timeout || DRIVE_ENTRY_TIMEOUT
    const parsed = parseMostLink(link)
    if (parsed.errorCode) {
      throw new ValidationError(
        parsed.errorCode,
        parsed.errorCode,
        parsed.details
      )
    }

    const cidString = parsed.cid
    const { driveName: name } = this.#getCidInfo(cidString)
    const localContent = await this.#getLocalCidContent(cidString, {
      ownerAddress,
      public: true,
      allowHoldingFallback: true,
    })
    if (localContent) {
      const collection =
        localContent.fileRecord?.kind === 'collection'
          ? await this.#readCollectionFromDrive(
              cidString,
              localContent.drive,
              sanitizeFilename(parsed.fileName)
            )
          : await this.#tryReadCollectionFromDrive(
              cidString,
              localContent.drive,
              sanitizeFilename(parsed.fileName)
            )
      if (collection) {
        return {
          available: true,
          ...this.#withCollectionFileStates(collection),
          localAvailable: true,
          alreadyExists: this.#isCollectionPublishedInOwnerLibrary(
            collection,
            ownerAddress
          ),
        }
      }

      return {
        available: true,
        cid: cidString,
        fileName: sanitizeFilename(parsed.fileName),
        size: localContent.size,
        localAvailable: true,
        alreadyExists: this.#getPublishedBucket(ownerAddress).some(
          f => f.cid === cidString
        ),
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

    const collection = await this.#tryReadCollectionFromDrive(
      cidString,
      drive,
      sanitizeFilename(parsed.fileName)
    )
    if (collection) {
      return {
        available: true,
        ...this.#withCollectionFileStates(collection),
        alreadyExists: this.#isCollectionPublishedInOwnerLibrary(
          collection,
          ownerAddress
        ),
      }
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

    return files.map(f => {
      const holding = this.#holdings.find(item => item.cid === f.cid)
      const seedState = this.#seedStates.get(f.cid)
      const seedStatus = seedState?.status || ''
      return {
        kind: f.kind || 'file',
        fileName: f.fileName,
        cid: f.cid,
        link: buildMostLink(f.cid, f.fileName),
        publishedAt: f.publishedAt,
        size: Number(f.size) || 0,
        fileCount: Number(f.fileCount) || undefined,
        starred: f.starred || false,
        ownerAddress: ownerAddress || '',
        localAvailable: this.#isLocalHoldingAvailable(f.cid),
        seedStatus,
        seedError: seedState?.error,
        holdingSize: Number(holding?.size) || 0,
      }
    })
  }

  async listPublishedFilesWithAvailability(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.listPublishedFiles(options)

    return Promise.all(
      files.map(async file => {
        const localContent = await this.#getLocalCidContent(file.cid, {
          ownerAddress,
          public: true,
          allowHoldingFallback: true,
        })
        return {
          ...file,
          localAvailable: localContent !== null,
        }
      })
    )
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
    files[index].syncUpdatedAt = getNextSyncTimestamp(
      files[index].syncUpdatedAt
    )
    this.#savePublishedMetadata()
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
      if (fileRecord.kind === 'collection') {
        trashRecord.kind = 'collection'
        trashRecord.fileCount = Number(fileRecord.fileCount) || 0
      }
      trashFiles.push(trashRecord)
      this.#saveTrashMetadata()

      files.splice(index, 1)
      this.#setPublishedBucket(ownerAddress, files)
      this.#savePublishedMetadata()

      if (!this.#hasPublishedReference(fileRecord.cid)) {
        await this.#leaveCidTopic(fileRecord.cid)
        await this.#closeDriveForSeed(
          fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName
        )
        this.#removeHolding(fileRecord.cid)
      }
      await this.#stopCollectionChildHoldings(fileRecord, {
        ownerAddress,
        excludeCid: fileRecord.cid,
      })
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
    return files.map(f => {
      const holding = this.#holdings.find(item => item.cid === f.cid)
      const seedState = this.#seedStates.get(f.cid)
      const seedStatus = seedState?.status || ''
      return {
        kind: f.kind || 'file',
        fileName: f.fileName,
        cid: f.cid,
        link: buildMostLink(f.cid, f.fileName),
        publishedAt: f.publishedAt,
        size: Number(f.size) || 0,
        fileCount: Number(f.fileCount) || undefined,
        starred: f.starred || false,
        ownerAddress: ownerAddress || '',
        deletedAt: f.deletedAt,
        localAvailable: this.#isLocalHoldingAvailable(f.cid),
        seedStatus,
        seedError: seedState?.error,
        holdingSize: Number(holding?.size) || 0,
      }
    })
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
    if (fileRecord.kind === 'collection') {
      publishedRecord.kind = 'collection'
      publishedRecord.fileCount = Number(fileRecord.fileCount) || 0
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
        size:
          fileRecord.kind === 'collection'
            ? 0
            : localContent.size || Number(fileRecord.size) || 0,
        driveName,
        source: fileRecord.source || 'published',
        kind: fileRecord.kind === 'collection' ? 'collection' : undefined,
      })
    }
    await this.#restoreCollectionChildHoldings(fileRecord, {
      ownerAddress,
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
    files[index].syncUpdatedAt = getNextSyncTimestamp(
      files[index].syncUpdatedAt
    )
    files[index].publishedAt = new Date(
      files[index].syncUpdatedAt
    ).toISOString()
    this.#savePublishedMetadata()
    return {
      cid,
      fileName: safeFileName,
      link: buildMostLink(cid, safeFileName),
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
        link: buildMostLink(file.cid, file.fileName),
      }
    })

    if (updatedFiles.length > 0) {
      this.#savePublishedMetadata()
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

  hasDownloadNameConflict(fileName, options = {}) {
    this.#ensureInitialized()
    const sanitizedFileName = sanitizeFilename(fileName)
    const savePath = path.join(this.#options.downloadPath, sanitizedFileName)
    if (!fs.existsSync(savePath)) return false
    if (options.allowDirectory === true) {
      try {
        return !fs.statSync(savePath).isDirectory()
      } catch {
        return true
      }
    }
    return true
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
        link: buildMostLink(holding.cid, holding.fileName || holding.cid),
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
      if (parsed.errorCode) {
        throw new ValidationError(
          parsed.errorCode,
          parsed.errorCode,
          parsed.details
        )
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
    const link = buildMostLink(cid, fileName)
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
    const [leftChat, rightChat] = createMemoryDuplexPair()
    left.on('error', () => {})
    right.on('error', () => {})
    leftChat.on('error', () => {})
    rightChat.on('error', () => {})
    left.pipe(right).pipe(left)
    this.#handleChannelConnection(leftChat).catch(() => {})
    peerEngine.#handleChannelConnection(rightChat).catch(() => {})

    return {
      close: () => {
        left.destroy()
        right.destroy()
        leftChat.destroy()
        rightChat.destroy()
      },
    }
  }

  getUserProfile(ownerAddressInput) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }
    const profile = this.#accountMetadata.profiles?.[ownerAddress]
    return profile ? { ...profile } : null
  }

  saveUserProfile(ownerAddressInput, profileInput = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }
    const existing = this.getUserProfile(ownerAddress)
    const profile = this.#normalizeAccountProfileRecord(
      ownerAddress,
      profileInput,
      getNextSyncTimestamp(existing?.updatedAt)
    )
    if (!profile) {
      throw new ValidationError('valid profile is required')
    }
    if (existing && profile.updatedAt <= existing.updatedAt) {
      return { ...existing }
    }

    this.#accountMetadata.profiles = this.#accountMetadata.profiles || {}
    this.#accountMetadata.profiles[ownerAddress] = profile
    this.#saveAccountMetadata()

    const changedChannels = this.#applyUserProfileToJoinedChannels(
      ownerAddress,
      profile
    )
    if (changedChannels) {
      this.#saveChannelsMetadata()
      this.emit('user:metadata:updated', {
        ownerAddress,
        scope: 'channels',
      })
    }
    this.emit('user:metadata:updated', {
      ownerAddress,
      scope: 'profile',
    })
    return { ...profile }
  }

  exportUserData(ownerAddressInput) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }

    const profile = this.getUserProfile(ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
      .map(file => this.#formatAccountFileForBackup(file, 'active'))
      .filter(Boolean)
    const trashFiles = this.#getTrashBucket(ownerAddress)
      .map(file => this.#formatAccountFileForBackup(file, 'trash'))
      .filter(Boolean)
    const channels = this.#channels
      .filter(channel => this.#channelHasMember(channel, ownerAddress))
      .map(channel =>
        this.#formatAccountChannelForBackup(channel, ownerAddress)
      )
      .filter(Boolean)

    return {
      type: 'mostbox.account-backup',
      schemaVersion: 1,
      ownerAddress,
      exportedAt: new Date().toISOString(),
      profile,
      files,
      trashFiles,
      channels,
    }
  }

  async importUserData(ownerAddressInput, backupInput = {}, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }
    if (
      !backupInput ||
      typeof backupInput !== 'object' ||
      backupInput.type !== 'mostbox.account-backup' ||
      Number(backupInput.schemaVersion) !== 1
    ) {
      throw new ValidationError('invalid account backup data')
    }
    if (normalizeOwnerAddress(backupInput.ownerAddress) !== ownerAddress) {
      throw new PermissionError('backup owner does not match current user')
    }

    const result = {
      profileUpdated: false,
      filesAdded: 0,
      filesUpdated: 0,
      trashFilesAdded: 0,
      trashFilesUpdated: 0,
      channelsAdded: 0,
      channelsUpdated: 0,
      skipped: 0,
    }

    const profileResult = this.#mergeAccountProfileRecord(
      ownerAddress,
      backupInput.profile,
      {
        overwrite: options.overwriteProfile === true,
      }
    )
    result.profileUpdated = profileResult.changed
    if (profileResult.skipped) result.skipped += 1

    let filesChanged = false
    for (const file of Array.isArray(backupInput.files)
      ? backupInput.files
      : []) {
      const mergeResult = this.#mergeAccountFileRecord(
        ownerAddress,
        file,
        'active'
      )
      if (mergeResult.added) result.filesAdded += 1
      else if (mergeResult.updated) result.filesUpdated += 1
      else result.skipped += 1
      filesChanged = mergeResult.changed || filesChanged
    }

    for (const file of Array.isArray(backupInput.trashFiles)
      ? backupInput.trashFiles
      : []) {
      const mergeResult = this.#mergeAccountFileRecord(
        ownerAddress,
        file,
        'trash'
      )
      if (mergeResult.added) result.trashFilesAdded += 1
      else if (mergeResult.updated) result.trashFilesUpdated += 1
      else result.skipped += 1
      filesChanged = mergeResult.changed || filesChanged
    }

    let channelsChanged = false
    for (const channel of Array.isArray(backupInput.channels)
      ? backupInput.channels
      : []) {
      const mergeResult = await this.#mergeAccountChannelRecord(
        ownerAddress,
        channel
      )
      if (mergeResult.added) result.channelsAdded += 1
      else if (mergeResult.updated) result.channelsUpdated += 1
      else result.skipped += 1
      channelsChanged = mergeResult.changed || channelsChanged
    }

    if (filesChanged) {
      this.#savePublishedMetadata()
      this.#saveTrashMetadata()
      this.emit('user:metadata:updated', {
        ownerAddress,
        scope: 'files',
      })
    }
    if (channelsChanged) {
      this.#saveChannelsMetadata()
      this.emit('user:metadata:updated', {
        ownerAddress,
        scope: 'channels',
      })
    }
    if (result.profileUpdated) {
      this.emit('user:metadata:updated', {
        ownerAddress,
        scope: 'profile',
      })
    }

    return result
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
    const link = buildMostLink(cid, fileRecord.fileName)
    await this.checkDownloadAvailability(link, {
      ownerAddress,
      timeout: options.timeout,
    })
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

  async #readDriveEntryBuffer(drive, driveKey, timeout = STREAM_READ_TIMEOUT) {
    const chunks = []
    const stream = drive.createReadStream(driveKey)

    let timer = null
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Stream read timeout')),
        timeout
      )
    })

    const readPromise = (async () => {
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
    })()

    try {
      await Promise.race([readPromise, timeoutPromise])
      await readPromise
      return Buffer.concat(chunks)
    } finally {
      if (timer) clearTimeout(timer)
      stream.destroy()
    }
  }

  async #readUnixfsBlock(drive, cid, rootCid) {
    const driveKey = cid === rootCid ? `/${cid}` : `/.unixfs/${cid}`
    const entry = await this.#waitForDriveEntry(
      drive,
      driveKey,
      STREAM_READ_TIMEOUT
    )
    if (!entry) {
      throw new Error(`UnixFS block not found: ${cid}`)
    }
    const block = await this.#readDriveEntryBuffer(drive, driveKey)
    const actualCid = CID.create(1, 0x70, await sha256.digest(block)).toString()
    if (actualCid !== cid) {
      const err = new IntegrityError(
        `UnixFS block CID mismatch: expected ${cid}, got ${actualCid}`
      )
      err.cid = cid
      err.rootCid = rootCid
      throw err
    }
    const node = dagPb.decode(block)
    const unixfs = UnixFS.unmarshal(node.Data)
    return { node, unixfs }
  }

  async #readCollectionFromDrive(rootCid, drive, fileName) {
    if (CID.parse(rootCid).code !== 0x70) {
      throw new Error('CID is not a UnixFS directory')
    }
    const root = await this.#readUnixfsBlock(drive, rootCid, rootCid)
    if (!root.unixfs.isDirectory()) {
      throw new Error('CID is not a UnixFS directory')
    }

    const files = []
    await this.#collectUnixfsDirectoryFiles(
      drive,
      root.node,
      '',
      files,
      rootCid
    )

    return {
      kind: 'collection',
      cid: rootCid,
      fileName,
      fileCount: files.length,
      size: files.reduce((sum, file) => sum + file.size, 0),
      files,
    }
  }

  async #tryReadCollectionFromDrive(rootCid, drive, fileName) {
    try {
      if (CID.parse(rootCid).code !== 0x70) return null
    } catch {
      return null
    }
    try {
      return await this.#readCollectionFromDrive(rootCid, drive, fileName)
    } catch (err) {
      if (err instanceof IntegrityError || err?.code === 'INTEGRITY_ERROR') {
        if (err.cid === rootCid) return null
        throw err
      }
      return null
    }
  }

  async #readLocalCollectionChildFiles(fileRecord, options = {}) {
    if ((fileRecord?.kind || 'file') !== 'collection') {
      return []
    }
    try {
      const localContent = await this.#getLocalCidContent(fileRecord.cid, {
        ownerAddress: options.ownerAddress,
        public: true,
        allowHoldingFallback: true,
      })
      if (!localContent) return []
      const collection = await this.#readCollectionFromDrive(
        fileRecord.cid,
        localContent.drive,
        fileRecord.fileName
      )
      return collection.files
    } catch {
      return []
    }
  }

  async #collectionRecordIncludesCid(fileRecord, cid) {
    const files = await this.#readLocalCollectionChildFiles(fileRecord, {
      ownerAddress: fileRecord.ownerAddress,
    })
    return files.some(file => file.cid === cid)
  }

  async #hasPublishedCollectionChildReference(cid, options = {}) {
    for (const fileRecord of this.#allPublishedRecords()) {
      if ((fileRecord.kind || 'file') !== 'collection') continue
      if (options.excludeCid && fileRecord.cid === options.excludeCid) continue
      if (await this.#collectionRecordIncludesCid(fileRecord, cid)) {
        return true
      }
    }
    return false
  }

  async #stopHoldingIfUnreferenced(cid, options = {}) {
    if (!this.#holdings.some(holding => holding.cid === cid)) return false
    if (this.#hasPublishedReference(cid)) return false
    if (await this.#hasPublishedCollectionChildReference(cid, options)) {
      return false
    }
    const { driveName } = this.#getCidInfo(cid)
    await this.#leaveCidTopic(cid)
    await this.#closeDriveForSeed(driveName)
    this.#removeHolding(cid)
    return true
  }

  async #stopCollectionChildHoldings(fileRecord, options = {}) {
    const files = await this.#readLocalCollectionChildFiles(fileRecord, options)
    for (const file of files) {
      await this.#stopHoldingIfUnreferenced(file.cid, {
        excludeCid: options.excludeCid,
      })
    }
  }

  async #restoreCollectionChildHoldings(fileRecord, options = {}) {
    const files = await this.#readLocalCollectionChildFiles(fileRecord, options)
    for (const file of files) {
      const localContent = await this.#getLocalCidContent(file.cid, {
        ownerAddress: options.ownerAddress,
        public: true,
        allowHoldingFallback: true,
      })
      if (!localContent) continue
      await this.#joinCidTopicInternal(file.cid, {
        server: true,
        client: false,
      })
      this.#upsertHolding({
        cid: file.cid,
        fileName: sanitizeFilename(`${fileRecord.fileName}/${file.path}`),
        size: localContent.size || Number(file.size) || 0,
        driveName: this.#getCidInfo(file.cid).driveName,
        source: fileRecord.source || 'published',
      })
    }
  }

  async #downloadCollectionFiles(collection, taskId, options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const collectionName = sanitizeFilename(
      options.fileName || collection.fileName
    )
    const selectedPaths = Array.isArray(options.selectedPaths)
      ? options.selectedPaths.map(item =>
          String(item || '').replace(/\\/g, '/')
        )
      : []
    const selectedSet = new Set(selectedPaths)
    const files =
      selectedSet.size === 0
        ? collection.files
        : collection.files.filter(file => selectedSet.has(file.path))

    if (selectedSet.size > 0 && files.length !== selectedSet.size) {
      throw new ValidationError(
        'selectedPaths contains unknown collection files'
      )
    }

    const { driveName } = this.#getCidInfo(collection.cid)
    const childTargets = files.map(file => {
      const fileName = sanitizeFilename(`${collectionName}/${file.path}`)
      return { file, fileName }
    })

    for (const target of childTargets) {
      this.#assertDisplayNameAvailable(target.fileName, {
        ownerAddress,
        excludeCid: target.file.cid,
      })
    }

    const downloadedFiles = []
    for (let index = 0; index < childTargets.length; index += 1) {
      const { file, fileName } = childTargets[index]
      const childResult = await this.downloadFile(
        buildMostLink(file.cid, fileName),
        `${taskId}_${index}`,
        {
          timeout: options.timeout,
          streamReadTimeout: options.streamReadTimeout,
          ownerAddress,
          addToLibrary: true,
          suppressSuccessEvent: true,
        }
      )
      downloadedFiles.push({
        ...file,
        ...childResult,
        path: file.path,
        cid: file.cid,
      })
      const completedFiles = downloadedFiles.length
      this.emit('download:progress', {
        taskId,
        collection: true,
        file: fileName,
        loaded: completedFiles,
        total: files.length,
        completedFiles,
        totalFiles: files.length,
        percent:
          files.length > 0
            ? Math.round((completedFiles / files.length) * 100)
            : 0,
      })
    }

    await this.#joinCidTopicInternal(collection.cid, {
      server: true,
      client: false,
    })
    this.#upsertHolding({
      cid: collection.cid,
      fileName: collectionName,
      kind: 'collection',
      size: 0,
      driveName,
      source: 'downloaded',
    })

    const result = {
      kind: 'collection',
      taskId,
      cid: collection.cid,
      fileName: collectionName,
      fileCount: collection.fileCount,
      files: downloadedFiles,
    }
    this.emit('download:success', result)
    return result
  }

  async #collectUnixfsDirectoryFiles(
    drive,
    directoryNode,
    prefix,
    files,
    rootCid
  ) {
    const links = [...(directoryNode.Links || [])].sort((left, right) =>
      String(left.Name || '').localeCompare(String(right.Name || ''))
    )

    for (const link of links) {
      const name = String(link.Name || '').trim()
      if (!name) continue
      const cid = link.Hash.toString()
      const childPath = prefix ? `${prefix}/${name}` : name

      if (link.Hash.code === 0x55) {
        files.push({
          path: childPath,
          cid,
          size: Number(link.Tsize) || 0,
        })
        continue
      }

      const child = await this.#readUnixfsBlock(drive, cid, rootCid)
      if (child.unixfs.isDirectory()) {
        await this.#collectUnixfsDirectoryFiles(
          drive,
          child.node,
          childPath,
          files,
          rootCid
        )
      } else {
        files.push({
          path: childPath,
          cid,
          size: Number(child.unixfs.fileSize?.()) || Number(link.Tsize) || 0,
        })
      }
    }
  }

  #withCollectionFileStates(collection) {
    const files = collection.files.map(file => {
      const seedState = this.#seedStates.get(file.cid)
      const status =
        seedState?.status ||
        (this.#fileDiscoveries.has(file.cid) ? 'active' : '')
      return {
        ...file,
        localAvailable: this.#isLocalHoldingAvailable(file.cid),
        seedStatus: status,
        seedError: seedState?.error,
      }
    })
    const localAvailableCount = files.filter(
      file => file.localAvailable === true
    ).length

    return {
      ...collection,
      availabilityScope: 'collection-manifest',
      localAvailableCount,
      missingLocalCount: Math.max(files.length - localAvailableCount, 0),
      files,
    }
  }

  #isCollectionPublishedInOwnerLibrary(collection, ownerAddress) {
    const files = Array.isArray(collection.files) ? collection.files : []
    if (files.length === 0) return false

    const collectionName = sanitizeFilename(
      collection.fileName || collection.cid
    )
    const publishedBucket = this.#getPublishedBucket(ownerAddress)
    return files.every(file => {
      const fileName = sanitizeFilename(`${collectionName}/${file.path}`)
      return (
        this.#isLocalHoldingAvailable(file.cid) &&
        publishedBucket.some(
          record =>
            record.cid === file.cid &&
            sanitizeFilename(record.fileName) === fileName
        )
      )
    })
  }

  #isLocalHoldingAvailable(cid) {
    const holding = this.#holdings.find(item => item.cid === cid)
    if (!holding) return false

    const seedState = this.#seedStates.get(cid)
    if (seedState?.status) {
      return seedState.status === 'active'
    }

    return this.#fileDiscoveries.has(cid)
  }

  async #hasLocalDriveContent(drive, key) {
    try {
      return await drive.has(key)
    } catch (err) {
      if (this.#isClosedSessionError(err)) {
        throw err
      }
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
    let drive = await this.#getOrCreateDrive(
      fileRecord?.driveName || holding?.driveName || driveName,
      { server: true, client: false }
    )
    const driveKey = '/' + cid

    for (let attempt = 0; attempt < 2; attempt += 1) {
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
            kind: holding?.kind,
            size,
            ownerAddress,
          },
        }
      } catch (err) {
        if (attempt === 0 && this.#isClosedSessionError(err)) {
          drive = await this.#reopenDrive(
            fileRecord?.driveName || holding?.driveName || driveName,
            { server: true, client: false }
          )
          continue
        }
        return null
      }
    }

    return null
  }

  // --- 频道管理 ---

  /**
   * 创建或加入频道。channelId 是用户输入的短 ID，channelKey 与频道名一致。
   * @param {string} channelIdInput - 用户可见短频道 ID
   * @param {string} [type='personal'] - 频道类型
   * @returns {Promise<object>}
   */
  async createChannel(channelIdInput, type = 'personal', options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const channelId = normalizeChannelId(channelIdInput)
    const channelType = String(type || 'personal').trim() || 'personal'

    if (channelId.includes('.') && channelType !== 'game') {
      throw new Error('点号为系统保留，不能用于手动频道 ID')
    }
    if (
      channelType === 'game' &&
      !/^game\.[a-z0-9]+\.[a-z0-9]+$/.test(channelId)
    ) {
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

    if (candidates.length > 0) {
      const candidate = candidates[0]
      if (candidate.local) {
        const existing = this.#channels.find(
          channel => channel.channelKey === candidate.channelKey
        )
        if (existing) {
          const wasMember = this.#channelHasMember(existing, ownerAddress)
          const writerKeysChanged = await this.#mergeChannelWriterCoreKeys(
            existing,
            candidate.writerCoreKeys
          )
          const memberChanged = this.#upsertChannelMember(existing, options)
          if (writerKeysChanged || memberChanged) {
            existing.syncUpdatedAt = getNextSyncTimestamp(
              existing.syncUpdatedAt
            )
            this.#saveChannelsMetadata()
            this.#broadcastChannelHello()
          }
          if (!wasMember || memberChanged) {
            await this.#appendChannelMemberProfileMessage(existing, options)
          }
          await this.#appendChannelWelcomeMessage(existing, options, wasMember)
          return this.#formatChannelForResponse(existing, ownerAddress)
        }
        const joined = await this.#joinChannelFromCandidate(
          candidate,
          channelType,
          options
        )
        return joined
      }
      const joined = await this.#joinChannelFromCandidate(
        candidate,
        channelType,
        options
      )
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

    if (!candidate?.channelKey) {
      return this.createChannel(channelId, options.type || 'group', options)
    }

    const channelKey = buildChannelKey(channelId)
    const existing = this.#channels.find(c => c.channelKey === channelKey)
    if (existing) {
      const wasMember = this.#channelHasMember(existing, options.ownerAddress)
      const writerKeysChanged = await this.#mergeChannelWriterCoreKeys(
        existing,
        candidate.writerCoreKeys
      )
      const memberChanged = this.#upsertChannelMember(existing, options)
      if (writerKeysChanged || memberChanged) {
        existing.syncUpdatedAt = getNextSyncTimestamp(existing.syncUpdatedAt)
        this.#saveChannelsMetadata()
        this.#broadcastChannelHello()
      }
      if (!wasMember || memberChanged) {
        await this.#appendChannelMemberProfileMessage(existing, options)
      }
      await this.#appendChannelWelcomeMessage(existing, options, wasMember)
      return this.#formatChannelForResponse(existing, options.ownerAddress)
    }

    const cached =
      this.#getCachedChannelCandidate(
        channelId,
        normalizeChannelKey(candidate.channelKey)
      ) || this.#getCachedChannelCandidate(channelId, channelKey)
    const joined = await this.#joinChannelFromCandidate(
      cached || candidate,
      'group',
      {
        ...options,
        channelKey,
      }
    )
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
    const index = this.#channels.findIndex(
      c => c.channelKey === channel.channelKey
    )
    if (index === -1) {
      throw new Error('频道不存在')
    }

    if (ownerAddress && Array.isArray(channel.members)) {
      channel.members = channel.members.filter(
        member => normalizeOwnerAddress(member?.address) !== ownerAddress
      )
      const syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
      channel.syncUpdatedAt = syncUpdatedAt
      if (channel.members.length > 0) {
        this.#saveChannelsMetadata()
        return this.listChannels({ ownerAddress })
      }
    }

    const appDiscovery = this.#channelDiscoveries.get(channel.channelKey)
    if (appDiscovery && this.#swarm) {
      this.#channelDiscoveries.delete(channel.channelKey)
      this.#swarm
        .leave(this.#generateChannelDiscoveryKey(channel.channelKey))
        .catch(err => {
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
    return Boolean(channel.pinnedBy[ownerAddress])
  }

  /**
   * 列出频道；默认排除带点号的系统频道。
   * @returns {Array<{ channelId: string, channelKey: string, name: string, createdAt: string, lastMessageAt: string, type: string, peerCount: number, remark: string, pinned: boolean }>}
   */
  listChannels(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const type = String(options.type || '').trim()

    return this.#channels
      .filter(c => {
        if (!ownerAddress) return true
        return this.#channelHasMember(c, ownerAddress)
      })
      .filter(c => {
        if (type) return c.type === type
        return !isSpecialChannel(c)
      })
      .map(c => this.#formatChannelForResponse(c, ownerAddress))
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
          if (isChannelHistoryEntry(entry)) {
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
      const key = getChannelHistoryDedupeKey(m)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    unique.sort((a, b) => a.timestamp - b.timestamp)

    this.#applyChannelMemberProfileEntries(channel, unique, { save: true })

    const visibleMessages = unique.filter(
      message => !isChannelMemberProfileEventEntry(message)
    )
    const total = visibleMessages.length
    const start = Math.max(0, total - offset - limit)
    const end = total - offset

    return visibleMessages
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
  async sendMessage(
    channelKeyInput,
    content,
    author,
    authorName,
    options = {}
  ) {
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
    const clientMessageId = normalizeClientMessageId(options.clientMessageId, {
      strict: hasOwnProperty(options, 'clientMessageId'),
    })
    const attachment = normalizeChannelAttachment(options.attachment)
    const mentions = normalizeChannelMentionList(options.mentions, trimmed, {
      strict: hasOwnProperty(options, 'mentions'),
      attachment,
    })
    if (attachment && trimmed !== attachment.link) {
      throw new ValidationError('attachment content must match link')
    }
    const authorAddress = normalizeOwnerAddress(author)
    const existingMember = Array.isArray(channel?.members)
      ? channel.members.find(
          member => normalizeOwnerAddress(member?.address) === authorAddress
        )
      : null
    let normalizedAuthorTag
    if (hasOwnProperty(options, 'authorTag')) {
      normalizedAuthorTag = normalizeLocalizedChatTag(options.authorTag)
      if (!normalizedAuthorTag) {
        throw new ValidationError('Invalid authorTag')
      }
    } else if (
      existingMember?.tag &&
      typeof existingMember.tag === 'object'
    ) {
      normalizedAuthorTag = normalizeLocalizedChatTag(existingMember.tag)
    }
    if (
      channel &&
      this.#upsertChannelMember(channel, {
        ownerAddress: options.ownerAddress,
        displayName: authorName,
        ...(Object.prototype.hasOwnProperty.call(options, 'avatar')
          ? { avatar: options.avatar }
          : {}),
      })
    ) {
      this.#saveChannelsMetadata()
    }

    const normalizedAvatar = normalizeChannelAvatar(options.avatar)
    const message = {
      type: options.type === 'system' ? 'system' : 'message',
      author,
      authorName: normalizeChannelDisplayName(
        authorName,
        normalizeOwnerAddress(author)
      ),
      content: trimmed,
      timestamp: await this.#getNextChannelMessageTimestamp(channel.channelKey),
    }
    if (normalizedAuthorTag) {
      message.authorTag = normalizedAuthorTag
    }
    if (clientMessageId) {
      message.clientMessageId = clientMessageId
    }
    if (normalizedAvatar) {
      message.avatar = normalizedAvatar
    }
    if (attachment) {
      message.attachment = attachment
    }
    if (mentions.length > 0) {
      message.mentions = mentions
    }
    if (message.type === 'system') {
      const event = String(options.event || '').trim()
      if (event) message.event = event
      if (
        event === CHANNEL_MEMBER_PROFILE_UPDATED_EVENT &&
        options.memberProfile &&
        typeof options.memberProfile === 'object'
      ) {
        message.member = options.memberProfile
      }
    }

    try {
      await core.append(message)
    } catch (err) {
      if (!this.#isClosedSessionError(err)) {
        throw err
      }
      const reopenedCore = await this.#reopenChannelLocalWriter(channel)
      await reopenedCore.append(message)
    }
    if (channel && !isChannelMemberProfileEventEntry(message)) {
      channel.lastMessageAt = new Date(message.timestamp).toISOString()
      this.#saveChannelsMetadata()
    }

    return this.#normalizeChannelMessageForResponse(channel.channelKey, message)
  }

  /**
   * 获取频道内在线用户
   * @param {string} channelKeyInput - 内部频道 key，或本地唯一短频道 ID
   * @returns {Array<{ peerId: string, authorName: string, lastSeen: number, memberAddresses: string[] }>}
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
      memberAddresses: uniqueStrings(p.memberAddresses)
        .map(address => normalizeOwnerAddress(address))
        .filter(Boolean),
      lastSeen: p.lastSeen,
    }))
  }

  getChannelMemberProfiles(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    return this.#getChannelMembers(channel)
  }

  async updateChannelMemberProfile(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const author = normalizeOwnerAddress(options.author)
    if (!ownerAddress || !author || ownerAddress !== author) {
      throw new PermissionError('member profile author must match logged-in user')
    }
    this.#assertChannelMember(channelKeyInput, ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, ownerAddress)
    const event = await this.#appendChannelMemberProfileMessage(channel, {
      ...options,
      ownerAddress,
      author,
    })
    return {
      success: Boolean(event),
      member: this.#getChannelMembers(channel).find(
        member => member.address === ownerAddress
      ),
      event,
    }
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

    channel = this.#channels.find(c => c.channelId === value)
    if (channel && (!owner || this.#channelHasMember(channel, owner))) {
      return channel
    }
    throw new Error('频道不存在')
  }

  async #createLocalChannel(channelId, type = 'personal', options = {}) {
    const channelKey = buildChannelKey(channelId)
    const writerId =
      String(options.writerId || '').trim() || createChannelWriterId()
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
    await this.#appendChannelMemberProfileMessage(channelInfo, options)
    await this.#appendChannelWelcomeMessage(channelInfo, options, false)
    this.#broadcastChannelHello()
    return channelInfo
  }

  async #joinChannelFromCandidate(
    candidateInput,
    type = 'group',
    options = {}
  ) {
    const channelId = normalizeChannelId(
      candidateInput.channelId || options.channelId
    )
    const channelKey = buildChannelKey(channelId)
    if (!channelId || !channelKey) {
      throw new Error('频道候选缺少身份信息')
    }

    const existing = this.#channels.find(
      channel => channel.channelKey === channelKey
    )
    if (existing) {
      const wasMember = this.#channelHasMember(existing, options.ownerAddress)
      const memberChanged = this.#upsertChannelMember(existing, options)
      if (memberChanged) {
        this.#saveChannelsMetadata()
        this.#broadcastChannelHello()
      }
      if (!wasMember || memberChanged) {
        await this.#appendChannelMemberProfileMessage(existing, options)
      }
      await this.#appendChannelWelcomeMessage(existing, options, wasMember)
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
    const channelInfo = await this.#createLocalChannel(
      channelId,
      candidateInput.type || type,
      {
        ...options,
        ownerAddress,
        createdAt: candidateInput.createdAt,
        lastMessageAt: candidateInput.lastMessageAt,
        writerCoreKeys: candidateInput.writerCoreKeys,
        remark,
      }
    )

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
    this.#channelCores
      .get(channel.channelKey)
      .set(localWriterCoreKey, localCore)
    this.#channelLocalCoreKey.set(channel.channelKey, localWriterCoreKey)
    if (!this.#channelPeers.has(channel.channelKey)) {
      this.#channelPeers.set(channel.channelKey, new Map())
    }
    this.#setupChannelAppendListener(localCore, channel.channelKey)
    await this.#replayChannelMemberProfileCore(channel, localCore, {
      save: true,
    })

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
    if (this.#options.disableNetwork) return getCachedCandidates()
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
    const candidates = getCachedCandidates()
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

  #channelToCandidate(channel, local = false) {
    return {
      channelId: channel.channelId,
      channelKey: channel.channelKey,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
      local,
    }
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

  #getCachedChannelCandidate(channelId, channelKey) {
    const normalizedChannelId = normalizeChannelId(channelId)
    const normalizedChannelKey = buildChannelKey(normalizedChannelId)
    const cache = this.#channelCandidateCache.get(normalizedChannelId)
    const candidate = cache?.get(channelKey) || cache?.get(normalizedChannelKey)
    if (candidate) return candidate
    const local = this.#channels.find(
      channel => channel.channelKey === normalizedChannelKey
    )
    return local ? this.#channelToCandidate(local, true) : null
  }

  #formatChannelForResponse(channel, ownerAddress = '') {
    const owner = normalizeOwnerAddress(ownerAddress)
    return {
      name: channel.channelId,
      channelId: channel.channelId,
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

    const hasDisplayName = hasOwnProperty(options, 'displayName')
    const displayName = normalizeChannelDisplayName(options.displayName, address)
    const hasTag = hasOwnProperty(options, 'tag')
    const tagPatch = normalizeChatMemberTagPatch(options.tag, hasTag)
    if (tagPatch.action === 'invalid') {
      throw new ValidationError('Invalid member tag')
    }
    const avatar = normalizeChannelAvatar(options.avatar)
    const profileUpdatedAt = this.#normalizeMemberProfileUpdatedAt(
      options.profileUpdatedAt,
      { strict: false }
    )
    const existing = channel.members.find(
      member => normalizeOwnerAddress(member?.address) === address
    )

    if (existing) {
      let changed = false
      if (existing.address !== address) {
        existing.address = address
        changed = true
      }
      if (hasDisplayName && displayName && existing.displayName !== displayName) {
        existing.displayName = displayName
        changed = true
      }
      if (Object.prototype.hasOwnProperty.call(options, 'avatar')) {
        const currentAvatar = normalizeChannelAvatar(existing.avatar)
        if (currentAvatar !== avatar) {
          if (avatar) {
            existing.avatar = avatar
          } else {
            delete existing.avatar
          }
          changed = true
        }
      }
      if (tagPatch.action === 'set') {
        if (
          JSON.stringify(normalizeLocalizedChatTag(existing.tag) || {}) !==
          JSON.stringify(tagPatch.tag)
        ) {
          existing.tag = tagPatch.tag
          changed = true
        }
      } else if (tagPatch.action === 'clear') {
        if (existing.tag !== null) {
          existing.tag = null
          changed = true
        }
      }
      if (
        profileUpdatedAt > 0 &&
        this.#normalizeMemberProfileUpdatedAt(existing.profileUpdatedAt) !==
          profileUpdatedAt
      ) {
        existing.profileUpdatedAt = profileUpdatedAt
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
    if (tagPatch.action === 'set') {
      member.tag = tagPatch.tag
    } else if (tagPatch.action === 'clear') {
      member.tag = null
    }
    if (profileUpdatedAt > 0) {
      member.profileUpdatedAt = profileUpdatedAt
    }
    channel.members.push(member)
    return true
  }

  #normalizeMemberProfileUpdatedAt(input, { strict = false } = {}) {
    if (input === undefined || input === null || input === '') return 0
    const value = Number(input)
    if (!Number.isFinite(value) || value <= 0) {
      if (strict) throw new ValidationError('Invalid profileUpdatedAt')
      return 0
    }
    return Math.floor(value)
  }

  #getNextMemberProfileUpdatedAt(channel, address) {
    const normalizedAddress = normalizeOwnerAddress(address)
    const existing = Array.isArray(channel?.members)
      ? channel.members.find(
          member => normalizeOwnerAddress(member?.address) === normalizedAddress
        )
      : null
    const current = this.#normalizeMemberProfileUpdatedAt(
      existing?.profileUpdatedAt
    )
    return Math.max(Date.now(), current + 1)
  }

  async #appendChannelWelcomeMessage(channel, options = {}, wasMember = false) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    if (
      wasMember ||
      !ownerAddress ||
      !channel ||
      TRANSIENT_CHANNEL_TYPES.has(channel.type)
    ) {
      return false
    }
    await this.sendMessage(
      channel.channelKey,
      CHANNEL_MEMBER_JOINED_EVENT,
      ownerAddress,
      normalizeChannelDisplayName(options.displayName, ownerAddress),
      {
        ownerAddress,
        type: 'system',
        event: CHANNEL_MEMBER_JOINED_EVENT,
        ...(Object.prototype.hasOwnProperty.call(options, 'avatar')
          ? { avatar: options.avatar }
          : {}),
      }
    )
    return true
  }

  async #appendChannelMemberProfileMessage(channel, options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress || options.author)
    if (!ownerAddress || !channel || TRANSIENT_CHANNEL_TYPES.has(channel.type)) {
      return null
    }

    const hasTag = hasOwnProperty(options, 'tag')
    const tagPatch = normalizeChatMemberTagPatch(options.tag, hasTag)
    if (tagPatch.action === 'invalid') {
      throw new ValidationError('Invalid member tag')
    }
    const displayName = normalizeChannelDisplayName(
      options.displayName,
      ownerAddress
    )
    const avatar = normalizeChannelAvatar(options.avatar)
    const profileUpdatedAt = this.#getNextMemberProfileUpdatedAt(
      channel,
      ownerAddress
    )
    const memberProfile = {
      address: ownerAddress,
      displayName,
      profileUpdatedAt,
    }
    if (hasOwnProperty(options, 'avatar')) {
      memberProfile.avatar = avatar
    }
    if (tagPatch.action === 'set') {
      memberProfile.tag = tagPatch.tag
    } else if (tagPatch.action === 'clear') {
      memberProfile.tag = null
    }

    if (
      this.#upsertChannelMember(channel, {
        ownerAddress,
        displayName,
        ...(hasOwnProperty(options, 'avatar') ? { avatar } : {}),
        ...(hasTag ? { tag: memberProfile.tag } : {}),
        profileUpdatedAt,
      })
    ) {
      channel.syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
      this.#saveChannelsMetadata()
      this.#broadcastChannelHello()
    }

    return this.sendMessage(
      channel.channelKey,
      CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
      ownerAddress,
      displayName,
      {
        ownerAddress,
        type: 'system',
        event: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
        memberProfile,
        ...(hasOwnProperty(options, 'avatar') ? { avatar } : {}),
      }
    )
  }

  #normalizeChannelMemberProfileEvent(message, { strict = false } = {}) {
    if (!isChannelMemberProfileEventEntry(message)) {
      if (strict) throw new ValidationError('Invalid member profile event')
      return null
    }

    const member = message?.member
    if (!member || typeof member !== 'object' || Array.isArray(member)) {
      if (strict) throw new ValidationError('Invalid member profile payload')
      return null
    }

    const author = normalizeOwnerAddress(message.author)
    const address = normalizeOwnerAddress(member.address)
    if (!author || !address || author !== address) {
      if (strict) {
        throw new ValidationError('member profile author mismatch')
      }
      return null
    }

    const profileUpdatedAt = this.#normalizeMemberProfileUpdatedAt(
      member.profileUpdatedAt,
      { strict }
    )
    if (!profileUpdatedAt) {
      return null
    }
    if (
      profileUpdatedAt >
      Date.now() + CHANNEL_MEMBER_PROFILE_TIME_FUTURE_TOLERANCE_MS
    ) {
      if (strict) throw new ValidationError('profileUpdatedAt is too far ahead')
      return null
    }

    const hasDisplayName = hasOwnProperty(member, 'displayName')
    const hasAvatar = hasOwnProperty(member, 'avatar')
    const hasTag = hasOwnProperty(member, 'tag')
    const tagPatch = normalizeChatMemberTagPatch(member.tag, hasTag)
    if (tagPatch.action === 'invalid') {
      if (strict) throw new ValidationError('Invalid member tag')
      return null
    }

    const profile = {
      address,
      ownerAddress: address,
      profileUpdatedAt,
    }
    if (hasDisplayName) {
      profile.displayName = normalizeChannelDisplayName(
        member.displayName,
        address
      )
    }
    if (hasAvatar) {
      profile.avatar = normalizeChannelAvatar(member.avatar)
    }
    if (tagPatch.action === 'set') {
      profile.tag = tagPatch.tag
    } else if (tagPatch.action === 'clear') {
      profile.tag = null
    }

    return {
      profile,
      hasDisplayName,
      hasAvatar,
      hasTag,
    }
  }

  #applyChannelMemberProfileEvent(channel, message, options = {}) {
    if (!channel) return null
    const normalized = this.#normalizeChannelMemberProfileEvent(message)
    if (!normalized) return null

    const { profile, hasDisplayName, hasAvatar, hasTag } = normalized
    const existing = Array.isArray(channel.members)
      ? channel.members.find(
          member => normalizeOwnerAddress(member?.address) === profile.address
        )
      : null
    const currentUpdatedAt = this.#normalizeMemberProfileUpdatedAt(
      existing?.profileUpdatedAt
    )
    let changed = false

    if (profile.profileUpdatedAt > currentUpdatedAt) {
      changed = this.#upsertChannelMember(channel, {
        ownerAddress: profile.address,
        ...(hasDisplayName ? { displayName: profile.displayName } : {}),
        ...(hasAvatar ? { avatar: profile.avatar } : {}),
        ...(hasTag ? { tag: profile.tag } : {}),
        profileUpdatedAt: profile.profileUpdatedAt,
      })
      if (changed) {
        channel.syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
        if (options.save !== false) {
          this.#saveChannelsMetadata()
        }
        if (options.broadcast !== false) {
          this.#broadcastChannelHello()
        }
      }
    }

    const member =
      this.#getChannelMembers(channel).find(
        item => item.address === profile.address
      ) || {
        address: profile.address,
        displayName: profile.displayName,
        avatar: profile.avatar,
        tag: hasTag ? profile.tag : undefined,
        profileUpdatedAt: profile.profileUpdatedAt,
      }
    const event = {
      channel: channel.channelKey,
      channelKey: channel.channelKey,
      channelId: channel.channelId || '',
      event: CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
      member,
      profileUpdatedAt: profile.profileUpdatedAt,
      changed,
    }
    if (options.emit) {
      this.emit('channel:member-profile', event)
    }
    return event
  }

  #applyChannelMemberProfileEntries(channel, entries, options = {}) {
    if (!channel || !Array.isArray(entries)) return false
    let changed = false
    for (const entry of entries) {
      const result = this.#applyChannelMemberProfileEvent(channel, entry, {
        save: false,
        broadcast: false,
      })
      changed = Boolean(result?.changed) || changed
    }
    if (changed && options.save !== false) {
      channel.syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
      this.#saveChannelsMetadata()
      if (options.broadcast !== false) {
        this.#broadcastChannelHello()
      }
    }
    return changed
  }

  async #replayChannelMemberProfileCore(channel, core, options = {}) {
    if (!channel || !core) return false
    const entries = []
    for (let i = 0; i < core.length; i++) {
      try {
        const entry = await core.get(i)
        if (isChannelMemberProfileEventEntry(entry)) {
          entries.push(entry)
        }
      } catch {
        break
      }
    }
    return this.#applyChannelMemberProfileEntries(channel, entries, options)
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
        tag: member?.tag === null ? null : normalizeLocalizedChatTag(member?.tag),
        profileUpdatedAt: this.#normalizeMemberProfileUpdatedAt(
          member?.profileUpdatedAt
        ),
        joinedAt: String(member?.joinedAt || ''),
        _index: index,
      }))
      .filter(member => member.address && member.joinedAt)
      .sort((a, b) => {
        const timeDiff =
          new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
        return timeDiff || a._index - b._index
      })
      .map(({ _index, ...member }) => {
        const next = member.avatar ? member : { ...member, avatar: undefined }
        if (next.tag === undefined) delete next.tag
        if (!next.profileUpdatedAt) delete next.profileUpdatedAt
        return next
      })
  }

  #getChannelMemberAddresses(channel) {
    const members = Array.isArray(channel?.members) ? channel.members : []
    return uniqueStrings(
      members.map(member => normalizeOwnerAddress(member?.address))
    )
  }

  #normalizePresenceSessionId(sessionId) {
    return (
      String(sessionId || 'default')
        .trim()
        .slice(0, 120) || 'default'
    )
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
      normalizeOwnerAddress(options.address),
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
    const normalizedAddress = normalizeOwnerAddress(address)
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

  #formatChannelPresence(channelKey, address, status = 'online') {
    const normalizedAddress = normalizeOwnerAddress(address)
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
    }
  }

  #upsertChannelPresenceProfile(
    channelKey,
    address,
    options = {},
    now = Date.now()
  ) {
    const normalizedAddress = normalizeOwnerAddress(address)
    if (!normalizedAddress) return false
    const hasDisplayName = Object.prototype.hasOwnProperty.call(
      options,
      'displayName'
    )
    const hasAvatar = Object.prototype.hasOwnProperty.call(options, 'avatar')
    const profileUpdatedAt = Number(options.profileUpdatedAt)
    const hasProfileUpdatedAt =
      Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0
    if (!hasDisplayName && !hasAvatar && !hasProfileUpdatedAt) {
      return false
    }

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
      next.displayName = normalizeChannelDisplayName(
        options.displayName,
        normalizedAddress
      )
    }
    if (hasAvatar) {
      next.avatar = normalizeChannelAvatar(options.avatar)
    }
    if (
      previous?.profileUpdatedAt &&
      hasProfileUpdatedAt &&
      nextUpdatedAt === previous.profileUpdatedAt &&
      (previous.displayName !== next.displayName ||
        previous.avatar !== next.avatar)
    ) {
      return false
    }

    const changed =
      !previous ||
      previous.displayName !== next.displayName ||
      previous.avatar !== next.avatar ||
      previous.profileUpdatedAt !== next.profileUpdatedAt
    profiles.set(normalizedAddress, next)
    return changed
  }

  #emitChannelPresence(channelKey, address, status) {
    const event = this.#formatChannelPresence(channelKey, address, status)
    if (event) {
      this.emit('channel:presence', event)
    }
    return event
  }

  #upsertChannelPresenceSession(channel, options = {}) {
    const address = normalizeOwnerAddress(options.address)
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
      return this.#emitChannelPresence(channelKey, address, 'online')
    }
    if (profileChanged) {
      return this.#emitChannelPresence(channelKey, address, 'profile')
    }
    return null
  }

  #touchChannelPresenceSession(channel, options = {}) {
    const address = normalizeOwnerAddress(options.address)
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
    const address = normalizeOwnerAddress(options.address)
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
      return this.#emitChannelPresence(channel.channelKey, address, 'profile')
    }
    return null
  }

  #removeChannelPresenceSessions(channelKey, options = {}) {
    const address = normalizeOwnerAddress(options.address)
    const sourceId = this.#normalizePresenceSourceId(options)
    const sessionId = options.sessionId
      ? this.#normalizePresenceSessionId(options.sessionId)
      : ''
    const sessions = this.#channelPresenceSessions.get(channelKey)
    if (!sessions || (!address && !sourceId)) return []

    const touchedAddresses = new Set()
    for (const [key, session] of [...sessions]) {
      if (address && session.address !== address) continue
      if (sourceId && session.sourceId !== sourceId) continue
      if (sessionId && session.sessionId !== sessionId) continue
      touchedAddresses.add(session.address)
      sessions.delete(key)
    }
    if (sessions.size === 0) {
      this.#channelPresenceSessions.delete(channelKey)
    }

    return [...touchedAddresses]
      .filter(item => !this.#isChannelPresenceAddressOnline(channelKey, item))
      .map(item => this.#emitChannelPresence(channelKey, item, 'offline'))
      .filter(Boolean)
  }

  #removeChannelPresenceSessionsBySource(sourceId) {
    const normalizedSourceId = String(sourceId || '').trim()
    if (!normalizedSourceId) return []
    const events = []
    for (const [channelKey, sessions] of [...this.#channelPresenceSessions]) {
      const touchedAddresses = new Set()
      for (const [key, session] of [...sessions]) {
        if (session.sourceId !== normalizedSourceId) continue
        touchedAddresses.add(session.address)
        sessions.delete(key)
      }
      if (sessions.size === 0) {
        this.#channelPresenceSessions.delete(channelKey)
      }
      for (const address of touchedAddresses) {
        if (!this.#isChannelPresenceAddressOnline(channelKey, address)) {
          const event = this.#emitChannelPresence(
            channelKey,
            address,
            'offline'
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
      for (const [key, session] of [...sessions]) {
        if (now - session.lastSeen <= CHANNEL_PRESENCE_TIMEOUT_MS) continue
        touchedAddresses.add(session.address)
        sessions.delete(key)
      }
      if (sessions.size === 0) {
        this.#channelPresenceSessions.delete(channelKey)
      }
      for (const address of touchedAddresses) {
        if (!this.#isChannelPresenceAddressOnline(channelKey, address)) {
          const event = this.#emitChannelPresence(
            channelKey,
            address,
            'offline'
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
      this.#pruneStaleChannelPresence()
    }, CHANNEL_PRESENCE_HEARTBEAT_MS)
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

  async #getNextChannelMessageTimestamp(channelKey) {
    const coresMap = this.#channelCores.get(channelKey)
    let maxTimestamp = 0

    if (coresMap) {
      for (const [, core] of coresMap) {
        for (let i = 0; i < core.length; i++) {
          try {
            const entry = await core.get(i)
            if (isChannelHistoryEntry(entry)) {
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

  #normalizeChannelMessageForResponse(channelKey, message) {
    const channel = this.#channels.find(item => item.channelKey === channelKey)
    const authorAddress = normalizeOwnerAddress(message?.author)
    const member = Array.isArray(channel?.members)
      ? channel.members.find(
          item => normalizeOwnerAddress(item?.address) === authorAddress
        )
      : null
    let baseMessage = { ...message }
    const clientMessageId = normalizeClientMessageId(baseMessage.clientMessageId)
    if (clientMessageId) {
      baseMessage.clientMessageId = clientMessageId
    } else {
      delete baseMessage.clientMessageId
    }
    const mentions = normalizeChannelMentionList(
      baseMessage.mentions,
      String(baseMessage.content || ''),
      { attachment: baseMessage.attachment }
    )
    if (mentions.length > 0) {
      baseMessage.mentions = mentions
    } else {
      delete baseMessage.mentions
    }
    const authorTag = normalizeLocalizedChatTag(baseMessage.authorTag)
    if (authorTag) {
      baseMessage.authorTag = authorTag
    } else {
      delete baseMessage.authorTag
    }
    if (member) {
      const displayName = normalizeChannelDisplayName(
        member.displayName,
        authorAddress
      )
      const avatar = normalizeChannelAvatar(member.avatar)
      if (displayName && !String(baseMessage?.authorName || '').trim()) {
        baseMessage = { ...baseMessage, authorName: displayName }
      }
      if (avatar && !normalizeChannelAvatar(baseMessage?.avatar)) {
        baseMessage = { ...baseMessage, avatar }
      }
    }
    return baseMessage
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

  #formatAccountFileForBackup(file, state = 'active') {
    const cid = String(file?.cid || '').trim()
    if (!cid) return null
    const { driveName } = this.#getCidInfo(cid)
    const updatedAt = getSyncTimestamp(
      file.updatedAt || file.syncUpdatedAt || file.deletedAt || file.publishedAt
    )
    const record = {
      cid,
      fileName: sanitizeFilename(file.fileName || cid),
      driveName: file.driveName || driveName,
      size: Number(file.size) || 0,
      source: String(
        file.source || (state === 'active' ? 'published' : 'trash')
      ),
      publishedAt:
        typeof file.publishedAt === 'string'
          ? file.publishedAt
          : new Date(updatedAt).toISOString(),
      ...(state === 'trash'
        ? {
            deletedAt:
              typeof file.deletedAt === 'string'
                ? file.deletedAt
                : new Date(updatedAt).toISOString(),
          }
        : {}),
      starred: Boolean(file.starred),
      updatedAt,
    }
    if (file.kind === 'collection') {
      record.kind = 'collection'
      record.fileCount = Number(file.fileCount) || 0
    }
    return record
  }

  #formatAccountChannelForBackup(channel, ownerAddress) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (
      !channel ||
      !owner ||
      TRANSIENT_CHANNEL_TYPES.has(channel.type) ||
      !this.#channelHasMember(channel, owner)
    ) {
      return null
    }
    const updatedAt = getSyncTimestamp(
      channel.updatedAt ||
        channel.syncUpdatedAt ||
        channel.lastMessageAt ||
        channel.createdAt
    )
    return {
      channelId: channel.channelId,
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
      updatedAt,
    }
  }

  #normalizeAccountProfileRecord(ownerAddress, record, timestamp = Date.now()) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (!owner || !record || typeof record !== 'object') return null
    const updatedAt = getSyncTimestamp(
      record.updatedAt || record.syncUpdatedAt,
      timestamp
    )
    return {
      displayName: normalizeChannelDisplayName(record.displayName, owner),
      avatar: normalizeChannelAvatar(record.avatar),
      updatedAt,
    }
  }

  #mergeAccountProfileRecord(ownerAddress, record, options = {}) {
    const owner = normalizeOwnerAddress(ownerAddress)
    const profile = this.#normalizeAccountProfileRecord(owner, record)
    if (!profile) return { changed: false, skipped: true }
    const existing = this.#accountMetadata.profiles?.[owner]
    if (
      existing &&
      !options.overwrite &&
      profile.updatedAt <= getSyncTimestamp(existing.updatedAt, 0)
    ) {
      return { changed: false, skipped: true }
    }
    if (
      existing &&
      existing.displayName === profile.displayName &&
      existing.avatar === profile.avatar &&
      getSyncTimestamp(existing.updatedAt, 0) === profile.updatedAt
    ) {
      return { changed: false, skipped: true }
    }

    this.#accountMetadata.profiles = this.#accountMetadata.profiles || {}
    this.#accountMetadata.profiles[owner] = profile
    this.#saveAccountMetadata()
    const changedChannels = this.#applyUserProfileToJoinedChannels(
      owner,
      profile
    )
    if (changedChannels) this.#saveChannelsMetadata()
    return { changed: true, skipped: false }
  }

  #normalizeAccountFileRecord(record, state) {
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
    const updatedAt = getSyncTimestamp(
      record.updatedAt ||
        record.syncUpdatedAt ||
        record.deletedAt ||
        record.publishedAt
    )
    const normalized = {
      cid,
      fileName,
      driveName: record.driveName || driveName,
      size: Number(record.size) || 0,
      source: String(
        record.source || (state === 'active' ? 'synced' : 'trash')
      ),
      publishedAt:
        typeof record.publishedAt === 'string'
          ? record.publishedAt
          : new Date(updatedAt).toISOString(),
      deletedAt:
        typeof record.deletedAt === 'string'
          ? record.deletedAt
          : state === 'trash'
            ? new Date(updatedAt).toISOString()
            : '',
      starred: Boolean(record.starred),
      updatedAt,
    }
    if (record.kind === 'collection') {
      normalized.kind = 'collection'
      normalized.fileCount = Number(record.fileCount) || 0
    }
    return normalized
  }

  #getRecordUpdatedAt(record) {
    return getSyncTimestamp(
      record?.updatedAt ||
        record?.syncUpdatedAt ||
        record?.deletedAt ||
        record?.publishedAt,
      0
    )
  }

  #mergeAccountFileRecord(ownerAddress, record, state) {
    const owner = normalizeOwnerAddress(ownerAddress)
    const normalized = this.#normalizeAccountFileRecord(record, state)
    if (!owner || !normalized) {
      return { changed: false, added: false, updated: false }
    }

    const publishedFiles = [...this.#getPublishedBucket(owner)]
    const trashFiles = [...this.#getTrashBucket(owner)]
    const publishedIndex = publishedFiles.findIndex(
      file => file.cid === normalized.cid
    )
    const trashIndex = trashFiles.findIndex(file => file.cid === normalized.cid)
    const existingActive =
      publishedIndex === -1 ? null : publishedFiles[publishedIndex]
    const existingTrash = trashIndex === -1 ? null : trashFiles[trashIndex]
    const existingUpdatedAt = Math.max(
      this.#getRecordUpdatedAt(existingActive),
      this.#getRecordUpdatedAt(existingTrash)
    )
    if (normalized.updatedAt <= existingUpdatedAt) {
      return { changed: false, added: false, updated: false }
    }

    const localHolding = this.#holdings.find(
      holding => holding.cid === normalized.cid
    )
    const localSource = localHolding?.source || normalized.source
    const wasKnown = Boolean(existingActive || existingTrash)

    if (state === 'active') {
      const nextRecord = {
        fileName: normalized.fileName,
        cid: normalized.cid,
        driveName: normalized.driveName,
        size: normalized.size,
        source: localSource,
        publishedAt: normalized.publishedAt,
        starred: normalized.starred,
        syncUpdatedAt: normalized.updatedAt,
      }
      if (normalized.kind === 'collection') {
        nextRecord.kind = 'collection'
        nextRecord.fileCount = Number(normalized.fileCount) || 0
      }
      if (publishedIndex === -1) publishedFiles.push(nextRecord)
      else publishedFiles[publishedIndex] = nextRecord
      if (trashIndex !== -1) trashFiles.splice(trashIndex, 1)
    } else {
      const nextRecord = {
        fileName: normalized.fileName,
        cid: normalized.cid,
        driveName: normalized.driveName,
        size: normalized.size,
        source: localSource,
        publishedAt: normalized.publishedAt,
        starred: normalized.starred,
        deletedAt:
          normalized.deletedAt || new Date(normalized.updatedAt).toISOString(),
        syncUpdatedAt: normalized.updatedAt,
      }
      if (normalized.kind === 'collection') {
        nextRecord.kind = 'collection'
        nextRecord.fileCount = Number(normalized.fileCount) || 0
      }
      if (trashIndex === -1) trashFiles.push(nextRecord)
      else trashFiles[trashIndex] = nextRecord
      if (publishedIndex !== -1) publishedFiles.splice(publishedIndex, 1)
    }

    this.#setPublishedBucket(owner, publishedFiles)
    this.#setTrashBucket(owner, trashFiles)
    return {
      changed: true,
      added: !wasKnown,
      updated: wasKnown,
    }
  }

  async #mergeAccountChannelRecord(ownerAddress, record) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (!owner || !record || typeof record !== 'object') {
      return { changed: false, added: false, updated: false }
    }
    const channelId = normalizeChannelId(record.channelId)
    const channelKey = buildChannelKey(channelId)
    if (
      !channelId ||
      !channelKey ||
      TRANSIENT_CHANNEL_TYPES.has(String(record.type || ''))
    ) {
      return { changed: false, added: false, updated: false }
    }

    const updatedAt = getSyncTimestamp(record.updatedAt || record.syncUpdatedAt)
    let channel = this.#channels.find(item => item.channelKey === channelKey)
    const existingUpdatedAt = this.#getRecordUpdatedAt(channel)
    if (channel && updatedAt <= existingUpdatedAt) {
      return { changed: false, added: false, updated: false }
    }

    const added = !channel
    let changed = false
    if (!channel) {
      channel = {
        channelId,
        channelKey,
        name: channelId,
        createdAt:
          typeof record.createdAt === 'string'
            ? record.createdAt
            : new Date(updatedAt).toISOString(),
        lastMessageAt:
          typeof record.lastMessageAt === 'string' ? record.lastMessageAt : '',
        type: String(record.type || 'personal').trim() || 'personal',
        writerId: createChannelWriterId(),
        localWriterCoreKey: '',
        writerCoreKeys: uniqueStrings(record.writerCoreKeys),
        members: [],
        syncUpdatedAt: updatedAt,
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
      if (
        record.lastMessageAt &&
        record.lastMessageAt !== channel.lastMessageAt
      ) {
        channel.lastMessageAt = record.lastMessageAt
        changed = true
      }
      channel.type = String(record.type || channel.type || 'personal').trim()
      channel.syncUpdatedAt = updatedAt
    }

    if (
      this.#upsertChannelMember(channel, {
        ownerAddress: owner,
        displayName: record.member?.displayName || record.remark || '',
        avatar: record.member?.avatar || '',
      })
    ) {
      changed = true
    }

    channel.remarks = channel.remarks || {}
    const remark = String(record.remark || '').slice(0, 50)
    if (remark) channel.remarks[owner] = remark
    else delete channel.remarks[owner]

    channel.pinnedBy = channel.pinnedBy || {}
    if (record.pinned) channel.pinnedBy[owner] = true
    else delete channel.pinnedBy[owner]

    if (!this.#channelLocalCoreKey.get(channel.channelKey)) {
      await this.#openChannelRuntime(channel)
      await this.#joinChannelDiscoveryTopics(channel)
      this.emit('channel:joined', {
        channel: channel.channelKey,
        channelKey: channel.channelKey,
        channelId: channel.channelId,
        key: channel.channelKey,
      })
      changed = true
    }

    return { changed: true, added, updated: !added || changed }
  }

  #applyUserProfileToJoinedChannels(ownerAddress, profile) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (!owner || !profile) return false
    let changed = false
    for (const channel of this.#channels) {
      if (!this.#channelHasMember(channel, owner)) continue
      changed =
        this.#upsertChannelMember(channel, {
          ownerAddress: owner,
          displayName: profile.displayName,
          avatar: profile.avatar,
        }) || changed
    }
    return changed
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
            const localContent = await this.#getLocalCidContent(holding.cid, {
              public: true,
              allowHoldingFallback: true,
            })
            if (!localContent) {
              this.#setSeedState(holding.cid, {
                status: 'error',
                topic: holding.topic,
                driveName: holding.driveName,
                error: 'Local CID content missing',
              })
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

    const normalized = {
      cid,
      fileName: record.fileName || cid,
      size,
      topic: topicHex,
      driveName,
      source: record.source || 'manual',
    }
    if (record.kind === 'collection') {
      normalized.kind = 'collection'
    }
    return normalized
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

  async #reopenDrive(name, options = { server: true, client: false }) {
    const staleDrive = this.#drives.get(name)
    if (staleDrive) {
      this.#drives.delete(name)
      await staleDrive.close().catch(() => {})
    }
    this.#drivePromises.delete(name)
    return this.#getOrCreateDrive(name, options)
  }

  async #writeDriveFile(drive, driveKey, content, cleanPath) {
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
      return
    }

    const rs = fs.createReadStream(cleanPath)
    try {
      await new Promise((resolve, reject) => {
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })
    } catch (err) {
      ws.destroy()
      rs.destroy()
      throw err
    }
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
                ([address]) =>
                  normalizeOwnerAddress(address) !== normalizedOwner
              )
            )
          : undefined
        const pinnedBy = channel.pinnedBy
          ? Object.fromEntries(
              Object.entries(channel.pinnedBy).filter(
                ([address]) =>
                  normalizeOwnerAddress(address) !== normalizedOwner
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
      if (options.excludeCid && file.cid === options.excludeCid) {
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
    return this.#holdings.reduce(
      (sum, h) => sum + (h.kind === 'collection' ? 0 : h.size || 0),
      0
    )
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

  #getAccountMetadataPath() {
    return path.join(this.#options.dataPath, 'account-metadata.json')
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
    return {}
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
    return {}
  }

  #saveTrashMetadata() {
    try {
      const metadataPath = this.#getTrashMetadataPath()
      this.#atomicWrite(metadataPath, JSON.stringify(this.#trashFiles, null, 2))
    } catch (err) {
      console.error('Failed to save trash metadata:', err.message)
    }
  }

  #loadAccountMetadata() {
    try {
      const metadataPath = this.#getAccountMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
        const profiles = {}
        for (const [owner, profile] of Object.entries(parsed.profiles || {})) {
          const ownerAddress = normalizeOwnerAddress(owner)
          const normalized = this.#normalizeAccountProfileRecord(
            ownerAddress,
            profile,
            profile?.updatedAt || profile?.syncUpdatedAt
          )
          if (normalized) profiles[ownerAddress] = normalized
        }
        return { profiles }
      }
    } catch (err) {
      console.warn(
        'Failed to load account metadata, using empty state:',
        err.message
      )
    }
    return { profiles: {} }
  }

  #saveAccountMetadata() {
    try {
      const metadataPath = this.#getAccountMetadataPath()
      this.#atomicWrite(
        metadataPath,
        JSON.stringify(this.#accountMetadata, null, 2)
      )
    } catch (err) {
      console.error('Failed to save account metadata:', err.message)
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
            const channelKey = normalizeChannelKey(channel.channelKey)
            const expectedChannelKey = buildChannelKey(channelId)
            return {
              ...channel,
              channelId,
              channelKey,
              expectedChannelKey,
              name: channelId,
              writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
            }
          })
          .filter(
            channel =>
              CHANNEL_NAME_REGEX.test(channel.channelId) &&
              channel.channelKey === channel.expectedChannelKey &&
              channel.writerId &&
              channel.localWriterCoreKey
          )
          .map(
            ({ expectedChannelKey: _expectedChannelKey, ...channel }) => channel
          )
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

  #setupChannelAppendListener(core, channelKey) {
    let lastCoreLength = core.length
    core.on('append', async () => {
      if (core.length > lastCoreLength) {
        for (let i = lastCoreLength; i < core.length; i++) {
          try {
            const entry = await core.get(i)
            if (isChannelHistoryEntry(entry)) {
              const channel = this.#channels.find(
                c => c.channelKey === channelKey
              )
              if (isChannelMemberProfileEventEntry(entry)) {
                if (channel) {
                  this.#applyChannelMemberProfileEvent(channel, entry, {
                    save: true,
                    emit: true,
                  })
                }
                continue
              }
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
      if (channel) {
        await this.#replayChannelMemberProfileCore(channel, core, {
          save: true,
        })
      }
      if (channel && !channel.writerCoreKeys?.includes(normalizedCoreKey)) {
        channel.writerCoreKeys = uniqueStrings([
          ...(channel.writerCoreKeys || []),
          normalizedCoreKey,
        ])
        this.#saveChannelsMetadata()
      }
      if (channel) {
        this.emit('channel:sync:available', {
          channel: channelKey,
          channelKey,
          channelId: channel.channelId || '',
          writerCoreKey: normalizedCoreKey,
          writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
        })
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

  #buildChannelHelloMessage() {
    const channels = this.#channels.map(channel => ({
      channelId: channel.channelId,
      channelKey: channel.channelKey,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      memberAddresses: this.#getChannelMemberAddresses(channel),
      writerCoreKeys: uniqueStrings([
        ...(channel.writerCoreKeys || []),
        this.#channelLocalCoreKey.get(channel.channelKey),
      ]),
    }))
    return {
      type: 'channel-hello',
      peerId: this.getNodeId(),
      authorName: this.getNodeId().slice(0, 4),
      channels,
    }
  }

  #sendChannelHello(stream) {
    if (!stream || stream.destroyed || stream.writableEnded) {
      this.#channelStreams.delete(stream)
      return false
    }
    try {
      stream.write(`${JSON.stringify(this.#buildChannelHelloMessage())}\n`)
      return true
    } catch {
      this.#channelStreams.delete(stream)
      return false
    }
  }

  #broadcastChannelHello() {
    for (const stream of [...this.#channelStreams]) {
      this.#sendChannelHello(stream)
    }
  }

  #sendChannelPresence(stream, event) {
    if (!stream || stream.destroyed || stream.writableEnded || !event) {
      this.#channelStreams.delete(stream)
      return false
    }
    try {
      stream.write(
        `${JSON.stringify({
          type: 'channel-presence',
          peerId: this.getNodeId(),
          channelId: event.channelId,
          channelKey: event.channelKey,
          address: event.address,
          status: event.status,
          displayName: event.displayName,
          avatar: event.avatar,
          profileUpdatedAt: event.profileUpdatedAt,
          lastSeen: event.lastSeen || Date.now(),
          sessionId: event.sessionId || 'default',
        })}\n`
      )
      return true
    } catch {
      this.#channelStreams.delete(stream)
      return false
    }
  }

  #broadcastChannelPresence(event) {
    for (const stream of [...this.#channelStreams]) {
      this.#sendChannelPresence(stream, event)
    }
  }

  #sendChannelVoice(stream, event) {
    if (!stream || stream.destroyed || stream.writableEnded || !event) {
      this.#channelStreams.delete(stream)
      return false
    }
    try {
      stream.write(
        `${JSON.stringify({
          type: 'channel-voice',
          peerId: this.getNodeId(),
          ...event,
        })}\n`
      )
      return true
    } catch {
      this.#channelStreams.delete(stream)
      return false
    }
  }

  #broadcastChannelVoice(event) {
    for (const stream of [...this.#channelStreams]) {
      this.#sendChannelVoice(stream, event)
    }
  }

  async #processChannelHelloMessage(msg) {
    if (msg.type !== 'channel-hello') return null

    const onlineChannels = []
    const remoteChannels = Array.isArray(msg.channels)
      ? msg.channels
          .filter(channel => channel && typeof channel === 'object')
          .map(channel => {
            const channelId = normalizeChannelId(channel.channelId)
            return {
              channelId,
              channelKey: buildChannelKey(channelId),
              type: String(channel.type || 'public').trim() || 'public',
              createdAt:
                typeof channel.createdAt === 'string' ? channel.createdAt : '',
              lastMessageAt:
                typeof channel.lastMessageAt === 'string'
                  ? channel.lastMessageAt
                  : '',
              memberAddresses: uniqueStrings(
                Array.isArray(channel.memberAddresses)
                  ? channel.memberAddresses.map(address =>
                      normalizeOwnerAddress(address)
                    )
                  : []
              ),
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
      if (peers) {
        peers.set(msg.peerId, {
          peerId: msg.peerId,
          authorName: msg.authorName,
          memberAddresses: remoteChannel.memberAddresses,
          lastSeen: Date.now(),
        })
      }
      onlineChannels.push({
        channelKey: localChannel.channelKey,
        channelId: localChannel.channelId,
        memberAddresses: remoteChannel.memberAddresses,
      })

      for (const writerCoreKey of remoteChannel.writerCoreKeys) {
        if (
          writerCoreKey &&
          writerCoreKey !==
            this.#channelLocalCoreKey.get(localChannel.channelKey)
        ) {
          await this.#openRemoteChannelCore(
            localChannel.channelKey,
            writerCoreKey
          )
        }
      }
    }

    this.emit('channel:peer:online', {
      peerId: msg.peerId,
      authorName: msg.authorName,
      channels: onlineChannels,
    })

    return msg.peerId
  }

  #processChannelPresenceMessage(msg) {
    if (msg.type !== 'channel-presence') return null
    const peerId = String(msg.peerId || '').trim()
    if (!peerId || peerId === this.getNodeId()) return null
    const channelId = normalizeChannelId(msg.channelId || msg.channelKey)
    const channelKey = buildChannelKey(channelId)
    const localChannel = this.#channels.find(
      channel => channel.channelKey === channelKey
    )
    if (!localChannel) return peerId

    const address = normalizeOwnerAddress(msg.address)
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

    if (status === 'online') {
      this.#upsertChannelPresenceSession(localChannel, options)
    } else if (status === 'heartbeat') {
      this.#touchChannelPresenceSession(localChannel, options)
    } else if (status === 'profile') {
      this.#updateChannelPresenceProfile(localChannel, options)
    } else if (status === 'offline') {
      this.#removeChannelPresenceSessions(localChannel.channelKey, options)
    }

    return peerId
  }

  #processChannelVoiceMessage(msg) {
    if (msg.type !== 'channel-voice') return null
    const peerId = String(msg.peerId || '').trim()
    if (!peerId || peerId === this.getNodeId()) return null
    const channelId = normalizeChannelId(msg.channelId || msg.channelKey)
    const channelKey = buildChannelKey(channelId)
    const localChannel = this.#channels.find(
      channel => channel.channelKey === channelKey
    )
    if (!localChannel) return peerId

    try {
      const event = normalizeChannelVoiceEvent(channelKey, msg, {
        timestamp: msg.timestamp,
      })
      this.emit('channel:voice', event)
    } catch {}
    return peerId
  }

  async #handleChannelConnection(conn) {
    const stream = conn
    let connectedPeerId = null
    let readBuffer = ''
    let closed = false

    this.#channelStreams.add(stream)
    if (!this.#sendChannelHello(stream)) return

    stream.on('data', async data => {
      readBuffer += data.toString()
      let newlineIndex = readBuffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = readBuffer.slice(0, newlineIndex).trim()
        readBuffer = readBuffer.slice(newlineIndex + 1)
        newlineIndex = readBuffer.indexOf('\n')
        if (!line) continue
        try {
          const message = JSON.parse(line)
          const peerId =
            message.type === 'channel-presence'
              ? this.#processChannelPresenceMessage(message)
              : message.type === 'channel-voice'
                ? this.#processChannelVoiceMessage(message)
                : await this.#processChannelHelloMessage(message)
          if (peerId) connectedPeerId = peerId
        } catch (err) {
          console.warn(`[MostBox] Failed to process channel data:`, err.message)
        }
      }
    })

    const cleanup = () => {
      if (closed) return
      closed = true
      this.#channelStreams.delete(stream)
      if (connectedPeerId) {
        for (const [channelKey, peers] of this.#channelPeers) {
          if (peers.has(connectedPeerId)) {
            const peer = peers.get(connectedPeerId)
            peers.delete(connectedPeerId)
            const channel = this.#channels.find(
              item => item.channelKey === channelKey
            )
            this.emit('channel:peer:offline', {
              peerId: connectedPeerId,
              authorName: peer?.authorName,
              channelKey,
              channelId: channel?.channelId || '',
              memberAddresses: peer?.memberAddresses || [],
            })
          }
        }
        this.#removeChannelPresenceSessionsBySource(`peer:${connectedPeerId}`)
      }
    }

    stream.on('close', cleanup)
    stream.on('error', cleanup)
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
