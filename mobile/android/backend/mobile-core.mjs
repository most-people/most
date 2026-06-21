import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { importer } from 'ipfs-unixfs-importer'
import { CID } from 'multiformats/cid'

const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'
const MAX_PEERS = 64
const CONNECTION_TIMEOUT = 120000
const DOWNLOAD_TIMEOUT = 900000
const STREAM_READ_TIMEOUT = 10000
const FILE_WRITE_CHUNK_SIZE = 64 * 1024
const DOWNLOAD_POLL_INTERVAL_MIN = 500
const DOWNLOAD_POLL_INTERVAL_MAX = 2000
const DRIVE_UPDATE_INTERVAL = 2000
const PROGRESS_THROTTLE = 500
const HOLDINGS_FILE = 'node-holdings.json'

const SWARM_BOOTSTRAP = [
  '88.99.3.86@node1.hyperdht.org:49737',
  '142.93.90.113@node2.hyperdht.org:49737',
  '138.68.147.8@node3.hyperdht.org:49737',
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

function createDummyBlockstore() {
  return {
    put: async (key, _value) => key,
    get: async () => {
      throw new Error('Not implemented')
    },
    has: async () => false,
  }
}

function ensureDirectory(dir) {
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath)
  } catch {}
}

function safeRm(filePath) {
  try {
    fs.rmSync(filePath, { force: true })
  } catch {
    safeUnlink(filePath)
  }
}

