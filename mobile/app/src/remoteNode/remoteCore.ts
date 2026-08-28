import * as FileSystem from 'expo-file-system/legacy'
import b4a from 'b4a'
import { Platform } from 'react-native'
import { calculateUnixfsCidFromContent } from '../mobileCore/cid'
import { buildMostLink, parseMostLink } from '../mobileCore/protocol'
import type {
  CancelDownloadInput,
  CancelDownloadResult,
  CancelP2PPingInput,
  CoreListener,
  DeleteHoldingInput,
  DeleteHoldingResult,
  DownloadLinkInput,
  ExportHoldingInput,
  ExportHoldingResult,
  MobileCoreSnapshot,
  MobileHolding,
  MobileIdentity,
  MobileLogEntry,
  MobileTransfer,
  MostBoxMobileCore,
  PublishFileInput,
  P2PPing,
  ShareFolderInput,
  ShareFolderResult,
  StartP2PPingInput,
} from '../mobileCore/types'
import {
  buildAuthenticatedWebSocketUrl,
  buildRemoteApiUrl,
  buildRemoteHeaders,
} from './protocol'
import type { RemoteNodeConfig } from '../mobileCore/types'
import { cacheMatchesCid } from './remoteCache'
import {
  asRecord,
  applyRemoteDownloadEvent,
  normalizeRemoteDownloadTask,
  normalizeRemoteHolding,
  readNumber,
  readString,
  type JsonRecord,
} from './remoteState'

const REQUEST_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000
const FILE_READ_CHUNK_BYTES = 256 * 1024
const TERMINAL_PING_STATUSES = new Set([
  'success',
  'partial',
  'failed',
  'cancelled',
  'expired',
])

type DownloadWaiter = {
  cid: string
  resolve: (transfer: MobileTransfer) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type PendingDownloadEvent = {
  event: string
  data: JsonRecord
}

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createInitialSnapshot(config: RemoteNodeConfig): MobileCoreSnapshot {
  return {
    node: {
      status: 'idle',
      peerCount: 0,
      storagePath: '',
      error: '',
      mode: 'remote',
      endpoint: config.url,
      authenticated: false,
      userAddress: '',
      username: '',
    },
    holdings: [],
    transfers: [],
    p2pPing: null,
    logs: [],
  }
}

function createRemoteError(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string }
  error.code = code
  return error
}

