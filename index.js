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
import base32Encode from 'base32-encode'
import base32Decode from 'base32-decode'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import os from 'bare-os'
import { importer } from 'ipfs-unixfs-importer'
import { MemoryBlockstore } from 'blockstore-core/memory'

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
const storagePath = './most-box-storage'

// 为了实现“任何人发布同一文件链接一致”，我们使用一个硬编码的、全局共享的 Seed。
// 注意：这意味着任何人都可以写入这些 Drive，但我们会通过内容哈希校验来保证安全性。
const GLOBAL_SHARED_SEED = b4a.alloc(32).fill('most-box-global-shared-seed-v1')
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
const metadataPath = path.join(storagePath, 'published-files.json')

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

// 模拟 IPFS 的默认行为，对文件进行 UnixFS Chunking 并计算 Root CID
async function calculateIpfsCid(filePath) {
  console.log('(Main) 开始计算 CID:', filePath)
  // 使用内存 Blockstore，因为我们只需要计算 CID，不需要持久化存储这些 block
  // 注意：对于非常大的文件，内存 Blockstore 可能会有问题吗？
  // ipfs-unixfs-importer 是流式的，它会生成 block 并存入 blockstore。
  // 我们只关心最后一个 Root CID。
  // 为了避免内存占用，我们可以实现一个 Dummy Blockstore，只存储 minimal info 或者及时清理。
  // 但为了简单起见，且 MemoryBlockstore 实际上是存储了所有 block 的数据，
  // 对于 GB 级文件，我们需要一个不存储数据的 Blockstore，只用于计算哈希。
  
  // 自定义一个丢弃数据的 Blockstore
  const dummyBlockstore = {
    put: async (key, val) => { return key },
    get: async () => { throw new Error('Not implemented') },
    has: async () => { return false }
  }

  const source = [{
    path: 'file',
    content: fs.createReadStream(filePath)
  }]

  // IPFS 默认参数: cidVersion 0 for v0, 1 for v1. 
  // 我们使用 v1。rawLeaves: false (默认) 会使用 protobuf 封装叶子节点。
  // 但为了更通用的兼容性，我们可以开启 rawLeaves: true (IPFS > 0.6 默认行为?)
  // 实际上 `ipfs add` 默认使用 fixed size chunking (256KB).
  
  let rootCid = null
  try {
    for await (const entry of importer(source, dummyBlockstore, { 
      cidVersion: 1, 
      rawLeaves: true, // 启用 raw leaves 以获得更现代的 CID
      wrapWithDirectory: false 
    })) {
      rootCid = entry.cid
      // console.log('(Main) Generated CID entry:', entry.cid.toString())
    }
  } catch (err) {
    console.error('(Main) IPFS Importer Error:', err)
    throw err
  }
  
  console.log('(Main) Final Root CID:', rootCid)
  return rootCid
}

// --- IPC 消息处理 ---
// 使用 pear-messages 基于模式匹配监听来自 UI (渲染进程) 的消息

// 处理文件发布请求
messages({ type: 'publish-file' }, async (msg) => {
  const { payload } = msg
  console.log('(Main) 收到发布请求:', payload.name)
  try {
    // 清理路径中的不可见字符和多余的引号 (在计算哈希前也需要清理)
    let cleanPath = payload.filePath.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '').replace(/"/g, '').trim();
    // 确保路径分隔符规范化
    cleanPath = path.normalize(cleanPath);

    // 流式计算文件的 UnixFS Root CID
    const rootCid = await calculateIpfsCid(cleanPath)
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

    console.log('(Main) 处理后的文件路径:', cleanPath);

    const rs = fs.createReadStream(cleanPath)
    const ws = drive.createWriteStream(payload.name)

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
        fileName: payload.name,
        cid: cidString,
        publishedAt: new Date().toISOString()
      })
    } else {
      // 同一文件重新发布，更新时间
      publishedFiles[existingIndex].publishedAt = new Date().toISOString()
      publishedFiles[existingIndex].fileName = payload.name
    }
    savePublishedMetadata(publishedFiles)

    // 发送成功消息回前端，将 key 替换为 CID
    await message({ type: 'publish-success', key: cidString, fileName: payload.name })
  } catch (err) {
    console.error('(Main) 发布错误:', err)
    await message({ type: 'error', message: err.message })
  }
})

// 获取节点 ID
messages({ type: 'get-node-id' }, async () => {
  await message({ type: 'node-id', id: b4a.toString(swarm.keyPair.publicKey, 'hex') })
})

