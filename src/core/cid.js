/**
 * CID (Content Identifier) Calculation Module
 * Handles IPFS UnixFS CID computation for files
 */

import fs from 'bare-fs'
import { importer } from 'ipfs-unixfs-importer'

/**
 * Dummy Blockstore for CID calculation
 * Does not store any data, only used for streaming CID computation
 */
function createDummyBlockstore() {
  return {
    put: async (key, val) => key,
    get: async () => { throw new Error('Not implemented') },
    has: async () => false
  }
}

/**
 * Calculate IPFS UnixFS CID v1 for a file
 * Uses streaming approach to handle large files efficiently
 * 
 * @param {string} filePath - Absolute path to the file
 * @param {object} options - Calculation options
 * @param {boolean} [options.rawLeaves=true] - Use raw leaves for modern CID
 * @param {number} [options.cidVersion=1] - CID version (0 or 1)
 * @returns {Promise<{cid: import('multiformats/cid').CID, size: number}>}
 */
export async function calculateCid(filePath, options = {}) {
  const {
    rawLeaves = true,
    cidVersion = 1
  } = options

  const blockstore = createDummyBlockstore()
  
  let rootCid = null
  let totalSize = 0
  
  try {
    const stat = await fs.promises.stat(filePath)
    totalSize = stat.size
  } catch {
    // Ignore stat errors, size will be 0
  }

  const source = [{
    path: 'file',
    content: fs.createReadStream(filePath)
  }]

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
 * Validate a CID string
 * @param {string} cidString - CID string to validate
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
 * Parse a most:// link and extract the CID
 * @param {string} link - most://<cid> format link
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

  // Remove any trailing slashes or whitespace
  cidString = cidString.trim().replace(/\/+$/, '')
  
  // Handle URL-like parsing for potential extra paths
  if (cidString.includes('/')) {
    cidString = cidString.split('/')[0]
  }

  const validation = validateCidString(cidString)
  if (!validation.valid) {
    return { cid: '', error: validation.error }
  }

  return { cid: cidString }
}