export class RemoteMostBoxCore implements MostBoxMobileCore {
  #config: RemoteNodeConfig
  #identity: MobileIdentity | null
  #snapshot: MobileCoreSnapshot
  #listeners = new Set<CoreListener>()
  #socket: WebSocket | null = null
  #started = false
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #reconnectAttempts = 0
  #downloadWaiters = new Map<string, DownloadWaiter>()
  #pendingDownloadEvents = new Map<string, PendingDownloadEvent>()
  #activeRemoteTaskIds = new Set<string>()
  #pingPollTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: RemoteNodeConfig, identity: MobileIdentity | null) {
    this.#config = config
    this.#identity = identity
    this.#snapshot = createInitialSnapshot(config)
  }

  async start() {
    if (this.#started) return
    this.#started = true
    this.#snapshot.node.status = 'starting'
    this.#snapshot.node.error = ''
    this.#emit()

    try {
      const capabilities = asRecord(
        await this.#requestJson('GET', '/api/remote/capabilities')
      )
      if (
        typeof capabilities.remoteAccess !== 'boolean' ||
        typeof capabilities.inviteRequired !== 'boolean' ||
        typeof capabilities.adminAvailable !== 'boolean' ||
        typeof capabilities.listenHost !== 'string'
      ) {
        throw createRemoteError(
          'The address did not return a MostBox node capability response',
          'REMOTE_HTTP_UNREACHABLE'
        )
      }

      this.#snapshot.node.authenticated =
        this.#identity !== null && capabilities.authenticated === true
      this.#snapshot.node.userAddress = this.#identity?.address || ''
      this.#snapshot.node.username = this.#identity?.username || ''
      await this.#refreshNodeStatus()

      if (this.#identity) {
        if (!this.#snapshot.node.authenticated) {
          throw createRemoteError(
            'Remote node did not accept the signed identity',
            'REMOTE_LOGIN_REQUIRED'
          )
        }
        await this.#connectWebSocket()
        await Promise.all([this.#refreshFiles(), this.#refreshDownloadTasks()])
      } else {
        this.#snapshot.holdings = []
        this.#snapshot.transfers = []
      }

      this.#snapshot.node.status = 'ready'
      this.#snapshot.node.error = ''
      this.#pushLog('info', 'Connected to remote node')
    } catch (error) {
      this.#started = false
      if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
      this.#socket?.close()
      this.#socket = null
      this.#snapshot.node.status = 'error'
      this.#snapshot.node.error =
        error instanceof Error ? error.message : 'Remote node connection failed'
      this.#pushLog('error', this.#snapshot.node.error)
      throw error
    }
  }

  async stop() {
    this.#started = false
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null
    if (this.#pingPollTimer) clearTimeout(this.#pingPollTimer)
    this.#pingPollTimer = null
    this.#socket?.close()
    this.#socket = null
    for (const [taskId, waiter] of this.#downloadWaiters) {
      clearTimeout(waiter.timer)
      waiter.reject(
        createRemoteError('Remote connection stopped', 'REMOTE_STOPPED')
      )
      this.#downloadWaiters.delete(taskId)
    }
    this.#pendingDownloadEvents.clear()
    this.#activeRemoteTaskIds.clear()
    this.#snapshot.node.status = 'idle'
    this.#snapshot.node.peerCount = 0
    this.#emit()
  }

  async startP2PPing(input: StartP2PPingInput) {
    await this.#ensureStarted()
    const response = asRecord(
      await this.#requestJson('POST', '/api/p2p/ping', input)
    )
    const ping = asRecord(response).ping
    if (!ping || typeof ping !== 'object') {
      throw createRemoteError(
        'Remote node returned an invalid Ping',
        'REMOTE_INVALID_RESPONSE'
      )
    }
    this.#snapshot.p2pPing = ping as P2PPing
    this.#emit()
    this.#schedulePingPoll(this.#snapshot.p2pPing.id)
    return this.#snapshot.p2pPing
  }

  async cancelP2PPing(input: CancelP2PPingInput = {}) {
    const id = input.id || this.#snapshot.p2pPing?.id
    if (!id) return null
    const response = asRecord(
      await this.#requestJson(
        'DELETE',
        `/api/p2p/ping/${encodeURIComponent(id)}`
      )
    )
    const ping = asRecord(response).ping
    this.#snapshot.p2pPing =
      ping && typeof ping === 'object' ? (ping as P2PPing) : null
    if (this.#pingPollTimer) clearTimeout(this.#pingPollTimer)
    this.#pingPollTimer = null
    this.#emit()
    return this.#snapshot.p2pPing
  }

  async publishFile(input: PublishFileInput) {
    await this.#ensureAuthenticated()
    const id = createId('remote_publish')
    const transfer: MobileTransfer = {
      id,
      kind: 'publish',
      status: 'running',
      fileName: input.name,
      progress: 5,
      message: 'Uploading to remote node',
    }
    this.#snapshot.transfers = [transfer, ...this.#snapshot.transfers]
    this.#emit()

    try {
      const headers = await buildRemoteHeaders({
        baseUrl: this.#config.url,
        invite: this.#config.invite,
        identity: this.#identity,
        method: 'POST',
        path: '/api/publish',
      })
      const body = new FormData()
      if (input.webFile) {
        body.append('file', input.webFile, input.name)
      } else {
        body.append('file', {
          uri: input.uri,
          name: input.name,
          type: input.mimeType || 'application/octet-stream',
        } as unknown as Blob)
      }
      const response = await this.#fetchWithTimeout(
        buildRemoteApiUrl(this.#config.url, '/api/publish'),
        { method: 'POST', headers, body },
        DOWNLOAD_TIMEOUT_MS
      )
      const result = asRecord(await this.#parseResponse(response))
      transfer.status = 'completed'
      transfer.progress = 100
      transfer.message = 'Published and seeding on remote node'
      transfer.cid = readString(result, 'cid') || undefined
      transfer.link = readString(result, 'link') || undefined
      await this.#refreshFiles()
      this.#emit()
      return { ...transfer }
    } catch (error) {
      transfer.status = 'failed'
      transfer.message =
        error instanceof Error ? error.message : 'Publish failed'
      this.#emit()
      throw error
    }
  }

  async shareFolder(input: ShareFolderInput): Promise<ShareFolderResult> {
    await this.#ensureAuthenticated()
    const result = asRecord(
      await this.#requestJson('POST', '/api/folder/share', {
        path: input.path,
      })
    )
    const cid = readString(result, 'cid')
    const fileName = readString(result, 'fileName')
    if (!cid || !fileName) {
      throw createRemoteError(
        'Remote node returned an invalid folder share',
        'REMOTE_INVALID_RESPONSE'
      )
    }
    return {
      cid,
      fileName,
      link: readString(result, 'link') || buildMostLink(cid, fileName),
    }
  }

  async downloadLink(input: DownloadLinkInput) {
    await this.#ensureAuthenticated()
    const parsed = parseMostLink(input.link)
    const provisionalId = createId('remote_download')
    const transfer: MobileTransfer = {
      id: provisionalId,
      kind: 'download',
      status: 'queued',
      fileName: parsed.fileName,
      cid: parsed.cid,
      link: input.link,
      progress: 0,
      message: 'Starting remote download',
    }
    this.#snapshot.transfers = [transfer, ...this.#snapshot.transfers]
    this.#emit()

    try {
      const result = asRecord(
        await this.#requestJson('POST', '/api/download', {
          link: input.link,
          background: true,
        })
      )
      const taskId = readString(result, 'taskId')
      if (taskId) transfer.id = taskId
      if (result.localAvailable === true || result.alreadyExists === true) {
        transfer.status = 'completed'
        transfer.progress = 100
        transfer.message = 'Downloaded and seeding on remote node'
        await this.#refreshFiles()
        this.#emit()
        return { ...transfer }
      }
      if (!taskId) {
        throw createRemoteError(
          'Remote node did not create a download task',
          'REMOTE_INVALID_RESPONSE'
        )
      }
      transfer.status = 'running'
      transfer.message = 'Finding peers'
      this.#emit()
      return await this.#waitForDownload(taskId, parsed.cid)
    } catch (error) {
      transfer.status = 'failed'
      transfer.message =
        error instanceof Error ? error.message : 'Download failed'
      this.#emit()
      throw error
    }
  }

  async cancelDownload(
    input: CancelDownloadInput
  ): Promise<CancelDownloadResult> {
    await this.#ensureAuthenticated()
    const transfer = this.#snapshot.transfers.find(
      item =>
        item.kind === 'download' &&
        item.cid === input.cid &&
        (item.status === 'queued' || item.status === 'running')
    )
    if (!transfer) {
      throw createRemoteError(
        'Download task not found',
        'DOWNLOAD_TASK_NOT_FOUND'
      )
    }
    await this.#requestJson('POST', '/api/download/cancel', {
      taskId: transfer.id,
    })
    this.#finishDownload(transfer.id, 'cancelled', {
      taskId: transfer.id,
      error: 'Download cancelled',
    })
    return { cid: input.cid, snapshot: this.getSnapshot() }
  }

  async exportHolding(input: ExportHoldingInput): Promise<ExportHoldingResult> {
    await this.#ensureAuthenticated()
    const holding = this.#snapshot.holdings.find(item => item.cid === input.cid)
    if (!holding) throw createRemoteError('File not found', 'NOT_FOUND')
    if (Platform.OS === 'web') {
      const path = `/api/files/${encodeURIComponent(input.cid)}/download`
      const headers = await buildRemoteHeaders({
        baseUrl: this.#config.url,
        invite: this.#config.invite,
        identity: this.#identity,
        method: 'GET',
        path,
      })
      const response = await this.#fetchWithTimeout(
        buildRemoteApiUrl(this.#config.url, path),
        { method: 'GET', headers },
        DOWNLOAD_TIMEOUT_MS
      )
      if (!response.ok) await this.#parseResponse(response)

      const bytes = new Uint8Array(await response.arrayBuffer())
      const verified = await calculateUnixfsCidFromContent([bytes])
      if (!cacheMatchesCid(input.cid, verified.cid)) {
        throw createRemoteError(
          `File content CID mismatch. Expected ${input.cid}, got ${verified.cid}.`,
          'INTEGRITY_ERROR'
        )
      }
      const blob = new Blob([bytes], {
        type: 'application/octet-stream',
      })
      return {
        filePath: URL.createObjectURL(blob),
        fileName: input.fileName || holding.fileName,
        size: verified.size,
        holding,
      }
    }
    if (!FileSystem.cacheDirectory) {
      throw createRemoteError(
        'Temporary storage is unavailable',
        'STORAGE_UNAVAILABLE'
      )
    }

    const directory = `${FileSystem.cacheDirectory}mostbox-remote-files`
    const target = `${directory}/${input.cid}`
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    const existing = await FileSystem.getInfoAsync(target)
    if (existing.exists) {
      const verified = await this.#calculateFileCid(target, existing.size)
      if (cacheMatchesCid(input.cid, verified.cid)) {
        return {
          filePath: target,
          fileName: input.fileName || holding.fileName,
          size: verified.size,
          holding,
        }
      }
      await FileSystem.deleteAsync(target, { idempotent: true })
    }

    const headers = await buildRemoteHeaders({
      baseUrl: this.#config.url,
      invite: this.#config.invite,
      identity: this.#identity,
      method: 'GET',
      path: `/api/files/${encodeURIComponent(input.cid)}/download`,
    })
    const download = FileSystem.createDownloadResumable(
      buildRemoteApiUrl(
        this.#config.url,
        `/api/files/${encodeURIComponent(input.cid)}/download`
      ),
      target,
      { headers }
    )
    const result = await download.downloadAsync()
    if (!result || result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(target, { idempotent: true })
      throw createRemoteError(
        'Remote file download failed',
        'REMOTE_DOWNLOAD_FAILED'
      )
    }
    const info = await FileSystem.getInfoAsync(target)
    if (!info.exists)
      throw createRemoteError('Downloaded file is missing', 'NOT_FOUND')
    const verified = await this.#calculateFileCid(target, info.size)
    if (!cacheMatchesCid(input.cid, verified.cid)) {
      await FileSystem.deleteAsync(target, { idempotent: true })
      throw createRemoteError(
        `File content CID mismatch. Expected ${input.cid}, got ${verified.cid}.`,
        'INTEGRITY_ERROR'
      )
    }
    return {
      filePath: target,
      fileName: input.fileName || holding.fileName,
      size: verified.size,
      holding,
    }
  }

  async deleteHolding(input: DeleteHoldingInput): Promise<DeleteHoldingResult> {
    await this.#ensureAuthenticated()
    await this.#requestJson(
      'DELETE',
      `/api/files/${encodeURIComponent(input.cid)}`
    )
    await this.#refreshFiles()
    return { cid: input.cid, snapshot: this.getSnapshot() }
  }

  getSnapshot() {
    return this.#clone()
  }

  subscribe(listener: CoreListener) {
    this.#listeners.add(listener)
    listener(this.#clone())
    return () => this.#listeners.delete(listener)
  }

  async #ensureStarted() {
    if (!this.#started || this.#snapshot.node.status !== 'ready') {
      await this.start()
    }
  }

  async #ensureAuthenticated() {
    await this.#ensureStarted()
    if (!this.#identity || !this.#snapshot.node.authenticated) {
      throw createRemoteError('Sign in to use remote files', 'LOGIN_REQUIRED')
    }
  }

  async #requestJson(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ) {
    const headers = await buildRemoteHeaders({
      baseUrl: this.#config.url,
      invite: this.#config.invite,
      identity: this.#identity,
      method,
      path,
    })
    if (body) headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await this.#fetchWithTimeout(
        buildRemoteApiUrl(this.#config.url, path),
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        },
        REQUEST_TIMEOUT_MS
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createRemoteError(
          'Remote node request timed out',
          'REMOTE_HTTP_UNREACHABLE'
        )
      }
      throw createRemoteError(
        'Remote node HTTP endpoint is unreachable',
        'REMOTE_HTTP_UNREACHABLE'
      )
    }
    return this.#parseResponse(response)
  }

  async #parseResponse(response: Response): Promise<unknown> {
    const text = await response.text()
    let payload: unknown = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = {}
    }
    if (response.ok) return payload
    const record = asRecord(payload)
    const code = readString(record, 'code') || `HTTP_${response.status}`
    const message =
      readString(record, 'error') ||
      readString(record, 'message') ||
      `Remote node request failed (${response.status})`
    throw createRemoteError(message, code)
  }

  async #fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  async #refreshNodeStatus() {
    const status = asRecord(await this.#requestJson('GET', '/api/node/status'))
    const network = asRecord(status.network)
    this.#snapshot.node.peerCount = readNumber(network, 'peers')
    this.#emit()
  }

  async #refreshFiles() {
    if (!this.#identity) return
    const response = await this.#requestJson('GET', '/api/files')
    const values = Array.isArray(response) ? response : []
    this.#snapshot.holdings = values
      .map(normalizeRemoteHolding)
      .filter((holding): holding is MobileHolding => holding !== null)
    this.#emit()
  }

  async #refreshDownloadTasks() {
    if (!this.#identity) return
    const response = await this.#requestJson('GET', '/api/download/tasks')
    const remoteTransfers = (Array.isArray(response) ? response : [])
      .map(normalizeRemoteDownloadTask)
      .filter((transfer): transfer is MobileTransfer => transfer !== null)
    const remoteIds = new Set(remoteTransfers.map(transfer => transfer.id))
    this.#activeRemoteTaskIds = remoteIds
    this.#snapshot.transfers = [
      ...remoteTransfers,
      ...this.#snapshot.transfers.filter(
        transfer => transfer.status !== 'running' || !remoteIds.has(transfer.id)
      ),
    ]
    this.#emit()
  }

  async #connectWebSocket() {
    if (!this.#identity || !this.#started) return
    const socketUrl = await buildAuthenticatedWebSocketUrl({
      baseUrl: this.#config.url,
      invite: this.#config.invite,
      identity: this.#identity,
    })
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(socketUrl)
      this.#socket = socket
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        socket.close()
        reject(
          createRemoteError(
            'Remote node WebSocket is unreachable',
            'REMOTE_WS_UNREACHABLE'
          )
        )
      }, 8_000)
      socket.onopen = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.#reconnectAttempts = 0
        resolve()
      }
      socket.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(
          createRemoteError(
            'Remote node WebSocket is unreachable',
            'REMOTE_WS_UNREACHABLE'
          )
        )
      }
      socket.onmessage = event => this.#handleSocketMessage(String(event.data))
      socket.onclose = () => {
        clearTimeout(timer)
        if (this.#socket === socket) this.#socket = null
        if (settled && this.#started) this.#scheduleReconnect()
      }
    })
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer || !this.#started || !this.#identity) return
    this.#snapshot.node.status = 'starting'
    this.#snapshot.node.error = 'Reconnecting to remote node'
    this.#emit()
    this.#reconnectAttempts += 1
    const delay = Math.min(1000 * 2 ** (this.#reconnectAttempts - 1), 10_000)
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      void this.#connectWebSocket()
        .then(async () => {
          await this.#refreshNodeStatus()
          await this.#refreshDownloadTasks()
          await this.#refreshFiles()
          this.#reconcileDownloadWaiters()
          this.#snapshot.node.status = 'ready'
          this.#snapshot.node.error = ''
          this.#emit()
        })
        .catch(() => this.#scheduleReconnect())
    }, delay)
  }

  #handleSocketMessage(raw: string) {
    let message: JsonRecord
    try {
      message = asRecord(JSON.parse(raw))
    } catch {
      return
    }
    const event = readString(message, 'event')
    const data = asRecord(message.data)
    if (event === 'node:status') {
      const network = asRecord(data.network)
      this.#snapshot.node.peerCount = readNumber(network, 'peers')
      this.#emit()
      return
    }
    if (event === 'publish:success') {
      void this.#refreshFiles()
      return
    }
    if (event === 'download:status' || event === 'download:progress') {
      const taskId = readString(data, 'taskId')
      const index = this.#snapshot.transfers.findIndex(
        item => item.id === taskId
      )
      if (index < 0) return
      this.#snapshot.transfers[index] = applyRemoteDownloadEvent(
        this.#snapshot.transfers[index],
        event,
        data
      )
      this.#emit()
      return
    }
    if (
      event === 'download:success' ||
      event === 'download:error' ||
      event === 'download:cancelled'
    ) {
      this.#finishDownload(readString(data, 'taskId'), event, data)
    }
  }

  #waitForDownload(taskId: string, cid: string) {
    return new Promise<MobileTransfer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#downloadWaiters.delete(taskId)
        reject(
          createRemoteError(
            'Remote download timed out',
            'REMOTE_DOWNLOAD_TIMEOUT'
          )
        )
      }, DOWNLOAD_TIMEOUT_MS)
      this.#downloadWaiters.set(taskId, { cid, resolve, reject, timer })
      const pending = this.#pendingDownloadEvents.get(taskId)
      if (pending) {
        this.#pendingDownloadEvents.delete(taskId)
        this.#finishDownload(taskId, pending.event, pending.data)
      }
    })
  }

  #finishDownload(taskId: string, event: string, data: JsonRecord) {
    if (!taskId) return
    const transfer = this.#snapshot.transfers.find(item => item.id === taskId)
    const waiter = this.#downloadWaiters.get(taskId)
    if (!transfer) {
      if (this.#pendingDownloadEvents.size >= 16) {
        const oldest = this.#pendingDownloadEvents.keys().next().value
        if (oldest) this.#pendingDownloadEvents.delete(oldest)
      }
      this.#pendingDownloadEvents.set(taskId, { event, data })
      return
    }
    if (waiter) {
      clearTimeout(waiter.timer)
      this.#downloadWaiters.delete(taskId)
    }
    if (!transfer) return

    const updated = applyRemoteDownloadEvent(transfer, event, data)
    Object.assign(transfer, updated)
    if (event === 'download:success') {
      void this.#refreshFiles().finally(() => waiter?.resolve({ ...transfer }))
    } else {
      waiter?.reject(
        createRemoteError(
          transfer.message,
          readString(data, 'code') || 'REMOTE_DOWNLOAD_FAILED'
        )
      )
    }
    this.#emit()
  }

  #reconcileDownloadWaiters() {
    for (const [taskId, waiter] of this.#downloadWaiters) {
      if (this.#snapshot.holdings.some(item => item.cid === waiter.cid)) {
        this.#finishDownload(taskId, 'download:success', { taskId })
      } else if (!this.#activeRemoteTaskIds.has(taskId)) {
        this.#finishDownload(taskId, 'download:error', {
          taskId,
          code: 'REMOTE_DOWNLOAD_INTERRUPTED',
          error: 'Remote download ended while the connection was unavailable',
        })
      }
    }
  }

  #schedulePingPoll(id: string) {
    if (this.#pingPollTimer) clearTimeout(this.#pingPollTimer)
    const poll = async () => {
      if (!this.#started) return
      try {
        const response = asRecord(
          await this.#requestJson(
            'GET',
            `/api/p2p/ping/${encodeURIComponent(id)}`
          )
        )
        const ping = asRecord(response).ping
        if (!ping || typeof ping !== 'object') return
        this.#snapshot.p2pPing = ping as P2PPing
        this.#emit()
        if (!TERMINAL_PING_STATUSES.has(this.#snapshot.p2pPing.status)) {
          this.#pingPollTimer = setTimeout(poll, 500)
        }
      } catch (error) {
        this.#pushLog(
          'warn',
          error instanceof Error ? error.message : 'Failed to refresh Ping'
        )
      }
    }
    this.#pingPollTimer = setTimeout(poll, 500)
  }

  async #calculateFileCid(fileUri: string, size: number) {
    async function* chunks() {
      for (
        let position = 0;
        position < size;
        position += FILE_READ_CHUNK_BYTES
      ) {
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
          position,
          length: Math.min(FILE_READ_CHUNK_BYTES, size - position),
        })
        yield b4a.from(base64, 'base64')
      }
      if (size === 0) yield b4a.alloc(0)
    }
    return calculateUnixfsCidFromContent(chunks())
  }

  #pushLog(level: MobileLogEntry['level'], message: string) {
    this.#snapshot.logs = [
      { id: createId('remote_log'), time: nowIso(), level, message },
      ...this.#snapshot.logs,
    ].slice(0, 50)
    this.#emit()
  }

  #emit() {
    const snapshot = this.#clone()
    for (const listener of this.#listeners) listener(snapshot)
  }

  #clone(): MobileCoreSnapshot {
    return {
      node: { ...this.#snapshot.node },
      holdings: this.#snapshot.holdings.map(item => ({ ...item })),
      transfers: this.#snapshot.transfers.map(item => ({ ...item })),
      p2pPing: this.#snapshot.p2pPing
        ? {
            ...this.#snapshot.p2pPing,
            directions: {
              hostToJoin: { ...this.#snapshot.p2pPing.directions.hostToJoin },
              joinToHost: { ...this.#snapshot.p2pPing.directions.joinToHost },
            },
          }
        : null,
      logs: this.#snapshot.logs.map(item => ({ ...item })),
    }
  }
}
