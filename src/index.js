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
import { CID } from 'multiformats/cid'
import fs from 'node:fs'
import path from 'node:path'

import { calculateCid, parseMostLink } from './core/cid.js'
import { sanitizeFilename, validateAndSanitizePath, validateFileSize, checkDirectoryWritable, formatFileSize } from './utils/security.js'
import { ValidationError, PathSecurityError, FileSizeError, PeerNotFoundError, IntegrityError, PermissionError, EngineNotInitializedError } from './utils/errors.js'
import { GLOBAL_SHARED_SEED_STRING, MAX_FILE_SIZE, CONNECTION_TIMEOUT, DOWNLOAD_TIMEOUT, SWARM_BOOTSTRAP, MAX_PEERS, SWARM_KEEP_ALIVE_INTERVAL, SWARM_RANDOM_PUNCH_INTERVAL, DRIVE_ENTRY_TIMEOUT, DRIVE_SYNC_TIMEOUT, STREAM_READ_TIMEOUT, DOWNLOAD_POLL_INTERVAL, PROGRESS_THROTTLE, DEFAULT_READ_LIMIT } from './config.js'

export class MostBoxEngine extends EventEmitter {
  #store = null
  #swarm = null
  #drives = new Map()
  #publishedFiles = []
  #trashFiles = []
  #initialized = false
  #options = null
  #activeDownloads = new Map()
  #drivePromises = new Map()

