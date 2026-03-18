/**
 * MostBoxEngine - Core P2P Engine
 * Platform-agnostic engine for P2P file sharing using Hyperswarm/Hyperdrive
 */

import EventEmitter from 'eventemitter3'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'
import { CID } from 'multiformats/cid'
import fs from 'node:fs'
import path from 'node:path'

import { calculateCid, parseMostLink } from './src/core/cid.js'
import { sanitizeFilename, validateAndSanitizePath, validateFileSize, checkDirectoryWritable, formatFileSize } from './src/utils/security.js'
import { ValidationError, PathSecurityError, FileSizeError, PeerNotFoundError, IntegrityError, PermissionError, EngineNotInitializedError, toPlainError } from './src/utils/errors.js'
import { GLOBAL_SHARED_SEED_STRING, MAX_FILE_SIZE } from './src/config.js'

export class MostBoxEngine extends EventEmitter {
  #store = null
  #swarm = null
  #drives = new Map()
  #publishedFiles = []
  #initialized = false
  #options = null

  /**
   * Create a new MostBoxEngine instance
   * @param {object} options - Configuration options
   * @param {string} options.storagePath - Path to store P2P data (required)
   * @param {string} [options.downloadPath] - Default download path (optional, defaults to storagePath/downloads)
   * @param {number} [options.maxFileSize] - Maximum file size in bytes (default: 100GB)
   */
  constructor(options) {
    super()
    
    if (!options || !options.storagePath) {
      throw new Error('storagePath is required')
    }
    
    this.#options = {
      storagePath: options.storagePath,
      downloadPath: options.downloadPath || path.join(options.storagePath, 'downloads'),
      maxFileSize: options.maxFileSize || MAX_FILE_SIZE
    }
  }

  /**
   * Initialize the engine - must be called before other methods
   */
  async start() {
    if (this.#initialized) {
      return
    }

    const { storagePath } = this.#options
    
    // Create storage directory if not exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }

    // Initialize Corestore with global shared seed
    const GLOBAL_SHARED_SEED = b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING)
    this.#store = new Corestore(storagePath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })
    
    try {
      await this.#store.ready()
    } catch (err) {
      if (err.message && err.message.includes('Another corestore is stored here')) {
        // Reset corrupt storage
        fs.rmSync(storagePath, { recursive: true, force: true })
        fs.mkdirSync(storagePath, { recursive: true })
        this.#store = new Corestore(storagePath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })
        await this.#store.ready()
      } else {
        throw err
      }
    }

    // Initialize Hyperswarm
    this.#swarm = new Hyperswarm()
    
    // Replicate store on new connections
    this.#swarm.on('connection', (conn) => {
      this.#store.replicate(conn)
      this.emit('connection', conn)
    })

    // Load published files metadata
    this.#publishedFiles = this.#loadPublishedMetadata()
    
    this.#initialized = true
    this.emit('ready')
    
    return this
  }

  /**
   * Stop the engine and cleanup resources
   */
  async stop() {
    if (!this.#initialized) {
      return
    }

    // Close all drives
    for (const drive of this.#drives.values()) {
      await drive.close()
    }
    this.#drives.clear()

    // Destroy swarm
    if (this.#swarm) {
      await this.#swarm.destroy()
      this.#swarm = null
    }

    // Close store
    if (this.#store) {
      await this.#store.close()
      this.#store = null
    }

    this.#initialized = false
    this.emit('stopped')
  }

  /**
   * Get the node's public key
   * @returns {string} Node ID as hex string
   */
  getNodeId() {
    this.#ensureInitialized()
    return b4a.toString(this.#swarm.keyPair.publicKey, 'hex')
  }

  /**
   * Get current network status
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
   * Publish a file to the P2P network
   * @param {string} filePath - Absolute path to the file
   * @param {string} [fileName] - Name for the file (defaults to basename)
   * @returns {Promise<{ cid: string, link: string, fileName: string }>}
   */
  async publishFile(filePath, fileName) {
    this.#ensureInitialized()

    // Validate path
    const pathValidation = validateAndSanitizePath(filePath)
    if (pathValidation.error) {
      throw new PathSecurityError(pathValidation.error)
    }
    const cleanPath = pathValidation.cleanPath

    // Validate file size
    const sizeValidation = await validateFileSize(cleanPath, this.#options.maxFileSize)
    if (!sizeValidation.valid) {
      throw new FileSizeError(sizeValidation.error, sizeValidation.size)
    }

    // Sanitize filename
    const safeFileName = sanitizeFilename(fileName || path.basename(cleanPath))

    this.emit('publish:progress', { stage: 'calculating-cid', file: safeFileName })

    // Calculate CID
    const { cid: rootCid } = await calculateCid(cleanPath)
    const hashHex = b4a.toString(rootCid.multihash.digest, 'hex')
    const cidString = rootCid.toString()

    // Create/Get Hyperdrive
    const name = `drive-${hashHex}`
    let drive = this.#drives.get(name)
    
    if (!drive) {
      drive = new Hyperdrive(this.#store.namespace(name))
      await drive.ready()
      this.#drives.set(name, drive)
      
      // Join P2P network
      const discovery = this.#swarm.join(drive.discoveryKey)
      await discovery.flushed()
    }

    this.emit('publish:progress', { stage: 'uploading', file: safeFileName })

    // Stream file into drive
    const rs = fs.createReadStream(cleanPath)
    const ws = drive.createWriteStream(safeFileName)

    await new Promise((resolve, reject) => {
      rs.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
      rs.on('error', reject)
    })

    // Update published files list
    const existingIndex = this.#publishedFiles.findIndex(f => f.cid === cidString)
    if (existingIndex === -1) {
      this.#publishedFiles.push({
        fileName: safeFileName,
        cid: cidString,
        publishedAt: new Date().toISOString(),
        originalPath: cleanPath
      })
    } else {
      this.#publishedFiles[existingIndex].publishedAt = new Date().toISOString()
      this.#publishedFiles[existingIndex].fileName = safeFileName
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
   * Download a file from the P2P network
   * @param {string} link - most:// link
   * @param {string} [downloadPath] - Path to save the file (defaults to configured downloadPath)
   * @param {object} [callbacks] - Progress callbacks
   * @returns {Promise<{ fileName: string, savedPath: string }>}
   */
  async downloadFile(link, downloadPath, callbacks = {}) {
    this.#ensureInitialized()

    const targetDir = downloadPath || this.#options.downloadPath

    // Parse link
    const parsed = parseMostLink(link)
    if (parsed.error) {
      throw new ValidationError(parsed.error)
    }
    const cidString = parsed.cid

    // Parse CID
    const parsedCid = CID.parse(cidString)
    const hashBytes = parsedCid.multihash.digest
    const hashHex = b4a.toString(hashBytes, 'hex')

    // Get/Create drive
    const name = `drive-${hashHex}`
    let drive = this.#drives.get(name)
    
    if (!drive) {
      drive = new Hyperdrive(this.#store.namespace(name))
      await drive.ready()
      this.#drives.set(name, drive)
      
      this.emit('download:status', { status: 'connecting' })
      if (callbacks.onStatus) callbacks.onStatus('connecting')
      
      await this.#swarm.join(drive.discoveryKey).flushed()
    }

    this.emit('download:status', { status: 'finding-peers' })
    if (callbacks.onStatus) callbacks.onStatus('finding-peers')

    // Get file list
    const entries = []
    for await (const entry of drive.list()) {
      entries.push(entry)
    }

    if (entries.length === 0) {
      throw new PeerNotFoundError('No files found in drive. Please ensure publisher is online.')
    }

    // Check download directory
    const writableCheck = await checkDirectoryWritable(targetDir)
    if (!writableCheck.writable) {
      throw new PermissionError(writableCheck.error)
    }

    // Download files
    for (const entry of entries) {
      const sanitizedFileName = sanitizeFilename(entry.key.replace(/^[\/\\]/, ''))
      
      // Get file size
      let totalBytes = 0
      try {
        const stat = await drive.entry(entry.key)
        if (stat && stat.value && stat.value.blob) {
          totalBytes = stat.value.blob.byteLength || 0
        }
      } catch {
        // Ignore
      }

      const savePath = path.join(targetDir, sanitizedFileName)
      
      this.emit('download:status', { 
        status: 'downloading', 
        file: sanitizedFileName, 
        size: totalBytes ? formatFileSize(totalBytes) : null 
      })
      if (callbacks.onStatus) {
        callbacks.onStatus(`Downloading: ${sanitizedFileName}${totalBytes ? ` (${formatFileSize(totalBytes)})` : ''}`)
      }

      // Download with progress
      const rs = drive.createReadStream(entry.key)
      const ws = fs.createWriteStream(savePath)
      
      let loadedBytes = 0
      let lastProgressUpdate = 0
      
      await new Promise((resolve, reject) => {
        rs.on('data', (chunk) => {
          loadedBytes += chunk.length
          const now = Date.now()
          if (totalBytes > 0 && now - lastProgressUpdate > 500) {
            lastProgressUpdate = now
            const percent = Math.round((loadedBytes / totalBytes) * 100)
            this.emit('download:progress', { loaded: loadedBytes, total: totalBytes, percent })
            if (callbacks.onProgress) {
              callbacks.onProgress({ loadedBytes, totalBytes, percent })
            }
          }
        })
        
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })

      // Verify integrity
      this.emit('download:status', { status: 'verifying' })
      if (callbacks.onStatus) callbacks.onStatus('verifying')

      const { cid: downloadedCid } = await calculateCid(savePath)
      const expectedHash = b4a.toString(parsedCid.multihash.digest, 'hex')
      const actualHash = b4a.toString(downloadedCid.multihash.digest, 'hex')

      if (expectedHash !== actualHash) {
        fs.unlinkSync(savePath)
        throw new IntegrityError(`File content CID mismatch. File may be corrupted or tampered.`)
      }

      const result = {
        fileName: sanitizedFileName,
        savedPath: savePath
      }

      this.emit('download:success', result)
      return result
    }
  }

  /**
   * List all published files
   * @returns {Array<{ fileName: string, cid: string, link: string, publishedAt: string }>}
   */
  listPublishedFiles() {
    this.#ensureInitialized()
    return this.#publishedFiles.map(f => ({
      fileName: f.fileName,
      cid: f.cid,
      link: `most://${f.cid}`,
      publishedAt: f.publishedAt
    }))
  }

  /**
   * Delete a published file record
   * @param {string} cid - CID of the file to delete
   * @returns {Array} Updated list of published files
   */
  deletePublishedFile(cid) {
    this.#ensureInitialized()
    const index = this.#publishedFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      this.#publishedFiles.splice(index, 1)
      this.#savePublishedMetadata()
    }
    return this.listPublishedFiles()
  }

  // --- Private methods ---

  #ensureInitialized() {
    if (!this.#initialized) {
      throw new EngineNotInitializedError()
    }
  }

  #getMetadataPath() {
    return path.join(this.#options.storagePath, 'published-files.json')
  }

  #loadPublishedMetadata() {
    try {
      const metadataPath = this.#getMetadataPath()
      if (fs.existsSync(metadataPath)) {
        const data = fs.readFileSync(metadataPath, 'utf-8')
        return JSON.parse(data)
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
}

// Re-export utilities and constants
export * from './src/config.js'
export * from './src/constants.js'
export * from './src/core/cid.js'
export * from './src/utils/errors.js'
export * from './src/utils/security.js'