// 处理文件下载请求
messages({ type: 'download-file' }, async (msg) => {
  const { link } = msg.payload
  console.log('(Main) 收到下载请求:', link)

  try {
    // 解析链接: most://<cid>
    const urlObj = new URL(link.startsWith('most://') ? link.replace('most://', 'http://') : link)
    const cidString = urlObj.hostname || urlObj.pathname

    if (!cidString.startsWith('b')) {
      throw new Error('无效的 CID 格式，请提供以 b 开头的 CID v1 链接')
    }

    // 使用 multiformats 库解析标准 CID
    const parsedCid = CID.parse(cidString)

    // 提取后 32 字节的 Hash (去除 multihash 的 2 字节前缀 0x12 0x20)
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
      
      await message({ type: 'download-status', status: '正在连接 P2P 网络...' })
      const discovery = swarm.join(drive.discoveryKey)
      await discovery.flushed()
    } else {
      await message({ type: 'download-status', status: '从本地 Drive 读取...' })
    }

    await message({ type: 'download-status', status: '正在获取文件列表...' })

    const entries = []
    for await (const entry of drive.list()) {
      entries.push(entry)
    }

    if (entries.length === 0) {
      throw new Error('未在 Drive 中找到文件。请确保发布者在线。')
    }

    // 下载 Drive 中的所有文件 (本应用逻辑中通常只有一个)
    for (const entry of entries) {
      // 修复文件名前缀问题：去除可能的路径分隔符
      const safeFileName = entry.key.replace(/^[\/\\]/, '')

      await message({ type: 'download-status', status: `正在下载: ${safeFileName}...` })
      
      // 确定下载保存路径 (默认为用户下载目录)
      const downloadDir = path.join(os.homedir(), 'Downloads')
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true })
      }
      const savePath = path.join(downloadDir, safeFileName)

      // 流式读取 Hyperdrive 并写入本地磁盘
      const rs = drive.createReadStream(entry.key)
      const ws = fs.createWriteStream(savePath)
      
      await new Promise((resolve, reject) => {
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })

      await message({ type: 'download-status', status: '正在校验文件完整性...' })

      // 安全性检查：计算下载文件的 UnixFS CID 并与链接比对
      const downloadedCid = await calculateIpfsCid(savePath)
      
      const expectedHash = b4a.toString(parsedCid.multihash.digest, 'hex')
      const actualHash = b4a.toString(downloadedCid.multihash.digest, 'hex')

      if (expectedHash !== actualHash) {
        // 校验失败，删除可能被篡改的文件
        fs.unlinkSync(savePath)
        throw new Error(`安全性校验失败：文件内容 CID (${downloadedCid.toString()}) 与链接 CID 不匹配。文件可能被篡改。`)
      }

      // 仅发送状态和路径回渲染进程，不再发送 Base64 数据
      await message({
        type: 'download-file-received',
        fileName: safeFileName,
        savedPath: savePath
      })
    }

    await message({ type: 'download-success' })
  } catch (err) {
    await message({ type: 'error', message: err.message })
  }
})

// 获取已发布文件列表
messages({ type: 'list-published-files' }, async () => {
  try {
    await message({
      type: 'published-files-list',
      files: publishedFiles.map(f => ({
        fileName: f.fileName,
        cid: f.cid,
        link: `most://${f.cid}`,
        publishedAt: f.publishedAt
      }))
    })
  } catch (err) {
    await message({ type: 'error', message: '获取已发布文件列表失败: ' + err.message })
  }
})

// 删除已发布文件记录
messages({ type: 'delete-published-file' }, async (msg) => {
  try {
    const { cid } = msg.payload
    const index = publishedFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      publishedFiles.splice(index, 1)
      savePublishedMetadata(publishedFiles)
    }
    // 返回更新后的列表
    await message({
      type: 'published-files-list',
      files: publishedFiles.map(f => ({
        fileName: f.fileName,
        cid: f.cid,
        link: `most://${f.cid}`,
        publishedAt: f.publishedAt
      }))
    })
  } catch (err) {
    await message({ type: 'error', message: '删除发布记录失败: ' + err.message })
  }
})

// --- Pear 应用启动 ---
const bridge = new Bridge()
await bridge.ready()

const runtime = new Runtime()
const pipe = await runtime.start({ bridge })

pipe.on('close', () => Pear.exit())
