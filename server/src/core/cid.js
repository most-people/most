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
} from './mostLink.js'

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
