import './polyfills.js'
import http from 'bare-http1'

import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'
import message from 'pear-message'
import messages from 'pear-messages'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import goodbye from 'graceful-goodbye'
import b4a from 'b4a'
import { CID } from 'multiformats/cid'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import os from 'bare-os'

import * as constants from './src/constants.js'
import * as config from './src/config.js'
import { calculateCid, parseMostLink } from './src/core/cid.js'
import { 
  sanitizeFilename, 
  validateAndSanitizePath, 
  validateFileSize,
  checkDirectoryWritable,
  formatFileSize 
} from './src/utils/security.js'
import { 
  AppError, 
  ValidationError, 
  FileNotFoundError, 
  FileSizeError, 
  PathSecurityError,
  NetworkError,
  PeerNotFoundError,
  IntegrityError,
  PermissionError,
  toPlainError 
} from './src/utils/errors.js'

// --- 兼容性补丁 ---
// 为 pear-bridge 补丁 http 模块，以支持 Electron 环境下的标准 Web API
const { IncomingMessage, ServerResponse } = http
if (IncomingMessage) {
  Object.defineProperty(IncomingMessage.prototype, 'url', {
    get() { return this._url },
    set(val) { this._url = val },
    configurable: true
  })
}
if (ServerResponse) {
  Object.defineProperty(ServerResponse.prototype, 'statusCode', {
    get() { return this._statusCode },
    set(val) { this._statusCode = val },
    configurable: true
  })
}

// --- P2P 核心引擎 (主进程) ---
const storagePath = config.STORAGE_DIR
const metadataPath = path.join(storagePath, config.METADATA_FILE)

// 为了实现"任何人发布同一文件链接一致"，我们使用一个硬编码的、全局共享的 Seed。
// 注意：这意味着任何人都可以写入这些 Drive，但我们会通过内容哈希校验来保证安全性。
const GLOBAL_SHARED_SEED = b4a.alloc(32).fill(config.GLOBAL_SHARED_SEED_STRING)
// Hypercore/Corestore 默认不允许直接传入 primaryKey 以防止安全风险。
// 但因为我们的应用场景特殊（基于哈希的只读 P2P 分发，且有下载后校验），
// 我们可以在初始化 Corestore 时关闭这个安全检查 (unsafe: true)。
const store = new Corestore(storagePath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })
// 等待 Corestore 初始化完成
try {
  await store.ready()
} catch (err) {
  // 如果遇到 Corestore 冲突错误（例如旧的 Corestore 使用了不同的 Key），则删除旧数据并重试
  if (err.message && err.message.includes('Another corestore is stored here')) {
    console.warn('检测到旧的 Corestore 存储冲突，正在重置存储目录...')
    // 递归删除存储目录
    await fs.promises.rm(storagePath, { recursive: true, force: true })
    console.log('检测到旧的存储数据格式不兼容。已自动清除旧数据。请重新运行 npm start 启动应用。')
    // 尝试重新初始化
    // 注意：在同一个进程中重用 store 实例可能比较复杂，
    // 最简单且健壮的方式是直接退出进程，让用户或自动重启脚本来处理。
    // 如果是开发环境 (pear run --dev)，它通常不会自动重启，需要用户手动再跑一次。
    // 如果是生产环境，通常会有守护进程。
    // 我们这里抛出一个带有指导信息的错误，或者直接退出。
    // 为了用户体验，我们直接退出并打印日志。
    process.exit(1) 
  }
  throw err
}
const swarm = new Hyperswarm()

// 退出时清理资源
goodbye(() => swarm.destroy())

// 当有新的 P2P 连接时，复制核心数据存储
swarm.on('connection', (conn) => {
  store.replicate(conn)
})

// 缓存已创建的 Drive 实例，避免同一节点重复创建
const drives = new Map()

