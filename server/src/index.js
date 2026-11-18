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
import { Duplex, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import {
  calculateCid,
  calculateDirectoryCid,
  parseMostLink,
  buildMostLink,
} from './core/cid.js'
import { ACCOUNT_HELLO_TYPE, AccountSync } from './node/accountSync.js'
import {
  compareChannelHistoryEntries,
  paginateChannelHistory,
} from './core/channelHistory.js'
import {
  MAX_CHANNEL_FRAME_BYTES,
  consumeChannelFrames,
} from './core/channelFrames.js'
import {
  CHANNEL_PROOF_VERSION,
  MAX_CHANNEL_SCOPE_TOPICS_PER_FRAME,
  buildChannelHelloMessages,
  chunkChannelScopeTopics,
  createChannelProofChallenge,
  normalizeChannelProofChallenge,
  normalizeChannelScopeTopics,
} from './core/channelHello.js'
import { normalizeChannelVoiceEvent } from './core/channelVoice.js'
import { CID_TOPIC_JOIN_OPTIONS, getCidInfo } from './core/cidTopic.js'
import { attachCidDriveChannel, cidDriveName } from './core/cidDriveExchange.js'
import { P2PPingManager } from './core/p2pPing.js'
import {
  normalizeChannelDisplayName,
  normalizeChannelAvatar,
  normalizeChannelId,
  normalizeChannelKey,
  isSpecialChannel,
  uniqueStrings,
} from './core/channelIdentity.js'
import {
  channelTopics,
  channelWriterKeyPair,
  createChannelProof,
  resolveChannelHandle,
  verifyChannelProof,
} from './core/channelKeysV2.js'
import {
  CHANNEL_MEMBER_PROFILE_TIME_FUTURE_TOLERANCE_MS,
  CHANNEL_MEMBER_PROFILE_UPDATED_EVENT,
  getChannelHistoryDedupeKey,
  isChannelMemberProfileEventEntry,
  normalizeChannelMentionList,
  normalizeClientMessageId,
} from './core/channelMessage.js'
import {
  SIGNED_TS_FUTURE_LIMIT_MS,
  buildSignedEntry,
  readSignedEntry,
  readSignedMessageEntry,
  readSignedProfileEntry,
  signedMessageError,
  signedProfileError,
} from './core/channelSignedEntry.js'
import { canonicalJson } from './core/canonicalJson.js'
import { ChannelPresenceManager } from './core/channelPresence.js'
import {
  createChannelPresenceMessage,
  createChannelVoiceMessage,
  normalizeRemoteChannelFrame,
  normalizeRemoteChannelPresence,
} from './core/channelWire.js'
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
  METADATA_BACKUP_SUFFIX,
  readMetadataFile,
  writeMetadataFile,
} from './node/metadataFile.js'
import {
  getChannelConfigPath,
  getChannelsMetadataPath,
  loadChannelConfig,
  loadChannelsMetadata,
  serializeChannelsMetadata,
} from './node/channelMetadata.js'
import {
  ensureNodeSeedPersisted,
  loadOrCreateNodeSeed,
} from './node/nodeIdentity.js'
import {
  getFilesystemSpace,
  StorageReservationLedger,
} from './node/storageSpace.js'
import {
  sanitizeFilename,
  validateAndSanitizePath,
  validateFileSize,
  checkDirectoryWritable,
  formatFileSize,
} from './utils/security.js'
import {
  normalizeChatMemberTagPatch,
  normalizeLocalizedChatTag,
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
  PersistenceError,
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
  TOPIC_LOOKUP_INTERVAL,
  HOLDING_REJOIN_BATCH_SIZE,
  HOLDING_REJOIN_BATCH_DELAY,
  PROGRESS_THROTTLE,
  DEFAULT_READ_LIMIT,
  CHANNEL_MESSAGE_LIMIT,
} from './config.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const HEX_64_REGEX = /^[0-9a-f]{64}$/
// channel-keys.md §5: writer core keys accepted per channel from one hello.
const MAX_HELLO_WRITER_CORE_KEYS = 256
const PUBLISH_WRITE_STALL_TIMEOUT = 15 * 1000
const PUBLISH_DRIVE_RESET_TIMEOUT = 5 * 1000
const PUBLISH_BUFFER_WRITE_LIMIT = 32 * 1024 * 1024
const PUBLISH_BUFFER_WRITE_BYTES_PER_SECOND = 2 * 1024 * 1024
const LOCAL_CONTENT_PROBE_TIMEOUT = 2 * 1000

function hasOwnProperty(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key)
}

function getDirectoryBlockBytes(directory) {
  let bytes = 0
  for (const block of directory?.blocks?.values?.() || []) {
    bytes += Number(block?.byteLength ?? block?.length ?? 0)
  }
  return bytes
}

function parseMetadataBuckets(data, label) {
  const parsed = JSON.parse(data)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(`${label} metadata must be an object`)
  }
  return normalizeMetadataBuckets(parsed)
}

function parseMetadataObject(data, label) {
  const parsed = JSON.parse(data)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(`${label} metadata must be an object`)
  }
  return parsed
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

const ACCOUNT_SYNC_RECONCILE_DELAY = 400

export class MostBoxEngine extends EventEmitter {
  #store = null
  #swarm = null
  #drives = new Map()
  #publishedFiles = {}
  #holdings = []
  #initialized = false
  #options = null
  #activeDownloads = new Map()
  #drivePromises = new Map()
  #fileDiscoveries = new Map()
  #fileMonitors = new Map()
  #activePublishes = new Map()
  #seedStates = new Map()
  #holdingResumeTask = null
  #cidDriveSecret = null
  #cidDrivePeers = new Set()
  #cidDriveOffers = new Map()
  #cidDriveWants = new Map()
  #cidDriveOfferWaiters = new Set()
  #storageReservations = new StorageReservationLedger()

  #channels = []
  #channelCores = new Map()
  #channelLocalCoreKey = new Map()
  #channelCoresOpening = new Set()
  #channelDiscoveries = new Map()
  #channelChatDiscoveries = new Map()
  #channelTopicMap = null
  #channelTopicMapVersion = 0
  #channelPeers = new Map()
  #channelStreams = new Map()
  #channelPresence = null
  #channelCreationQueues = new Map()
  #channelMessageQueues = new Map()
  #channelHistoryIndex = new Map()
  #accountSync = null
  #accountSyncQueue = Promise.resolve()
  #accountSyncTimer = null

  #accountMetadata = { profiles: {} }

  #chatSwarm = null
  #p2pPingManager = null

