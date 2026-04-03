/**
 * CID（内容标识符）计算模块
 * 处理文件的 IPFS UnixFS CID 计算
 */

import fs from 'node:fs'
import { Readable } from 'node:stream'
import { importer } from 'ipfs-unixfs-importer'

/**
 * 用于 CID 计算的虚拟 Blockstore
 * 不存储任何数据，仅用于流式 CID 计算
 */
function createDummyBlockstore() {
  return {
    put: async (key, val) => key,
    get: async () => { throw new Error('Not implemented') },
    has: async () => false
  }
}

/**
 * 计算内容的 IPFS UnixFS CID v1
 * 使用流式方法高效处理大文件
 * 
 * @param {string|Buffer|AsyncIterable} content - 文件路径（字符串）、Buffer 或异步迭代器
 * @param {object} options - 计算选项
 * @param {boolean} [options.rawLeaves=true] - 使用原始叶子节点以支持现代 CID
 * @param {number} [options.cidVersion=1] - CID 版本（0 或 1）
 * @param {number} [options.size] - 总字节数（可选，自动检测）
 * @returns {Promise<{cid: import('multiformats/cid').CID, size: number}>}
 */
export async function calculateCid(content, options = {}) {
  const {
    rawLeaves = true,
    cidVersion = 1,
    size: providedSize
  } = options

  const blockstore = createDummyBlockstore()
  
  let rootCid = null
  let totalSize = providedSize || 0
  
  let source

  if (typeof content === 'string') {
    const filePath = content
    try {
      const stat = await fs.promises.stat(filePath)
      totalSize = stat.size
    } catch {
      // 忽略 stat 错误，大小将为 0
    }
    source = [{
      path: 'file',
      content: fs.createReadStream(filePath)
    }]
  } else if (Buffer.isBuffer(content)) {
    totalSize = content.length
    source = [{
      path: 'file',
      content: Readable.from(content)
    }]
  } else {
    source = [{
      path: 'file',
      content
    }]
  }

  try {
    for await (const entry of importer(source, blockstore, {
      cidVersion,
      rawLeaves,
      wrapWithDirectory: false
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
    size: totalSize
  }
}

/**
 * 验证 CID 字符串
 * @param {string} cidString - 要验证的 CID 字符串
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCidString(cidString) {
  if (!cidString || typeof cidString !== 'string') {
    return { valid: false, error: 'CID must be a non-empty string' }
  }

  if (!cidString.startsWith('b')) {
    return { valid: false, error: 'Invalid CID format: CID v1 must start with "b"' }
  }

  return { valid: true }
}

/**
 * 解析 most:// 链接并提取 CID
 * @param {string} link - most://<cid> 格式的链接
 * @returns {{ cid: string, error?: string }}
 */
export function parseMostLink(link) {
  if (!link || typeof link !== 'string') {
    return { cid: '', error: 'Link must be a non-empty string' }
  }

  let cidString = link
  
  if (link.startsWith('most://')) {
    cidString = link.replace('most://', '')
  }

  // 移除尾部斜杠和空白
  cidString = cidString.trim().replace(/\/+$/, '')
  
  // 移除 query string
  if (cidString.includes('?')) {
    cidString = cidString.split('?')[0]
  }

  // 处理可能的额外路径的 URL 解析
  if (cidString.includes('/')) {
    cidString = cidString.split('/')[0]
  }

  const validation = validateCidString(cidString)
  if (!validation.valid) {
    return { cid: '', error: validation.error }
  }

  return { cid: cidString }
}