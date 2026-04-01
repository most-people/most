/**
 * MostBoxEngine - 核心 P2P 引擎
 * 基于 Hyperswarm/Hyperdrive 的跨平台 P2P 文件共享引擎
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
import { GLOBAL_SHARED_SEED_STRING, MAX_FILE_SIZE, CONNECTION_TIMEOUT, DOWNLOAD_TIMEOUT, SWARM_BOOTSTRAP } from './config.js'

export class MostBoxEngine extends EventEmitter {
  #store = null
  #swarm = null
  #drives = new Map()
  #publishedFiles = []
  #trashFiles = []
  #initialized = false
  #options = null
  #activeDownloads = new Map() // taskId -> { 已中止, 读取流, 写入流 }

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
    
    // 创建存储目录（如不存在）
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
    }

    // 使用全局共享种子初始化 Corestore
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

    // 初始化 Hyperswarm（启用 NAT 穿透）
    console.log(`[MostBox] Initializing Hyperswarm...`)
    this.#swarm = new Hyperswarm({
      // 连接设置以提高稳定性
      maxPeers: 64,
      // DHT 引导节点（与 Keet.io/HyperDHT 相同）
      bootstrap: SWARM_BOOTSTRAP,
      // 启用 NAT 穿透（打洞）
      // 防火墙函数：允许所有连接（默认行为）
      firewall: () => false,
      // 连接保活超时（5秒）
      connectionKeepAlive: 5000,
      // NAT 穿透随机打洞间隔（20秒）
      randomPunchInterval: 20000,
      // 增加不稳定网络的超时时间
      handshakeTimeout: CONNECTION_TIMEOUT
    })

    // 处理 swarm 级别错误
    this.#swarm.on('error', (err) => {
      // 静默处理 SSL/网络错误 — 这些对 DHT 发现不重要
      if (err.code === 'SSL_ERROR' || err.message?.includes('handshake') || err.message?.includes('ECONNRESET')) {
        console.warn('[MostBox] Network warning (non-critical):', err.message)
        return
      }
      console.error('[MostBox] Swarm error:', err.message)
      this.emit('error', err)
    })

    // 在新连接上复制存储
    this.#swarm.on('connection', (conn, info) => {
      console.log(`[MostBox] New peer connection established`)
      // 优雅处理连接错误
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

    // 加载已发布文件元数据
    this.#publishedFiles = this.#loadPublishedMetadata()
    console.log(`[MostBox] Loaded ${this.#publishedFiles.length} published files`)
    
    // 加载回收站文件元数据
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

    // 关闭所有驱动器
    for (const drive of this.#drives.values()) {
      await drive.close()
    }
    this.#drives.clear()

    // 销毁 swarm
    if (this.#swarm) {
      await this.#swarm.destroy()
      this.#swarm = null
    }

    // 关闭存储
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
    const hashHex = b4a.toString(rootCid.multihash.digest, 'hex')
    const cidString = rootCid.toString()

    const name = `drive-${hashHex}`
    let drive = this.#drives.get(name)
    
    if (!drive) {
      drive = new Hyperdrive(this.#store.namespace(name))
      await drive.ready()
      this.#drives.set(name, drive)
      
      const discovery = this.#swarm.join(drive.discoveryKey, { server: true, client: false })
      await discovery.flushed()
    }

    this.emit('publish:progress', { stage: 'uploading', file: safeFileName })

    const ws = drive.createWriteStream(safeFileName)

    if (Buffer.isBuffer(content)) {
      // 分块流式传输 Buffer 以避免超过 Hyperdrive 块大小限制
      const CHUNK_SIZE = 64 * 1024 // 64KB 块
      let offset = 0

      const waitForDrain = () => new Promise(resolve => ws.once('drain', resolve))

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
    } else {
      const rs = fs.createReadStream(cleanPath)
      await new Promise((resolve, reject) => {
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })
    }

    const existingIndex = this.#publishedFiles.findIndex(f => f.cid === cidString)
    if (existingIndex !== -1) {
      const existing = this.#publishedFiles[existingIndex]
      // 相同内容已存在 — 返回"已存在"（无论文件名如何）
      return {
        cid: cidString,
        link: `most://${cidString}`,
        fileName: existing.fileName,
        alreadyExists: true
      }
    } else {
      this.#publishedFiles.push({
        fileName: safeFileName,
        cid: cidString,
        publishedAt: new Date().toISOString(),
        starred: false
      })
    }
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

    // 如果未提供 taskId 则生成一个
    taskId = taskId || `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    console.log(`[MostBox] Starting download for link: ${link} (taskId: ${taskId})`)

    // 注册到活动下载
    const taskState = { aborted: false, readStream: null, writeStream: null }
    this.#activeDownloads.set(taskId, taskState)

    try {
      // 解析链接
      const parsed = parseMostLink(link)
      if (parsed.error) {
        throw new ValidationError(parsed.error)
      }
      const cidString = parsed.cid
      console.log(`[MostBox] Parsed CID: ${cidString}`)

      // 检查文件是否已存在于已发布文件列表
      const existingFile = this.#publishedFiles.find(f => f.cid === cidString)
      if (existingFile) {
        console.log(`[MostBox] File already exists: ${existingFile.fileName}`)
        return {
          taskId,
          fileName: existingFile.fileName,
          alreadyExists: true
        }
      }

      // 解析 CID
      const parsedCid = CID.parse(cidString)
      const hashBytes = parsedCid.multihash.digest
      const hashHex = b4a.toString(hashBytes, 'hex')

      // 检查是否取消
      if (taskState.aborted) throw new Error('Download cancelled')

      // 获取/创建驱动器
      const name = `drive-${hashHex}`
      let drive = this.#drives.get(name)
      
      if (!drive) {
        console.log(`[MostBox] Creating new drive: ${name}`)
        drive = new Hyperdrive(this.#store.namespace(name))
        await drive.ready()
        this.#drives.set(name, drive)
        
        this.emit('download:status', { taskId, status: 'connecting' })
        
        console.log(`[MostBox] Joining swarm for drive discovery...`)
        // 作为服务器和客户端加入以允许自我下载
        await this.#swarm.join(drive.discoveryKey, { server: true, client: true }).flushed()
        console.log(`[MostBox] Swarm join flushed`)
      } else {
        console.log(`[MostBox] Using existing drive: ${name}`)
      }

      // 检查是否取消
      if (taskState.aborted) throw new Error('Download cancelled')

      this.emit('download:status', { taskId, status: 'finding-peers' })

      // 等待对等节点和数据同步
      console.log(`[MostBox] Waiting for drive content (timeout: ${DOWNLOAD_TIMEOUT/1000}s)...`)
      const entries = await this.#waitForDriveContent(drive, DOWNLOAD_TIMEOUT, taskId, taskState)

      if (entries.length === 0) {
        console.log(`[MostBox] No entries found after timeout`)
        
        // 提供更详细的错误信息
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

      // 检查是否取消
      if (taskState.aborted) throw new Error('Download cancelled')

      console.log(`[MostBox] Found ${entries.length} entries, starting download...`)

      // 保存到存储目录（不是下载文件夹）
      const targetDir = this.#options.dataPath

      // 检查存储目录
      const writableCheck = await checkDirectoryWritable(targetDir)
      if (!writableCheck.writable) {
        throw new PermissionError(writableCheck.error)
      }

      // 下载文件
      for (const entry of entries) {
        const sanitizedFileName = sanitizeFilename(entry.key.replace(/^[\/\\]/, ''))
        
        // 获取文件大小
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

        // 带进度下载
        const rs = drive.createReadStream(entry.key)
        const ws = fs.createWriteStream(savePath)
        
        taskState.readStream = rs
        taskState.writeStream = ws

        let loadedBytes = 0
        let lastProgressUpdate = 0
        
        await new Promise((resolve, reject) => {
          rs.on('data', (chunk) => {
            // 检查是否取消
            if (taskState.aborted) {
              rs.destroy()
              ws.destroy()
              reject(new Error('Download cancelled'))
              return
            }
            loadedBytes += chunk.length
            const now = Date.now()
            if (totalBytes > 0 && now - lastProgressUpdate > 500) {
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

        // 验证前检查是否取消
        if (taskState.aborted) throw new Error('Download cancelled')

        // 验证完整性
        this.emit('download:status', { taskId, status: 'verifying' })

        const { cid: downloadedCid } = await calculateCid(savePath)
        const expectedHash = b4a.toString(parsedCid.multihash.digest, 'hex')
        const actualHash = b4a.toString(downloadedCid.multihash.digest, 'hex')

        if (expectedHash !== actualHash) {
          fs.unlinkSync(savePath)
          throw new IntegrityError(`File content CID mismatch. File may be corrupted or tampered.`)
        }

        const result = {
          taskId,
          fileName: sanitizedFileName,
          savedPath: savePath
        }

        // 将下载的文件添加到已发布文件列表
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
      
      // 移至回收站而非永久删除
      this.#trashFiles.push({
        fileName: fileRecord.fileName,
        cid: fileRecord.cid,
        publishedAt: fileRecord.publishedAt,
        starred: fileRecord.starred || false,
        deletedAt: new Date().toISOString()
      })
      this.#saveTrashMetadata()
      
      // 从已发布文件列表中移除
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
    
    // 恢复到已发布文件列表
    this.#publishedFiles.push({
      fileName: fileRecord.fileName,
      cid: fileRecord.cid,
      publishedAt: fileRecord.publishedAt,
      starred: fileRecord.starred || false
    })
    this.#savePublishedMetadata()
    
    // 从回收站中移除
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
      
      // 从 CID 重建驱动器名称
      const parsedCid = CID.parse(cid)
      const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')
      const driveName = `drive-${hashHex}`
      
      // 从 HyperDrive 删除文件并清理驱动器
      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del(fileRecord.fileName)
        } catch (err) {
          // 文件可能不存在于驱动器中，继续清理
        }
        
        // 离开此驱动器的 swarm
        await this.#swarm.leave(drive.discoveryKey)
        
        // 关闭并移除驱动器
        await drive.close()
        this.#drives.delete(driveName)
      }
      
      // 从回收站中移除
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
      // 从 CID 重建驱动器名称
      const parsedCid = CID.parse(fileRecord.cid)
      const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')
      const driveName = `drive-${hashHex}`
      
      // 从 HyperDrive 删除文件并清理驱动器
      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del(fileRecord.fileName)
        } catch (err) {
          // 文件可能不存在于驱动器中，继续清理
        }
        
        // 离开此驱动器的 swarm
        this.#swarm.leave(drive.discoveryKey)
        
        // 关闭并移除驱动器
        await drive.close()
        this.#drives.delete(driveName)
      }
    }
    
    // 清空回收站
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
      // 如果 statfs 不可用则回退
      try {
        const stats = fs.statSync(dataPath)
        totalSize = 0
        freeSize = 0
      } catch {
        totalSize = 0
        freeSize = 0
      }
    }
    
    // 计算文件使用的空间
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
   * 移动/重命名已发布文件（不重新上传）
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
   * 重命名文件夹（重命名文件夹内的所有文件）
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
        const newFileName = remainder ? newPath + '/' + remainder : newPath
        file.fileName = sanitizeFilename(newFileName)
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

  // --- 私有方法 ---

  #ensureInitialized() {
    if (!this.#initialized) {
      throw new EngineNotInitializedError()
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
        // 确保旧数据中存在 starred 字段
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
    const checkInterval = 1000 // 每秒检查一次
    let lastPeerCount = 0
    let lastStatus = ''
    let bootstrapNodesChecked = false

    // 首先检查内容是否已本地可用（针对自行发布的文件）
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
      // 检查是否取消
      if (taskState && taskState.aborted) {
        throw new Error('Download cancelled')
      }

      const currentTime = Date.now()
      const elapsed = Math.round((currentTime - startTime) / 1000)
      
      // 检查是否有对等节点
      const currentPeerCount = this.#swarm.connections.size
      const hasPeers = currentPeerCount > 0

      // 记录对等节点数量变化
      if (currentPeerCount !== lastPeerCount) {
        console.log(`[MostBox] Peer count changed: ${lastPeerCount} -> ${currentPeerCount} (elapsed: ${elapsed}s)`)
        lastPeerCount = currentPeerCount
      }

      // 尝试列出条目（适用于本地和同步数据）
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

      // 根据对等节点连接更新状态
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
        
        // 每 30 秒记录一次进度
        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(`[MostBox] Still waiting for peers... (${elapsed}s elapsed, timeout: ${timeout/1000}s)`)
          
          // 检查引导节点是否可访问（仅一次）
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

      // 等待下次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    console.log(`[MostBox] Timeout reached after ${timeout/1000}s, making final attempt...`)

    // 最终尝试 — 返回我们拥有的任何内容（可能为空）
    const entries = []
    try {
      for await (const entry of drive.list()) {
        entries.push(entry)
      }
    } catch (err) {
      console.log(`[MostBox] Final attempt failed: ${err.message}`)
    }
    
    console.log(`[MostBox] Final entry count: ${entries.length}`)
    
    // 提供详细错误信息
    if (entries.length === 0) {
      const peerCount = this.#swarm.connections.size
      console.log(`[MostBox] Diagnostic information:`)
      console.log(`[MostBox] - Peer count: ${peerCount}`)
      console.log(`[MostBox] - Bootstrap nodes: ${SWARM_BOOTSTRAP.length}`)
      console.log(`[MostBox] - Timeout: ${timeout/1000}s`)
      
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
