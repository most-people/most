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
import { CID } from 'multiformats/cid'
import fs from 'node:fs'
import path from 'node:path'

import { calculateCid, parseMostLink, validateCidString } from './core/cid.js'
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
  DRIVE_SYNC_TIMEOUT,
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

function normalizeOwnerAddress(address) {
  const value = String(address || '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : ''
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
  #publishedFiles = []
  #holdings = []
  #trashFiles = []
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
  #channelPeers = new Map()

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
      `[MostBox] Loaded ${this.#publishedFiles.length} published files`
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
    console.log(`[MostBox] Loaded ${this.#trashFiles.length} trash files`)

    this.#channels = this.#loadChannelsMetadata()
    console.log(`[MostBox] Loaded ${this.#channels.length} channels`)

    for (const channel of this.#channels) {
      try {
        const ns = this.#store.namespace(`channel-${channel.name}`)
        const core = ns.get({
          key: b4a.from(channel.coreKey, 'hex'),
          valueEncoding: 'json',
        })
        await core.ready()
        const coreKeyHex = b4a.toString(core.key, 'hex')
        if (!this.#channelCores.has(channel.name)) {
          this.#channelCores.set(channel.name, new Map())
        }
        this.#channelCores.get(channel.name).set(coreKeyHex, core)
        this.#channelLocalCoreKey.set(channel.name, coreKeyHex)
        this.#channelPeers.set(channel.name, new Map())
        this.#setupChannelAppendListener(core, channel.name)

        const discoveryKey = b4a.from(channel.discoveryKey, 'hex')
        const chatDiscoveryKey = this.#generateChannelChatDiscoveryKey(
          channel.name
        )
        const appDiscovery = this.#swarm.join(discoveryKey, {
          server: true,
          client: true,
        })
        this.#channelDiscoveries.set(channel.name, appDiscovery)
        const chatDiscovery = this.#chatSwarm.join(chatDiscoveryKey, {
          server: true,
          client: true,
        })
        this.#channelChatDiscoveries.set(channel.name, chatDiscovery)
        console.log(`[MostBox] Rejoined channel: ${channel.name}`)
      } catch (err) {
        console.warn(
          `[MostBox] Failed to rejoin channel ${channel.name}:`,
          err.message
        )
      }
    }

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
    this.#channelPeers.clear()
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
   * @param {string|null} [options.localPath] - 持有记录中的本地路径
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
    const holdingLocalPath =
      options.localPath === undefined ? cleanPath : options.localPath

    // 检查相同内容是否已存在
    const existingIndex = this.#publishedFiles.findIndex(
      f => f.cid === cidString && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (existingIndex !== -1) {
      const existing = this.#publishedFiles[existingIndex]
      await this.#joinCidTopicInternal(cidString, {
        server: true,
        client: false,
      })
      this.#upsertHolding({
        cid: cidString,
        fileName: existing.fileName,
        size: fileSize,
        localPath: holdingLocalPath,
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
    this.#publishedFiles.push({
      fileName: safeFileName,
      cid: cidString,
      driveName: name,
      publishedAt: new Date().toISOString(),
      starred: false,
      ownerAddress,
    })
    this.#savePublishedMetadata()
    this.#upsertHolding({
      cid: cidString,
      fileName: safeFileName,
      size: fileSize,
      localPath: holdingLocalPath,
      driveName: name,
      source: 'published',
    })

    const result = {
      cid: cidString,
      link: `most://${cidString}?filename=${encodeURIComponent(safeFileName)}`,
      fileName: safeFileName,
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

      const existingFile = this.#publishedFiles.find(
        f => f.cid === cidString && this.#recordMatchesOwner(f, ownerAddress)
      )
      if (existingFile) {
        console.log(`[MostBox] File already exists: ${existingFile.fileName}`)
        const existingHolding = this.#holdings.find(
          item => item.cid === cidString
        )
        const existingSize = Number(existingFile.size)
        await this.#joinCidTopicInternal(cidString, {
          server: true,
          client: false,
        })
        this.#upsertHolding({
          cid: cidString,
          fileName: existingFile.fileName,
          size:
            existingHolding?.size ??
            (Number.isFinite(existingSize) ? existingSize : 0),
          localPath:
            existingHolding?.localPath || existingFile.localPath || null,
          driveName: existingFile.driveName || name,
          source: existingHolding?.source || 'published',
        })
        return {
          taskId,
          fileName: existingFile.fileName,
          alreadyExists: true,
        }
      }

      const linkFileName = parsed.fileName

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
        server: true,
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

        const result = {
          taskId,
          fileName: sanitizedFileName,
          savedPath: savePath,
        }

        // 将下载的文件添加到已发布文件列表（displayName 用原始文件名）
        const existingIndex = this.#publishedFiles.findIndex(
          f => f.cid === cidString && this.#recordMatchesOwner(f, ownerAddress)
        )
        if (existingIndex !== -1) {
          const existing = this.#publishedFiles[existingIndex]
          if (existing.fileName !== sanitizedFileName) {
            throw new Error(`文件已存在: ${existing.fileName}`)
          }
          existing.publishedAt = new Date().toISOString()
        } else {
          this.#publishedFiles.push({
            fileName: sanitizedFileName,
            cid: cidString,
            driveName: name,
            publishedAt: new Date().toISOString(),
            starred: false,
            ownerAddress,
          })
        }
        this.#savePublishedMetadata()
        const savedSize = totalBytes || fs.statSync(savePath).size
        this.#upsertHolding({
          cid: cidString,
          fileName: sanitizedFileName,
          size: savedSize,
          localPath: savePath,
          driveName: name,
          source: 'downloaded',
        })

        this.emit('download:success', result)
        return result
      }
    } finally {
      this.#activeDownloads.delete(taskId)
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
    const existingFile = this.#publishedFiles.find(
      f => f.cid === cidString && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (existingFile) {
      return {
        available: true,
        cid: cidString,
        fileName: existingFile.fileName,
        size: Number(existingFile.size) || null,
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
      server: true,
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
    let files = this.#publishedFiles
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    if (ownerAddress) {
      files = files.filter(f => this.#recordMatchesOwner(f, ownerAddress))
    }

    if (options.starred === true) {
      files = files.filter(f => f.starred === true)
    }

    return files.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}?filename=${encodeURIComponent(f.fileName)}`,
      publishedAt: f.publishedAt,
      starred: f.starred || false,
      ownerAddress: f.ownerAddress || '',
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
    const index = this.#publishedFiles.findIndex(
      f => f.cid === cid && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (index === -1) {
      throw new Error('File not found')
    }
    this.#publishedFiles[index].starred = !this.#publishedFiles[index].starred
    this.#savePublishedMetadata()
    return {
      cid,
      starred: this.#publishedFiles[index].starred,
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
    const index = this.#publishedFiles.findIndex(
      f => f.cid === cid && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (index !== -1) {
      const fileRecord = this.#publishedFiles[index]
      const holding = this.#holdings.find(item => item.cid === fileRecord.cid)

      this.#trashFiles.push({
        fileName: fileRecord.fileName,
        cid: fileRecord.cid,
        driveName:
          fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName,
        size: holding?.size ?? fileRecord.size ?? 0,
        localPath: holding?.localPath || fileRecord.localPath || null,
        source: holding?.source || 'published',
        publishedAt: fileRecord.publishedAt,
        starred: fileRecord.starred || false,
        ownerAddress: fileRecord.ownerAddress || ownerAddress,
        deletedAt: new Date().toISOString(),
      })
      this.#saveTrashMetadata()

      this.#publishedFiles.splice(index, 1)
      this.#savePublishedMetadata()

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
    const files = ownerAddress
      ? this.#trashFiles.filter(f => this.#recordMatchesOwner(f, ownerAddress))
      : this.#trashFiles
    return files.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}?filename=${encodeURIComponent(f.fileName)}`,
      publishedAt: f.publishedAt,
      starred: f.starred || false,
      ownerAddress: f.ownerAddress || '',
      deletedAt: f.deletedAt,
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
    const index = this.#trashFiles.findIndex(
      f => f.cid === cid && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (index === -1) {
      throw new Error('File not found in trash')
    }

    const fileRecord = this.#trashFiles[index]

    const parsedCid = CID.parse(fileRecord.cid)
    const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')
    const driveName = `drive-${hashHex}`

    this.#publishedFiles.push({
      fileName: fileRecord.fileName,
      cid: fileRecord.cid,
      driveName,
      publishedAt: fileRecord.publishedAt,
      starred: fileRecord.starred || false,
      ownerAddress: fileRecord.ownerAddress || ownerAddress,
    })
    this.#savePublishedMetadata()

    this.#trashFiles.splice(index, 1)
    this.#saveTrashMetadata()

    await this.#joinCidTopicInternal(fileRecord.cid, {
      server: true,
      client: false,
    })
    this.#upsertHolding({
      cid: fileRecord.cid,
      fileName: fileRecord.fileName,
      size: Number(fileRecord.size) || 0,
      localPath: fileRecord.localPath || null,
      driveName,
      source: fileRecord.source || 'published',
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
    const index = this.#trashFiles.findIndex(
      f => f.cid === cid && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (index !== -1) {
      const fileRecord = this.#trashFiles[index]
      const driveName =
        fileRecord.driveName || this.#getCidInfo(fileRecord.cid).driveName

      this.#trashFiles.splice(index, 1)
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
    const remainingTrash = []
    const removedTrash = []

    for (const fileRecord of this.#trashFiles) {
      if (ownerAddress && !this.#recordMatchesOwner(fileRecord, ownerAddress)) {
        remainingTrash.push(fileRecord)
        continue
      }
      removedTrash.push(fileRecord)
    }

    this.#trashFiles = remainingTrash
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
        ? this.#publishedFiles.filter(f =>
            this.#recordMatchesOwner(f, ownerAddress)
          ).length
        : this.#publishedFiles.length,
      trashCount: ownerAddress
        ? this.#trashFiles.filter(f =>
            this.#recordMatchesOwner(f, ownerAddress)
          ).length
        : this.#trashFiles.length,
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
    const index = this.#publishedFiles.findIndex(
      f => f.cid === cid && this.#recordMatchesOwner(f, ownerAddress)
    )
    if (index === -1) {
      throw new Error('File not found')
    }
    const safeFileName = sanitizeFilename(newFileName)
    this.#publishedFiles[index].fileName = safeFileName
    this.#publishedFiles[index].publishedAt = new Date().toISOString()
    this.#savePublishedMetadata()
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
    const updatedFiles = []

    for (const file of this.#publishedFiles) {
      if (
        file.fileName.startsWith(prefix) &&
        this.#recordMatchesOwner(file, ownerAddress)
      ) {
        const remainder = file.fileName.substring(prefix.length)
        const newFileName = sanitizeFilename(
          remainder ? newPath + '/' + remainder : newPath
        )
        file.fileName = newFileName
        file.publishedAt = new Date().toISOString()
        updatedFiles.push({
          cid: file.cid,
          fileName: file.fileName,
          link: `most://${file.cid}?filename=${encodeURIComponent(file.fileName)}`,
        })
      }
    }

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
      ? this.#publishedFiles.filter(f =>
          this.#recordMatchesOwner(f, ownerAddress)
        )
      : this.#publishedFiles
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

    for (const file of this.#publishedFiles) {
      const entry = ensure(file.ownerAddress)
      if (!entry) continue
      entry.fileCount += 1
      entry.cids.add(file.cid)
    }
    for (const file of this.#trashFiles) {
      const entry = ensure(file.ownerAddress)
      if (!entry) continue
      entry.trashCount += 1
      entry.cids.add(file.cid)
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

    const affectedCids = new Set()
    const beforeFiles = this.#publishedFiles.length
    const beforeTrash = this.#trashFiles.length

    this.#publishedFiles = this.#publishedFiles.filter(file => {
      if (this.#recordMatchesOwner(file, ownerAddress)) {
        affectedCids.add(file.cid)
        return false
      }
      return true
    })
    this.#trashFiles = this.#trashFiles.filter(file => {
      if (this.#recordMatchesOwner(file, ownerAddress)) {
        affectedCids.add(file.cid)
        return false
      }
      return true
    })
    this.#channels = this.#channels
      .map(channel => ({
        ...channel,
        members: Array.isArray(channel.members)
          ? channel.members.filter(
              member => normalizeOwnerAddress(member) !== ownerAddress
            )
          : [],
      }))
      .filter(channel => channel.members.length > 0)

    this.#savePublishedMetadata()
    this.#saveTrashMetadata()
    this.#saveChannelsMetadata()

    let removedReplicas = 0
    for (const cid of affectedCids) {
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

    return {
      ownerAddress,
      removedFiles: beforeFiles - this.#publishedFiles.length,
      removedTrashFiles: beforeTrash - this.#trashFiles.length,
      removedReplicas,
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

    return {
      close: () => {
        left.destroy()
        right.destroy()
      },
    }
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
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const fileRecord = this.#publishedFiles.find(
      f =>
        f.cid === cid &&
        (options.public || this.#recordMatchesOwner(f, ownerAddress))
    )
    if (!fileRecord) {
      throw new Error('File not found')
    }

    const drive = await this.#getDriveForFile(fileRecord)

    // Hyperdrive 中 key 为 '/' + cid
    const driveKey = '/' + cid
    const entry = await drive.entry(driveKey, {
      wait: true,
      timeout: DRIVE_ENTRY_TIMEOUT,
    })
    if (!entry || !entry.value) {
      throw new Error('File content not available')
    }

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

    const fileRecord = this.#publishedFiles.find(
      f =>
        f.cid === cid &&
        (options.public || this.#recordMatchesOwner(f, ownerAddress))
    )
    if (!fileRecord) {
      throw new Error('File not found')
    }

    const drive = await this.#getDriveForFile(fileRecord)

    const driveKey = '/' + cid
    const entry = await drive.entry(driveKey, {
      wait: true,
      timeout: DRIVE_ENTRY_TIMEOUT,
    })
    if (!entry || !entry.value || !entry.value.blob) {
      throw new Error('File content not available')
    }

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

  /**
   * 获取文件对应的 drive，如果不存在则创建并同步
   */
  async #getDriveForFile(fileRecord) {
    let drive = this.#drives.get(fileRecord.driveName)
    if (!drive) {
      drive = await this.#getOrCreateDrive(fileRecord.driveName, {
        server: true,
        client: true,
      })
    }
    await this.#syncDrive(drive)
    return drive
  }

  // --- 频道管理 ---

  /**
   * 创建或加入频道
   * @param {string} name - 频道名
   * @param {string} [type='personal'] - 频道类型
   * @returns {Promise<{ name: string, key: string }>}
   */
  async createChannel(name, type = 'personal', options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    if (!CHANNEL_NAME_REGEX.test(name)) {
      throw new Error('频道名只能包含字母、数字、下划线和连字符')
    }
    if (name.length < CHANNEL_NAME_MIN_LENGTH) {
      throw new Error(`频道名至少 ${CHANNEL_NAME_MIN_LENGTH} 个字符`)
    }
    if (name.length > CHANNEL_NAME_MAX_LENGTH) {
      throw new Error(`频道名最多 ${CHANNEL_NAME_MAX_LENGTH} 个字符`)
    }

    const existing = this.#channels.find(c => c.name === name)
    if (existing) {
      if (ownerAddress && !Array.isArray(existing.members)) {
        existing.members = []
      }
      if (ownerAddress && !existing.members.includes(ownerAddress)) {
        existing.members.push(ownerAddress)
        this.#saveChannelsMetadata()
      }
      return { name: existing.name, key: existing.coreKey }
    }

    const ns = this.#store.namespace(`channel-${name}`)
    const core = ns.get({ name: 'messages', valueEncoding: 'json' })
    await core.ready()

    const discoveryKey = this.#generateChannelDiscoveryKey(name)
    const chatDiscoveryKey = this.#generateChannelChatDiscoveryKey(name)
    const appDiscovery = this.#swarm.join(discoveryKey, {
      server: true,
      client: true,
    })
    const chatDiscovery = this.#chatSwarm.join(chatDiscoveryKey, {
      server: true,
      client: true,
    })

    this.#setupChannelAppendListener(core, name)

    const channelInfo = {
      name,
      discoveryKey: b4a.toString(discoveryKey, 'hex'),
      coreKey: b4a.toString(core.key, 'hex'),
      createdAt: new Date().toISOString(),
      type,
      ownerAddress,
      members: ownerAddress ? [ownerAddress] : [],
      remoteCoreKeys: [],
    }

    this.#channels.push(channelInfo)
    const coreKeyHex = b4a.toString(core.key, 'hex')
    if (!this.#channelCores.has(name)) {
      this.#channelCores.set(name, new Map())
    }
    this.#channelCores.get(name).set(coreKeyHex, core)
    this.#channelLocalCoreKey.set(name, coreKeyHex)
    this.#channelPeers.set(name, new Map())
    this.#channelDiscoveries.set(name, appDiscovery)
    this.#channelChatDiscoveries.set(name, chatDiscovery)
    this.#saveChannelsMetadata()

    console.log(`[MostBox] Channel created: ${name}`)
    this.emit('channel:joined', { name, key: channelInfo.coreKey })

    return { name, key: channelInfo.coreKey }
  }

  /**
   * 加入已有频道（通过频道名和 coreKey）
   * @param {string} name - 频道名
   * @param {string} [coreKey] - 频道的 coreKey（加入他人创建的频道时必填）
   * @returns {Promise<{ name: string, key: string }>}
   */
  async joinChannel(name, coreKey = null, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const existing = this.#channels.find(c => c.name === name)
    if (existing) {
      if (ownerAddress && !Array.isArray(existing.members)) {
        existing.members = []
      }
      if (ownerAddress && !existing.members.includes(ownerAddress)) {
        existing.members.push(ownerAddress)
        this.#saveChannelsMetadata()
      }
      if (coreKey && coreKey !== existing.coreKey) {
        if (!Array.isArray(existing.remoteCoreKeys)) {
          existing.remoteCoreKeys = []
        }
        if (!existing.remoteCoreKeys.includes(coreKey)) {
          existing.remoteCoreKeys.push(coreKey)
          this.#saveChannelsMetadata()
        }
      }
      return { name: existing.name, key: existing.coreKey }
    }

    if (!coreKey) {
      throw new Error('加入已有频道需要提供 coreKey')
    }

    const ns = this.#store.namespace(`channel-${name}`)
    const remoteCoreKeyHex = b4a.toString(b4a.from(coreKey, 'hex'), 'hex')
    const localCore = ns.get({
      name: `messages-${this.getNodeId()}`,
      valueEncoding: 'json',
    })
    await localCore.ready()
    const localCoreKeyHex = b4a.toString(localCore.key, 'hex')

    const discoveryKey = this.#generateChannelDiscoveryKey(name)
    const chatDiscoveryKey = this.#generateChannelChatDiscoveryKey(name)
    const appDiscovery = this.#swarm.join(discoveryKey, {
      server: true,
      client: true,
    })
    const chatDiscovery = this.#chatSwarm.join(chatDiscoveryKey, {
      server: true,
      client: true,
    })

    this.#setupChannelAppendListener(localCore, name)

    const channelInfo = {
      name,
      discoveryKey: b4a.toString(discoveryKey, 'hex'),
      coreKey: localCoreKeyHex,
      createdAt: new Date().toISOString(),
      type: 'group',
      ownerAddress,
      members: ownerAddress ? [ownerAddress] : [],
      remoteCoreKeys:
        remoteCoreKeyHex === localCoreKeyHex ? [] : [remoteCoreKeyHex],
    }

    this.#channels.push(channelInfo)
    if (!this.#channelCores.has(name)) {
      this.#channelCores.set(name, new Map())
    }
    this.#channelCores.get(name).set(localCoreKeyHex, localCore)
    this.#channelLocalCoreKey.set(name, localCoreKeyHex)
    this.#channelPeers.set(name, new Map())
    this.#channelDiscoveries.set(name, appDiscovery)
    this.#channelChatDiscoveries.set(name, chatDiscovery)
    this.#saveChannelsMetadata()

    console.log(`[MostBox] Joined channel: ${name}`)
    this.emit('channel:joined', { name, key: localCoreKeyHex })

    return { name, key: localCoreKeyHex }
  }

  /**
   * 离开频道
   * @param {string} name - 频道名
   * @returns {Promise<string[]>} 剩余频道列表
   */
  async leaveChannel(name, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    const index = this.#channels.findIndex(c => c.name === name)
    if (index === -1) {
      throw new Error('频道不存在')
    }

    const channel = this.#channels[index]
    if (ownerAddress && Array.isArray(channel.members)) {
      channel.members = channel.members.filter(
        member => normalizeOwnerAddress(member) !== ownerAddress
      )
      if (channel.members.length > 0) {
        this.#saveChannelsMetadata()
        return this.listChannels({ ownerAddress })
      }
    }

    const appDiscovery = this.#channelDiscoveries.get(name)
    if (appDiscovery && this.#swarm) {
      this.#channelDiscoveries.delete(name)
      this.#swarm.leave(b4a.from(channel.discoveryKey, 'hex')).catch(err => {
        console.warn(
          `[MostBox] Failed to leave app swarm for ${name}:`,
          err.message
        )
      })
    }

    const chatDiscovery = this.#channelChatDiscoveries.get(name)
    if (chatDiscovery && this.#chatSwarm) {
      this.#channelChatDiscoveries.delete(name)
      const chatDiscoveryKey = this.#generateChannelChatDiscoveryKey(name)
      this.#chatSwarm.leave(chatDiscoveryKey).catch(err => {
        console.warn(
          `[MostBox] Failed to leave chat swarm for ${name}:`,
          err.message
        )
      })
    }

    const coresMap = this.#channelCores.get(name)
    if (coresMap) {
      for (const [, core] of coresMap) {
        try {
          await core.close()
        } catch (err) {
          console.warn(
            `[MostBox] Failed to close channel core for ${name}:`,
            err.message
          )
        }
      }
      this.#channelCores.delete(name)
    }
    this.#channelLocalCoreKey.delete(name)

    this.#channelPeers.delete(name)
    this.#channels.splice(index, 1)
    this.#saveChannelsMetadata()

    console.log(`[MostBox] Left channel: ${name}`)
    this.emit('channel:left', { name })

    return this.listChannels({ ownerAddress })
  }

  setChannelRemark(name, remark, options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)
    if (!ownerAddress) {
      throw new Error('需要登录才能设置备注')
    }

    const channel = this.#channels.find(c => c.name === name)
    if (!channel) {
      throw new Error('频道不存在')
    }

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

    this.#saveChannelsMetadata()
    return trimmed
  }

  /**
   * 列出所有频道
   * @returns {Array<{ name: string, coreKey: string, createdAt: string, type: string, peerCount: number, remark: string }>}
   */
  listChannels(options = {}) {
    this.#ensureInitialized()
    const ownerAddress = normalizeOwnerAddress(options.ownerAddress)

    return this.#channels
      .filter(c => {
        if (!ownerAddress) return true
        return Array.isArray(c.members) && c.members.includes(ownerAddress)
      })
      .map(c => ({
        name: c.name,
        coreKey: c.coreKey,
        createdAt: c.createdAt,
        type: c.type,
        peerCount: (this.#channelPeers.get(c.name) || new Map()).size,
        remark: ownerAddress && c.remarks ? c.remarks[ownerAddress] || '' : '',
      }))
  }

  /**
   * 获取频道消息
   * @param {string} name - 频道名
   * @param {object} [options] - 选项
   * @param {number} [options.limit=100] - 消息数量
   * @param {number} [options.offset=0] - 偏移量
   * @returns {Promise<Array>}
   */
  async getChannelMessages(name, options = {}) {
    this.#ensureInitialized()

    const { limit = CHANNEL_MESSAGE_LIMIT, offset = 0 } = options

    const coresMap = this.#channelCores.get(name)
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

    return unique.slice(start, end).map(({ _coreKey, _index, ...msg }) => msg)
  }

  /**
   * 发送消息到频道
   * @param {string} name - 频道名
   * @param {string} content - 消息内容
   * @param {string} author - 作者 address
   * @param {string} authorName - 作者显示名
   * @returns {Promise<object>}
   */
  async sendMessage(name, content, author, authorName) {
    this.#ensureInitialized()

    const localKeyHex = this.#channelLocalCoreKey.get(name)
    const coresMap = this.#channelCores.get(name)
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

    const message = {
      type: 'message',
      author,
      authorName,
      content: trimmed,
      timestamp: Date.now(),
    }

    await core.append(message)

    this.emit('channel:message', { channel: name, message })

    return message
  }

  /**
   * 获取频道内在线用户
   * @param {string} name - 频道名
   * @returns {Array<{ peerId: string, authorName: string, lastSeen: number }>}
   */
  getChannelPeers(name) {
    this.#ensureInitialized()

    const peers = this.#channelPeers.get(name)
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

  #ensureInitialized() {
    if (!this.#initialized) {
      throw new EngineNotInitializedError()
    }
  }

  #getCidInfo(cid) {
    try {
      const validation = validateCidString(cid)
      if (!validation.valid) {
        throw new ValidationError(validation.error)
      }
      const parsedCid = CID.parse(cid)
      const topic = b4a.from(parsedCid.multihash.digest)
      if (topic.length !== 32) {
        throw new ValidationError('CID digest must be 32 bytes')
      }
      const topicHex = b4a.toString(topic, 'hex')
      return {
        topic,
        topicHex,
        driveName: `drive-${topicHex}`,
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        throw err
      }
      throw new ValidationError('Invalid CID format')
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
      localPath: record.localPath || null,
      topic: topicHex,
      driveName: record.driveName || driveName,
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

      const discovery = this.#swarm.join(topic, {
        server: options.server !== false,
        client: options.client === true,
      })

      this.#fileDiscoveries.set(cid, {
        discovery,
        topic: topicHex,
        driveName,
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

  #recordMatchesOwner(record, ownerAddress) {
    const normalizedOwner = normalizeOwnerAddress(ownerAddress)
    if (!normalizedOwner) return !record.ownerAddress
    return normalizeOwnerAddress(record.ownerAddress) === normalizedOwner
  }

  #hasPublishedReference(cid) {
    return this.#publishedFiles.some(file => file.cid === cid)
  }

  #hasAnyUserReference(cid) {
    return (
      this.#publishedFiles.some(file => file.cid === cid) ||
      this.#trashFiles.some(file => file.cid === cid)
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

  async #syncDrive(drive, timeout = DRIVE_SYNC_TIMEOUT) {
    try {
      const updated = await Promise.race([
        drive.update(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sync timeout')), timeout)
        ),
      ])
      return updated
    } catch {
      return false
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
        return parsed.map(f => ({ ...f, starred: f.starred || false }))
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
        return JSON.parse(data)
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
        return JSON.parse(data)
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
      this.#atomicWrite(metadataPath, JSON.stringify(this.#channels, null, 2))
    } catch (err) {
      console.error('Failed to save channels metadata:', err.message)
    }
  }

  #generateChannelDiscoveryKey(name) {
    const hash = crypto
      .createHash('sha256')
      .update(`${CHANNEL_NAME_PREFIX}${name}`)
      .digest()
    return hash
  }

  #generateChannelChatDiscoveryKey(name) {
    const hash = crypto
      .createHash('sha256')
      .update(`${CHANNEL_NAME_PREFIX}${name}:chat`)
      .digest()
    return hash
  }

  #setupChannelAppendListener(core, channelName) {
    let lastCoreLength = core.length
    core.on('append', async () => {
      if (core.length > lastCoreLength) {
        for (let i = lastCoreLength; i < core.length; i++) {
          try {
            const entry = await core.get(i)
            if (entry && entry.type === 'message') {
              this.emit('channel:message', {
                channel: channelName,
                message: entry,
              })
            }
          } catch (err) {
            console.error(
              `[MostBox] Failed to read channel message from ${channelName}:`,
              err.message
            )
            continue
          }
        }
        lastCoreLength = core.length
      }
    })
  }

  async #openRemoteChannelCore(channelName, coreKeyHex) {
    const coresMap = this.#channelCores.get(channelName)
    if (!coresMap) return
    if (coresMap.has(coreKeyHex)) return

    try {
      const ns = this.#store.namespace(`channel-${channelName}`)
      const core = ns.get({
        key: b4a.from(coreKeyHex, 'hex'),
        valueEncoding: 'json',
      })
      await core.ready()
      const normalizedCoreKey = b4a.toString(core.key, 'hex')
      coresMap.set(normalizedCoreKey, core)
      this.#setupChannelAppendListener(core, channelName)
      const channel = this.#channels.find(c => c.name === channelName)
      if (channel && normalizedCoreKey !== channel.coreKey) {
        if (!Array.isArray(channel.remoteCoreKeys)) {
          channel.remoteCoreKeys = []
        }
        if (!channel.remoteCoreKeys.includes(normalizedCoreKey)) {
          channel.remoteCoreKeys.push(normalizedCoreKey)
          this.#saveChannelsMetadata()
        }
      }
      console.log(
        `[MostBox] Opened remote channel core ${normalizedCoreKey.slice(0, 8)}... for ${channelName}`
      )
    } catch (err) {
      console.warn(
        `[MostBox] Failed to open remote channel core for ${channelName}:`,
        err.message
      )
    }
  }

  async #handleChannelConnection(conn) {
    const stream = conn
    let connectedPeerId = null

    const coreKeys = {}
    for (const [name, localKeyHex] of this.#channelLocalCoreKey) {
      coreKeys[name] = localKeyHex
    }

    const helloMessage = JSON.stringify({
      type: 'channel-hello',
      peerId: this.getNodeId(),
      authorName: this.getNodeId().slice(0, 4),
      channels: this.#channels.map(c => c.name),
      coreKeys,
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

          const theirChannels = new Set(msg.channels || [])
          for (const [name, peers] of this.#channelPeers) {
            if (theirChannels.has(name)) {
              peers.set(msg.peerId, {
                peerId: msg.peerId,
                authorName: msg.authorName,
                lastSeen: Date.now(),
              })
            }
          }

          if (msg.coreKeys && typeof msg.coreKeys === 'object') {
            for (const [channelName, coreKeyHex] of Object.entries(
              msg.coreKeys
            )) {
              if (this.#channelCores.has(channelName) && coreKeyHex) {
                await this.#openRemoteChannelCore(channelName, coreKeyHex)
              }
            }
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
