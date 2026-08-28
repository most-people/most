import b4a from 'b4a'
import { Worklet } from 'react-native-bare-kit'
import { COMMANDS, EVENTS } from '../../rpc-commands.mjs'
import type {
  CancelDownloadInput,
  CancelDownloadResult,
  CoreListener,
  DeleteHoldingInput,
  DeleteHoldingResult,
  DownloadLinkInput,
  ExportHoldingInput,
  ExportHoldingResult,
  MobileCoreSnapshot,
  MobileLogEntry,
  MobileTransfer,
  MostBoxMobileCore,
  PublishFileInput,
  ShareFolderInput,
  ShareFolderResult,
  P2PPing,
  StartP2PPingInput,
  CancelP2PPingInput,
} from './types'

type BareWorkletMostBoxCoreOptions = {
  bundle: string | Uint8Array
  storagePath: string
}

type RpcEvent = {
  type: string
  requestId?: string
  payload?: unknown
  time?: string
}

type PendingRequest = {
  successTypes: Set<string>
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function createInitialSnapshot(storagePath: string): MobileCoreSnapshot {
  return {
    node: {
      status: 'idle',
      peerCount: 0,
      storagePath,
      error: '',
    },
    holdings: [],
    transfers: [],
    p2pPing: null,
    logs: [],
  }
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function isSnapshot(value: unknown): value is MobileCoreSnapshot {
  const record = asRecord(value)
  return (
    Boolean(record.node) &&
    Array.isArray(record.holdings) &&
    Array.isArray(record.transfers) &&
    (record.p2pPing === undefined ||
      record.p2pPing === null ||
      isP2PPing(record.p2pPing)) &&
    Array.isArray(record.logs)
  )
}

function isTransfer(value: unknown): value is MobileTransfer {
  const record = asRecord(value)
  return (
    typeof record.id === 'string' &&
    (record.kind === 'publish' || record.kind === 'download') &&
    typeof record.status === 'string' &&
    typeof record.fileName === 'string' &&
    typeof record.progress === 'number' &&
    typeof record.message === 'string'
  )
}

function isP2PPing(value: unknown): value is P2PPing {
  const record = asRecord(value)
  const directions = asRecord(record.directions)
  return (
    typeof record.id === 'string' &&
    (record.role === 'host' || record.role === 'join') &&
    typeof record.code === 'string' &&
    typeof record.status === 'string' &&
    typeof record.phase === 'string' &&
    isP2PPingDirection(directions.hostToJoin) &&
    isP2PPingDirection(directions.joinToHost)
  )
}

function isP2PPingDirection(value: unknown) {
  const record = asRecord(value)
  return (
    (record.direction === 'hostToJoin' || record.direction === 'joinToHost') &&
    (record.initiatorRole === 'host' || record.initiatorRole === 'join') &&
    typeof record.status === 'string' &&
    typeof record.phase === 'string'
  )
}

function isExportHoldingResult(value: unknown): value is ExportHoldingResult {
  const record = asRecord(value)
  return (
    typeof record.filePath === 'string' &&
    typeof record.fileName === 'string' &&
    typeof record.size === 'number' &&
    Boolean(record.holding)
  )
}

function isDeleteHoldingResult(value: unknown): value is DeleteHoldingResult {
  const record = asRecord(value)
  return typeof record.cid === 'string' && Boolean(record.snapshot)
}

function isCancelDownloadResult(value: unknown): value is CancelDownloadResult {
  const record = asRecord(value)
  return typeof record.cid === 'string' && Boolean(record.snapshot)
}

function normalizeFileUri(uri: string) {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.slice('file://'.length))
  }
  return uri
}

function extractSnapshot(payload: unknown) {
  if (isSnapshot(payload)) return payload
  const record = asRecord(payload)
  if (isSnapshot(record.snapshot)) return record.snapshot
  return null
}

function extractTransfer(payload: unknown) {
  const record = asRecord(payload)
  if (isTransfer(record.transfer)) return record.transfer
  if (isTransfer(payload)) return payload
  throw new Error('P2P core returned an invalid transfer payload')
}

function extractP2PPing(payload: unknown): P2PPing | null {
  const record = asRecord(payload)
  const ping = record.ping === null ? null : record.ping || payload
  if (ping === null || isP2PPing(ping)) return ping
  throw new Error('P2P core returned an invalid Ping payload')
}

function extractExportResult(payload: unknown) {
  if (isExportHoldingResult(payload)) return payload
  throw new Error('P2P core returned an invalid export payload')
}

function extractDeleteResult(payload: unknown) {
  if (isDeleteHoldingResult(payload)) return payload
  throw new Error('P2P core returned an invalid delete payload')
}