function atomicWrite(filePath, data) {
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, data, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function sanitizeFilename(name) {
  const text = String(name || '').trim()
  const cleaned = text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim()
  return cleaned || 'mostbox-file'
}

function splitMostLink(link) {
  const value = String(link || '').trim()
  if (!value) throw new Error('most:// link is required')
  if (!value.startsWith('most://')) {
    throw new Error('Link must start with most://')
  }

  const rest = value.slice('most://'.length)
  const queryIndex = rest.indexOf('?')
  const authorityAndPath =
    queryIndex === -1 ? rest : rest.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : rest.slice(queryIndex + 1)

  const slashIndex = authorityAndPath.indexOf('/')
  if (slashIndex !== -1 && slashIndex !== authorityAndPath.length - 1) {
    throw new Error('most:// link cannot contain an extra path')
  }

  const cid = authorityAndPath.replace(/\/$/, '')
  let fileName = cid

  if (query) {
    for (const part of query.split('&')) {
      if (!part) continue
      const [rawKey, rawValue = ''] = part.split('=')
      const key = decodeURIComponent(rawKey)
      if (key !== 'filename') {
        throw new Error('most:// link only supports filename query')
      }
      const decoded = decodeURIComponent(rawValue.replace(/\+/g, '%20')).trim()
      if (decoded) fileName = decoded
    }
  }

  return {
    cid,
    fileName: sanitizeFilename(fileName),
  }
}

function getCidInfo(cid) {
  let parsed
  try {
    parsed = CID.parse(String(cid || ''))
  } catch {
    throw new Error('Invalid CID format')
  }

  if (parsed.version !== 1) {
    throw new Error('CID v1 required')
  }

  const topic = b4a.from(parsed.multihash.digest)
  if (topic.byteLength !== 32) {
    throw new Error('CID digest must be 32 bytes')
  }

  const topicHex = b4a.toString(topic, 'hex')
  return {
    cid: parsed.toString(),
    topic,
    topicHex,
    driveName: `drive-${topicHex}`,
  }
}

function buildMostLink(cid, fileName) {
  const cleanName = String(fileName || '').trim()
  if (!cleanName) return `most://${cid}`
  return `most://${cid}?filename=${encodeURIComponent(cleanName)}`
}

function normalizeFileUri(uri) {
  const value = String(uri || '').trim()
  if (value.startsWith('file://')) {
    return decodeURIComponent(value.slice('file://'.length))
  }
  return value
}

async function calculateCid(input) {
  const blockstore = createDummyBlockstore()
  let rootCid = null
  let size = 0
  let content

  if (input.buffer) {
    size = input.buffer.byteLength
    content = [input.buffer]
  } else if (input.filePath) {
    const filePath = normalizeFileUri(input.filePath)
    const stat = await fs.stat(filePath)
    size = stat.size || 0
    content = fs.createReadStream(filePath)
  } else {
    throw new Error('File content is required')
  }

  for await (const entry of importer(
    [
      {
        path: 'file',
        content,
      },
    ],
    blockstore,
    {
      cidVersion: 1,
      rawLeaves: true,
      wrapWithDirectory: false,
    }
  )) {
    rootCid = entry.cid
  }

  if (!rootCid) {
    throw new Error('Failed to calculate CID: no root CID generated')
  }

  return {
    cid: rootCid.toString(),
    size,
  }
}

async function writeBufferToDrive(drive, driveKey, buffer) {
  const ws = drive.createWriteStream(driveKey)

  await new Promise((resolve, reject) => {
    let offset = 0
    let settled = false

    const fail = err => {
      if (settled) return
      settled = true
      ws.destroy(err)
      reject(err)
    }

    const writeMore = () => {
      try {
        while (offset < buffer.byteLength) {
          const chunk = buffer.subarray(offset, offset + FILE_WRITE_CHUNK_SIZE)
          offset += chunk.byteLength
          if (!ws.write(chunk)) {
            ws.once('drain', writeMore)
            return
          }
        }
        ws.end()
      } catch (err) {
        fail(err)
      }
    }

    ws.on('finish', () => {
      if (settled) return
      settled = true
      resolve()
    })
    ws.on('error', fail)
    writeMore()
  })
}

async function pipeFileToDrive(filePath, drive, driveKey) {
  const rs = fs.createReadStream(normalizeFileUri(filePath))
  const ws = drive.createWriteStream(driveKey)

  await new Promise((resolve, reject) => {
    let settled = false
    const fail = err => {
      if (settled) return
      settled = true
      rs.destroy(err)
      ws.destroy(err)
      reject(err)
    }
    const complete = () => {
      if (settled) return
      settled = true
      resolve()
    }

    rs.pipe(ws)
    rs.on('error', fail)
    ws.on('error', fail)
    ws.on('finish', complete)
  })
}

async function pipeDriveToFile(stream, targetPath, options = {}) {
  const ws = fs.createWriteStream(targetPath)
  const timeout = options.timeout ?? STREAM_READ_TIMEOUT
  const onProgress = options.onProgress || (() => {})

  await new Promise((resolve, reject) => {
    let settled = false
    let loaded = 0
    let lastProgressAt = 0
    let readTimer = null

    const clearReadTimer = () => {
      if (readTimer) {
        clearTimeout(readTimer)
        readTimer = null
      }
    }

    const fail = err => {
      if (settled) return
      settled = true
      clearReadTimer()
      stream.destroy(err)
      ws.destroy(err)
      reject(err)
    }

    const complete = () => {
      if (settled) return
      settled = true
      clearReadTimer()
      resolve()
    }

    const resetReadTimer = () => {
      clearReadTimer()
      if (timeout > 0) {
        readTimer = setTimeout(() => {
          fail(new Error(`Download stalled: no data received for ${timeout / 1000}s`))
        }, timeout)
      }
    }

    resetReadTimer()

    stream.on('data', chunk => {
      resetReadTimer()
      loaded += chunk.byteLength
      const now = Date.now()
      if (now - lastProgressAt > PROGRESS_THROTTLE) {
        lastProgressAt = now
        onProgress(loaded)
      }
    })

    stream.pipe(ws)
    stream.on('error', fail)
    ws.on('error', fail)
    ws.on('finish', complete)
  })
}

function uniqueSavePath(downloadPath, fileName) {
  const cleanName = sanitizeFilename(fileName)
  const ext = path.extname(cleanName)
  const base = ext ? cleanName.slice(0, -ext.length) : cleanName
  let candidate = path.join(downloadPath, cleanName)
  let index = 1

  while (fs.existsSync(candidate)) {
    candidate = path.join(downloadPath, `${base}-${index}${ext}`)
    index += 1
  }

  return candidate
}

export class MobileP2PCore {
  #storagePath
  #downloadPath
  #send
  #store = null
  #swarm = null
  #drives = new Map()
  #drivePromises = new Map()
  #discoveries = new Map()
  #holdings = []
  #seedStates = new Map()
  #transfers = []
  #logs = []
  #node = {
    status: 'idle',
    peerCount: 0,
    storagePath: '',
    error: '',
  }

  constructor(options = {}) {
    this.#storagePath = normalizeFileUri(options.storagePath || '')
    this.#downloadPath = path.join(this.#storagePath, 'downloads')
    this.#send = options.send || (() => {})
    this.#node.storagePath = this.#storagePath
  }

  getSnapshot() {
    return {
      node: { ...this.#node, peerCount: this.#peerCount() },
      holdings: this.#holdings.map(holding => this.#toMobileHolding(holding)),
      transfers: this.#transfers.map(transfer => ({ ...transfer })),
      logs: this.#logs.map(log => ({ ...log })),
    }
  }

  async start() {
    if (this.#node.status === 'ready') return this.getSnapshot()

    this.#node = {
      ...this.#node,
      status: 'starting',
      error: '',
    }
    this.#emitSnapshot()

    ensureDirectory(this.#storagePath)
    ensureDirectory(this.#downloadPath)

    const primaryKey = b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING)
    this.#store = new Corestore(this.#storagePath, {
      primaryKey,
      unsafe: true,
    })
    await this.#store.ready()

    this.#swarm = new Hyperswarm({
      maxPeers: MAX_PEERS,
      bootstrap: SWARM_BOOTSTRAP,
      firewall: () => false,
      connectionKeepAlive: 5000,
      randomPunchInterval: 20000,
      handshakeTimeout: CONNECTION_TIMEOUT,
    })

    this.#swarm.on('connection', conn => {
      conn.on('error', () => {})
      this.#store.replicate(conn)
      this.#emitNetworkStatus()
    })
    this.#swarm.on('update', () => this.#emitNetworkStatus())
    this.#swarm.on('error', err => {
      const message = err && err.message ? err.message : 'Hyperswarm error'
      this.#log('warn', message)
    })

    this.#holdings = this.#loadHoldings()
    for (const holding of this.#holdings) {
      this.#seedStates.set(holding.cid, {
        status: 'queued',
        topic: holding.topic,
        driveName: holding.driveName,
      })
    }

    this.#node = {
      ...this.#node,
      status: 'ready',
      error: '',
    }
    this.#log('info', 'MostBox Android P2P core is ready')
    this.#emitSnapshot()

    for (const holding of [...this.#holdings]) {
      this.#joinCidTopic(holding.cid, { server: true, client: false }).catch(err => {
        this.#setSeedState(holding.cid, { status: 'error', error: err.message })
      })
    }

    return this.getSnapshot()
  }

  async stop() {
    this.#node = { ...this.#node, status: 'stopping' }
    this.#emitSnapshot()

    if (this.#swarm) {
      await this.#swarm.destroy()
      this.#swarm = null
    }

    await Promise.allSettled([...this.#drives.values()].map(drive => drive.close()))
    this.#drives.clear()
    this.#drivePromises.clear()
    this.#discoveries.clear()

    if (this.#store) {
      await this.#store.close()
      this.#store = null
    }

    this.#node = {
      ...this.#node,
      status: 'idle',
      peerCount: 0,
      error: '',
    }
    this.#emitSnapshot()
  }

  listHoldings() {
    return this.getSnapshot().holdings
  }

  async publishFile(input = {}, requestId = createId('publish')) {
    this.#ensureReady()
    const fileName = sanitizeFilename(input.name || input.fileName)
    const transfer = this.#upsertTransfer({
      id: requestId,
      kind: 'publish',
      status: 'running',
      fileName,
      progress: 5,
      message: 'Calculating UnixFS CID',
    })

    try {
      const source = this.#createFileSource(input)
      const result = await calculateCid(source)
      const cid = result.cid
      const size = result.size || Number(input.size) || 0
      const { driveName } = getCidInfo(cid)
      const driveKey = `/${cid}`
      const drive = await this.#getOrCreateDrive(driveName)

      this.#upsertTransfer({
        ...transfer,
        cid,
        link: buildMostLink(cid, fileName),
        progress: 30,
        message: 'Writing file into Hyperdrive',
      })

      const existingEntry = await drive.entry(driveKey).catch(() => null)
      if (!existingEntry) {
        if (source.buffer) {
          await writeBufferToDrive(drive, driveKey, source.buffer)
        } else {
          await pipeFileToDrive(source.filePath, drive, driveKey)
        }
      }

      await this.#joinCidTopic(cid, { server: true, client: false })
      const holding = this.#upsertHolding({
        cid,
        fileName,
        size,
        driveName,
        source: 'published',
      })

      const completed = this.#upsertTransfer({
        ...transfer,
        cid,
        link: buildMostLink(cid, fileName),
        status: 'completed',
        progress: 100,
        message: 'Published and seeding',
      })

      this.#log('info', `Published ${fileName} as ${cid.slice(0, 16)}`)
      return {
        transfer: completed,
        holding: this.#toMobileHolding(holding),
      }
    } catch (err) {
      const failed = this.#upsertTransfer({
        ...transfer,
        status: 'failed',
        progress: 0,
        message: err instanceof Error ? err.message : 'Publish failed',
      })
      this.#log('error', failed.message)
      throw err
    }
  }

  async downloadLink(input = {}, requestId = createId('download')) {
    this.#ensureReady()
    const parsed = splitMostLink(input.link)
    const cid = parsed.cid
    const fileName = sanitizeFilename(parsed.fileName)
    const { driveName } = getCidInfo(cid)
    const driveKey = `/${cid}`

    const transfer = this.#upsertTransfer({
      id: requestId,
      kind: 'download',
      status: 'running',
      fileName,
      cid,
      link: buildMostLink(cid, fileName),
      progress: 5,
      message: 'Connecting to CID topic',
    })

    try {
      const drive = await this.#getOrCreateDrive(driveName)
      await this.#joinCidTopic(cid, { server: false, client: true })

      this.#upsertTransfer({
        ...transfer,
        progress: 10,
        message: 'Finding peers',
      })

      const entry = await this.#waitForDriveEntry(
        drive,
        driveKey,
        input.timeout || DOWNLOAD_TIMEOUT,
        requestId
      )

      if (!entry) {
        throw new Error('No online seed was found for this CID')
      }

      const totalBytes = Number(entry?.value?.blob?.byteLength) || 0
      const savePath = uniqueSavePath(this.#downloadPath, fileName)
      const tempPath = `${savePath}.part`
      safeRm(tempPath)

      this.#upsertTransfer({
        ...transfer,
        progress: 20,
        message: 'Downloading file',
      })

      const readStream = drive.createReadStream(driveKey)
      let loaded = 0
      await pipeDriveToFile(readStream, tempPath, {
        timeout: STREAM_READ_TIMEOUT,
        onProgress: nextLoaded => {
          loaded = nextLoaded
          if (totalBytes > 0) {
            const progress = 20 + Math.round((loaded / totalBytes) * 60)
            this.#upsertTransfer({
              ...transfer,
              progress: Math.min(progress, 80),
              message: 'Downloading file',
            })
          }
        },
      })

      this.#upsertTransfer({
        ...transfer,
        progress: 85,
        message: 'Verifying CID',
      })

      const downloaded = await calculateCid({ filePath: tempPath })
      if (downloaded.cid !== cid) {
        safeRm(tempPath)
        throw new Error(`File content CID mismatch. Expected ${cid}, got ${downloaded.cid}.`)
      }

      fs.renameSync(tempPath, savePath)

      await this.#joinCidTopic(cid, { server: true, client: false })
      const savedSize = downloaded.size || totalBytes || fs.statSync(savePath).size || 0
      const holding = this.#upsertHolding({
        cid,
        fileName,
        size: savedSize,
        driveName,
        source: 'downloaded',
      })

      const completed = this.#upsertTransfer({
        ...transfer,
        status: 'completed',
        progress: 100,
        message: `Downloaded to ${savePath}`,
      })

      this.#log('info', `Downloaded and seeding ${cid.slice(0, 16)}`)
      return {
        transfer: completed,
        holding: this.#toMobileHolding(holding),
        savedPath: savePath,
      }
    } catch (err) {
      const failed = this.#upsertTransfer({
        ...transfer,
        status: 'failed',
        progress: 0,
        message: err instanceof Error ? err.message : 'Download failed',
      })
      this.#log('error', failed.message)
      throw err
    }
  }

  #ensureReady() {
    if (this.#node.status !== 'ready' || !this.#store || !this.#swarm) {
      throw new Error('P2P core is not ready')
    }
  }

  #createFileSource(input) {
    if (input.contentBase64) {
      return { buffer: b4a.from(input.contentBase64, 'base64') }
    }
    if (input.filePath || input.uri) {
      return { filePath: normalizeFileUri(input.filePath || input.uri) }
    }
    throw new Error('File content or file path is required')
  }

  async #getOrCreateDrive(name) {
    if (this.#drives.has(name)) return this.#drives.get(name)
    if (this.#drivePromises.has(name)) return this.#drivePromises.get(name)

    const promise = (async () => {
      const drive = new Hyperdrive(this.#store.namespace(name))
      await drive.ready()
      this.#drives.set(name, drive)
      return drive
    })()

    this.#drivePromises.set(name, promise)
    try {
      return await promise
    } finally {
      this.#drivePromises.delete(name)
    }
  }

  async #joinCidTopic(cid, options = {}) {
    const { topic, topicHex, driveName } = getCidInfo(cid)
    const requestedServer = options.server !== false
    const requestedClient = options.client === true

    this.#setSeedState(cid, {
      status: 'joining',
      topic: topicHex,
      driveName,
      error: '',
    })

    await this.#getOrCreateDrive(driveName)

    const existing = this.#discoveries.get(cid)
    if (existing) {
      const nextServer = existing.server || requestedServer
      const nextClient = existing.client || requestedClient
      if (nextServer === existing.server && nextClient === existing.client) {
        this.#setSeedState(cid, {
          status: 'active',
          topic: topicHex,
          driveName,
          error: '',
        })
        return existing
      }

      await this.#swarm.leave(topic).catch(() => {})
      this.#discoveries.delete(cid)
    }

    const discovery = this.#swarm.join(topic, {
      server: existing?.server || requestedServer,
      client: existing?.client || requestedClient,
    })
    const record = {
      discovery,
      topic: topicHex,
      driveName,
      server: existing?.server || requestedServer,
      client: existing?.client || requestedClient,
    }
    this.#discoveries.set(cid, record)
    this.#setSeedState(cid, {
      status: 'active',
      topic: topicHex,
      driveName,
      error: '',
    })

    discovery.flushed?.().then(
      () => this.#emitSnapshot(),
      () => {}
    )

    return record
  }

  async #waitForDriveEntry(drive, driveKey, timeout, transferId) {
    const startedAt = Date.now()
    let pollInterval = DOWNLOAD_POLL_INTERVAL_MIN
    let lastDriveUpdate = 0

    while (Date.now() - startedAt < timeout) {
      const now = Date.now()
      if (now - lastDriveUpdate > DRIVE_UPDATE_INTERVAL) {
        lastDriveUpdate = now
        await drive.update().catch(() => {})
      }

      const entry = await drive.entry(driveKey).catch(() => null)
      if (entry) return entry

      const hasPeers = this.#peerCount() > 0
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      this.#patchTransfer(transferId, {
        progress: hasPeers ? 15 : 10,
        message: hasPeers
          ? `Syncing metadata (${elapsed}s)`
          : `Finding peers (${elapsed}s)`,
      })

      pollInterval = hasPeers
        ? Math.min(pollInterval + 200, DOWNLOAD_POLL_INTERVAL_MAX)
        : DOWNLOAD_POLL_INTERVAL_MIN
      await sleep(pollInterval)
    }

    await drive.update().catch(() => {})
    return drive.entry(driveKey).catch(() => null)
  }

  #normalizeHolding(record = {}) {
    const { cid, topicHex, driveName } = getCidInfo(record.cid)
    const size = Number(record.size)
    if (!Number.isFinite(size) || size < 0) {
      throw new Error('Holding size must be a non-negative number')
    }
    return {
      cid,
      fileName: sanitizeFilename(record.fileName || cid),
      size,
      topic: record.topic || topicHex,
      driveName: record.driveName || driveName,
      source: record.source === 'downloaded' ? 'downloaded' : 'published',
      createdAt: record.createdAt || nowIso(),
      updatedAt: record.updatedAt || nowIso(),
    }
  }

  #upsertHolding(record) {
    const holding = this.#normalizeHolding(record)
    const index = this.#holdings.findIndex(item => item.cid === holding.cid)
    const now = nowIso()
    const next =
      index === -1
        ? { ...holding, createdAt: now, updatedAt: now }
        : { ...this.#holdings[index], ...holding, updatedAt: now }

    if (index === -1) {
      this.#holdings.unshift(next)
    } else {
      this.#holdings[index] = next
    }

    this.#saveHoldings()
    this.#emitSnapshot()
    return next
  }

  #toMobileHolding(holding) {
    const seedState = this.#seedStates.get(holding.cid)
    const status =
      seedState?.status ||
      (this.#discoveries.has(holding.cid) ? 'active' : 'queued')

    return {
      cid: holding.cid,
      fileName: holding.fileName,
      size: holding.size,
      status,
      topicJoined: status === 'active' && this.#discoveries.has(holding.cid),
      peerCount: this.#peerCount(),
      source: holding.source,
      shareLink: buildMostLink(holding.cid, holding.fileName),
    }
  }

  #upsertTransfer(transfer) {
    const index = this.#transfers.findIndex(item => item.id === transfer.id)
    const next = {
      id: transfer.id,
      kind: transfer.kind,
      status: transfer.status,
      fileName: transfer.fileName,
      cid: transfer.cid,
      link: transfer.link,
      progress: transfer.progress,
      message: transfer.message,
    }

    if (index === -1) {
      this.#transfers.unshift(next)
      this.#transfers = this.#transfers.slice(0, 20)
    } else {
      this.#transfers[index] = {
        ...this.#transfers[index],
        ...next,
      }
    }

    this.#emitSnapshot()
    return this.#transfers.find(item => item.id === transfer.id)
  }

  #patchTransfer(id, patch) {
    const current = this.#transfers.find(item => item.id === id)
    if (!current) return null
    return this.#upsertTransfer({
      ...current,
      ...patch,
    })
  }

  #setSeedState(cid, patch) {
    const current = this.#seedStates.get(cid) || {}
    this.#seedStates.set(cid, {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    })
    this.#emitSnapshot()
  }

  #loadHoldings() {
    const filePath = path.join(this.#storagePath, HOLDINGS_FILE)
    try {
      if (!fs.existsSync(filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!Array.isArray(parsed)) return []
      return parsed.map(record => this.#normalizeHolding(record))
    } catch (err) {
      this.#log('warn', `Failed to load holdings: ${err.message}`)
      return []
    }
  }

  #saveHoldings() {
    const filePath = path.join(this.#storagePath, HOLDINGS_FILE)
    atomicWrite(filePath, JSON.stringify(this.#holdings, null, 2))
  }

  #peerCount() {
    return this.#swarm?.connections?.size || 0
  }

  #emitNetworkStatus() {
    this.#node.peerCount = this.#peerCount()
    this.#send('network.status', {
      peerCount: this.#node.peerCount,
      snapshot: this.getSnapshot(),
    })
    this.#emitSnapshot()
  }

  #log(level, message) {
    this.#logs = [
      {
        id: createId('log'),
        time: nowIso(),
        level,
        message,
      },
      ...this.#logs,
    ].slice(0, 50)
    this.#emitSnapshot()
  }

  #emitSnapshot() {
    this.#node.peerCount = this.#peerCount()
    this.#send('snapshot', this.getSnapshot())
  }
}