// --- 已发布文件的持久化元数据 ---
// 从磁盘加载已发布文件的元数据
function loadPublishedMetadata() {
  try {
    if (fs.existsSync(metadataPath)) {
      const data = fs.readFileSync(metadataPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.warn('加载已发布文件元数据失败，将使用空列表:', err.message)
  }
  return []
}

// 将已发布文件的元数据保存到磁盘
function savePublishedMetadata(metadata) {
  try {
    // 确保存储目录存在
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  } catch (err) {
    console.error('保存已发布文件元数据失败:', err.message)
  }
}

// 已发布文件列表 [{ fileName, cid, publishedAt }]
const publishedFiles = loadPublishedMetadata()

console.log('P2P 核心在主进程中已初始化')
console.log(`已加载 ${publishedFiles.length} 个已发布文件的元数据`)

// --- 辅助函数 ---

// 计算 IPFS UnixFS CID (使用模块化函数)

// --- IPC 消息处理 ---
// 使用 pear-messages 基于模式匹配监听来自 UI (渲染进程) 的消息

// 处理文件发布请求
messages({ type: constants.IPC_PUBLISH_FILE }, async (msg) => {
  const { payload } = msg
  console.log('(Main) 收到发布请求:', payload.name)
  try {
    // 安全性: 验证并清理路径
    const pathValidation = validateAndSanitizePath(payload.filePath)
    if (pathValidation.error) {
      throw new PathSecurityError(pathValidation.error)
    }
    let cleanPath = pathValidation.cleanPath

    // 安全性: 检查文件大小
    const sizeValidation = await validateFileSize(cleanPath, config.MAX_FILE_SIZE)
    if (!sizeValidation.valid) {
      throw new FileSizeError(sizeValidation.error, sizeValidation.size)
    }
    console.log(`(Main) 文件大小: ${formatFileSize(sizeValidation.size)}`)

    // 安全性: 清理文件名
    const safeFileName = sanitizeFilename(payload.name)

    // 流式计算文件的 UnixFS Root CID
    console.log('(Main) 开始计算 CID:', cleanPath)
    const { cid: rootCid } = await calculateCid(cleanPath)
    const hashHex = b4a.toString(rootCid.multihash.digest, 'hex')
    const cidString = rootCid.toString()

    // 为每个文件创建一个新的独立 Hyperdrive
    // 使用文件内容哈希 (Root CID 的 hash 部分) 作为命名空间
    const name = `drive-${hashHex}`
    
    // 检查是否已存在该 Drive（避免重复创建）
    let drive = drives.get(name)
    if (!drive) {
      drive = new Hyperdrive(store.namespace(name))
      await drive.ready()
      drives.set(name, drive)
      
      // 加入 P2P 网络并宣布此 Drive
      const discovery = swarm.join(drive.discoveryKey)
      await discovery.flushed()
      
      // 保持 Drive 打开以供服务，但在应用退出时关闭
      goodbye(() => drive.close())
    }

    const rs = fs.createReadStream(cleanPath)
    const ws = drive.createWriteStream(safeFileName)

    await new Promise((resolve, reject) => {
      rs.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
      rs.on('error', reject)
    })

    // 持久化已发布文件的元数据
    const existingIndex = publishedFiles.findIndex(f => f.cid === cidString)
    if (existingIndex === -1) {
      publishedFiles.push({
        fileName: safeFileName,
        cid: cidString,
        publishedAt: new Date().toISOString()
      })
    } else {
      // 同一文件重新发布，更新时间
      publishedFiles[existingIndex].publishedAt = new Date().toISOString()
      publishedFiles[existingIndex].fileName = safeFileName
    }
    savePublishedMetadata(publishedFiles)

    // 发送成功消息回前端
    await message({ type: constants.IPC_PUBLISH_SUCCESS, key: cidString, fileName: safeFileName })
  } catch (err) {
    console.error('(Main) 发布错误:', err)
    await message({ type: constants.IPC_ERROR, ...toPlainError(err) })
  }
})

// 获取节点 ID
messages({ type: constants.IPC_GET_NODE_ID }, async () => {
  await message({ type: constants.IPC_NODE_ID, id: b4a.toString(swarm.keyPair.publicKey, 'hex') })
})

// 处理文件下载请求
messages({ type: constants.IPC_DOWNLOAD_FILE }, async (msg) => {
  const { link } = msg.payload
  console.log('(Main) 收到下载请求:', link)

  try {
    // 解析并验证 CID 链接
    const parsed = parseMostLink(link)
    if (parsed.error) {
      throw new ValidationError(parsed.error)
    }
    const cidString = parsed.cid

    // 使用 multiformats 库解析标准 CID
    const parsedCid = CID.parse(cidString)

    // 提取后 32 字节的 Hash (去除 multihash 的 2 字节前缀)
    const hashBytes = parsedCid.multihash.digest
    const hashHex = b4a.toString(hashBytes, 'hex')

    // 使用 Hash 作为命名空间重建相同的 Drive Key
    const name = `drive-${hashHex}`
    
    // 检查是否已存在该 Drive（本地已发布）
    let drive = drives.get(name)
    if (!drive) {
      drive = new Hyperdrive(store.namespace(name))
      await drive.ready()
      drives.set(name, drive)
      
      await message({ type: constants.IPC_DOWNLOAD_STATUS, status: '正在连接 P2P 网络...' })
      const discovery = swarm.join(drive.discoveryKey)
      await discovery.flushed()
    } else {
      await message({ type: constants.IPC_DOWNLOAD_STATUS, status: '从本地 Drive 读取...' })
    }

    await message({ type: constants.IPC_DOWNLOAD_STATUS, status: '正在获取文件列表...' })

    const entries = []
    for await (const entry of drive.list()) {
      entries.push(entry)
    }

    if (entries.length === 0) {
      throw new PeerNotFoundError('未在 Drive 中找到文件。请确保发布者在线。')
    }

    // 确定下载保存路径 (默认为用户下载目录)
    const downloadDir = path.join(os.homedir(), 'Downloads')
    
    // 安全性: 检查下载目录是否可写
    const writableCheck = await checkDirectoryWritable(downloadDir)
    if (!writableCheck.writable) {
      throw new PermissionError(writableCheck.error)
    }

    // 下载 Drive 中的所有文件 (本应用逻辑中通常只有一个)
    for (const entry of entries) {
      // 安全性: 清理文件名，防止路径遍历
      const sanitizedFileName = sanitizeFilename(entry.key.replace(/^[\/\\]/, ''))
      
      // 获取文件大小用于进度跟踪
      let totalBytes = 0
      try {
        const stat = await drive.entry(entry.key)
        if (stat && stat.value && stat.value.blob) {
          totalBytes = stat.value.blob.byteLength || 0
        }
      } catch {
        // 无法获取文件大小，继续下载但不显示进度
      }

      await message({ 
        type: constants.IPC_DOWNLOAD_STATUS, 
        status: `正在下载: ${sanitizedFileName}${totalBytes ? ` (${formatFileSize(totalBytes)})` : ''}...` 
      })
      
      const savePath = path.join(downloadDir, sanitizedFileName)

      // 流式读取 Hyperdrive 并写入本地磁盘 (带进度跟踪)
      const rs = drive.createReadStream(entry.key)
      const ws = fs.createWriteStream(savePath)
      
      let loadedBytes = 0
      let lastProgressUpdate = 0
      
      await new Promise((resolve, reject) => {
        rs.on('data', (chunk) => {
          loadedBytes += chunk.length
          // 每 500ms 更新一次进度，避免频繁 IPC
          const now = Date.now()
          if (totalBytes > 0 && now - lastProgressUpdate > 500) {
            lastProgressUpdate = now
            const percent = Math.round((loadedBytes / totalBytes) * 100)
            message({ 
              type: constants.IPC_DOWNLOAD_PROGRESS, 
              loaded: loadedBytes, 
              total: totalBytes,
              percent 
            })
          }
        })
        
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })

      await message({ type: constants.IPC_DOWNLOAD_STATUS, status: '正在校验文件完整性...' })

      // 安全性检查：计算下载文件的 UnixFS CID 并与链接比对
      const { cid: downloadedCid } = await calculateCid(savePath)
      
      const expectedHash = b4a.toString(parsedCid.multihash.digest, 'hex')
      const actualHash = b4a.toString(downloadedCid.multihash.digest, 'hex')

      if (expectedHash !== actualHash) {
        // 校验失败，删除可能被篡改的文件
        fs.unlinkSync(savePath)
        throw new IntegrityError(`文件内容 CID (${downloadedCid.toString()}) 与链接 CID 不匹配。文件可能被篡改。`)
      }

      // 仅发送状态和路径回渲染进程
      await message({
        type: constants.IPC_DOWNLOAD_FILE_RECEIVED,
        fileName: sanitizedFileName,
        savedPath: savePath
      })
    }

    await message({ type: constants.IPC_DOWNLOAD_SUCCESS })
  } catch (err) {
    console.error('(Main) 下载错误:', err)
    await message({ type: constants.IPC_ERROR, ...toPlainError(err) })
  }
})

// 获取已发布文件列表
messages({ type: constants.IPC_LIST_PUBLISHED_FILES }, async () => {
  try {
    await message({
      type: constants.IPC_PUBLISHED_FILES_LIST,
      files: publishedFiles.map(f => ({
        fileName: f.fileName,
        cid: f.cid,
        link: `most://${f.cid}`,
        publishedAt: f.publishedAt
      }))
    })
  } catch (err) {
    await message({ type: constants.IPC_ERROR, ...toPlainError(err) })
  }
})

// 删除已发布文件记录
messages({ type: constants.IPC_DELETE_PUBLISHED_FILE }, async (msg) => {
  try {
    const { cid } = msg.payload
    const index = publishedFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      publishedFiles.splice(index, 1)
      savePublishedMetadata(publishedFiles)
    }
    // 返回更新后的列表
    await message({
      type: constants.IPC_PUBLISHED_FILES_LIST,
      files: publishedFiles.map(f => ({
        fileName: f.fileName,
        cid: f.cid,
        link: `most://${f.cid}`,
        publishedAt: f.publishedAt
      }))
    })
  } catch (err) {
    await message({ type: constants.IPC_ERROR, ...toPlainError(err) })
  }
})

// 获取网络状态
messages({ type: constants.IPC_GET_NETWORK_STATUS }, async () => {
  try {
    const connections = swarm.connections.size
    await message({
      type: constants.IPC_NETWORK_STATUS,
      peers: connections,
      status: connections > 0 ? 'connected' : 'waiting'
    })
  } catch (err) {
    await message({ type: constants.IPC_NETWORK_STATUS, peers: 0, status: 'error' })
  }
})

// --- Pear 应用启动 ---
const bridge = new Bridge()
await bridge.ready()

const runtime = new Runtime()
const pipe = await runtime.start({ bridge })

pipe.on('close', () => Pear.exit())