  /**
   * 创建新的 MostBoxEngine 实例
   * @param {object} options - 配置选项
   * @param {string} options.dataPath - 存储 P2P 数据的路径（必填）
   * @param {number} [options.maxFileSize] - 最大文件大小（字节）（默认：10GB）
   * @param {number} [options.capacityBytes] - 节点存储容量上限（字节）（默认：100GB）
   * @param {boolean} [options.disableNetwork] - 测试用：跳过真实 Hyperswarm 网络
   * @param {string|Buffer|null} [options.relayThrough] - 可选的 Hyperswarm 数据中继公钥
   * @param {Array<string|object>} [options.bootstrap] - 测试用：覆盖 DHT bootstrap 节点（如本地测试网）
   */
  constructor(options) {
    super()

    if (!options || !options.dataPath) {
      throw new Error('dataPath is required')
    }

    this.#options = {
      dataPath: options.dataPath,
      maxFileSize: options.maxFileSize ?? MAX_FILE_SIZE,
      capacityBytes: options.capacityBytes ?? 100 * 1024 * 1024 * 1024,
      downloadTimeout: options.downloadTimeout || DOWNLOAD_TIMEOUT,
      publishWriteStallTimeout:
        options.publishWriteStallTimeout ?? PUBLISH_WRITE_STALL_TIMEOUT,
      publishBufferWriteLimit:
        options.publishBufferWriteLimit ?? PUBLISH_BUFFER_WRITE_LIMIT,
      localContentProbeTimeout:
        options.localContentProbeTimeout ?? LOCAL_CONTENT_PROBE_TIMEOUT,
      disableNetwork: options.disableNetwork === true,
      relayThrough: options.relayThrough || null,
      bootstrap: options.bootstrap || SWARM_BOOTSTRAP,
      createP2PPingSwarm: options.createP2PPingSwarm,
    }
    this.#channelPresence = new ChannelPresenceManager({
      emitPresence: event => this.emit('channel:presence', event),
      getChannelId: channelKey =>
        this.#channels.find(channel => channel.channelKey === channelKey)
          ?.channelId || channelKey,
    })
  }

  getChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    this.#channelPresence.prune()
    return this.#channelPresence.list(channel.channelKey)
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
    const event = this.#channelPresence.join(channel, {
      ...options,
      address: options.ownerAddress,
      local: true,
    })
    if (event) {
      this.#broadcastChannelPresence(event)
    }
    return this.#channelPresence.list(channel.channelKey)
  }

  heartbeatChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const event = this.#channelPresence.heartbeat(channel, {
      ...options,
      address: options.ownerAddress,
      local: true,
    })
    this.#broadcastChannelPresence(
      event ||
        this.#channelPresence.format(
          channel.channelKey,
          options.ownerAddress,
          'heartbeat'
        )
    )
    return this.#channelPresence.list(channel.channelKey)
  }

  updateChannelPresenceProfile(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const event = this.#channelPresence.updateProfile(channel, {
      ...options,
      address: options.ownerAddress,
      local: true,
    })
    if (event) {
      this.#broadcastChannelPresence(event)
    }
    return this.#channelPresence.list(channel.channelKey)
  }

  leaveChannelPresence(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const events = this.#channelPresence.leave(channel.channelKey, {
      ...options,
      address: options.ownerAddress,
    })
    events.forEach(event => this.#broadcastChannelPresence(event))
    return this.#channelPresence.list(channel.channelKey)
  }

  clearChannelPresenceSource(sourceId, options = {}) {
    this.#ensureInitialized()
    const events = this.#channelPresence.clearSource(sourceId)
    if (options.broadcast) {
      events.forEach(event => this.#broadcastChannelPresence(event))
    }
    return events
  }

  pruneChannelPresence() {
    this.#ensureInitialized()
    return this.#channelPresence.prune()
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

  #isReadOnlySessionError(err) {
    if (!err || typeof err !== 'object') return false
    const code = String(err.code || '')
    const message = String(err.message || '').toLowerCase()
    return (
      code === 'SESSION_NOT_WRITABLE' ||
      message.includes('session_not_writable') ||
      message.includes('readonly core') ||
      message.includes('not writable')
    )
  }

  #isRecoverableChannelAppendError(err) {
    return this.#isClosedSessionError(err) || this.#isReadOnlySessionError(err)
  }

  #isPublishWriteTimeoutError(err) {
    return err?.code === 'PUBLISH_WRITE_TIMEOUT'
  }

  #isRecoverablePublishWriteError(err) {
    return (
      this.#isClosedSessionError(err) || this.#isPublishWriteTimeoutError(err)
    )
  }

  #createPublishWriteTimeoutError(driveKey) {
    const err = new Error(`Publish write timed out while writing ${driveKey}`)
    err.code = 'PUBLISH_WRITE_TIMEOUT'
    return err
  }

  #getPublishBufferWriteTimeout(byteLength) {
    const baseTimeout = Number(this.#options.publishWriteStallTimeout)
    if (!Number.isFinite(baseTimeout) || baseTimeout <= 0) return 0

    const scaledTimeout =
      Math.ceil(
        Math.max(0, Number(byteLength) || 0) /
          PUBLISH_BUFFER_WRITE_BYTES_PER_SECOND
      ) *
        1000 +
      baseTimeout
    return Math.max(baseTimeout, scaledTimeout)
  }

  #withTimeout(promise, timeoutMs, message, code = 'OPERATION_TIMEOUT') {
    const timeout = Number(timeoutMs)
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return promise
    }

    promise.catch(() => {})
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error(message)
        err.code = code
        reject(err)
      }, timeout)
      timeoutId.unref?.()
    })

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId)
    })
  }

  #createPublishWriteWatchdog(streams, driveKey) {
    const timeout = Number(this.#options.publishWriteStallTimeout)
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return { promise: new Promise(() => {}), reset() {}, stop() {} }
    }

    let timer = null
    let stopped = false
    let rejectStalledWrite
    const promise = new Promise((_, reject) => {
      rejectStalledWrite = reject
    })
    const reset = () => {
      if (stopped) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (stopped) return
        const err = this.#createPublishWriteTimeoutError(driveKey)
        for (const stream of streams) {
          stream?.destroy?.(err)
        }
        rejectStalledWrite(err)
      }, timeout)
      timer.unref?.()
    }

    reset()
    return {
      promise,
      reset,
      stop() {
        stopped = true
        clearTimeout(timer)
      },
    }
  }

  async #reopenChannelLocalWriter(channel, options = {}) {
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
    if (options.forceNamedWriter) {
      channel.writerCoreKeys = uniqueStrings([
        ...(Array.isArray(channel.writerCoreKeys)
          ? channel.writerCoreKeys
          : []),
        localKeyHex,
      ])
      channel.writerGeneration = (channel.writerGeneration || 0) + 1
      channel.localWriterCoreKey = ''
    }

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

    const nodeSeed = loadOrCreateNodeSeed(dataPath)
    this.#cidDriveSecret = nodeSeed
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
        this.#store = null
        throw new PersistenceError(
          `Storage path uses a different Corestore identity. MostBox will not delete existing data automatically. Move the directory aside or choose a new dataPath before restarting: ${dataPath}`,
          { reason: 'CORESTORE_IDENTITY_MISMATCH' }
        )
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

    // The store lock is held, so no download can be using these: they are
    // left over from a crash.
    for (const name of fs.readdirSync(dataPath)) {
      if (name.startsWith('.download-tmp-')) {
        fs.rmSync(path.join(dataPath, name), { recursive: true, force: true })
      }
    }

    try {
      ensureNodeSeedPersisted(dataPath, nodeSeed)
    } catch (err) {
      const store = this.#store
      this.#store = null
      try {
        await store.close()
      } catch {}
      throw err
    }

    console.log(`[MostBox] Initializing Hyperswarm...`)
    if (this.#options.disableNetwork) {
      this.#swarm = createOfflineSwarm(nodeSeed)
      this.#chatSwarm = createOfflineSwarm(nodeSeed)
    } else {
      this.#swarm = new Hyperswarm({
        seed: nodeSeed,
        maxPeers: MAX_PEERS,
        bootstrap: this.#options.bootstrap,
        firewall: () => false,
        connectionKeepAlive: SWARM_KEEP_ALIVE_INTERVAL,
        randomPunchInterval: SWARM_RANDOM_PUNCH_INTERVAL,
        handshakeTimeout: CONNECTION_TIMEOUT,
        relayThrough: this.#options.relayThrough,
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
      this.#attachCidDrivePeer(conn)
      this.emit('connection', conn)
    })

    if (!this.#options.disableNetwork) {
      this.#chatSwarm = new Hyperswarm({
        maxPeers: MAX_PEERS,
        bootstrap: this.#options.bootstrap,
        firewall: () => false,
        connectionKeepAlive: SWARM_KEEP_ALIVE_INTERVAL,
        randomPunchInterval: SWARM_RANDOM_PUNCH_INTERVAL,
        handshakeTimeout: CONNECTION_TIMEOUT,
        relayThrough: this.#options.relayThrough,
      })
    }

    this.#p2pPingManager = new P2PPingManager({
      createSwarm:
        this.#options.createP2PPingSwarm ||
        (swarmOptions =>
          this.#options.disableNetwork
            ? createOfflineSwarm()
            : new Hyperswarm(swarmOptions)),
      swarmOptions: {
        maxPeers: 4,
        bootstrap: SWARM_BOOTSTRAP,
        firewall: () => false,
        connectionKeepAlive: SWARM_KEEP_ALIVE_INTERVAL,
        randomPunchInterval: SWARM_RANDOM_PUNCH_INTERVAL,
        handshakeTimeout: CONNECTION_TIMEOUT,
        relayThrough: this.#options.relayThrough,
      },
      onUpdate: ping => this.emit('p2p:ping', ping),
    })

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

    try {
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

      await this.#migrateLegacyTrashMetadata()

      this.#channels = loadChannelsMetadata(this.#options.dataPath)
      this.#invalidateChannelTopicMap()
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

      // Persist v1 records migrated to v2 channel keys on load.
      this.#saveChannelsMetadata()

      this.#accountMetadata = this.#loadAccountMetadata()

      this.#accountSync = new AccountSync({
        store: this.#store,
        dataPath: this.#options.dataPath,
        swarm: this.#swarm,
        chatSwarm: this.#chatSwarm,
      })
      this.#accountSync.on('change', event => {
        this.emit('account:sync:change', event)
        this.#enqueueAccountSync(() => this.#applyAccountSyncChange(event))
      })
      await this.#accountSync.start()
    } catch (err) {
      await this.stop()
      throw err
    }

    this.#initialized = true
    console.log(`[MostBox] Engine initialized successfully`)
    this.emit('ready')
    this.#resumeHoldingsInBackground()
    this.#channelPresence.start()

    return this
  }

  /**
   * 停止引擎并清理资源
   */
  async stop() {
    if (
      !this.#initialized &&
      !this.#store &&
      !this.#swarm &&
      !this.#chatSwarm &&
      !this.#p2pPingManager
    ) {
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
    this.#cidDrivePeers.clear()
    this.#cidDriveOffers.clear()
    this.#cidDriveWants.clear()
    this.#activePublishes.clear()
    this.#seedStates.clear()
    this.#holdingResumeTask = null

    clearTimeout(this.#accountSyncTimer)
    this.#accountSyncTimer = null
    await this.#accountSyncQueue.catch(() => {})
    if (this.#accountSync) {
      await this.#accountSync.stop()
      this.#accountSync = null
    }

    if (this.#p2pPingManager) {
      await this.#p2pPingManager.destroy()
      this.#p2pPingManager = null
    }

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
    this.#channelPeers.clear()
    for (const stream of [...this.#channelStreams.keys()]) {
      this.#removeChannelStream(stream)
    }
    this.#channelPresence.clear()
    this.#channels = []
    this.#invalidateChannelTopicMap()

    if (this.#store) {
      await this.#store.close()
      this.#store = null
    }

    this.#storageReservations.clear()
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
      online: this.#swarm.dht?.online !== false,
      relayConfigured: Boolean(this.#options.relayThrough),
      status: total > 0 ? 'connected' : 'waiting',
    }
  }

  startP2PPing(input) {
    this.#ensureInitialized()
    return this.#p2pPingManager.start(input)
  }

  getP2PPing(id) {
    this.#ensureInitialized()
    return this.#p2pPingManager.get(id)
  }

  cancelP2PPing(id) {
    this.#ensureInitialized()
    return this.#p2pPingManager.cancel(id)
  }

  /**
   * 将内容发布到 P2P 网络
   * Hyperdrive 中存储 key 为 '/' + cid，metadata 中存储 displayName（用户看到的路径）
   * @param {string|Buffer} content - 文件路径（字符串）或内容（Buffer）
   * @param {string} [fileName] - 文件名（Buffer 输入时必填）
   * @param {object} [options] - 发布选项
   * @returns {Promise<{ cid: string, link: string, fileName: string }>}
   */
  async #acquirePublishLock(cid) {
    const previous = this.#activePublishes.get(cid) || Promise.resolve()
    let release
    const current = new Promise(resolve => {
      release = resolve
    })
    const next = previous.catch(() => {}).then(() => current)
    this.#activePublishes.set(cid, next)

    await previous.catch(() => {})

    let released = false
    return () => {
      if (released) return
      released = true
      release()
      if (this.#activePublishes.get(cid) === next) {
        this.#activePublishes.delete(cid)
      }
    }
  }

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

    this.emit('publish:progress', {
      stage: 'calculating-cid',
      file: safeFileName,
    })

    const { cid: rootCid } = await calculateCid(content)
    const cidString = rootCid.toString()
    const releasePublishLock = await this.#acquirePublishLock(cidString)
    try {
      this.emit('publish:progress', {
        stage: 'checking-local',
        file: safeFileName,
        cid: cidString,
        size: fileSize,
      })
      const { driveName: name } = this.#getCidInfo(cidString)
      const publishedBucket = addToLibrary
        ? this.#getPublishedBucket(ownerAddress, true)
        : []
      // 检查相同内容是否已存在
      const existingIndex = publishedBucket.findIndex(f => f.cid === cidString)
      const repairingMissingContent = existingIndex !== -1
      const existingHolding = this.#holdings.find(
        item => item.cid === cidString
      )
      let existingContent = null
      if (existingIndex !== -1 || existingHolding) {
        existingContent = await this.#getLocalCidContent(cidString, {
          ownerAddress,
          public: true,
          allowHoldingFallback: true,
        })
      }
      if (existingIndex !== -1) {
        const existing = publishedBucket[existingIndex]
        if (existingContent) {
          await this.#joinCidTopicInternal(cidString)
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

      const releaseCapacity = this.#reserveCapacity(
        existingHolding ? 0 : fileSize,
        [
          {
            path: this.#options.dataPath,
            bytes: fileSize,
            label: 'hyperdrive',
          },
        ]
      )

      // 获取或创建该 CID 对应的 drive
      try {
        let drive = this.#drives.get(name)

        if (!drive) {
          this.emit('publish:progress', {
            stage: 'opening-drive',
            file: safeFileName,
            cid: cidString,
            size: fileSize,
          })
          drive = await this.#getOrCreateDrive(name, {
            server: true,
            client: false,
          })
        }
        this.emit('publish:progress', {
          stage: 'uploading',
          file: safeFileName,
        })

        // Hyperdrive 中用 CID 作为 key 存储（解耦目录结构）
        const driveKey = '/' + cidString
        this.emit('publish:progress', {
          stage: 'writing-drive',
          file: safeFileName,
          cid: cidString,
          size: fileSize,
        })
        try {
          await this.#writeDriveFile(drive, driveKey, content, cleanPath)
        } catch (err) {
          if (!this.#isRecoverablePublishWriteError(err)) {
            throw err
          }
          this.emit('publish:progress', {
            stage: this.#isPublishWriteTimeoutError(err)
              ? 'resetting-drive'
              : 'reopening-drive',
            file: safeFileName,
            cid: cidString,
            size: fileSize,
          })
          drive = this.#isPublishWriteTimeoutError(err)
            ? await this.#resetDriveAfterPublishTimeout(name, drive, {
                server: true,
                client: false,
              })
            : await this.#reopenDrive(name, {
                server: true,
                client: false,
              })
          await this.#writeDriveFile(drive, driveKey, content, cleanPath)
        }

        // 存储 displayName（用户看到的文件夹路径），不存储 drivePath
        this.emit('publish:progress', {
          stage: 'drive-written',
          file: safeFileName,
          cid: cidString,
          size: fileSize,
        })
        this.emit('publish:progress', {
          stage: 'joining-topic',
          file: safeFileName,
          cid: cidString,
          size: fileSize,
        })
        await this.#joinCidTopicInternal(cidString)
        this.emit('publish:progress', {
          stage: 'saving-metadata',
          file: safeFileName,
          cid: cidString,
          size: fileSize,
        })
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
        // Holding first: after a crash a library record always has one.
        this.#upsertHolding({
          cid: cidString,
          fileName: safeFileName,
          size: fileSize,
          driveName: name,
          source: 'published',
        })
        if (addToLibrary) {
          if (repairingMissingContent) {
            publishedBucket[existingIndex] = fileRecord
          } else {
            publishedBucket.push(fileRecord)
          }
          this.#savePublishedMetadata()
        }

        const result = {
          cid: cidString,
          link: buildMostLink(cidString, safeFileName),
          fileName: safeFileName,
        }

        this.emit('publish:success', result)
        return result
      } finally {
        releaseCapacity()
      }
    } finally {
      releasePublishLock()
    }
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
      files.push({
        path: `${safeFolderPath}/${relativePath}`,
        content: this.#streamFolderFileContent(file.cid, {
          ownerAddress,
          fileName: safeFileName,
        }),
      })
    }

    const existingShare = this.#getPublishedBucket(ownerAddress).find(
      file =>
        file.libraryVisible === false &&
        (file.kind || 'file') === 'collection' &&
        sanitizeFilename(file.fileName || '') === safeFolderPath
    )

    return this.publishCollection(files, safeFolderPath, {
      ownerAddress,
      addToLibrary: true,
      libraryVisible: false,
      replaceCid: existingShare?.cid,
      seedChildFiles: false,
    })
  }

  async publishCollection(files, collectionName, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const addToLibrary = options.addToLibrary !== false
    const libraryVisible = options.libraryVisible !== false
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
    if (
      !libraryVisible &&
      existingIndex !== -1 &&
      options.replaceCid !== cidString
    ) {
      throw new ConflictError(
        `目录内容已被其他文件库记录使用: ${safeCollectionName}`
      )
    }
    const replacementIndex =
      existingIndex === -1 && options.replaceCid
        ? publishedBucket.findIndex(f => f.cid === options.replaceCid)
        : -1
    const excludedCid = repairingMissingContent
      ? cidString
      : replacementIndex !== -1
        ? options.replaceCid
        : undefined

    if (existingIndex !== -1) {
      const existingContent = await this.#getLocalCidContent(cidString, {
        ownerAddress,
        public: true,
        allowHoldingFallback: true,
      })
      if (existingContent) {
        await this.#joinCidTopicInternal(cidString)
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
        excludeCid: excludedCid,
      })
    }

    const directoryBlockBytes = getDirectoryBlockBytes(directory)
    const childPhysicalBytes = seedChildFiles ? directory.totalSize : 0
    this.#checkCapacity(seedChildFiles ? directory.totalSize : 0, [
      {
        path: this.#options.dataPath,
        bytes: childPhysicalBytes + directoryBlockBytes,
        label: 'collection',
      },
    ])

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

    const releaseCapacity = this.#reserveCapacity(0, [
      {
        path: this.#options.dataPath,
        bytes: directoryBlockBytes,
        label: 'collection',
      },
    ])

    try {
      let drive = this.#drives.get(name)
      if (!drive) {
        drive = await this.#getOrCreateDrive(name, {
          server: true,
          client: false,
        })
      }
      await this.#joinCidTopicInternal(cidString)

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
        ...(libraryVisible ? {} : { libraryVisible: false }),
      }
      this.#upsertHolding({
        cid: cidString,
        fileName: safeCollectionName,
        kind: 'collection',
        size: 0,
        driveName: name,
        source: 'published',
      })
      if (addToLibrary) {
        if (repairingMissingContent) {
          publishedBucket[existingIndex] = fileRecord
        } else if (replacementIndex !== -1) {
          publishedBucket[replacementIndex] = fileRecord
        } else {
          publishedBucket.push(fileRecord)
        }
        this.#savePublishedMetadata()
      }

      const result = {
        kind: 'collection',
        cid: cidString,
        link: buildMostLink(cidString, safeCollectionName),
        fileName: safeCollectionName,
        size: directory.totalSize,
        fileCount: directory.files.length,
        files: directory.files,
      }

      if (replacementIndex !== -1 && options.replaceCid !== cidString) {
        await this.#cleanupUnreferencedCids(new Set([options.replaceCid]))
      }

      this.emit('publish:success', result)
      return result
    } finally {
      releaseCapacity()
    }
  }

  async *#streamFolderFileContent(cid, options = {}) {
    let result = null
    try {
      result = await this.openFileReadStream(cid, {
        ownerAddress: options.ownerAddress,
      })
      for await (const chunk of result.stream) {
        yield chunk
      }
    } catch {
      const safeFileName = sanitizeFilename(options.fileName || '')
      throw new ValidationError(
        `Folder file is not locally available: ${safeFileName || cid}`
      )
    } finally {
      result?.stream?.destroy()
    }
  }

  /**
   * 从 P2P 网络下载文件
   * @param {string} link - most:// 链接
   * @param {string} [taskId] - 用于取消的任务 ID
   * @param {object} [options] - 下载选项
   * @param {number} [options.timeout] - 等待 P2P 内容的超时时间（毫秒）
   * @param {number} [options.streamReadTimeout] - 下载流无进度超时时间（毫秒）
   * @returns {Promise<{ taskId: string, cid?: string, fileName: string, savedPath?: string, localAvailable?: boolean, alreadyExists?: boolean }>}
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

    const taskState = {
      aborted: false,
      readStream: null,
      writeStream: null,
      releaseCapacity: null,
      childTaskIds: new Set(),
    }
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
      const { driveName: name, topicHex } = this.#getCidInfo(cidString)
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
          const result = await this.#downloadCollectionFiles(
            localCollection,
            taskId,
            {
              ...options,
              ownerAddress,
              fileName: linkFileName,
              taskState,
            }
          )
          return result
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
        const addRecord = addToLibrary && !alreadyInOwnerLibrary
        if (addRecord) {
          this.#assertDisplayNameAvailable(linkFileName, {
            ownerAddress,
            excludeCid: cidString,
          })
        }
        await this.#joinCidTopicInternal(cidString)
        this.#upsertHolding({
          cid: cidString,
          fileName:
            existingHolding?.fileName ||
            (alreadyInOwnerLibrary ? existingFile?.fileName : linkFileName) ||
            linkFileName,
          size: localSize,
          driveName: name,
          source:
            existingHolding?.source ||
            (alreadyInOwnerLibrary ? existingFile?.source : 'downloaded') ||
            'downloaded',
        })
        if (addRecord) {
          const syncUpdatedAt = Date.now()
          publishedBucket.push({
            fileName: linkFileName,
            cid: cidString,
            driveName: name,
            size: localSize,
            source: 'downloaded',
            publishedAt: new Date(syncUpdatedAt).toISOString(),
            starred: false,
            syncUpdatedAt,
          })
          this.#savePublishedMetadata()
        }
        return {
          taskId,
          cid: cidString,
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

        this.emit('download:status', {
          taskId,
          cid: cidString,
          topic: topicHex,
          status: 'connecting',
        })
      } else {
        console.log(`[MostBox] Using existing drive: ${name}`)
      }
      await this.#joinCidTopicInternal(cidString)

      if (taskState.aborted) throw new Error('Download cancelled')

      this.emit('download:status', {
        taskId,
        cid: cidString,
        topic: topicHex,
        status: 'finding-peers',
      })

      console.log(
        `[MostBox] Waiting for a seed drive with /${cidString} (timeout: ${downloadTimeout / 1000}s)...`
      )
      const driveKey = '/' + cidString
      const discoveryDeadline = Date.now() + downloadTimeout
      const triedKeys = new Set()
      let sourceMismatch = null
      findSource: for (;;) {
        const source = await this.#waitForRemoteCidDrive(
          cidString,
          discoveryDeadline - Date.now(),
          { triedKeys, taskId, taskState }
        )
        const entry = source?.entry
        const sourceDrive = source?.drive
        try {
          if (!entry) {
            if (sourceMismatch) throw sourceMismatch
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
            sourceDrive,
            linkFileName
          )
          if (remoteCollection) {
            await this.#copyUnixfsBlocks(sourceDrive, drive, cidString)
            const result = await this.#downloadCollectionFiles(
              remoteCollection,
              taskId,
              {
                ...options,
                ownerAddress,
                fileName: linkFileName,
                taskState,
              }
            )
            return result
          }

          const writableCheck = await checkDirectoryWritable(
            this.#options.dataPath
          )
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
              const stat = await sourceDrive.entry(entry.key)
              if (stat && stat.value && stat.value.blob) {
                totalBytes = stat.value.blob.byteLength || 0
              }
            } catch {
              // 忽略
            }

            if (totalBytes > this.#options.maxFileSize) {
              throw new FileSizeError(
                'Downloaded file exceeds the configured maximum file size',
                totalBytes,
                this.#options.maxFileSize
              )
            }

            const tempDir = fs.mkdtempSync(
              path.join(this.#options.dataPath, '.download-tmp-')
            )
            const tempPath = path.join(tempDir, 'content')
            const existingHolding = this.#holdings.find(
              item => item.cid === cidString
            )
            taskState.releaseCapacity = this.#reserveCapacity(
              existingHolding ? 0 : totalBytes,
              [
                {
                  path: this.#options.dataPath,
                  bytes: totalBytes,
                  label: 'hyperdrive',
                },
                {
                  path: this.#options.dataPath,
                  bytes: totalBytes,
                  label: 'download-temp',
                },
              ]
            )

            try {
              this.emit('download:status', {
                taskId,
                cid: cidString,
                topic: topicHex,
                status: 'downloading',
                file: sanitizedFileName,
                size: totalBytes ? formatFileSize(totalBytes) : null,
              })

              const rs = sourceDrive.createReadStream(entry.key)
              const ws = fs.createWriteStream(tempPath)

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
                  fs.unlink(tempPath, () => {})
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

              this.emit('download:status', {
                taskId,
                cid: cidString,
                topic: topicHex,
                status: 'verifying',
              })

              const { cid: downloadedCid, size: downloadedSize } =
                await calculateCid(tempPath)
              const downloadedCidString = downloadedCid.toString()

              if (downloadedCidString !== cidString) {
                sourceMismatch = new IntegrityError(
                  `File content CID mismatch. Expected ${cidString}, got ${downloadedCidString}.`
                )
                console.warn(
                  `[MostBox] Seed drive ${source.keyHex} served wrong content for ${cidString}`
                )
                continue findSource
              }

              const driveKey = '/' + cidString
              const existingEntry = await drive.entry(driveKey, { wait: false })
              const hasDriveContent =
                Boolean(existingEntry?.value?.blob) &&
                (await this.#hasLocalDriveContent(drive, driveKey))
              if (!hasDriveContent) {
                await pipeline(
                  fs.createReadStream(tempPath),
                  drive.createWriteStream(driveKey)
                )
              }
              const verifyEntry = await drive.entry(driveKey, { wait: false })
              const verifiedDriveContent =
                Boolean(verifyEntry?.value?.blob) &&
                (await this.#hasLocalDriveContent(drive, driveKey))
              if (!verifiedDriveContent) {
                throw new IntegrityError(
                  `Failed to write file to Hyperdrive for seeding: ${driveKey}`
                )
              }
              await this.#joinCidTopicInternal(cidString)

              const result = {
                taskId,
                cid: cidString,
                fileName: sanitizedFileName,
                localAvailable: true,
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
              const savedSize =
                totalBytes || downloadedSize || fs.statSync(tempPath).size
              const syncUpdatedAt =
                existingIndex !== -1
                  ? getNextSyncTimestamp(
                      publishedBucket[existingIndex].syncUpdatedAt
                    )
                  : Date.now()
              this.#upsertHolding({
                cid: cidString,
                fileName: sanitizedFileName,
                size: savedSize,
                driveName: name,
                source: 'downloaded',
              })
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

              if (!options.suppressSuccessEvent) {
                this.emit('download:success', result)
              }
              return result
            } finally {
              taskState.readStream = null
              taskState.writeStream = null
              fs.rmSync(tempDir, { recursive: true, force: true })
            }
          }
        } finally {
          if (!source?.local) await sourceDrive?.close().catch(() => {})
        }
      }
    } finally {
      taskState.releaseCapacity?.()
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

    const writableCheck = await checkDirectoryWritable(this.#options.dataPath)
    if (!writableCheck.writable) {
      throw new PermissionError(writableCheck.error)
    }

    await this.#joinCidTopicInternal(cidString)

    const source = await this.#waitForRemoteCidDrive(cidString, timeout)
    if (!source) {
      throw new PeerNotFoundError(
        '当前没有发现可下载的在线种子，请稍后重试或确认发布者在线'
      )
    }

    const { drive, entry } = source
    try {
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
    } finally {
      if (!source.local) await drive.close().catch(() => {})
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

    files = files.filter(file =>
      options.hiddenOnly === true
        ? file.libraryVisible === false
        : file.libraryVisible !== false
    )

    if (options.starred === true) {
      files = files.filter(f => f.starred === true)
    }

    return files.map(f => {
      const holding = this.#holdings.find(item => item.cid === f.cid)
      const seedState = this.#seedStates.get(f.cid)
      const seedStatus = seedState?.status || ''
      const runtimeStats = this.#getFileRuntimeStats(f.cid)
      return {
        kind: f.kind || 'file',
        fileName: f.fileName,
        cid: f.cid,
        link: buildMostLink(f.cid, f.fileName),
        publishedAt: f.publishedAt,
        size: Number(f.size) || 0,
        fileCount: Number(f.fileCount) || undefined,
        source: f.source === 'downloaded' ? 'downloaded' : 'published',
        starred: f.starred || false,
        ownerAddress: ownerAddress || '',
        localAvailable: this.#isLocalHoldingAvailable(f.cid),
        seedStatus,
        joined: seedStatus === 'active' && this.#fileDiscoveries.has(f.cid),
        peerCount: runtimeStats.peerCount,
        seedError: seedState?.error,
        holdingSize: Number(holding?.size) || 0,
        ...(f.libraryVisible === false ? { folderShare: true } : {}),
      }
    })
  }

  async listPublishedFilesWithAvailability(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.listPublishedFiles(options)

    return Promise.all(
      files.map(async file => {
        let localContent = null
        try {
          localContent = await this.#getLocalCidContent(file.cid, {
            ownerAddress,
            public: true,
            allowHoldingFallback: true,
            probeTimeoutMs: this.#options.localContentProbeTimeout,
          })
        } catch {
          localContent = null
        }
        return {
          ...file,
          localAvailable: localContent !== null,
        }
      })
    )
  }

  async listFolderSharesWithAvailability(options = {}) {
    return this.listPublishedFilesWithAvailability({
      ...options,
      hiddenOnly: true,
    })
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
   * 删除已发布文件 — 直接永久删除本地文件库记录和无引用副本
   * @param {string} cid - 要删除文件的 CID
   * @returns {Promise<Array>} 更新后的已发布文件列表
   */
  async deletePublishedFile(cid, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
    const index = files.findIndex(f => f.cid === cid)
    if (index !== -1) {
      const fileRecord = files[index]
      const affectedCids = await this.#collectFileRecordCids(fileRecord, {
        ownerAddress,
      })

      files.splice(index, 1)
      this.#setPublishedBucket(ownerAddress, files)
      this.#savePublishedMetadata()

      await this.#cleanupUnreferencedCids(affectedCids)
    } else if (this.#holdings.some(holding => holding.cid === cid)) {
      // A node holding can outlive its user-library record (for example after
      // a partial sync or an older client). Remove the orphaned replica too,
      // while preserving it when another published record still references it.
      await this.#cleanupUnreferencedCids(new Set([cid]))
    }
    return this.listPublishedFiles({ ownerAddress })
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<{ total: number, used: number, free: number, fileCount: number }>}
   */
  async getStorageStats(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    let physicalTotalBytes = 0
    let physicalFreeBytes = 0
    const { dataPath } = this.#options

    try {
      const space = getFilesystemSpace(dataPath)
      physicalTotalBytes = space.totalBytes
      physicalFreeBytes = space.availableBytes
    } catch {
      physicalTotalBytes = 0
      physicalFreeBytes = 0
    }
    const logicalUsedBytes = this.#getUsedBytes()

    return {
      total: physicalTotalBytes,
      used: logicalUsedBytes,
      free: physicalFreeBytes,
      logicalUsedBytes,
      physicalTotalBytes,
      physicalFreeBytes,
      fileCount: ownerAddress
        ? this.#getPublishedBucket(ownerAddress).length
        : this.#countBucketRecords(this.#publishedFiles),
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
      for (const childTaskId of [...(task.childTaskIds || [])]) {
        this.cancelDownload(childTaskId)
      }
      const err = new Error('Download cancelled')
      if (task.readStream) task.readStream.destroy(err)
      if (task.writeStream) task.writeStream.destroy()
    }
  }

  setMaxFileSize(maxFileSize) {
    const parsed = Number(maxFileSize)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ValidationError('maxFileSize must be a non-negative number')
    }
    this.#options.maxFileSize = Math.floor(parsed)
  }

  setCapacityBytes(capacityBytes) {
    const parsed = Number(capacityBytes)
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new ValidationError('capacityBytes must be a non-negative integer')
    }
    this.#options.capacityBytes = parsed
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
    return [...users.values()].map(user => ({
      address: user.address,
      fileCount: user.fileCount,
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
    await this.#joinCidTopicInternal(holding.cid)
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
   */
  async joinCidTopic(cid) {
    this.#ensureInitialized()
    return this.#joinCidTopicInternal(cid)
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
    const getSharedChannelTopics = () => {
      const localTopics = this.#getChannelTopicMap()
      const remoteTopics = peerEngine.#getChannelTopicMap()
      return [...localTopics.keys()]
        .filter(topicHex => remoteTopics.has(topicHex))
        .map(topicHex => b4a.from(topicHex, 'hex'))
    }
    const localPeerInfo = {
      publicKey: peerEngine.#chatSwarm.keyPair.publicKey,
    }
    const remotePeerInfo = {
      publicKey: this.#chatSwarm.keyPair.publicKey,
    }
    Object.defineProperty(localPeerInfo, 'topics', {
      enumerable: true,
      get: getSharedChannelTopics,
    })
    Object.defineProperty(remotePeerInfo, 'topics', {
      enumerable: true,
      get: getSharedChannelTopics,
    })
    left.on('error', () => {})
    right.on('error', () => {})
    leftChat.on('error', () => {})
    rightChat.on('error', () => {})
    left.pipe(right).pipe(left)
    this.#attachCidDrivePeer(left)
    peerEngine.#attachCidDrivePeer(right)
    this.#handleChannelConnection(leftChat, localPeerInfo).catch(() => {})
    peerEngine
      .#handleChannelConnection(rightChat, remotePeerInfo)
      .catch(() => {})

    return {
      close: () => {
        left.destroy()
        right.destroy()
        leftChat.destroy()
        rightChat.destroy()
      },
    }
  }

  // ---- 账号状态同步：把本机变更发布到账号日志，并应用其他设备的变更 ----

  #enqueueAccountSync(task) {
    const run = this.#accountSyncQueue.then(task)
    this.#accountSyncQueue = run.catch(err => {
      console.warn('[MostBox] Account sync failed:', err.message)
    })
    return this.#accountSyncQueue
  }

  #scheduleAccountSyncReconcile() {
    if (!this.#accountSync?.hasAccounts() || this.#accountSyncTimer) return
    this.#accountSyncTimer = setTimeout(() => {
      this.#accountSyncTimer = null
      this.#enqueueAccountSync(async () => {
        for (const address of this.#accountSync?.addresses() || []) {
          await this.#reconcileAccountSync(address)
        }
      })
    }, ACCOUNT_SYNC_RECONCILE_DELAY)
    this.#accountSyncTimer.unref?.()
  }

  /**
   * 账号同步用的稳定投影：只含用户设置的内容，去掉 lastMessageAt、writerCoreKeys、
   * updatedAt 这类会随聊天活动频繁变化的字段，否则每条消息都会触发重复发布。
   */
  #toAccountSyncRecords(address) {
    const backup = this.exportUserData(address)
    const records = new Map()
    if (backup.profile) {
      const { displayName, avatar, tag } = backup.profile
      records.set('profile:self', { displayName, avatar, tag })
    }
    for (const file of backup.files) {
      const record = { ...file }
      delete record.updatedAt
      records.set(`file:${file.cid}`, record)
    }
    for (const channel of backup.channels) {
      records.set(`channel:${channel.channelKey}`, {
        channelId: channel.channelId,
        channelKey: channel.channelKey,
        type: channel.type,
        createdAt: channel.createdAt,
        remark: channel.remark,
        pinned: channel.pinned,
        member: channel.member
          ? {
              displayName: channel.member.displayName,
              avatar: channel.member.avatar,
              ...(channel.member.tag ? { tag: channel.member.tag } : {}),
            }
          : undefined,
      })
    }
    return records
  }

  #hashAccountSyncRecord(record) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(record))
      .digest('hex')
  }

  #stripEmptyChannelSettings(record) {
    const data = { ...record }
    if (!data.remark) delete data.remark
    if (!data.pinned) delete data.pinned
    return data
  }

  async #reconcileAccountSync(address) {
    if (!address || !this.#accountSync?.has(address)) return
    const records = this.#toAccountSyncRecords(address)
    const published = this.#accountSync.getPublished(address)
    let changed = false
    for (const [key, record] of records) {
      const hash = this.#hashAccountSyncRecord(record)
      if (published.get(key) === hash) continue
      const [kind, ...rest] = key.split(':')
      // 首次发布的频道记录不带空的备注/置顶：否则新开启同步的节点会用空值
      // 覆盖其他设备上已有的设置（最后写入者胜出）。之后的变化仍显式发布，包括清空。
      const data =
        kind === 'channel' && !published.has(key)
          ? this.#stripEmptyChannelSettings(record)
          : record
      await this.#accountSync.append(address, {
        kind,
        id: rest.join(':'),
        data,
      })
      published.set(key, hash)
      changed = true
    }
    for (const key of [...published.keys()]) {
      if (records.has(key)) continue
      const [kind, ...rest] = key.split(':')
      await this.#accountSync.append(address, {
        kind,
        id: rest.join(':'),
        deleted: true,
      })
      published.delete(key)
      changed = true
    }
    if (changed) this.#accountSync.setPublished(address, published)
  }

  async #applyAccountSyncChange({ address, changed }) {
    const localDevice = this.#accountSync?.deviceIdFor(address)
    const remote = changed.filter(entry => entry.deviceId !== localDevice)
    for (const entry of remote) {
      const key = `${entry.kind}:${entry.id}`
      if (entry.kind === 'channel') {
        await this.#applyAccountSyncChannel(address, entry)
      } else if (entry.kind === 'file' && !entry.deleted) {
        const existing = this.#getPublishedBucket(address).find(
          file => file.cid === entry.id
        )
        await this.#importAccountSyncRecord(address, {
          files: [
            {
              ...entry.data,
              updatedAt: Math.max(
                entry.updatedAt,
                this.#getRecordUpdatedAt(existing) + 1
              ),
            },
          ],
        })
      } else if (entry.kind === 'profile' && !entry.deleted) {
        await this.#importAccountSyncRecord(
          address,
          { profile: { ...entry.data, updatedAt: entry.updatedAt } },
          { overwriteProfile: true }
        )
      } else {
        continue
      }
      // 记录应用后的本地内容哈希，避免把刚收到的变更再发布回去。
      const published = this.#accountSync.getPublished(address)
      const record = this.#toAccountSyncRecords(address).get(key)
      if (record) published.set(key, this.#hashAccountSyncRecord(record))
      else published.delete(key)
      this.#accountSync.setPublished(address, published)
    }
  }

  async #applyAccountSyncChannel(address, entry) {
    const channel = this.#channels.find(item => item.channelKey === entry.id)
    if (entry.deleted) {
      if (channel && this.#channelHasMember(channel, address)) {
        await this.leaveChannel(entry.id, { ownerAddress: address })
      }
      return
    }
    await this.#importAccountSyncRecord(address, {
      channels: [
        {
          ...entry.data,
          updatedAt: Math.max(
            entry.updatedAt,
            this.#getRecordUpdatedAt(channel) + 1
          ),
        },
      ],
    })
  }

  #importAccountSyncRecord(address, parts, options = {}) {
    return this.importUserData(
      address,
      {
        type: 'mostbox.account-backup',
        schemaVersion: 1,
        ownerAddress: address,
        profile: null,
        files: [],
        channels: [],
        ...parts,
      },
      options
    )
  }

  /**
   * 登记账号的同步子密钥，开始与同账号的其他设备同步账号状态。
   * 节点只保存同步子密钥，不接触账号种子。
   */
  async registerAccountSync(ownerAddress, syncKey) {
    this.#ensureInitialized()
    const status = await this.#accountSync.register(ownerAddress, syncKey)
    await this.#enqueueAccountSync(() =>
      this.#reconcileAccountSync(normalizeOwnerAddress(ownerAddress))
    )
    return status
  }

  async unregisterAccountSync(ownerAddress) {
    this.#ensureInitialized()
    return this.#accountSync.unregister(ownerAddress)
  }

  getAccountSyncStatus(ownerAddress) {
    this.#ensureInitialized()
    return this.#accountSync.status(ownerAddress)
  }

  listAccountSyncEntries(ownerAddress, options = {}) {
    this.#ensureInitialized()
    return this.#accountSync.list(ownerAddress, options)
  }

  async appendAccountSyncEntry(ownerAddress, entry) {
    this.#ensureInitialized()
    return this.#accountSync.append(ownerAddress, entry)
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
    if (
      existing &&
      !hasOwnProperty(profile, 'tag') &&
      hasOwnProperty(existing, 'tag')
    ) {
      profile.tag = existing.tag
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

  /**
   * Moves a v1 account's data on this node to its v2 chat identity
   * (docs/protocol/v2/signatures.md §7.4) by renaming the owner: published
   * files, channel membership with remarks and pins, and the profile. The
   * caller has already proven control of both addresses. Returns what moved,
   * or null when the old address has nothing on this node.
   */
  async migrateUserData(oldAddressInput, newAddressInput) {
    this.#ensureInitialized()
    const oldAddress = normalizeOwnerAddress(oldAddressInput)
    const newAddress = normalizeOwnerAddress(newAddressInput)
    if (!oldAddress || !newAddress || oldAddress === newAddress) {
      throw new ValidationError('two different owner addresses are required')
    }
    const files = this.#getPublishedBucket(oldAddress)
    const channels = this.#channels.filter(channel =>
      this.#channelHasMember(channel, oldAddress)
    )
    const profile = this.#accountMetadata.profiles?.[oldAddress]
    if (files.length === 0 && channels.length === 0 && !profile) return null

    if (files.length > 0) {
      const target = this.#getPublishedBucket(newAddress, true)
      const known = new Set(target.map(file => file.cid))
      for (const file of files) {
        if (!known.has(file.cid)) target.push(file)
      }
      this.#setPublishedBucket(newAddress, target)
      this.#setPublishedBucket(oldAddress, [])
      this.#savePublishedMetadata()
    }

    const renameKey = map => {
      if (!map || typeof map !== 'object') return map
      const next = {}
      for (const [address, value] of Object.entries(map)) {
        const owner = normalizeOwnerAddress(address)
        if (owner === oldAddress) {
          if (!(newAddress in next)) next[newAddress] = value
        } else {
          next[address] = value
        }
      }
      return next
    }
    for (const channel of channels) {
      const hasNew = this.#channelHasMember(channel, newAddress)
      channel.members = channel.members.flatMap(member => {
        if (normalizeOwnerAddress(member?.address) !== oldAddress) {
          return [member]
        }
        return hasNew ? [] : [{ ...member, address: newAddress }]
      })
      channel.remarks = renameKey(channel.remarks)
      channel.pinnedBy = renameKey(channel.pinnedBy)
      channel.syncUpdatedAt = getNextSyncTimestamp(channel.syncUpdatedAt)
    }
    if (channels.length > 0) {
      this.#saveChannelsMetadata()
      this.#broadcastChannelHello()
    }

    if (profile) {
      this.#accountMetadata.profiles[newAddress] ??= profile
      delete this.#accountMetadata.profiles[oldAddress]
      this.#saveAccountMetadata()
    }

    return {
      filesMoved: files.length,
      channelsMoved: channels.length,
      profileMoved: Boolean(profile),
    }
  }

  exportUserData(ownerAddressInput) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(ownerAddressInput)
    if (!ownerAddress) {
      throw new ValidationError('valid owner address is required')
    }

    const profile = this.getUserProfile(ownerAddress)
    const files = this.#getPublishedBucket(ownerAddress)
      .map(file => this.#formatAccountFileForBackup(file))
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

    let channelsChanged = false
    for (const channel of Array.isArray(backupInput.channels)
      ? backupInput.channels
      : []) {
      const mergeResult = await this.#runChannelCreationTask(
        normalizeChannelId(channel?.channelId),
        () => this.#mergeAccountChannelRecord(ownerAddress, channel)
      )
      if (mergeResult.added) result.channelsAdded += 1
      else if (mergeResult.updated) result.channelsUpdated += 1
      else result.skipped += 1
      channelsChanged = mergeResult.changed || channelsChanged
    }

    if (filesChanged) {
      this.#savePublishedMetadata()
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
    const result = await this.downloadFile(link, options.taskId, {
      ownerAddress,
      timeout: options.timeout,
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

  async openFileReadStream(cid, options = {}) {
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
    const offsetInput = Number(options.offset ?? 0)
    const offset =
      Number.isFinite(offsetInput) && offsetInput > 0
        ? Math.floor(offsetInput)
        : 0
    const limitInput = Number(options.limit)
    const requestedLimit =
      options.limit === undefined ||
      options.limit === null ||
      !Number.isFinite(limitInput)
        ? totalSize - offset
        : Math.max(0, Math.floor(limitInput))
    const contentLength = Math.max(
      0,
      Math.min(requestedLimit, totalSize - offset)
    )

    if (contentLength <= 0) {
      return {
        stream: Readable.from([]),
        fileName: fileRecord.fileName,
        totalSize,
        offset,
        contentLength: 0,
      }
    }

    return {
      stream: drive.createReadStream(driveKey, {
        start: offset,
        end: offset + contentLength - 1,
      }),
      fileName: fileRecord.fileName,
      totalSize,
      offset,
      contentLength,
    }
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
    return { node, unixfs, block }
  }

  // Copies the verified collection blocks that #readCollectionFromDrive reads.
  async #copyUnixfsBlocks(source, target, rootCid, cid = rootCid) {
    const { node, unixfs, block } = await this.#readUnixfsBlock(
      source,
      cid,
      rootCid
    )
    await target.put(cid === rootCid ? `/${cid}` : `/.unixfs/${cid}`, block)
    if (!unixfs.isDirectory()) return
    for (const link of node.Links || []) {
      if (link.Hash.code === 0x70) {
        await this.#copyUnixfsBlocks(
          source,
          target,
          rootCid,
          link.Hash.toString()
        )
      }
    }
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

  async #collectFileRecordCids(fileRecord, options = {}) {
    const cids = new Set()
    const cid = String(fileRecord?.cid || '').trim()
    if (cid) cids.add(cid)

    const files = await this.#readLocalCollectionChildFiles(fileRecord, options)
    for (const file of files) {
      if (file?.cid) cids.add(file.cid)
    }
    return cids
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
      if (fileRecord.libraryVisible === false) continue
      if (options.excludeCid && fileRecord.cid === options.excludeCid) continue
      if (await this.#collectionRecordIncludesCid(fileRecord, cid)) {
        return true
      }
    }
    return false
  }

  async #hasPublishedContentReference(cid) {
    return (
      this.#hasPublishedReference(cid) ||
      (await this.#hasPublishedCollectionChildReference(cid))
    )
  }

  async #downloadCollectionFiles(collection, taskId, options = {}) {
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const parentTaskState = options.taskState || null
    const throwIfCancelled = () => {
      if (parentTaskState?.aborted) {
        throw new Error('Download cancelled')
      }
    }
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
    const unavailableFiles = []
    for (let index = 0; index < childTargets.length; index += 1) {
      throwIfCancelled()
      const { file, fileName } = childTargets[index]
      this.emit('download:status', {
        taskId,
        status: 'finding-peers',
        file: fileName,
      })
      let childResult
      const childTaskId = `${taskId}_${index}`
      parentTaskState?.childTaskIds?.add(childTaskId)
      try {
        childResult = await this.downloadFile(
          buildMostLink(file.cid, fileName),
          childTaskId,
          {
            timeout: options.timeout ?? DRIVE_ENTRY_TIMEOUT,
            streamReadTimeout: options.streamReadTimeout,
            ownerAddress,
            addToLibrary: true,
            suppressSuccessEvent: true,
          }
        )
      } catch (err) {
        if (err?.code !== 'PEER_NOT_FOUND') throw err

        unavailableFiles.push({
          ...file,
          path: file.path,
          cid: file.cid,
          fileName,
          errorCode: 'COLLECTION_CHILD_UNAVAILABLE',
          error: 'No online seeders currently have this collection child file.',
        })
        this.emit('download:progress', {
          taskId,
          collection: true,
          file: fileName,
          loaded: downloadedFiles.length,
          total: files.length,
          completedFiles: downloadedFiles.length,
          totalFiles: files.length,
          processedFiles: index + 1,
          unavailableFileCount: unavailableFiles.length,
          percent:
            files.length > 0
              ? Math.round(((index + 1) / files.length) * 100)
              : 0,
        })
        continue
      } finally {
        parentTaskState?.childTaskIds?.delete(childTaskId)
      }
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
        processedFiles: index + 1,
        unavailableFileCount: unavailableFiles.length,
        percent:
          files.length > 0 ? Math.round(((index + 1) / files.length) * 100) : 0,
      })
    }

    throwIfCancelled()

    await this.#joinCidTopicInternal(collection.cid)
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
      selectedFileCount: files.length,
      downloadedFileCount: downloadedFiles.length,
      unavailableFileCount: unavailableFiles.length,
      partial: unavailableFiles.length > 0,
      files: downloadedFiles,
      unavailableFiles,
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
    const publishedBucket = this.#getPublishedBucket(ownerAddress)
    if (
      publishedBucket.some(
        record =>
          record.cid === collection.cid &&
          ((record.kind || 'file') === 'collection' ||
            Number(record.fileCount) > 0)
      )
    ) {
      return true
    }
    if (files.length === 0) return false

    return files.every(file => {
      const fileNames = this.#getCollectionChildPublishedNames(collection, file)
      return (
        this.#isLocalHoldingAvailable(file.cid) &&
        publishedBucket.some(
          record =>
            record.cid === file.cid &&
            fileNames.has(sanitizeFilename(record.fileName))
        )
      )
    })
  }

  #getCollectionChildPublishedNames(collection, file) {
    const collectionName = sanitizeFilename(
      collection.fileName || collection.cid
    )
    const childPath = sanitizeFilename(file?.path || '')
    const fileNames = new Set([
      sanitizeFilename(`${collectionName}/${childPath}`),
    ])
    const collectionParts = collectionName.split('/').filter(Boolean)
    const childParts = childPath.split('/').filter(Boolean)
    const collectionTail = collectionParts[collectionParts.length - 1] || ''
    if (
      collectionTail &&
      childParts.length > 1 &&
      childParts[0] === collectionTail
    ) {
      fileNames.add(
        sanitizeFilename(`${collectionName}/${childParts.slice(1).join('/')}`)
      )
    }
    return fileNames
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
    const holding = this.#holdings.find(item => item.cid === cid)
    // Blocks without a publish record or holding were never CID-verified here.
    if (!fileRecord && !(options.allowHoldingFallback && holding)) {
      return null
    }
    const { driveName } = this.#getCidInfo(cid)
    const probeTimeoutMs = Number(options.probeTimeoutMs)
    const timeoutEnabled = Number.isFinite(probeTimeoutMs) && probeTimeoutMs > 0
    const timeoutCode = 'LOCAL_CONTENT_PROBE_TIMEOUT'
    const withProbeTimeout = (promise, message) =>
      timeoutEnabled
        ? this.#withTimeout(promise, probeTimeoutMs, message, timeoutCode)
        : promise
    const targetDriveName = driveName
    let drive = await this.#getOrCreateDrive(targetDriveName, {
      server: true,
      client: false,
      openTimeoutMs: probeTimeoutMs,
    })
    const driveKey = '/' + cid

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const entry = await withProbeTimeout(
          drive.entry(driveKey, { wait: false }),
          `Timed out while checking local content for ${cid}`
        )
        if (!entry?.value?.blob) {
          return null
        }
        const hasContent = await withProbeTimeout(
          this.#hasLocalDriveContent(drive, driveKey),
          `Timed out while checking local blocks for ${cid}`
        )
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
            driveName,
            kind: holding?.kind,
            size,
            ownerAddress,
          },
        }
      } catch (err) {
        if (attempt === 0 && this.#isClosedSessionError(err)) {
          drive = await this.#reopenDrive(targetDriveName, {
            server: true,
            client: false,
            openTimeoutMs: probeTimeoutMs,
          })
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
  async createChannel(handleInput, type = 'personal', options = {}) {
    this.#ensureInitialized()
    const resolved = resolveChannelHandle(handleInput)
    if (!resolved) {
      throw new ValidationError('频道凭证或名称无效', 'INVALID_CHANNEL_HANDLE')
    }
    return this.#runChannelCreationTask(resolved.channelKey, () =>
      this.#createChannel(resolved, type, options)
    )
  }

  // 同一频道的创建/加入串行执行，避免并发请求各自写入一条频道记录。
  async #runChannelCreationTask(channelKey, task) {
    const previous =
      this.#channelCreationQueues.get(channelKey) || Promise.resolve()
    const pending = previous.then(task)
    const completed = pending.then(
      () => undefined,
      () => undefined
    )
    this.#channelCreationQueues.set(channelKey, completed)
    try {
      return await pending
    } finally {
      if (this.#channelCreationQueues.get(channelKey) === completed) {
        this.#channelCreationQueues.delete(channelKey)
      }
    }
  }

  async #createChannel(resolved, type, options) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    const channelType = String(type || 'personal').trim() || 'personal'
    const existing = this.#channels.find(
      channel => channel.channelKey === resolved.channelKey
    )
    if (existing) return this.#joinExistingChannel(existing, options)

    const channelInfo = await this.#createLocalChannel(resolved, channelType, {
      ...options,
      ownerAddress,
    })

    console.log(`[MostBox] Channel joined: ${channelInfo.channelKey}`)
    this.emit('channel:joined', {
      channel: channelInfo.channelKey,
      channelKey: channelInfo.channelKey,
      channelId: channelInfo.channelId,
      key: channelInfo.channelKey,
    })

    return this.#formatChannelForResponse(channelInfo, ownerAddress)
  }

  async #joinExistingChannel(existing, options) {
    const memberChanged = this.#upsertChannelMember(existing, options)
    if (memberChanged) {
      existing.syncUpdatedAt = getNextSyncTimestamp(existing.syncUpdatedAt)
      this.#saveChannelsMetadata()
      this.#broadcastChannelHello()
    }
    return this.#formatChannelForResponse(existing, options.ownerAddress)
  }

  /**
   * 加入频道：v2 中频道句柄（凭证、旧 ID 或公开名）即频道，加入与创建相同。
   * `_candidate` 为 v1 遗留参数，忽略。
   */
  async joinChannel(handleInput, _candidate = null, options = {}) {
    return this.createChannel(handleInput, options.type || 'group', options)
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
      this.#invalidateChannelTopicMap()
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
      this.#channelHistoryIndex.delete(channel.channelKey)
    }
    this.#channelLocalCoreKey.delete(channel.channelKey)

    this.#channelPeers.delete(channel.channelKey)
    this.#channels.splice(index, 1)
    this.#invalidateChannelTopicMap()
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

    const unique = await this.#readChannelHistory(channel)
    const total = unique.length
    const start = Math.max(0, total - offset - limit)
    const end = total - offset

    return unique
      .slice(start, end)
      .map(({ _coreKey, _index, ...msg }) =>
        this.#normalizeChannelMessageForResponse(channel.channelKey, msg)
      )
  }

  async getChannelHistory(channelKeyInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    const entries = await this.#readChannelHistory(channel)
    const page = paginateChannelHistory(entries, channel.channelKey, options)
    return {
      messages: page.messages.map(({ _coreKey, _index, ...message }) =>
        this.#normalizeChannelMessageForResponse(channel.channelKey, message)
      ),
      nextCursor: page.nextCursor,
    }
  }

  /**
   * A writer core block as a message or a member profile event, or null:
   * v2 cores hold only signed entries (signatures.md §6).
   */
  #decodeChannelEntry(entry, channelKey) {
    return readSignedEntry(entry, channelKey)
  }

  async #readChannelHistory(channel, { strict = false } = {}) {
    const coresMap = this.#channelCores.get(channel.channelKey)
    if (!coresMap || coresMap.size === 0) {
      throw new Error('频道未初始化')
    }

    const allMessages = []
    for (const [coreKeyHex, core] of coresMap) {
      for (let i = 0; i < core.length; i++) {
        try {
          const entry = await core.get(i, { wait: false })
          // Only blocks held locally: a writer whose block has not arrived
          // may be offline, and waiting would hang the read.
          if (entry === null) break
          const message = this.#decodeChannelEntry(entry, channel.channelKey)
          if (message) {
            allMessages.push({
              ...message,
              _coreKey: coreKeyHex,
              _index: i,
            })
          }
        } catch (error) {
          if (strict) throw error
          break
        }
      }
    }

    // Sort first so a duplicate keeps its earliest copy (§4.5).
    allMessages.sort(compareChannelHistoryEntries)
    const seen = new Set()
    const unique = allMessages.filter(m => {
      // Shown messages are all signed: (author, id) is unique (§4.5).
      const key =
        m.type === 'message'
          ? `message:${m.author}:${m.clientMessageId}`
          : getChannelHistoryDedupeKey(m)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    this.#applyChannelMemberProfileEntries(channel, unique, { save: true })

    return unique.filter(message => !isChannelMemberProfileEventEntry(message))
  }

  /**
   * Writes a message a client signed (docs/protocol/v2/signatures.md §4.6).
   * @param {string} channelKeyInput - 公开频道 ID，或本地句柄
   * @param {{ body: object, device: string, cert: string, sig: string }} signed
   * @param {object} [options]
   * @param {string} [options.ownerAddress] - 已认证账号；须等于 body.author
   * @returns {Promise<object>}
   */
  async sendMessage(channelKeyInput, signed, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelKeyInput, options.ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, options.ownerAddress)
    return this.#enqueueChannelWrite(channel.channelKey, () =>
      this.#writeSignedMessage(channel.channelKey, signed, options)
    )
  }

  async #writeSignedMessage(channelKey, signed, options) {
    const channel = this.#resolveChannel(channelKey, options.ownerAddress)
    const error = signedMessageError(signed, { channelId: channel.channelKey })
    if (error) throw new ValidationError(`Invalid signed message: ${error}`)
    const { body } = signed
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    if (ownerAddress && body.author !== ownerAddress) {
      throw new PermissionError('message author must match logged-in user')
    }

    const index = await this.#refreshChannelHistoryIndex(channel, {
      strict: true,
    })
    const existing = index.byClientId.get(`${body.author}:${body.id}`)
    if (existing) {
      if (existing._bodyJson !== canonicalJson(body)) {
        throw new ConflictError(
          'clientMessageId already identifies another message'
        )
      }
      const message = { ...existing }
      delete message._coreKey
      delete message._index
      delete message._bodyJson
      return this.#normalizeChannelMessageForResponse(
        channel.channelKey,
        message
      )
    }

    if (
      this.#upsertChannelMember(channel, {
        ownerAddress: body.author,
        displayName: body.authorName,
        ...(hasOwnProperty(body, 'avatar') ? { avatar: body.avatar } : {}),
      })
    ) {
      this.#saveChannelsMetadata()
    }

    const entry = buildSignedEntry(
      signed,
      await this.#getNextChannelMessageTimestamp(channel)
    )
    await this.#appendLocalChannelEntry(channel, entry)
    const message = readSignedMessageEntry(entry, channel.channelKey)
    channel.lastMessageAt = new Date(message.timestamp).toISOString()
    this.#saveChannelsMetadata()
    return this.#normalizeChannelMessageForResponse(channel.channelKey, message)
  }

  async #appendLocalChannelEntry(channel, entry) {
    const localKeyHex = this.#channelLocalCoreKey.get(channel.channelKey)
    const coresMap = this.#channelCores.get(channel.channelKey)
    const core = localKeyHex && coresMap ? coresMap.get(localKeyHex) : null
    if (!core) {
      throw new Error('频道未初始化或无可写 core')
    }
    try {
      await core.append(entry)
    } catch (err) {
      if (!this.#isRecoverableChannelAppendError(err)) {
        throw err
      }
      const reopenedCore = await this.#reopenChannelLocalWriter(channel, {
        forceNamedWriter: this.#isReadOnlySessionError(err),
      })
      await reopenedCore.append(entry)
    }
  }

  async #enqueueChannelWrite(key, write) {
    const previous = this.#channelMessageQueues.get(key) || Promise.resolve()
    const pending = previous.then(write)
    const completed = pending.then(
      () => {},
      () => {}
    )
    this.#channelMessageQueues.set(key, completed)
    try {
      return await pending
    } finally {
      if (this.#channelMessageQueues.get(key) === completed) {
        this.#channelMessageQueues.delete(key)
      }
    }
  }

  /**
   * 获取频道内在线用户
   * @param {string} channelKeyInput - 内部频道 key，或本地唯一短频道 ID
   * @returns {Array<{ peerId: string, authorName: string, lastSeen: number, memberAddresses: string[] }>}
   */
  /**
   * Public channel ID (64 hex) for a handle or ID the caller is a member of.
   * WebSocket subscriptions use it because engine events carry it.
   */
  resolveChannelKey(channelInput, options = {}) {
    this.#ensureInitialized()
    this.#assertChannelMember(channelInput, options.ownerAddress)
    return this.#resolveChannel(channelInput, options.ownerAddress).channelKey
  }

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

  /**
   * Writes a member profile the client signed (signatures.md §4.2, §6).
   * @param {{ body: object, device: string, cert: string, sig: string }} signed
   */
  async updateChannelMemberProfile(channelKeyInput, signed, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    this.#assertChannelMember(channelKeyInput, ownerAddress)
    const channel = this.#resolveChannel(channelKeyInput, ownerAddress)
    const error = signedProfileError(signed, { channelId: channel.channelKey })
    if (error) throw new ValidationError(`Invalid signed profile: ${error}`)
    if (ownerAddress && signed.body.author !== ownerAddress) {
      throw new PermissionError(
        'member profile author must match logged-in user'
      )
    }
    const author = signed.body.author
    return this.#enqueueChannelWrite(channel.channelKey, async () => {
      const entry = buildSignedEntry(
        signed,
        await this.#getNextChannelMessageTimestamp(channel)
      )
      // Applying fails for a createdAt too far ahead; refuse it unwritten.
      const profileEvent = readSignedProfileEntry(entry, channel.channelKey)
      if (!this.#normalizeChannelMemberProfileEvent(profileEvent)) {
        throw new ValidationError('createdAt is too far ahead')
      }
      await this.#appendLocalChannelEntry(channel, entry)
      const event = this.#applyChannelMemberProfileEvent(
        channel,
        profileEvent,
        {
          save: true,
          emit: true,
        }
      )
      return {
        success: true,
        member: this.#getChannelMembers(channel).find(
          member => member.address === author
        ),
        event,
      }
    })
  }

  /**
   * 获取显示名
   * @returns {string|null}
   */
  getDisplayName() {
    try {
      const config = loadChannelConfig(this.#options.dataPath)
      return config.displayName || null
    } catch {}
    return null
  }

  /**
   * 设置显示名
   * @param {string} name - 显示名
   */
  setDisplayName(name) {
    try {
      const configPath = getChannelConfigPath(this.#options.dataPath)
      const config = loadChannelConfig(this.#options.dataPath)
      config.displayName = name.trim()
      writeMetadataFile(configPath, JSON.stringify(config, null, 2))
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

    const resolvedKey = resolveChannelHandle(value)?.channelKey
    channel = this.#channels.find(
      c => c.channelId === value || c.channelKey === resolvedKey
    )
    if (channel && (!owner || this.#channelHasMember(channel, owner))) {
      return channel
    }
    throw new Error('频道不存在')
  }

  async #createLocalChannel(resolved, type = 'personal', options = {}) {
    const channelInfo = {
      channelId: resolved.handle,
      channelKey: resolved.channelKey,
      name: resolved.handle,
      secretKey: b4a.toString(resolved.key, 'hex'),
      kind: resolved.kind,
      type: String(type || 'personal').trim() || 'personal',
      createdAt: options.createdAt || new Date().toISOString(),
      lastMessageAt: options.lastMessageAt || '',
      writerGeneration: 0,
      localWriterCoreKey: '',
      writerCoreKeys: uniqueStrings(options.writerCoreKeys),
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
    this.#invalidateChannelTopicMap()
    await this.#openChannelRuntime(channelInfo)
    await this.#joinChannelDiscoveryTopics(channelInfo)
    this.#saveChannelsMetadata()
    this.#broadcastChannelHello()
    return channelInfo
  }

  async #openChannelRuntime(channel) {
    const ns = this.#store.namespace(`channel-${channel.channelKey}`)
    const previousLocalWriterCoreKey = channel.localWriterCoreKey || ''
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
    const localWriterChanged = channel.localWriterCoreKey !== localWriterCoreKey
    channel.localWriterCoreKey = localWriterCoreKey
    channel.writerCoreKeys = uniqueStrings([
      ...(Array.isArray(channel.writerCoreKeys) ? channel.writerCoreKeys : []),
      previousLocalWriterCoreKey,
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
    if (localWriterChanged) {
      this.#saveChannelsMetadata()
      this.#broadcastChannelHello()
    }
  }

  async #mergeChannelWriterCoreKeys(channel, writerCoreKeys = []) {
    const nextKeys = uniqueStrings(writerCoreKeys)
    if (nextKeys.length === 0) return false

    const previous = new Set(channel.writerCoreKeys || [])
    const remoteKeysToOpen = []
    let changed = false
    for (const writerCoreKey of nextKeys) {
      if (!previous.has(writerCoreKey)) {
        previous.add(writerCoreKey)
        changed = true
      }
      if (writerCoreKey !== this.#channelLocalCoreKey.get(channel.channelKey)) {
        remoteKeysToOpen.push(writerCoreKey)
      }
    }
    if (changed) {
      channel.writerCoreKeys = [...previous]
      this.#saveChannelsMetadata()
    }
    for (const writerCoreKey of remoteKeysToOpen) {
      await this.#openRemoteChannelCore(channel.channelKey, writerCoreKey)
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
      this.#invalidateChannelTopicMap()
    }
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
      kind: channel.kind,
      public: channel.kind === 'public',
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
    const displayName = normalizeChannelDisplayName(
      options.displayName,
      address
    )
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
      if (
        hasDisplayName &&
        displayName &&
        existing.displayName !== displayName
      ) {
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

    const member = this.#getChannelMembers(channel).find(
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
        const raw = await core.get(i, { wait: false })
        if (raw === null) break
        const entry = readSignedProfileEntry(raw, channel.channelKey)
        if (entry) entries.push(entry)
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
        tag:
          member?.tag === null ? null : normalizeLocalizedChatTag(member?.tag),
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

  /**
   * 增量扫描各 writer core 的新条目，维护最大时间戳和 clientMessageId 索引，
   * 避免每次发送都全量读取频道历史。
   */
  async #refreshChannelHistoryIndex(channel, { strict = false } = {}) {
    const channelKey = channel.channelKey
    let index = this.#channelHistoryIndex.get(channelKey)
    if (!index) {
      index = {
        scanned: new Map(),
        maxTimestamp: 0,
        timestamps: [],
        byClientId: new Map(),
      }
      this.#channelHistoryIndex.set(channelKey, index)
    }
    const coresMap = this.#channelCores.get(channelKey)
    if (!coresMap) return index

    for (const [coreKeyHex, core] of coresMap) {
      let i = index.scanned.get(coreKeyHex) || 0
      for (; i < core.length; i++) {
        let entry
        try {
          entry = await core.get(i, { wait: false })
        } catch (error) {
          if (strict) throw error
          break
        }
        // Stop at the first block not held locally; it is scanned again
        // on the next call.
        if (entry === null) break
        const message = this.#decodeChannelEntry(entry, channelKey)
        if (!message) continue
        index.timestamps.push(Number(message.timestamp) || 0)
        if (message.type === 'message') {
          const key = `${message.author}:${message.clientMessageId}`
          const candidate = {
            ...message,
            _coreKey: coreKeyHex,
            _index: i,
            _bodyJson: canonicalJson(entry.body),
          }
          const current = index.byClientId.get(key)
          if (
            !current ||
            compareChannelHistoryEntries(candidate, current) < 0
          ) {
            index.byClientId.set(key, candidate)
          }
        }
      }
      index.scanned.set(coreKeyHex, i)
    }
    return index
  }

  /**
   * ts = max(now, largest seen ts + 1), where only ts ≤ now + 5 min count:
   * a remote clock far ahead must not drag ours (§4.5). Future ts wait in
   * the index until they are no longer too far ahead.
   */
  async #getNextChannelMessageTimestamp(channel) {
    const index = await this.#refreshChannelHistoryIndex(channel)
    const now = Date.now()
    const limit = now + SIGNED_TS_FUTURE_LIMIT_MS
    index.timestamps = index.timestamps.filter(ts => {
      if (ts > limit) return true
      index.maxTimestamp = Math.max(index.maxTimestamp, ts)
      return false
    })
    return Math.max(now, index.maxTimestamp + 1)
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
    const clientMessageId = normalizeClientMessageId(
      baseMessage.clientMessageId
    )
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
    const info = getCidInfo(cid)
    return {
      ...info,
      driveName: cidDriveName(this.#cidDriveSecret, info.topicHex),
    }
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

  #formatAccountFileForBackup(file) {
    const cid = String(file?.cid || '').trim()
    if (!cid) return null
    const { driveName } = this.#getCidInfo(cid)
    const updatedAt = getSyncTimestamp(
      file.updatedAt || file.syncUpdatedAt || file.publishedAt
    )
    const record = {
      cid,
      fileName: sanitizeFilename(file.fileName || cid),
      driveName,
      size: Number(file.size) || 0,
      source: String(file.source || 'published'),
      publishedAt:
        typeof file.publishedAt === 'string'
          ? file.publishedAt
          : new Date(updatedAt).toISOString(),
      starred: Boolean(file.starred),
      updatedAt,
      ...(file.libraryVisible === false ? { libraryVisible: false } : {}),
    }
    if (file.kind === 'collection') {
      record.kind = 'collection'
      record.fileCount = Number(file.fileCount) || 0
    }
    return record
  }

  #formatAccountChannelForBackup(channel, ownerAddress) {
    const owner = normalizeOwnerAddress(ownerAddress)
    if (!channel || !owner || !this.#channelHasMember(channel, owner)) {
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
    const hasTag = hasOwnProperty(record, 'tag')
    const tagPatch = normalizeChatMemberTagPatch(record.tag, hasTag)
    if (tagPatch.action === 'invalid') return null
    const updatedAt = getSyncTimestamp(
      record.updatedAt || record.syncUpdatedAt,
      timestamp
    )
    const profile = {
      displayName: normalizeChannelDisplayName(record.displayName, owner),
      avatar: normalizeChannelAvatar(record.avatar),
      updatedAt,
    }
    if (tagPatch.action === 'set') profile.tag = tagPatch.tag
    if (tagPatch.action === 'clear') profile.tag = null
    return profile
  }

  #mergeAccountProfileRecord(ownerAddress, record, options = {}) {
    const owner = normalizeOwnerAddress(ownerAddress)
    const profile = this.#normalizeAccountProfileRecord(owner, record)
    if (!profile) return { changed: false, skipped: true }
    const existing = this.#accountMetadata.profiles?.[owner]
    if (
      existing &&
      !hasOwnProperty(profile, 'tag') &&
      hasOwnProperty(existing, 'tag')
    ) {
      profile.tag = existing.tag
    }
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
      JSON.stringify(existing.tag) === JSON.stringify(profile.tag) &&
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

  #normalizeAccountFileRecord(record) {
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
      driveName,
      size: Number(record.size) || 0,
      source: String(record.source || 'synced'),
      publishedAt:
        typeof record.publishedAt === 'string'
          ? record.publishedAt
          : new Date(updatedAt).toISOString(),
      starred: Boolean(record.starred),
      updatedAt,
      ...(record.libraryVisible === false ? { libraryVisible: false } : {}),
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

  #mergeAccountFileRecord(ownerAddress, record) {
    const owner = normalizeOwnerAddress(ownerAddress)
    const normalized = this.#normalizeAccountFileRecord(record)
    if (!owner || !normalized) {
      return { changed: false, added: false, updated: false }
    }

    const publishedFiles = [...this.#getPublishedBucket(owner)]
    const publishedIndex = publishedFiles.findIndex(
      file => file.cid === normalized.cid
    )
    const existingActive =
      publishedIndex === -1 ? null : publishedFiles[publishedIndex]
    const existingUpdatedAt = this.#getRecordUpdatedAt(existingActive)
    if (normalized.updatedAt <= existingUpdatedAt) {
      return { changed: false, added: false, updated: false }
    }

    const localHolding = this.#holdings.find(
      holding => holding.cid === normalized.cid
    )
    const localSource = localHolding?.source || normalized.source
    const wasKnown = Boolean(existingActive)

    const nextRecord = {
      fileName: normalized.fileName,
      cid: normalized.cid,
      driveName: normalized.driveName,
      size: normalized.size,
      source: localSource,
      publishedAt: normalized.publishedAt,
      starred: normalized.starred,
      syncUpdatedAt: normalized.updatedAt,
      ...(normalized.libraryVisible === false ? { libraryVisible: false } : {}),
    }
    if (normalized.kind === 'collection') {
      nextRecord.kind = 'collection'
      nextRecord.fileCount = Number(normalized.fileCount) || 0
    }
    if (publishedIndex === -1) publishedFiles.push(nextRecord)
    else publishedFiles[publishedIndex] = nextRecord

    this.#setPublishedBucket(owner, publishedFiles)
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
    const resolved = resolveChannelHandle(record.channelId)
    if (!resolved) {
      return { changed: false, added: false, updated: false }
    }
    const { channelKey } = resolved

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
        channelId: resolved.handle,
        channelKey,
        name: resolved.handle,
        secretKey: b4a.toString(resolved.key, 'hex'),
        kind: resolved.kind,
        createdAt:
          typeof record.createdAt === 'string'
            ? record.createdAt
            : new Date(updatedAt).toISOString(),
        lastMessageAt:
          typeof record.lastMessageAt === 'string' ? record.lastMessageAt : '',
        type: String(record.type || 'personal').trim() || 'personal',
        writerGeneration: 0,
        localWriterCoreKey: '',
        writerCoreKeys: uniqueStrings(record.writerCoreKeys),
        members: [],
        syncUpdatedAt: updatedAt,
      }
      this.#channels.push(channel)
      this.#invalidateChannelTopicMap()
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
        ...(hasOwnProperty(record.member, 'tag')
          ? { tag: record.member.tag }
          : {}),
      })
    ) {
      changed = true
    }

    channel.remarks = channel.remarks || {}
    // 缺少 remark/pinned 字段表示"没有意见"（例如新设备首次发布时的空值），保留本地设置。
    if (hasOwnProperty(record, 'remark')) {
      const remark = String(record.remark || '').slice(0, 50)
      if (remark) channel.remarks[owner] = remark
      else delete channel.remarks[owner]
    }

    channel.pinnedBy = channel.pinnedBy || {}
    if (hasOwnProperty(record, 'pinned')) {
      if (record.pinned) channel.pinnedBy[owner] = true
      else delete channel.pinnedBy[owner]
    }

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
          ...(hasOwnProperty(profile, 'tag') ? { tag: profile.tag } : {}),
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
            this.emit('holding:resume', {
              cid: holding.cid,
              topic: holding.topic,
              driveName: holding.driveName,
              status: 'checking',
            })
            try {
              await this.#migrateLegacyCidDrive(holding)
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
                this.emit('holding:resume', {
                  cid: holding.cid,
                  topic: holding.topic,
                  driveName: holding.driveName,
                  status: 'error',
                  error: 'Local CID content missing',
                  code: 'LOCAL_CONTENT_MISSING',
                })
                return
              }
              await this.#joinCidTopicInternal(holding.cid)
              this.emit('holding:resume', {
                cid: holding.cid,
                topic: holding.topic,
                driveName: holding.driveName,
                status: 'active',
              })
              console.log(`[MostBox] Rejoined CID topic: ${holding.cid}`)
            } catch (err) {
              this.#setSeedState(holding.cid, {
                status: 'error',
                topic: holding.topic,
                driveName: holding.driveName,
                error: err.message,
              })
              this.emit('holding:resume', {
                cid: holding.cid,
                topic: holding.topic,
                driveName: holding.driveName,
                status: 'error',
                error: err.message,
                code: err.code || 'UNKNOWN',
              })
            }
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

  // One-time move from the v1 shared-key drive. Only content that recomputes
  // to its CID is copied; anything else stays missing and reports an error.
  async #migrateLegacyCidDrive(holding) {
    const { cid } = holding
    const driveKey = '/' + cid
    const own = await this.#getOrCreateDrive(this.#getCidInfo(cid).driveName)
    if (await this.#hasLocalDriveContent(own, driveKey)) return

    const legacy = new Hyperdrive(
      this.#store.namespace(getCidInfo(cid).driveName)
    )
    try {
      await legacy.ready()
      if (!(await this.#hasLocalDriveContent(legacy, driveKey))) return
      if (holding.kind === 'collection') {
        await this.#copyUnixfsBlocks(legacy, own, cid)
      } else {
        const { cid: actual } = await calculateCid(
          legacy.createReadStream(driveKey, { wait: false })
        )
        if (actual.toString() !== cid) return
        await pipeline(
          legacy.createReadStream(driveKey, { wait: false }),
          own.createWriteStream(driveKey)
        )
      }
      await legacy.clear(driveKey).catch(() => {})
      console.log(`[MostBox] Migrated ${cid} to its own seed drive`)
    } catch (err) {
      console.warn(`[MostBox] Failed to migrate ${cid}:`, err.message)
    } finally {
      await legacy.close().catch(() => {})
    }
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

  async #joinCidTopicInternal(cid) {
    const { topic, topicHex, driveName } = this.#getCidInfo(cid)
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

      const discovery = this.#swarm.join(topic, CID_TOPIC_JOIN_OPTIONS)

      this.#fileDiscoveries.set(cid, {
        discovery,
        topic: topicHex,
        driveName,
        server: true,
        client: true,
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
    for (const [joinedCid, discovery] of this.#fileDiscoveries) {
      if (discovery.topic === topicHex) cid = joinedCid
    }
    if (!cid || !this.#holdings.some(holding => holding.cid === cid)) return
    const localContent = await this.#getLocalCidContent(cid, {
      public: true,
      allowHoldingFallback: true,
    })
    if (localContent) peer.have(topic, localContent.drive.key)
  }

  /**
   * Waits for a peer that offers a drive with /<cid>. Keys in `triedKeys` are
   * skipped, and every returned key is added to it. The caller closes the
   * returned read-only drive.
   */
  async #waitForRemoteCidDrive(cid, timeout, options = {}) {
    const { triedKeys = new Set(), taskId = null, taskState = null } = options
    const { topic, topicHex } = this.#getCidInfo(cid)
    // This node's own drive is only written after verification; it is tried
    // first, is not closed by the caller, and goes through the same CID check.
    const own = await this.#getOrCreateDrive(this.#getCidInfo(cid).driveName)
    const ownKeyHex = b4a.toString(own.key, 'hex')
    if (
      !triedKeys.has(ownKeyHex) &&
      (await this.#hasLocalDriveContent(own, '/' + cid))
    ) {
      triedKeys.add(ownKeyHex)
      const entry = await own.entry('/' + cid, { wait: false })
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
        if (taskState?.aborted) throw new Error('Download cancelled')
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
          this.#fileDiscoveries
            .get(cid)
            ?.discovery.refresh()
            .catch(() => {})
        }
        if (!keyHex) {
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
            '/' + cid,
            Math.min(STREAM_READ_TIMEOUT, deadline - Date.now()),
            taskId,
            taskState
          )
          if (entry) return { drive, entry, keyHex }
        } catch (err) {
          if (taskState?.aborted) {
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

  async #reopenDrive(name, options = { server: true, client: false }) {
    const staleDrive = this.#drives.get(name)
    if (staleDrive) {
      this.#drives.delete(name)
      await staleDrive.close().catch(() => {})
    }
    this.#drivePromises.delete(name)
    return this.#getOrCreateDrive(name, options)
  }

  async #resetDriveAfterPublishTimeout(
    name,
    staleDrive,
    options = { server: true, client: false }
  ) {
    const drive = staleDrive || this.#drives.get(name)
    this.#drives.delete(name)
    this.#drivePromises.delete(name)

    if (drive) {
      const resetPromise = drive.close()
      resetPromise.catch(() => {})
      let timeoutId
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const err = new Error(`Timed out while resetting drive ${name}`)
          err.code = 'PUBLISH_DRIVE_RESET_TIMEOUT'
          reject(err)
        }, PUBLISH_DRIVE_RESET_TIMEOUT)
        timeoutId.unref?.()
      })

      try {
        await Promise.race([resetPromise, timeoutPromise])
      } finally {
        clearTimeout(timeoutId)
      }
    }

    return this.#getOrCreateDrive(name, options)
  }

  async #writeDriveBuffer(drive, driveKey, buffer) {
    const timeout = this.#getPublishBufferWriteTimeout(buffer.length)
    if (!Number.isFinite(timeout) || timeout <= 0) {
      await drive.put(driveKey, buffer)
      return
    }

    const writePromise = drive.put(driveKey, buffer)
    writePromise.catch(() => {})
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(this.#createPublishWriteTimeoutError(driveKey))
      }, timeout)
      timeoutId.unref?.()
    })

    try {
      await Promise.race([writePromise, timeoutPromise])
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async #writeDriveFile(drive, driveKey, content, cleanPath) {
    const bufferWriteLimit = Number(this.#options.publishBufferWriteLimit)
    if (!Buffer.isBuffer(content)) {
      const stat = await fs.promises.stat(cleanPath)
      if (
        Number.isFinite(bufferWriteLimit) &&
        bufferWriteLimit > 0 &&
        stat.size <= bufferWriteLimit
      ) {
        await this.#writeDriveBuffer(
          drive,
          driveKey,
          await fs.promises.readFile(cleanPath)
        )
        return
      }
    }

    const ws = drive.createWriteStream(driveKey)
    const streams = [ws]
    const watchdog = this.#createPublishWriteWatchdog(streams, driveKey)
    const resetWatchdog = () => watchdog.reset()

    if (Buffer.isBuffer(content)) {
      const chunks = async function* bufferChunks() {
        let offset = 0
        while (offset < content.length) {
          watchdog.reset()
          const chunk = content.slice(offset, offset + FILE_WRITE_CHUNK_SIZE)
          offset += chunk.length
          yield chunk
        }
      }
      const rs = Readable.from(chunks())
      streams.push(rs)

      const writePromise = pipeline(rs, ws)
      try {
        await Promise.race([writePromise, watchdog.promise])
      } catch (err) {
        ws.destroy()
        rs.destroy?.()
        throw err
      } finally {
        writePromise.catch(() => {})
        watchdog.stop()
      }
      return
    }

    const rs = fs.createReadStream(cleanPath)
    streams.push(rs)
    rs.on('data', resetWatchdog)
    rs.on('end', resetWatchdog)
    const writePromise = pipeline(rs, ws)
    try {
      await Promise.race([writePromise, watchdog.promise])
    } catch (err) {
      ws.destroy()
      rs.destroy()
      throw err
    } finally {
      writePromise.catch(() => {})
      rs.off('data', resetWatchdog)
      rs.off('end', resetWatchdog)
      watchdog.stop()
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

  #setPublishedBucket(ownerAddress, records) {
    const ownerKey = this.#getOwnerKey(ownerAddress)
    const next = Array.isArray(records) ? records : []
    if (next.length === 0) {
      delete this.#publishedFiles[ownerKey]
    } else {
      this.#publishedFiles[ownerKey] = next
    }
  }

  #allPublishedRecords() {
    return Object.entries(this.#publishedFiles).flatMap(([owner, records]) =>
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
    return cids
  }

  #removeUserFromChannels(ownerAddress) {
    const normalizedOwner = normalizeOwnerAddress(ownerAddress)
    if (!normalizedOwner) return

    const previousChannelCount = this.#channels.length
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
    if (this.#channels.length !== previousChannelCount) {
      this.#invalidateChannelTopicMap()
    }
  }

  async #clearLocalCidContent(cid, driveName) {
    try {
      const drive = await this.#getOrCreateDrive(driveName)
      // Hyperdrive metadata is replicated; del() would publish a tombstone to peers.
      await drive.clear('/' + cid)
    } catch {
      // Content may not exist locally.
    }
  }

  async #cleanupUnreferencedCids(cids) {
    let removedReplicas = 0
    for (const cid of cids) {
      if (await this.#hasPublishedContentReference(cid)) continue
      const driveName = this.#getCidInfo(cid).driveName
      await this.#clearLocalCidContent(cid, driveName)
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

    this.#setPublishedBucket(ownerAddress, [])
    this.#removeUserFromChannels(ownerAddress)
    this.#savePublishedMetadata()
    this.#saveChannelsMetadata()

    const removedReplicas = await this.#cleanupUnreferencedCids(affectedCids)
    return {
      removedFiles,
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

  #getUsedBytes() {
    return this.#holdings.reduce(
      (sum, h) => sum + (h.kind === 'collection' ? 0 : h.size || 0),
      0
    )
  }

  #checkCapacity(additionalBytes, reservations = []) {
    const release = this.#reserveCapacity(additionalBytes, reservations)
    release()
  }

  #reserveCapacity(additionalBytes, reservations = []) {
    let result
    try {
      result = this.#storageReservations.reserve({
        usedBytes: this.#getUsedBytes(),
        capacityBytes: this.#options.capacityBytes,
        logicalBytes: additionalBytes,
        reservations,
      })
    } catch (err) {
      console.warn(
        '[MostBox] Failed to check filesystem capacity:',
        err.message
      )
      throw new StorageCapacityError(
        'Unable to determine available disk space',
        {
          reason: 'DISK_SPACE_CHECK_FAILED',
        }
      )
    }

    if (!result.logical.accepted) {
      const accountedBytes =
        result.logical.usedBytes + result.logical.pendingBytes
      const usedGB = (accountedBytes / (1024 * 1024 * 1024)).toFixed(2)
      const capacityGB = (
        result.logical.capacityBytes /
        (1024 * 1024 * 1024)
      ).toFixed(2)
      throw new StorageCapacityError(
        `Storage capacity exceeded: used ${usedGB} GB, capacity ${capacityGB} GB`,
        {
          reason: 'CONFIGURED_CAPACITY_EXCEEDED',
          usedBytes: result.logical.usedBytes,
          pendingBytes: result.logical.pendingBytes,
          additionalBytes,
          capacityBytes: result.logical.capacityBytes,
        }
      )
    }

    const insufficientVolume = result.volumes.find(volume => !volume.accepted)
    if (insufficientVolume) {
      throw new StorageCapacityError(
        `Insufficient disk space: ${formatFileSize(insufficientVolume.requiredBytes)} required, ${formatFileSize(insufficientVolume.availableBytes)} available`,
        {
          reason: 'INSUFFICIENT_DISK_SPACE',
          requiredBytes: insufficientVolume.requiredBytes,
          availableBytes: insufficientVolume.availableBytes,
          pendingBytes: insufficientVolume.pendingBytes,
          requestedBytes: insufficientVolume.requestedBytes,
          labels: insufficientVolume.labels,
        }
      )
    }

    return result.release
  }

  async #getOrCreateDrive(name, _options = { server: true, client: false }) {
    if (this.#drives.has(name)) return this.#drives.get(name)
    const openTimeoutMs = Number(_options.openTimeoutMs)
    let pending = this.#drivePromises.get(name)

    if (!pending) {
      pending = (async () => {
        const drive = new Hyperdrive(this.#store.namespace(name))
        await drive.ready()
        this.#drives.set(name, drive)
        return drive
      })()
      pending.catch(() => {})
      this.#drivePromises.set(name, pending)
      pending
        .finally(() => {
          if (this.#drivePromises.get(name) === pending) {
            this.#drivePromises.delete(name)
          }
        })
        .catch(() => {})
    }

    return this.#withTimeout(
      pending,
      openTimeoutMs,
      `Timed out while opening drive ${name}`,
      'DRIVE_OPEN_TIMEOUT'
    )
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

  #saveMetadataFile(label, filePath, data) {
    try {
      writeMetadataFile(filePath, data)
    } catch (err) {
      console.error(
        `[MostBox] Failed to save ${label} metadata at ${filePath}:`,
        err.message
      )
      throw new PersistenceError(`Failed to save ${label} metadata`, {
        metadata: label,
      })
    }
  }

  #loadPublishedMetadata() {
    return readMetadataFile(this.#getMetadataPath(), {
      label: 'published files',
      fallback: () => ({}),
      parse: data => {
        const buckets = parseMetadataBuckets(data, 'published files')
        for (const records of Object.values(buckets)) {
          for (const record of records) {
            record.starred = record.starred || false
          }
        }
        return buckets
      },
    })
  }

  #savePublishedMetadata() {
    this.#saveMetadataFile(
      'published files',
      this.#getMetadataPath(),
      JSON.stringify(this.#publishedFiles, null, 2)
    )
    this.#scheduleAccountSyncReconcile()
  }

  #loadHoldingsMetadata() {
    return readMetadataFile(this.#getHoldingsMetadataPath(), {
      label: 'node holdings',
      fallback: () => [],
      parse: data => {
        const parsed = JSON.parse(data)
        if (!Array.isArray(parsed)) {
          throw new TypeError('node holdings metadata must be an array')
        }
        return parsed.map(record => this.#normalizeHolding(record))
      },
    })
  }

  #saveHoldingsMetadata() {
    this.#saveMetadataFile(
      'node holdings',
      this.#getHoldingsMetadataPath(),
      JSON.stringify(this.#holdings, null, 2)
    )
  }

  #loadTrashMetadata() {
    return readMetadataFile(this.#getTrashMetadataPath(), {
      label: 'trash',
      fallback: () => ({}),
      parse: data => parseMetadataBuckets(data, 'trash'),
    })
  }

  async #migrateLegacyTrashMetadata() {
    const trashPath = this.#getTrashMetadataPath()
    const backupPath = `${trashPath}${METADATA_BACKUP_SUFFIX}`
    if (!fs.existsSync(trashPath) && !fs.existsSync(backupPath)) return

    const trashBuckets = this.#loadTrashMetadata()
    const trashCount = this.#countBucketRecords(trashBuckets)
    console.log(`[MostBox] Migrating ${trashCount} legacy trash files`)

    try {
      for (const [ownerAddress, files] of Object.entries(trashBuckets)) {
        for (const file of files) {
          const fileRecord = cloneMetadataRecord(file, ownerAddress)
          const affectedCids = await this.#collectFileRecordCids(fileRecord, {
            ownerAddress: fileRecord.ownerAddress,
          })
          await this.#cleanupUnreferencedCids(affectedCids)
        }
      }
    } catch (err) {
      console.warn(
        '[MostBox] Failed to migrate legacy trash metadata; will retry on next start:',
        err.message
      )
      return
    }

    try {
      fs.rmSync(trashPath, { force: true })
      fs.rmSync(backupPath, { force: true })
      console.log('[MostBox] Removed legacy trash metadata')
    } catch (err) {
      console.warn(
        '[MostBox] Failed to remove legacy trash metadata; will retry on next start:',
        err.message
      )
    }
  }

  #loadAccountMetadata() {
    return readMetadataFile(this.#getAccountMetadataPath(), {
      label: 'account',
      fallback: () => ({ profiles: {} }),
      parse: data => {
        const parsed = parseMetadataObject(data, 'account')
        if (
          parsed.profiles !== undefined &&
          (!parsed.profiles ||
            typeof parsed.profiles !== 'object' ||
            Array.isArray(parsed.profiles))
        ) {
          throw new TypeError('account profiles metadata must be an object')
        }
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
      },
    })
  }

  #saveAccountMetadata() {
    this.#saveMetadataFile(
      'account',
      this.#getAccountMetadataPath(),
      JSON.stringify(this.#accountMetadata, null, 2)
    )
    this.#scheduleAccountSyncReconcile()
  }

  #saveChannelsMetadata() {
    this.#saveMetadataFile(
      'channels',
      getChannelsMetadataPath(this.#options.dataPath),
      serializeChannelsMetadata(this.#channels)
    )
    this.#scheduleAccountSyncReconcile()
  }

  #channelSecretKey(channelKey) {
    const channel = this.#channels.find(item => item.channelKey === channelKey)
    return channel?.secretKey ? b4a.from(channel.secretKey, 'hex') : null
  }

  #generateChannelDiscoveryKey(channelKey) {
    return channelTopics(this.#channelSecretKey(channelKey)).replication
  }

  #generateChannelChatDiscoveryKey(channelKey) {
    return channelTopics(this.#channelSecretKey(channelKey)).chat
  }

  #addChannelTopicMapping(topicMap, topic, channelIdInput) {
    const channelId = normalizeChannelId(channelIdInput)
    const [topicHex] = normalizeChannelScopeTopics([b4a.toString(topic, 'hex')])
    if (!channelId || !topicHex) return
    const channelIds = topicMap.get(topicHex) || new Set()
    channelIds.add(channelId)
    topicMap.set(topicHex, channelIds)
  }

  #invalidateChannelTopicMap() {
    this.#channelTopicMap = null
    this.#channelTopicMapVersion += 1
  }

  #getChannelTopicMap() {
    if (this.#channelTopicMap) return this.#channelTopicMap

    const topicMap = new Map()
    const channelsByKey = new Map(
      this.#channels.map(channel => [channel.channelKey, channel])
    )
    for (const [channelKey] of this.#channelChatDiscoveries) {
      const channel = channelsByKey.get(channelKey)
      if (!channel) continue
      this.#addChannelTopicMapping(
        topicMap,
        this.#generateChannelChatDiscoveryKey(channelKey),
        channel.channelKey
      )
    }
    this.#channelTopicMap = topicMap
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
    if (!record) return new Set()
    if (
      record.authorizedChannelIds &&
      record.authorizedChannelIdsVersion === this.#channelTopicMapVersion
    ) {
      return record.authorizedChannelIds
    }

    const topicMap = this.#getChannelTopicMap()
    const channelIds = new Set()
    for (const topicHex of record.authorizedTopics) {
      for (const channelId of topicMap.get(topicHex) || []) {
        channelIds.add(channelId)
      }
    }
    // Derived only from verified proofs; callers treat this Set as read-only.
    record.authorizedChannelIds = channelIds
    record.authorizedChannelIdsVersion = this.#channelTopicMapVersion
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
        `${JSON.stringify({
          type: 'channel-proof-challenge',
          version: CHANNEL_PROOF_VERSION,
          challenge: record.localChallenge,
        })}\n`
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
      }
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #isChannelAllowedForStream(stream, channelKey) {
    return this.#getAuthorizedChannelIds(stream).has(
      normalizeChannelKey(channelKey)
    )
  }

  #setupChannelAppendListener(core, channelKey) {
    let lastCoreLength = core.length
    core.on('append', async () => {
      if (core.length > lastCoreLength) {
        for (let i = lastCoreLength; i < core.length; i++) {
          try {
            const entry = this.#decodeChannelEntry(
              await core.get(i),
              channelKey
            )
            if (entry) {
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
    // Hellos can arrive back to back; open each remote core only once.
    const openingKey = `${channelKey}:${coreKeyHex}`
    if (this.#channelCoresOpening.has(openingKey)) return
    this.#channelCoresOpening.add(openingKey)

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
    } finally {
      this.#channelCoresOpening.delete(openingKey)
    }
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
      memberAddresses: this.#getChannelMemberAddresses(channel),
      writerCoreKeys: uniqueStrings([
        ...(channel.writerCoreKeys || []),
        this.#channelLocalCoreKey.get(channel.channelKey),
      ]),
    }))
    return buildChannelHelloMessages(
      {
        type: 'channel-hello',
        peerId: this.getNodeId(),
        authorName: this.getNodeId().slice(0, 4),
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
        stream.write(`${JSON.stringify({ type: 'channel-scope', topics })}\n`)
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
        stream.write(`${JSON.stringify(message)}\n`)
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

  #sendChannelPresence(stream, event) {
    if (!stream || stream.destroyed || stream.writableEnded || !event) {
      this.#removeChannelStream(stream)
      return false
    }
    const channelKey = normalizeChannelKey(event.channelKey || event.channelId)
    if (!this.#isChannelAllowedForStream(stream, channelKey)) return true
    try {
      stream.write(
        `${JSON.stringify(
          createChannelPresenceMessage(this.getNodeId(), event)
        )}\n`
      )
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #sendCurrentChannelPresence(stream) {
    for (const event of this.#channelPresence.listLocal()) {
      this.#sendChannelPresence(stream, event)
    }
  }

  #broadcastChannelPresence(event) {
    for (const stream of [...this.#channelStreams.keys()]) {
      this.#sendChannelPresence(stream, event)
    }
  }

  #sendChannelVoice(stream, event) {
    if (!stream || stream.destroyed || stream.writableEnded || !event) {
      this.#removeChannelStream(stream)
      return false
    }
    const channelKey = normalizeChannelKey(event.channelKey || event.channelId)
    if (!this.#isChannelAllowedForStream(stream, channelKey)) return true
    try {
      stream.write(
        `${JSON.stringify(
          createChannelVoiceMessage(this.getNodeId(), event)
        )}\n`
      )
      return true
    } catch {
      this.#removeChannelStream(stream)
      return false
    }
  }

  #broadcastChannelVoice(event) {
    for (const stream of [...this.#channelStreams.keys()]) {
      this.#sendChannelVoice(stream, event)
    }
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
      record.authorizedChannelIds = null
      this.#sendChannelHello(stream, { sendScope: false })
      this.#sendCurrentChannelPresence(stream)
    }
    return true
  }

  async #processChannelHelloMessage(stream, msg) {
    if (msg.type !== 'channel-hello') return null
    const peerId = String(msg.peerId || '').trim()
    if (!peerId || peerId === this.getNodeId()) return null

    const onlineChannels = []
    const remoteChannels = []
    const authorized = this.#getAuthorizedChannelIds(stream)
    for (const channel of Array.isArray(msg.channels) ? msg.channels : []) {
      if (!channel || typeof channel !== 'object') continue
      // v2: channelId on the wire is the 64-hex public channel ID.
      const channelKey = normalizeChannelKey(channel.channelId)
      if (!HEX_64_REGEX.test(channelKey) || !authorized.has(channelKey)) {
        continue
      }
      remoteChannels.push({
        channelKey,
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
        writerCoreKeys: uniqueStrings(
          Array.isArray(channel.writerCoreKeys) ? channel.writerCoreKeys : []
        )
          .filter(key => HEX_64_REGEX.test(key))
          .slice(0, MAX_HELLO_WRITER_CORE_KEYS),
      })
    }
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
          memberAddresses: remoteChannel.memberAddresses,
          lastSeen: Date.now(),
        })
      }
      onlineChannels.push({
        channelKey: localChannel.channelKey,
        channelId: localChannel.channelId,
        memberAddresses: remoteChannel.memberAddresses,
      })

      if (
        await this.#mergeChannelWriterCoreKeys(
          localChannel,
          remoteChannel.writerCoreKeys
        )
      ) {
        writerKeysChanged = true
      }
    }

    if (writerKeysChanged) this.#broadcastChannelHello()

    this.emit('channel:peer:online', {
      peerId,
      authorName: msg.authorName,
      channels: onlineChannels,
    })

    return peerId
  }

  #processChannelPresenceMessage(stream, msg) {
    const presence = normalizeRemoteChannelPresence(msg, this.getNodeId())
    if (!presence) return null
    const localChannel = this.#channels.find(
      channel => channel.channelKey === presence.channelKey
    )
    if (!localChannel) return null
    if (!this.#isChannelAllowedForStream(stream, localChannel.channelKey)) {
      return null
    }

    if (presence.status === 'online') {
      this.#channelPresence.join(localChannel, presence.options)
    } else if (presence.status === 'heartbeat') {
      this.#channelPresence.heartbeat(localChannel, presence.options)
    } else if (presence.status === 'profile') {
      this.#channelPresence.updateProfile(localChannel, presence.options)
    } else {
      this.#channelPresence.leave(localChannel.channelKey, presence.options)
    }

    return presence.peerId
  }

  #processChannelVoiceMessage(stream, msg) {
    const context = normalizeRemoteChannelFrame(
      msg,
      this.getNodeId(),
      'channel-voice'
    )
    if (!context) return null
    const localChannel = this.#channels.find(
      channel => channel.channelKey === context.channelKey
    )
    if (!localChannel) return null
    if (!this.#isChannelAllowedForStream(stream, localChannel.channelKey)) {
      return null
    }

    try {
      const event = normalizeChannelVoiceEvent(context.channelKey, msg, {
        timestamp: msg.timestamp,
      })
      this.emit('channel:voice', event)
      return context.peerId
    } catch {
      return null
    }
  }

  async #handleChannelConnection(conn, info = {}) {
    const stream = conn
    let connectedPeerId = null
    let readBuffer = Buffer.alloc(0)
    let closed = false
    this.#channelStreams.set(stream, {
      info,
      remoteClaimedTopics: new Set(),
      authorizedTopics: new Set(),
      authorizedChannelIds: null,
      authorizedChannelIdsVersion: -1,
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
    this.#accountSync?.attachStream(stream)

    stream.on('data', async data => {
      let lines
      try {
        const result = consumeChannelFrames(readBuffer, data)
        readBuffer = result.remainder
        lines = result.frames
      } catch (err) {
        console.warn(`[MostBox] Rejected channel data:`, err.message)
        stream.destroy()
        return
      }

      for (const line of lines) {
        if (!line) continue
        try {
          const message = JSON.parse(line)
          if (message?.type === ACCOUNT_HELLO_TYPE) {
            await this.#accountSync?.handleMessage(stream, message)
            continue
          }
          if (this.#processChannelScopeMessage(stream, message)) continue
          if (this.#processChannelProofChallengeMessage(stream, message)) {
            continue
          }
          if (this.#processChannelProofMessage(stream, message)) continue
          const peerId =
            message.type === 'channel-presence'
              ? this.#processChannelPresenceMessage(stream, message)
              : message.type === 'channel-voice'
                ? this.#processChannelVoiceMessage(stream, message)
                : await this.#processChannelHelloMessage(stream, message)
          if (peerId) connectedPeerId = peerId
        } catch (err) {
          console.warn(`[MostBox] Failed to process channel data:`, err.message)
        }
      }
    })

    const cleanup = () => {
      if (closed) return
      closed = true
      info?.removeListener?.('topic', handleTopic)
      this.#removeChannelStream(stream)
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
        this.#channelPresence.clearSource(`peer:${connectedPeerId}`)
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
    const timeoutMs = Math.max(0, Number(timeout) || 0)
    const deadline = startTime + timeoutMs
    let pollInterval = DOWNLOAD_POLL_INTERVAL_MIN
    let lastPeerCount = 0
    let lastStatus = ''
    let bootstrapNodesChecked = false
    let lastUpdateTime = 0

    try {
      const localEntry = await drive.entry(key, {
        update: false,
        wait: false,
      })
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
        const remaining = deadline - now
        if (remaining <= 0) return
        try {
          await this.#withTimeout(
            drive.update({ timeout: remaining, wait: true }),
            remaining,
            `Drive update timed out while waiting for ${key}`
          )
        } catch {}
      }
    }

    while (Date.now() < deadline) {
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

      const remaining = deadline - Date.now()
      if (remaining <= 0) break

      try {
        const entry = await this.#withTimeout(
          drive.entry(key, {
            update: false,
            timeout: remaining,
          }),
          remaining,
          `Drive entry lookup timed out for ${key}`
        )
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
            `[MostBox] Still waiting for peers... (elapsed: ${elapsed}s, timeout: ${timeoutMs / 1000}s)`
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

      const remainingAfterLookup = deadline - Date.now()
      if (remainingAfterLookup <= 0) break
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(pollInterval, remainingAfterLookup))
      )
    }

    console.log(
      `[MostBox] Timeout reached after ${timeoutMs / 1000}s, making final attempt...`
    )

    try {
      const entry = await drive.entry(key, {
        update: false,
        wait: false,
      })
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
    console.log(`[MostBox] - Timeout: ${timeoutMs / 1000}s`)

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
