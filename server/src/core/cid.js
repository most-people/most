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
    put: async (key, _val) => key,
    get: async () => {
      throw new Error('Not implemented')
    },
    has: async () => false,
  }
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
    return {
      valid: false,
      error: 'Invalid CID format: CID v1 must start with "b"',
    }
  }

  return { valid: true }
}

/**
 * 解析 most:// 链接并提取 CID 与完整性校验锚
 * @param {string} link - most://<cid>?filename=...&r=... 格式的链接
 * @returns {{ cid: string, fileName?: string, chunkMerkleRoot?: string, error?: string }}
 */
export function parseMostLink(link) {
  if (!link || typeof link !== 'string') {
    return { cid: '', error: 'Link must be a non-empty string' }
  }

  let url
  try {
    url = new URL(link)
  } catch {
    return { cid: '', error: 'Link must be a valid most:// URL' }
  }

  if (url.protocol !== 'most:') {
    return { cid: '', error: 'Link must use most:// protocol' }
  }

  if (url.pathname && url.pathname !== '/') {
    return { cid: '', error: 'Link path is not supported' }
  }

  const cidString = url.hostname
  const fileName = url.searchParams.get('filename')
  const chunkMerkleRoot = url.searchParams.get('r')

  const validation = validateCidString(cidString)
  if (!validation.valid) {
    return { cid: '', error: validation.error }
  }

  if (!fileName) {
    return { cid: '', error: 'filename is required' }
  }

  if (!chunkMerkleRoot || !/^[0-9a-f]{64}$/.test(chunkMerkleRoot)) {
    return {
      cid: '',
      error: 'r must be a 64-character hex string',
    }
  }

  return { cid: cidString, fileName, chunkMerkleRoot }
}
