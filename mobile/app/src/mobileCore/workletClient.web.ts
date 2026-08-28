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
  MobileTransfer,
  PublishFileInput,
  ShareFolderInput,
  ShareFolderResult,
  P2PPing,
  StartP2PPingInput,
} from './types'

type BareWorkletMostBoxCoreOptions = {
  bundle: string | Uint8Array
  storagePath: string
}

const WEB_REMOTE_REQUIRED =
  'The Web app requires a connection to an existing MostBox node'

function createRemoteRequiredError() {
  const error = new Error(WEB_REMOTE_REQUIRED) as Error & { code?: string }
  error.code = 'WEB_REMOTE_REQUIRED'
  return error
}

export class BareWorkletMostBoxCore {
  #listeners = new Set<CoreListener>()
  #snapshot: MobileCoreSnapshot

  constructor(options: BareWorkletMostBoxCoreOptions) {
    this.#snapshot = {
      node: {
        status: 'idle',
        peerCount: 0,
        storagePath: options.storagePath,
        error: '',
      },
      holdings: [],
      transfers: [],
      p2pPing: null,
      logs: [],
    }
  }

  async start() {
    this.#snapshot.node.status = 'error'
    this.#snapshot.node.error = WEB_REMOTE_REQUIRED
    this.#emit()
  }

  async stop() {
    this.#snapshot.node.status = 'idle'
    this.#emit()
  }

  async startP2PPing(_input: StartP2PPingInput): Promise<P2PPing> {
    throw createRemoteRequiredError()
  }

  async cancelP2PPing(
    _input: CancelP2PPingInput = {}
  ): Promise<P2PPing | null> {
    throw createRemoteRequiredError()
  }

  async publishFile(_input: PublishFileInput): Promise<MobileTransfer> {
    throw createRemoteRequiredError()
  }

  async shareFolder(_input: ShareFolderInput): Promise<ShareFolderResult> {
    throw createRemoteRequiredError()
  }

  async downloadLink(_input: DownloadLinkInput): Promise<MobileTransfer> {
    throw createRemoteRequiredError()
  }

  async cancelDownload(
    _input: CancelDownloadInput
  ): Promise<CancelDownloadResult> {
    throw createRemoteRequiredError()
  }

  async exportHolding(
    _input: ExportHoldingInput
  ): Promise<ExportHoldingResult> {
    throw createRemoteRequiredError()
  }

  async deleteHolding(
    _input: DeleteHoldingInput
  ): Promise<DeleteHoldingResult> {
    throw createRemoteRequiredError()
  }

  getSnapshot() {
    return this.#clone()
  }

  subscribe(listener: CoreListener) {
    this.#listeners.add(listener)
    listener(this.#clone())
    return () => this.#listeners.delete(listener)
  }

  #emit() {
    const snapshot = this.#clone()
    for (const listener of this.#listeners) listener(snapshot)
  }

  #clone(): MobileCoreSnapshot {
    return {
      node: { ...this.#snapshot.node },
      holdings: [],
      transfers: [],
      p2pPing: null,
      logs: [],
    }
  }
}