  /**
   * 创建新的 MostBoxEngine 实例
   * @param {object} options - 配置选项
   * @param {string} options.dataPath - 存储 P2P 数据的路径（必填）
   * @param {string} [options.downloadPath] - 默认下载路径（可选，默认为 dataPath/downloads）
   * @param {number} [options.maxFileSize] - 最大文件大小（字节）（默认：100GB）
   */
  constructor(options) {
    super()

    if (!options || !options.dataPath) {
      throw new Error('dataPath is required')
    }

    this.#options = {
      dataPath: options.dataPath,
      downloadPath: options.downloadPath || path.join(options.dataPath, 'downloads'),
      maxFileSize: options.maxFileSize || MAX_FILE_SIZE
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
    this.#store = new Corestore(dataPath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })

    try {
      await this.#store.ready()
      console.log(`[MostBox] Corestore ready`)
    } catch (err) {
      if (err.message && err.message.includes('Another corestore is stored here')) {
        console.log(`[MostBox] Resetting corrupt storage...`)
        fs.rmSync(dataPath, { recursive: true, force: true })
        fs.mkdirSync(dataPath, { recursive: true })
        this.#store = new Corestore(dataPath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })
        await this.#store.ready()
        console.log(`[MostBox] Corestore reset and ready`)
      } else if (err.message && err.message.includes('Invalid device file')) {
        throw new Error(`存储文件损坏，请关闭其他访问 ${dataPath} 的程序后重试`)
      } else if (err.message && err.message.includes('File descriptor could not be locked')) {
        throw new Error(`存储文件被锁定，请关闭其他访问 ${dataPath} 的程序后重试`)
      } else {
        throw err
      }
    }

    console.log(`[MostBox] Initializing Hyperswarm...`)
    this.#swarm = new Hyperswarm({
      maxPeers: MAX_PEERS,
      bootstrap: SWARM_BOOTSTRAP,
      firewall: () => false,
      connectionKeepAlive: SWARM_KEEP_ALIVE_INTERVAL,
      randomPunchInterval: SWARM_RANDOM_PUNCH_INTERVAL,
      handshakeTimeout: CONNECTION_TIMEOUT
    })

    this.#swarm.on('error', (err) => {
      if (err.code === 'SSL_ERROR' || err.message?.includes('handshake') || err.message?.includes('ECONNRESET')) {
        console.warn('[MostBox] Network warning (non-critical):', err.message)
        return
      }
      console.error('[MostBox] Swarm error:', err.message)
      this.emit('error', err)
    })

    this.#swarm.on('connection', (conn, info) => {
      console.log(`[MostBox] New peer connection established`)
      conn.on('error', (err) => {
        if (err.code === 'SSL_ERROR' || err.message?.includes('handshake')) {
          console.warn('[MostBox] Connection warning:', err.message)
          return
        }
        console.error('[MostBox] Connection error:', err.message)
      })

      this.#store.replicate(conn)
      this.emit('connection', conn)
    })

    this.#publishedFiles = this.#loadPublishedMetadata()
    console.log(`[MostBox] Loaded ${this.#publishedFiles.length} published files`)

    this.#trashFiles = this.#loadTrashMetadata()
    console.log(`[MostBox] Loaded ${this.#trashFiles.length} trash files`)

    this.#initialized = true
    console.log(`[MostBox] Engine initialized successfully`)
    this.emit('ready')

    return this
  }

  /**
   * 停止引擎并清理资源
   */
  async stop() {
    if (!this.#initialized) {
      return
    }

    await Promise.allSettled([...this.#drives.values()].map(d => d.close()))
    this.#drives.clear()

    if (this.#swarm) {
      await this.#swarm.destroy()
      this.#swarm = null
    }

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
    const connections = this.#swarm.connections.size
    return {
      peers: connections,
      status: connections > 0 ? 'connected' : 'waiting'
    }
  }

  /**
   * 将内容发布到 P2P 网络
   * Hyperdrive 中存储 key 为 '/' + cid，metadata 中存储 displayName（用户看到的路径）
   * @param {string|Buffer} content - 文件路径（字符串）或内容（Buffer）
   * @param {string} [fileName] - 文件名（Buffer 输入时必填）
   * @returns {Promise<{ cid: string, link: string, fileName: string }>}
   */
  async publishFile(content, fileName) {
    this.#ensureInitialized()

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

      const sizeValidation = await validateFileSize(cleanPath, this.#options.maxFileSize)
      if (!sizeValidation.valid) {
        throw new FileSizeError(sizeValidation.error, sizeValidation.size)
      }
      fileSize = sizeValidation.size

      safeFileName = sanitizeFilename(fileName || path.basename(cleanPath))
    }

    if (fileSize > this.#options.maxFileSize) {
      const maxGB = Math.round(this.#options.maxFileSize / (1024 * 1024 * 1024))
      throw new FileSizeError(`File size exceeds limit of ${maxGB} GB`, fileSize)
    }

    this.emit('publish:progress', { stage: 'calculating-cid', file: safeFileName })

    const { cid: rootCid } = await calculateCid(content)
    const cidString = rootCid.toString()

    // 检查相同内容是否已存在
    const existingIndex = this.#publishedFiles.findIndex(f => f.cid === cidString)
    if (existingIndex !== -1) {
      const existing = this.#publishedFiles[existingIndex]
      return {
        cid: cidString,
        link: `most://${cidString}`,
        fileName: existing.fileName,
        alreadyExists: true
      }
    }

    // 获取或创建该 CID 对应的 drive
    const hashHex = b4a.toString(rootCid.multihash.digest, 'hex')
    const name = `drive-${hashHex}`
    let drive = this.#drives.get(name)

    if (!drive) {
      drive = await this.#getOrCreateDrive(name, { server: true, client: false })
      const discovery = this.#swarm.join(drive.discoveryKey, { server: true, client: false })
      await discovery.flushed()
    }

    this.emit('publish:progress', { stage: 'uploading', file: safeFileName })

    // Hyperdrive 中用 CID 作为 key 存储（解耦目录结构）
    const driveKey = '/' + cidString

    const ws = drive.createWriteStream(driveKey)

    if (Buffer.isBuffer(content)) {
      const CHUNK_SIZE = 64 * 1024
      let offset = 0
      const waitForDrain = () => new Promise(resolve => ws.once('drain', resolve))

      try {
        while (offset < content.length) {
          const chunk = content.slice(offset, offset + CHUNK_SIZE)
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
      starred: false
    })
    this.#savePublishedMetadata()

    const result = {
      cid: cidString,
      link: `most://${cidString}`,
      fileName: safeFileName
    }

    this.emit('publish:success', result)
    return result
  }

  /**
   * 从 P2P 网络下载文件
   * @param {string} link - most:// 链接
   * @param {string} [taskId] - 用于取消的任务 ID
   * @returns {Promise<{ taskId: string, fileName: string, savedPath: string, alreadyExists?: boolean }>}
   */
  async downloadFile(link, taskId = null) {
    this.#ensureInitialized()

    taskId = taskId || `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    console.log(`[MostBox] Starting download for link: ${link} (taskId: ${taskId})`)

    const taskState = { aborted: false, readStream: null, writeStream: null }
    this.#activeDownloads.set(taskId, taskState)

    try {
      const parsed = parseMostLink(link)
      if (parsed.error) {
        throw new ValidationError(parsed.error)
      }
      const cidString = parsed.cid
      console.log(`[MostBox] Parsed CID: ${cidString}`)

      const existingFile = this.#publishedFiles.find(f => f.cid === cidString)
      if (existingFile) {
        console.log(`[MostBox] File already exists: ${existingFile.fileName}`)
        return {
          taskId,
          fileName: existingFile.fileName,
          alreadyExists: true
        }
      }

      const parsedCid = CID.parse(cidString)
      const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')

      if (taskState.aborted) throw new Error('Download cancelled')

      const name = `drive-${hashHex}`
      let drive = this.#drives.get(name)

      if (!drive) {
        console.log(`[MostBox] Creating new drive: ${name}`)
        drive = await this.#getOrCreateDrive(name, { server: true, client: true })

        this.emit('download:status', { taskId, status: 'connecting' })

        console.log(`[MostBox] Joining swarm for drive discovery...`)
        await this.#swarm.join(drive.discoveryKey, { server: true, client: true }).flushed()
        console.log(`[MostBox] Swarm join flushed`)
      } else {
        console.log(`[MostBox] Using existing drive: ${name}`)
      }

      if (taskState.aborted) throw new Error('Download cancelled')

      this.emit('download:status', { taskId, status: 'finding-peers' })

      console.log(`[MostBox] Waiting for drive content (timeout: ${DOWNLOAD_TIMEOUT / 1000}s)...`)
      const entries = await this.#waitForDriveContent(drive, DOWNLOAD_TIMEOUT, taskId, taskState)

      if (entries.length === 0) {
        console.log(`[MostBox] No entries found after timeout`)

        const peerCount = this.#swarm.connections.size
        let errorMessage = 'No files found in drive. '

        if (peerCount === 0) {
          errorMessage += 'Could not connect to any peers. This may be due to:\n'
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

      console.log(`[MostBox] Found ${entries.length} entries, starting download...`)

      const targetDir = this.#options.dataPath

      const writableCheck = await checkDirectoryWritable(targetDir)
      if (!writableCheck.writable) {
        throw new PermissionError(writableCheck.error)
      }

      // 下载文件
      for (const entry of entries) {
        const cleanKey = entry.key.replace(/^[\/\\]/, '')
        // 用原始文件名作为 displayName
        const sanitizedFileName = sanitizeFilename(cleanKey)

        let totalBytes = 0
        try {
          const stat = await drive.entry(entry.key)
          if (stat && stat.value && stat.value.blob) {
            totalBytes = stat.value.blob.byteLength || 0
          }
        } catch {
          // 忽略
        }

        const savePath = path.join(targetDir, sanitizedFileName)

        this.emit('download:status', {
          taskId,
          status: 'downloading',
          file: sanitizedFileName,
          size: totalBytes ? formatFileSize(totalBytes) : null
        })

        const rs = drive.createReadStream(entry.key)
        const ws = fs.createWriteStream(savePath)

        taskState.readStream = rs
        taskState.writeStream = ws

        let loadedBytes = 0
        let lastProgressUpdate = 0

        await new Promise((resolve, reject) => {
          rs.on('data', (chunk) => {
            if (taskState.aborted) {
              rs.destroy()
              ws.destroy()
              fs.unlink(savePath, () => { })
              reject(new Error('Download cancelled'))
              return
            }
            loadedBytes += chunk.length
            const now = Date.now()
            if (totalBytes > 0 && now - lastProgressUpdate > PROGRESS_THROTTLE) {
              lastProgressUpdate = now
              const percent = Math.round((loadedBytes / totalBytes) * 100)
              this.emit('download:progress', { taskId, loaded: loadedBytes, total: totalBytes, percent })
            }
          })

          rs.pipe(ws)
          ws.on('finish', resolve)
          ws.on('error', reject)
          rs.on('error', reject)
        })

        if (taskState.aborted) throw new Error('Download cancelled')

        this.emit('download:status', { taskId, status: 'verifying' })

        const { cid: downloadedCid } = await calculateCid(savePath)
        const expectedHash = b4a.toString(parsedCid.multihash.digest, 'hex')
        const actualHash = b4a.toString(downloadedCid.multihash.digest, 'hex')

        if (expectedHash !== actualHash) {
          fs.unlinkSync(savePath)
          throw new IntegrityError(`File content CID mismatch. File may be corrupted or tampered.`)
        }

        // Write file content to Hyperdrive so it can be served for preview
        const driveKey = '/' + cidString
        const readStream = fs.createReadStream(savePath)
        const writeStream = drive.createWriteStream(driveKey)
        await new Promise((resolve, reject) => {
          readStream.pipe(writeStream)
          writeStream.on('finish', resolve)
          writeStream.on('error', reject)
          readStream.on('error', reject)
        })

        const result = {
          taskId,
          fileName: sanitizedFileName,
          savedPath: savePath
        }

        // 将下载的文件添加到已发布文件列表（displayName 用原始文件名）
        const existingIndex = this.#publishedFiles.findIndex(f => f.cid === cidString)
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
            starred: false
          })
        }
        this.#savePublishedMetadata()

        this.emit('download:success', result)
        return result
      }
    } finally {
      this.#activeDownloads.delete(taskId)
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

    if (options.starred === true) {
      files = files.filter(f => f.starred === true)
    }

    return files.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}`,
      publishedAt: f.publishedAt,
      starred: f.starred || false
    }))
  }

  /**
   * 切换文件的收藏状态
   * @param {string} cid - 文件的 CID
   * @returns {object} 更新后的文件信息
   */
  toggleStarred(cid) {
    this.#ensureInitialized()
    const index = this.#publishedFiles.findIndex(f => f.cid === cid)
    if (index === -1) {
      throw new Error('File not found')
    }
    this.#publishedFiles[index].starred = !this.#publishedFiles[index].starred
    this.#savePublishedMetadata()
    return {
      cid,
      starred: this.#publishedFiles[index].starred
    }
  }

  /**
   * 删除已发布文件 — 移至回收站而非永久删除
   * @param {string} cid - 要删除文件的 CID
   * @returns {Promise<Array>} 更新后的已发布文件列表
   */
  async deletePublishedFile(cid) {
    this.#ensureInitialized()
    const index = this.#publishedFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      const fileRecord = this.#publishedFiles[index]

      this.#trashFiles.push({
        fileName: fileRecord.fileName,
        cid: fileRecord.cid,
        driveName: fileRecord.driveName,
        publishedAt: fileRecord.publishedAt,
        starred: fileRecord.starred || false,
        deletedAt: new Date().toISOString()
      })
      this.#saveTrashMetadata()

      this.#publishedFiles.splice(index, 1)
      this.#savePublishedMetadata()
    }
    return this.listPublishedFiles()
  }

  /**
   * 列出回收站中的所有文件
   * @returns {Array} 回收站文件
   */
  listTrashFiles() {
    this.#ensureInitialized()
    return this.#trashFiles.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}`,
      publishedAt: f.publishedAt,
      starred: f.starred || false,
      deletedAt: f.deletedAt
    }))
  }

  /**
   * 从回收站恢复文件
   * @param {string} cid - 要恢复文件的 CID
   * @returns {Array} 更新后的已发布文件列表
   */
  restoreTrashFile(cid) {
    this.#ensureInitialized()
    const index = this.#trashFiles.findIndex(f => f.cid === cid)
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
      starred: fileRecord.starred || false
    })
    this.#savePublishedMetadata()

    this.#trashFiles.splice(index, 1)
    this.#saveTrashMetadata()

    return this.listPublishedFiles()
  }

  /**
   * 永久删除回收站中的文件
   * @param {string} cid - 要永久删除文件的 CID
   * @returns {Promise<Array>} 更新后的回收站列表
   */
  async permanentDeleteTrashFile(cid) {
    this.#ensureInitialized()
    const index = this.#trashFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      const fileRecord = this.#trashFiles[index]
      const driveName = fileRecord.driveName

      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del('/' + fileRecord.cid)
        } catch (err) {
          // 文件可能不存在于驱动器中
        }

        await this.#swarm.leave(drive.discoveryKey)
        await drive.close()
        this.#drives.delete(driveName)
      }

      this.#trashFiles.splice(index, 1)
      this.#saveTrashMetadata()
    }
    return this.listTrashFiles()
  }

  /**
   * 清空回收站 — 永久删除所有回收站文件
   * @returns {Promise<Array>} 清空后的回收站列表
   */
  async emptyTrash() {
    this.#ensureInitialized()

    for (const fileRecord of this.#trashFiles) {
      const driveName = fileRecord.driveName

      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del('/' + fileRecord.cid)
        } catch (err) {
          // 文件可能不存在
        }

        await this.#swarm.leave(drive.discoveryKey)
        await drive.close()
        this.#drives.delete(driveName)
      }
    }

    this.#trashFiles = []
    this.#saveTrashMetadata()

    return []
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<{ total: number, used: number, free: number, fileCount: number, trashCount: number }>}
   */
  async getStorageStats() {
    this.#ensureInitialized()

    let totalSize = 0
    let freeSize = 0
    const { dataPath } = this.#options

    try {
      const stats = fs.statfsSync(dataPath)
      totalSize = stats.bsize * stats.blocks
      freeSize = stats.bsize * stats.bfree
    } catch (err) {
      try {
        const stats = fs.statSync(dataPath)
        totalSize = 0
        freeSize = 0
      } catch {
        totalSize = 0
        freeSize = 0
      }
    }

    let usedSize = 0
    const calculateDirSize = (dirPath) => {
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
      fileCount: this.#publishedFiles.length,
      trashCount: this.#trashFiles.length
    }
  }

  /**
   * 移动/重命名已发布文件
   * 只更新 metadata 中的 displayName，不修改 Hyperdrive
   * @param {string} cid - 要移动文件的 CID
   * @param {string} newFileName - 新文件路径
   * @returns {object} 更新后的文件信息
   */
  moveFile(cid, newFileName) {
    this.#ensureInitialized()
    const index = this.#publishedFiles.findIndex(f => f.cid === cid)
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
      link: `most://${cid}`
    }
  }

  /**
   * 重命名文件夹（重命名文件夹内的所有文件 displayName）
   * 只更新 metadata，不修改 Hyperdrive
   * @param {string} oldPath - 当前文件夹路径
   * @param {string} newPath - 新文件夹路径
   * @returns {object} 更新后的文件信息
   */
  renameFolder(oldPath, newPath) {
    this.#ensureInitialized()
    const prefix = oldPath + '/'
    const updatedFiles = []

    for (const file of this.#publishedFiles) {
      if (file.fileName.startsWith(prefix)) {
        const remainder = file.fileName.substring(prefix.length)
        const newFileName = sanitizeFilename(remainder ? newPath + '/' + remainder : newPath)
        file.fileName = newFileName
        file.publishedAt = new Date().toISOString()
        updatedFiles.push({
          cid: file.cid,
          fileName: file.fileName,
          link: `most://${file.cid}`
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
      if (task.readStream) task.readStream.destroy()
      if (task.writeStream) task.writeStream.destroy()
    }
  }

  getPublishedFiles() {
    return this.#publishedFiles
  }

  /**
   * 读取已发布文件的内容（用于预览）
   * Hyperdrive 中用 CID 作为 key 存储
   * @param {string} cid - 文件的 CID
   * @param {number} [offset=0] - 读取起始位置
   * @param {number} [limit=10000] - 最大读取字节数
   */
  async readFileContent(cid, offset = 0, limit = DEFAULT_READ_LIMIT) {
    this.#ensureInitialized()

    const fileRecord = this.#publishedFiles.find(f => f.cid === cid)
    if (!fileRecord) {
      throw new Error('File not found')
    }

    const drive = await this.#getDriveForFile(fileRecord)

    // Hyperdrive 中 key 为 '/' + cid
    const driveKey = '/' + cid
    const entry = await drive.entry(driveKey, { wait: true, timeout: DRIVE_ENTRY_TIMEOUT })
    if (!entry || !entry.value) {
      throw new Error('File content not available')
    }

    const chunks = []
    const stream = drive.createReadStream(driveKey, { start: offset, end: offset + limit - 1 })

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stream read timeout')), STREAM_READ_TIMEOUT)
    })

    const readPromise = (async () => {
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
    })()

    await Promise.race([readPromise, timeoutPromise])

    const content = Buffer.concat(chunks).toString('utf8')
    const hasMore = chunks.length > 0 && chunks[chunks.length - 1].length === limit

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

    const fileRecord = this.#publishedFiles.find(f => f.cid === cid)
    if (!fileRecord) {
      throw new Error('File not found')
    }

    const drive = await this.#getDriveForFile(fileRecord)

    const driveKey = '/' + cid
    const entry = await drive.entry(driveKey, { wait: true, timeout: DRIVE_ENTRY_TIMEOUT })
    if (!entry || !entry.value || !entry.value.blob) {
      throw new Error('File content not available')
    }

    const totalSize = entry.value.blob.byteLength || 0

    const { offset = 0, limit, timeout = STREAM_READ_TIMEOUT } = options
    const effectiveLimit = (limit === undefined || limit === null)
      ? totalSize - offset
      : Math.min(limit, totalSize - offset)

    if (effectiveLimit <= 0) {
      return { buffer: Buffer.alloc(0), fileName: fileRecord.fileName, totalSize }
    }

    const chunks = []
    const stream = drive.createReadStream(driveKey, {
      start: offset,
      end: offset + effectiveLimit - 1
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
    await readPromise.catch(() => { })

    const buffer = Buffer.concat(chunks)
    return { buffer, fileName: fileRecord.fileName, totalSize }
  }

  /**
   * 获取文件对应的 drive，如果不存在则创建并同步
   */
  async #getDriveForFile(fileRecord) {
    let drive = this.#drives.get(fileRecord.driveName)
    if (!drive) {
      drive = await this.#getOrCreateDrive(fileRecord.driveName, { server: true, client: true })
    }
    await this.#syncDrive(drive)
    return drive
  }

  // --- 私有方法 ---

  #ensureInitialized() {
    if (!this.#initialized) {
      throw new EngineNotInitializedError()
    }
  }

  async #getOrCreateDrive(name, options = { server: true, client: false }) {
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
    const done = drive.findingPeers()
    this.#swarm.join(drive.discoveryKey, { server: true, client: true }).flushed().then(done, done)
    try {
      const updated = await Promise.race([
        drive.update(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), timeout))
      ])
      return updated
    } catch {
      return false
    }
  }

  #getMetadataPath() {
    return path.join(this.#options.dataPath, 'published-files.json')
  }

  #getTrashMetadataPath() {
    return path.join(this.#options.dataPath, 'trash-files.json')
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
      console.warn('Failed to load published metadata, using empty list:', err.message)
    }
    return []
  }

  #savePublishedMetadata() {
    try {
      const metadataPath = this.#getMetadataPath()
      fs.writeFileSync(metadataPath, JSON.stringify(this.#publishedFiles, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save published metadata:', err.message)
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
      console.warn('Failed to load trash metadata, using empty list:', err.message)
    }
    return []
  }

  #saveTrashMetadata() {
    try {
      const metadataPath = this.#getTrashMetadataPath()
      fs.writeFileSync(metadataPath, JSON.stringify(this.#trashFiles, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save trash metadata:', err.message)
    }
  }

  /**
   * 等待驱动器内容从对等节点或本地可用
   * @param {Hyperdrive} drive - 要检查的驱动器
   * @param {number} timeout - 最大等待时间（毫秒）
   * @param {string} [taskId] - 用于取消的任务 ID
   * @param {object} [taskState] - 任务状态对象
   * @returns {Promise<Array>} - 条目列表
   */
  async #waitForDriveContent(drive, timeout, taskId = null, taskState = null) {
    const startTime = Date.now()
    const checkInterval = DOWNLOAD_POLL_INTERVAL
    let lastPeerCount = 0
    let lastStatus = ''
    let bootstrapNodesChecked = false

    const localEntries = []
    try {
      for await (const entry of drive.list()) {
        localEntries.push(entry)
      }
      if (localEntries.length > 0) {
        console.log(`[MostBox] Found ${localEntries.length} entries locally`)
        this.emit('download:status', { taskId, status: 'syncing' })
        return localEntries
      }
    } catch (err) {
      // 继续进行节点发现
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
        console.log(`[MostBox] Peer count changed: ${lastPeerCount} -> ${currentPeerCount} (elapsed: ${elapsed}s)`)
        lastPeerCount = currentPeerCount
      }

      const entries = []
      try {
        for await (const entry of drive.list()) {
          entries.push(entry)
        }
      } catch (err) {
        // 驱动器可能尚未就绪
      }

      if (entries.length > 0) {
        console.log(`[MostBox] Found ${entries.length} entries after ${elapsed}s`)
        this.emit('download:status', { taskId, status: 'syncing' })
        return entries
      }

      if (hasPeers) {
        const newStatus = 'syncing'
        if (lastStatus !== newStatus) {
          this.emit('download:status', { taskId, status: newStatus })
          lastStatus = newStatus
        }
      } else {
        const newStatus = 'finding-peers'
        if (lastStatus !== newStatus) {
          this.emit('download:status', { taskId, status: newStatus })
          lastStatus = newStatus
        }

        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(`[MostBox] Still waiting for peers... (${elapsed}s elapsed, timeout: ${timeout / 1000}s)`)

          if (!bootstrapNodesChecked && elapsed >= 60) {
            bootstrapNodesChecked = true
            console.log(`[MostBox] No peers found after 60s. This may indicate:`)
            console.log(`[MostBox] 1. Network/firewall blocking P2P connections`)
            console.log(`[MostBox] 2. DHT bootstrap nodes unreachable`)
            console.log(`[MostBox] 3. Publisher node offline`)
            console.log(`[MostBox] 4. NAT traversal failed`)
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    console.log(`[MostBox] Timeout reached after ${timeout / 1000}s, making final attempt...`)

    const entries = []
    try {
      for await (const entry of drive.list()) {
        entries.push(entry)
      }
    } catch (err) {
      console.log(`[MostBox] Final attempt failed: ${err.message}`)
    }

    console.log(`[MostBox] Final entry count: ${entries.length}`)

    if (entries.length === 0) {
      const peerCount = this.#swarm.connections.size
      console.log(`[MostBox] Diagnostic information:`)
      console.log(`[MostBox] - Peer count: ${peerCount}`)
      console.log(`[MostBox] - Bootstrap nodes: ${SWARM_BOOTSTRAP.length}`)
      console.log(`[MostBox] - Timeout: ${timeout / 1000}s`)

      if (peerCount === 0) {
        console.log(`[MostBox] Suggestion: Check network connectivity and firewall settings`)
      } else {
        console.log(`[MostBox] Suggestion: Publisher may be offline or file may have been removed`)
      }
    }

    return entries
  }
}

// 重新导出工具函数
export * from './config.js'
export * from './core/cid.js'
export * from './utils/errors.js'
export * from './utils/security.js'
