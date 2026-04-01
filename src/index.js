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
      // 继续进行节点发现
    }

    while (Date.now() - startTime < timeout) {
      // 检查是否取消
      if (taskState.aborted) throw new Error('Download cancelled')

      console.log(`[MostBox] Found ${entries.length} entries, starting download...`)

      // 保存到存储目录（非下载文件夹）
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
      
      // 从已发布文件中移除
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
    
    // 恢复到已发布文件
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
      
      // 从 CID 重建 drive 名称
      const parsedCid = CID.parse(cid)
      const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')
      const driveName = `drive-${hashHex}`
      
      // 从 Hyperdrive 删除文件并清理 drive
      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del(fileRecord.fileName)
        } catch (err) {
          // 文件可能不存在于 drive 中，继续清理
        }
        
        // 离开此 drive 的 swarm
        await this.#swarm.leave(drive.discoveryKey)
        
        // 关闭并移除 drive
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
   * @returns {Promise<Array>} 空回收站列表
   */
  async emptyTrash() {
    this.#ensureInitialized()
    
    for (const fileRecord of this.#trashFiles) {
      // 从 CID 重建 drive 名称
      const parsedCid = CID.parse(fileRecord.cid)
      const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')
      const driveName = `drive-${hashHex}`
      
      // 从 Hyperdrive 删除文件并清理 drive
      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del(fileRecord.fileName)
        } catch (err) {
          // 文件可能不存在于 drive 中，继续清理
        }
        
        // 离开此 drive 的 swarm
        this.#swarm.leave(drive.discoveryKey)
        
        // 关闭并移除 drive
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
      // statfs 不可用时的回退方案
      try {
        const stats = fs.statSync(dataPath)
        totalSize = 0
        freeSize = 0
      } catch {
        totalSize = 0
        freeSize = 0
      }
    }
    
    // 按文件计算已用空间
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
   * 移动/重命名已发布文件（更改路径而不重新上传）
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
   * Rename a folder (renames all files within the folder)
   * @param {string} oldPath - Current folder path
   * @param {string} newPath - New folder path
   * @returns {object} Updated files info
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
   * Cancel an active download
   * @param {string} taskId - The task ID of the download to cancel
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

  // --- Private methods ---

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
        // 确保旧数据中存在收藏字段
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
   * Wait for drive content to be available from peers or local
   * @param {Hyperdrive} drive - The drive to check
   * @param {number} timeout - Maximum wait time in ms
   * @param {string} [taskId] - Task ID for cancellation
   * @param {object} [taskState] - Task state object
   * @returns {Promise<Array>} - List of entries
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
      
      // 检查是否有节点
      const currentPeerCount = this.#swarm.connections.size
      const hasPeers = currentPeerCount > 0

      // 记录节点数量变化
      if (currentPeerCount !== lastPeerCount) {
        console.log(`[MostBox] Peer count changed: ${lastPeerCount} -> ${currentPeerCount} (elapsed: ${elapsed}s)`)
        lastPeerCount = currentPeerCount
      }

      // 尝试列出条目（适用于本地和已同步数据）
      const entries = []
      try {
        for await (const entry of drive.list()) {
          entries.push(entry)
        }
      } catch (err) {
        // Drive 可能尚未就绪
      }

      if (entries.length > 0) {
        console.log(`[MostBox] Found ${entries.length} entries after ${elapsed}s`)
        this.emit('download:status', { taskId, status: 'syncing' })
        return entries
      }

      // 根据节点连接更新状态
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
        
        // 每 30 秒记录进度
        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(`[MostBox] Still waiting for peers... (${elapsed}s elapsed, timeout: ${timeout/1000}s)`)
          
          // 检查引导节点是否可达（仅一次）
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

    // 最终尝试 — 返回当前结果（可能为空）
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

// 重新导出工具
export * from './config.js'
export * from './core/cid.js'
export * from './utils/errors.js'
export * from './utils/security.js'