function extractCancelDownloadResult(payload: unknown) {
  if (isCancelDownloadResult(payload)) return payload
  throw new Error('P2P core returned an invalid cancel download payload')
}

export class BareWorkletMostBoxCore implements MostBoxMobileCore {
  #options: BareWorkletMostBoxCoreOptions
  #worklet: Worklet | null = null
  #listeners = new Set<CoreListener>()
  #pending = new Map<string, PendingRequest>()
  #readBuffer = ''
  #snapshot: MobileCoreSnapshot

  constructor(options: BareWorkletMostBoxCoreOptions) {
    this.#options = options
    this.#snapshot = createInitialSnapshot(options.storagePath)
  }

  async start() {
    if (this.#worklet) return

    this.#snapshot.node.status = 'starting'
    this.#snapshot.node.error = ''
    this.#emit()

    try {
      const worklet = new Worklet()
      worklet.IPC.on('data', data => this.#handleData(data as Uint8Array))
      const args = [this.#options.storagePath]
      if (typeof this.#options.bundle === 'string') {
        worklet.start('/mostbox-mobile.bundle', this.#options.bundle, args)
      } else {
        worklet.start('/mostbox-mobile.bundle', this.#options.bundle, args)
      }
      this.#worklet = worklet

      await this.#request(
        COMMANDS.NODE_START,
        { storagePath: this.#options.storagePath },
        [EVENTS.NODE_READY],
        30000
      )
    } catch (error) {
      this.#snapshot.node.status = 'error'
      this.#snapshot.node.error =
        error instanceof Error ? error.message : 'Failed to start P2P core'
      this.#pushLog('error', this.#snapshot.node.error)
      this.#worklet?.terminate()
      this.#worklet = null
      this.#emit()
      throw error
    }
  }

  async stop() {
    if (!this.#worklet) {
      this.#snapshot.node.status = 'idle'
      this.#emit()
      return
    }

    this.#snapshot.node.status = 'stopping'
    this.#emit()

    try {
      await this.#request(COMMANDS.NODE_STOP, {}, [EVENTS.SNAPSHOT], 5000)
    } catch {
      // The worklet may already be terminating during app shutdown.
    } finally {
      for (const [, pending] of this.#pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('P2P core stopped'))
      }
      this.#pending.clear()
      this.#worklet?.terminate()
      this.#worklet = null
      this.#snapshot.node.status = 'idle'
      this.#snapshot.node.peerCount = 0
      this.#emit()
    }
  }

  async startP2PPing(input: StartP2PPingInput): Promise<P2PPing> {
    await this.#ensureStarted()
    const result = await this.#request(
      COMMANDS.P2P_PING_START,
      input,
      [EVENTS.P2P_PING_STATUS],
      10000
    )
    const ping = extractP2PPing(result)
    if (!ping) throw new Error('P2P core did not create a Ping')
    return ping
  }

  async cancelP2PPing(input: CancelP2PPingInput = {}): Promise<P2PPing | null> {
    await this.#ensureStarted()
    const result = await this.#request(
      COMMANDS.P2P_PING_CANCEL,
      input,
      [EVENTS.P2P_PING_STATUS],
      10000
    )
    return extractP2PPing(result)
  }

  async publishFile(input: PublishFileInput): Promise<MobileTransfer> {
    await this.#ensureStarted()
    const payload = {
      uri: input.uri,
      filePath: normalizeFileUri(input.uri),
      name: input.name,
      size: input.size,
      mimeType: input.mimeType,
      contentBase64: input.contentBytes
        ? b4a.toString(input.contentBytes, 'base64')
        : undefined,
    }

    const result = await this.#request(
      COMMANDS.FILE_PUBLISH,
      payload,
      [EVENTS.PUBLISH_SUCCESS],
      900000
    )
    return extractTransfer(result)
  }

  async shareFolder(_input: ShareFolderInput): Promise<ShareFolderResult> {
    const error = new Error(
      'Folder sharing requires a connected desktop MostBox node'
    ) as Error & { code?: string }
    error.code = 'REMOTE_NODE_REQUIRED'
    throw error
  }

  async downloadLink(input: DownloadLinkInput): Promise<MobileTransfer> {
    await this.#ensureStarted()
    const result = await this.#request(
      COMMANDS.FILE_DOWNLOAD,
      { link: input.link },
      [EVENTS.DOWNLOAD_SUCCESS],
      900000
    )
    return extractTransfer(result)
  }

  async cancelDownload(
    input: CancelDownloadInput
  ): Promise<CancelDownloadResult> {
    await this.#ensureStarted()
    const result = await this.#request(
      COMMANDS.FILE_CANCEL_DOWNLOAD,
      { cid: input.cid },
      [EVENTS.DOWNLOAD_CANCELLED],
      10000
    )
    return extractCancelDownloadResult(result)
  }

