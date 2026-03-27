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

import { calculateCid, parseMostLink } from './core/cid.js'
import { sanitizeFilename, validateAndSanitizePath, validateFileSize, checkDirectoryWritable, formatFileSize } from './utils/security.js'
import { ValidationError, PathSecurityError, FileSizeError, PeerNotFoundError, IntegrityError, PermissionError, EngineNotInitializedError } from './utils/errors.js'
import { GLOBAL_SHARED_SEED_STRING, MAX_FILE_SIZE, CONNECTION_TIMEOUT, DOWNLOAD_TIMEOUT, SWARM_BOOTSTRAP } from './config.js'

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
    
    console.log(`[MostBox] Initializing engine...`)
    console.log(`[MostBox] Storage path: ${storagePath}`)
    
    // Create storage directory if not exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }

    // Initialize Corestore with global shared seed
    const GLOBAL_SHARED_SEED = b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING)
    this.#store = new Corestore(storagePath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })
    
    try {
      await this.#store.ready()
      console.log(`[MostBox] Corestore ready`)
    } catch (err) {
      if (err.message && err.message.includes('Another corestore is stored here')) {
        console.log(`[MostBox] Resetting corrupt storage...`)
        // Reset corrupt storage
        fs.rmSync(storagePath, { recursive: true, force: true })
        fs.mkdirSync(storagePath, { recursive: true })
        this.#store = new Corestore(storagePath, { primaryKey: GLOBAL_SHARED_SEED, unsafe: true })
        await this.#store.ready()
        console.log(`[MostBox] Corestore reset and ready`)
      } else {
        throw err
      }
    }

    // Initialize Hyperswarm with NAT traversal enabled
    console.log(`[MostBox] Initializing Hyperswarm...`)
    this.#swarm = new Hyperswarm({
      // Connection settings for better stability
      maxPeers: 64,
      // DHT bootstrap nodes (same as Keet.io/HyperDHT)
      bootstrap: SWARM_BOOTSTRAP,
      // Enable NAT traversal (hole punching)
      // firewall function: allow all connections (default behavior)
      firewall: () => false,
      // Connection keep-alive timeout (5 seconds)
      connectionKeepAlive: 5000,
      // Random punch interval for NAT traversal (20 seconds)
      randomPunchInterval: 20000,
      // Increase timeouts for unstable networks
      handshakeTimeout: CONNECTION_TIMEOUT
    })

    // Handle swarm-level errors
    this.#swarm.on('error', (err) => {
      // Silently handle SSL/network errors - they're non-critical for DHT discovery
      if (err.code === 'SSL_ERROR' || err.message?.includes('handshake') || err.message?.includes('ECONNRESET')) {
        console.warn('[MostBox] Network warning (non-critical):', err.message)
        return
      }
      console.error('[MostBox] Swarm error:', err.message)
      this.emit('error', err)
    })

    // Replicate store on new connections
    this.#swarm.on('connection', (conn, info) => {
      console.log(`[MostBox] New peer connection established`)
      // Handle connection errors gracefully
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

    // Load published files metadata
    this.#publishedFiles = this.#loadPublishedMetadata()
    console.log(`[MostBox] Loaded ${this.#publishedFiles.length} published files`)
    
    this.#initialized = true
    console.log(`[MostBox] Engine initialized successfully`)
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
      
      // Join P2P network as server (we're publishing/sharing the file)
      const discovery = this.#swarm.join(drive.discoveryKey, { server: true, client: false })
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
   * @param {object} [callbacks] - Progress callbacks
   * @returns {Promise<{ fileName: string, savedPath: string, alreadyExists?: boolean }>}
   */
  async downloadFile(link, callbacks = {}) {
    this.#ensureInitialized()

    console.log(`[MostBox] Starting download for link: ${link}`)

    // Parse link
    const parsed = parseMostLink(link)
    if (parsed.error) {
      throw new ValidationError(parsed.error)
    }
    const cidString = parsed.cid
    console.log(`[MostBox] Parsed CID: ${cidString}`)

    // Check if file already exists in published files
    const existingFile = this.#publishedFiles.find(f => f.cid === cidString)
    if (existingFile) {
      console.log(`[MostBox] File already exists: ${existingFile.fileName}`)
      return {
        fileName: existingFile.fileName,
        savedPath: existingFile.originalPath,
        alreadyExists: true
      }
    }

    // Parse CID
    const parsedCid = CID.parse(cidString)
    const hashBytes = parsedCid.multihash.digest
    const hashHex = b4a.toString(hashBytes, 'hex')

    // Get/Create drive
    const name = `drive-${hashHex}`
    let drive = this.#drives.get(name)
    
    if (!drive) {
      console.log(`[MostBox] Creating new drive: ${name}`)
      drive = new Hyperdrive(this.#store.namespace(name))
      await drive.ready()
      this.#drives.set(name, drive)
      
      this.emit('download:status', { status: 'connecting' })
      if (callbacks.onStatus) callbacks.onStatus('connecting')
      
      console.log(`[MostBox] Joining swarm for drive discovery...`)
      // Join as client only (we're downloading, not serving)
      await this.#swarm.join(drive.discoveryKey, { server: false, client: true }).flushed()
      console.log(`[MostBox] Swarm join flushed`)
    } else {
      console.log(`[MostBox] Using existing drive: ${name}`)
    }

    this.emit('download:status', { status: 'finding-peers' })
    if (callbacks.onStatus) callbacks.onStatus('finding-peers')

    // Wait for peers and data to sync
    console.log(`[MostBox] Waiting for drive content (timeout: ${DOWNLOAD_TIMEOUT/1000}s)...`)
    const entries = await this.#waitForDriveContent(drive, DOWNLOAD_TIMEOUT)

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

    console.log(`[MostBox] Found ${entries.length} entries, starting download...`)

    // Save to storage directory (not Downloads folder)
    const targetDir = this.#options.storagePath

    // Check storage directory
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

      // 将下载的文件添加到已发布文件列表
      const existingIndex = this.#publishedFiles.findIndex(f => f.cid === cidString)
      if (existingIndex === -1) {
        this.#publishedFiles.push({
          fileName: sanitizedFileName,
          cid: cidString,
          publishedAt: new Date().toISOString(),
          originalPath: savePath
        })
      } else {
        this.#publishedFiles[existingIndex].publishedAt = new Date().toISOString()
        this.#publishedFiles[existingIndex].fileName = sanitizedFileName
        this.#publishedFiles[existingIndex].originalPath = savePath
      }
      this.#savePublishedMetadata()

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
      publishedAt: f.publishedAt,
      originalPath: f.originalPath
    }))
  }

  /**
   * Delete a published file record and remove the file from Hyperdrive
   * @param {string} cid - CID of the file to delete
   * @returns {Promise<Array>} Updated list of published files
   */
  async deletePublishedFile(cid) {
    this.#ensureInitialized()
    const index = this.#publishedFiles.findIndex(f => f.cid === cid)
    if (index !== -1) {
      const fileRecord = this.#publishedFiles[index]
      
      // Delete original file from uploads directory
      if (fileRecord.originalPath && fs.existsSync(fileRecord.originalPath)) {
        try {
          fs.unlinkSync(fileRecord.originalPath)
        } catch (err) {
          // File may be locked or already deleted
        }
      }
      
      // Reconstruct drive name from CID
      const parsedCid = CID.parse(cid)
      const hashHex = b4a.toString(parsedCid.multihash.digest, 'hex')
      const driveName = `drive-${hashHex}`
      
      // Delete file from Hyperdrive and cleanup drive
      const drive = this.#drives.get(driveName)
      if (drive) {
        try {
          await drive.del(fileRecord.fileName)
        } catch (err) {
          // File may not exist in drive, continue with cleanup
        }
        
        // Leave swarm for this drive
        this.#swarm.leave(drive.discoveryKey)
        
        // Close and remove drive
        await drive.close()
        this.#drives.delete(driveName)
      }
      
      // Remove metadata record
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

  /**
   * Wait for drive content to be available from peers or local
   * @param {Hyperdrive} drive - The drive to check
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<Array>} - List of entries
   */
  async #waitForDriveContent(drive, timeout) {
    const startTime = Date.now()
    const checkInterval = 1000 // Check every second
    let lastPeerCount = 0
    let lastStatus = ''
    let bootstrapNodesChecked = false

    // First, check if content is already available locally (for self-published files)
    const localEntries = []
    try {
      for await (const entry of drive.list()) {
        localEntries.push(entry)
      }
      if (localEntries.length > 0) {
        console.log(`[MostBox] Found ${localEntries.length} entries locally`)
        this.emit('download:status', { status: 'syncing' })
        return localEntries
      }
    } catch (err) {
      // Continue to peer discovery
    }

    while (Date.now() - startTime < timeout) {
      const currentTime = Date.now()
      const elapsed = Math.round((currentTime - startTime) / 1000)
      
      // Check if we have peers
      const currentPeerCount = this.#swarm.connections.size
      const hasPeers = currentPeerCount > 0

      // Log peer count changes
      if (currentPeerCount !== lastPeerCount) {
        console.log(`[MostBox] Peer count changed: ${lastPeerCount} -> ${currentPeerCount} (elapsed: ${elapsed}s)`)
        lastPeerCount = currentPeerCount
      }

      // Try to list entries (works for both local and synced data)
      const entries = []
      try {
        for await (const entry of drive.list()) {
          entries.push(entry)
        }
      } catch (err) {
        // Drive might not be ready yet
      }

      if (entries.length > 0) {
        console.log(`[MostBox] Found ${entries.length} entries after ${elapsed}s`)
        this.emit('download:status', { status: 'syncing' })
        return entries
      }

      // Update status based on peer connection
      if (hasPeers) {
        const newStatus = 'syncing'
        if (lastStatus !== newStatus) {
          this.emit('download:status', { status: newStatus })
          lastStatus = newStatus
        }
      } else {
        const newStatus = 'finding-peers'
        if (lastStatus !== newStatus) {
          this.emit('download:status', { status: newStatus })
          lastStatus = newStatus
        }
        
        // Log progress every 30 seconds
        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(`[MostBox] Still waiting for peers... (${elapsed}s elapsed, timeout: ${timeout/1000}s)`)
          
          // Check if bootstrap nodes are reachable (only once)
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

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    console.log(`[MostBox] Timeout reached after ${timeout/1000}s, making final attempt...`)

    // Final attempt - return whatever we have (might be empty)
    const entries = []
    try {
      for await (const entry of drive.list()) {
        entries.push(entry)
      }
    } catch (err) {
      console.log(`[MostBox] Final attempt failed: ${err.message}`)
    }
    
    console.log(`[MostBox] Final entry count: ${entries.length}`)
    
    // Provide detailed error information
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

// Re-export utilities
export * from './config.js'
export * from './core/cid.js'
export * from './utils/errors.js'
export * from './utils/security.js'