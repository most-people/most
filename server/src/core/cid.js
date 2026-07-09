/**
 * CID（内容标识符）计算模块
 * 处理文件的 IPFS UnixFS CID 计算
 */

import fs from 'node:fs'
import { Readable } from 'node:stream'
import { importer } from 'ipfs-unixfs-importer'

export {
  MOST_LINK_ERROR_CODES,
  validateCidString,
  parseMostLink,
  buildMostLink,
} from './mostLink.js'

/**
 * 用于 CID 计算的虚拟 Blockstore
 * 不存储任何数据，仅用于流式 CID 计算
 */
function createDummyBlockstore() {
  return {
    put: async (key, _val) => key,
    get: async () => {
      throw new Error('CID calculation blockstore is write-only')
    },
    has: async () => false,
  }
}

function normalizeDirectoryEntryPath(inputPath) {
  const rawPath = String(inputPath || '')
    .replace(/\\/g, '/')
    .trim()
  if (!rawPath) {
    throw new Error('Collection path is required')
  }
  if (rawPath.startsWith('/') || /^[a-zA-Z]:\//.test(rawPath)) {
    throw new Error(`Absolute collection paths are not allowed: ${rawPath}`)
  }

  const parts = []
  for (const part of rawPath.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      throw new Error(`Path traversal detected: ${rawPath}`)
    }
    parts.push(part)
  }

  if (parts.length === 0) {
    throw new Error('Collection path is required')
  }

  return parts.join('/')
}

function getRootPath(paths) {
  const first = paths[0]?.split('/')[0] || ''
  if (first && paths.every(item => item.split('/')[0] === first)) {
    return first
  }
  return ''
}

function stripRootPath(entryPath, rootPath) {
  if (!rootPath) return entryPath
  return entryPath === rootPath ? '' : entryPath.slice(rootPath.length + 1)
}

function toImporterContent(content) {
  if (typeof content === 'string') {
    return fs.createReadStream(content)
  }
  if (Buffer.isBuffer(content)) {
    return Readable.from(content)
  }
  return content
}

/**
 * 计算内容的 IPFS UnixFS CID v1
 * 使用流式方法高效处理大文件
 *
 * @param {string|Buffer|AsyncIterable} content - 文件路径（字符串）、Buffer 或异步迭代器
 * @returns {Promise<{cid: import('multiformats/cid').CID, size: number}>}
 */
export async function calculateCid(content) {
  const blockstore = createDummyBlockstore()

  let rootCid = null
  let totalSize = 0

  let source

  if (typeof content === 'string') {
    const filePath = content
    try {
      const stat = await fs.promises.stat(filePath)
      totalSize = stat.size
    } catch {
      // 忽略 stat 错误，大小将为 0
    }
    source = [
      {
        path: 'file',
        content: fs.createReadStream(filePath),
      },
    ]
  } else if (Buffer.isBuffer(content)) {
    totalSize = content.length
    source = [
      {
        path: 'file',
        content: Readable.from(content),
      },
    ]
  } else {
    source = [
      {
        path: 'file',
        content,
      },
    ]
  }

  try {
    for await (const entry of importer(source, blockstore, {
      cidVersion: 1,
      rawLeaves: true,
      wrapWithDirectory: false,
    })) {
      rootCid = entry.cid
    }
  } catch (err) {
    throw new Error(`Failed to calculate CID: ${err.message}`)
  }

  if (!rootCid) {
    throw new Error('Failed to calculate CID: no root CID generated')
  }

  return {
    cid: rootCid,
    size: totalSize,
  }
}

export async function calculateDirectoryCid(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Collection files are required')
  }

  const normalizedFiles = files
    .map(file => {
      const normalizedPath = normalizeDirectoryEntryPath(file?.path)
      if (!file || file.content === undefined || file.content === null) {
        throw new Error(
          `Collection file content is required: ${normalizedPath}`
        )
      }
      return {
        path: normalizedPath,
        content: file.content,
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))

  const seenPaths = new Set()
  for (const file of normalizedFiles) {
    if (seenPaths.has(file.path)) {
      throw new Error(`Duplicate collection path: ${file.path}`)
    }
    seenPaths.add(file.path)
  }

  const blocks = new Map()
  const blockstore = {
    put: async (key, value) => {
      if (key.code === 0x70) {
        blocks.set(key.toString(), Buffer.from(value))
      }
      return key
    },
    get: async key => {
      const block = blocks.get(key.toString())
      if (!block) {
        throw new Error(`Block not found: ${key}`)
      }
      return block
    },
    has: async key => blocks.has(key.toString()),
  }

  const source = normalizedFiles.map(file => ({
    path: file.path,
    content: toImporterContent(file.content),
  }))

  const entries = []
  for await (const entry of importer(source, blockstore, {
    cidVersion: 1,
    rawLeaves: true,
    wrapWithDirectory: false,
  })) {
    entries.push(entry)
  }

  const rootEntry = entries[entries.length - 1]
  if (!rootEntry?.cid || !rootEntry.unixfs?.isDirectory()) {
    throw new Error('Failed to calculate directory CID')
  }

  const rootPath = getRootPath(normalizedFiles.map(file => file.path))
  const childFiles = entries
    .filter(entry => entry.path && entry.path !== rootEntry.path)
    .filter(entry => !entry.unixfs?.isDirectory?.())
    .map(entry => ({
      path: stripRootPath(entry.path, rootPath),
      cid: entry.cid.toString(),
      size: Number(entry.unixfs?.fileSize?.()) || Number(entry.size) || 0,
    }))

  return {
    cid: rootEntry.cid,
    rootPath: rootEntry.path || rootPath,
    size: Number(rootEntry.size) || 0,
    totalSize: childFiles.reduce((sum, file) => sum + file.size, 0),
    files: childFiles,
    blocks,
  }
}