  async exportHolding(input: ExportHoldingInput): Promise<ExportHoldingResult> {
    await this.#ensureStarted()
    const result = await this.#request(
      COMMANDS.FILE_EXPORT,
      { cid: input.cid, fileName: input.fileName },
      [EVENTS.FILE_EXPORT_SUCCESS],
      900000
    )
    return extractExportResult(result)
  }

  async deleteHolding(input: DeleteHoldingInput): Promise<DeleteHoldingResult> {
    await this.#ensureStarted()
    const result = await this.#request(
      COMMANDS.FILE_DELETE_HOLDING,
      { cid: input.cid },
      [EVENTS.FILE_DELETE_HOLDING_SUCCESS],
      30000
    )
    return extractDeleteResult(result)
  }

  getSnapshot() {
    return this.#clone()
  }

  subscribe(listener: CoreListener) {
    this.#listeners.add(listener)
    listener(this.#clone())
    return () => {
      this.#listeners.delete(listener)
    }
  }

  async #ensureStarted() {
    if (!this.#worklet) {
      await this.start()
    }
  }

  #request(
    type: string,
    payload: Record<string, unknown>,
    successTypes: string[],
    timeoutMs: number
  ) {
    if (!this.#worklet) {
      return Promise.reject(new Error('P2P core is not running'))
    }

    const requestId = createId(type.replace(/[^a-z0-9]+/gi, '_'))

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId)
        reject(new Error(`P2P core request timed out: ${type}`))
      }, timeoutMs)

      this.#pending.set(requestId, {
        successTypes: new Set(successTypes),
        resolve,
        reject,
        timer,
      })

      this.#writeCommand({
        id: requestId,
        type,
        payload,
      })
    })
  }

  #writeCommand(command: Record<string, unknown>) {
    const line = `${JSON.stringify(command)}\n`
    this.#worklet?.IPC.write(b4a.from(line))
  }

  #handleData(data: Uint8Array) {
    this.#readBuffer += b4a.toString(data)

    let newlineIndex = this.#readBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.#readBuffer.slice(0, newlineIndex).trim()
      this.#readBuffer = this.#readBuffer.slice(newlineIndex + 1)
      if (line) {
        try {
          this.#handleEvent(JSON.parse(line) as RpcEvent)
        } catch (error) {
          this.#pushLog(
            'error',
            error instanceof Error ? error.message : 'Invalid P2P core event'
          )
        }
      }
      newlineIndex = this.#readBuffer.indexOf('\n')
    }
  }

  #handleEvent(event: RpcEvent) {
    const snapshot = extractSnapshot(event.payload)
    if (snapshot) {
      this.#snapshot = snapshot
      this.#emit()
    }

    if (event.type === EVENTS.ERROR) {
      const record = asRecord(event.payload)
      const message =
        typeof record.message === 'string'
          ? record.message
          : 'P2P core command failed'
      this.#pushLog('error', message)

      if (event.requestId && this.#pending.has(event.requestId)) {
        const pending = this.#pending.get(event.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          this.#pending.delete(event.requestId)
          const error = new Error(message) as Error & { code?: string }
          if (typeof record.code === 'string') error.code = record.code
          pending.reject(error)
        }
      }
      return
    }

    if (event.requestId && this.#pending.has(event.requestId)) {
      const pending = this.#pending.get(event.requestId)
      if (pending && pending.successTypes.has(event.type)) {
        clearTimeout(pending.timer)
        this.#pending.delete(event.requestId)
        pending.resolve(event.payload)
      }
    }
  }

  #pushLog(level: MobileLogEntry['level'], message: string) {
    this.#snapshot.logs = [
      {
        id: createId('log'),
        time: nowIso(),
        level,
        message,
      },
      ...this.#snapshot.logs,
    ].slice(0, 50)
    this.#emit()
  }

  #emit() {
    const snapshot = this.#clone()
    for (const listener of this.#listeners) {
      listener(snapshot)
    }
  }

  #clone(): MobileCoreSnapshot {
    return {
      node: { ...this.#snapshot.node },
      holdings: this.#snapshot.holdings.map(holding => ({ ...holding })),
      transfers: this.#snapshot.transfers.map(transfer => ({ ...transfer })),
      p2pPing: this.#snapshot.p2pPing
        ? {
            ...this.#snapshot.p2pPing,
            directions: {
              hostToJoin: {
                ...this.#snapshot.p2pPing.directions.hostToJoin,
              },
              joinToHost: {
                ...this.#snapshot.p2pPing.directions.joinToHost,
              },
            },
          }
        : null,
      logs: this.#snapshot.logs.map(log => ({ ...log })),
    }
  }
}
