import { Worklet } from 'react-native-bare-kit'
import type {
  CoreListener,
  DownloadLinkInput,
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
  MostBoxMobileCore,
  PublishFileInput,
} from './types'

type BareWorkletMostBoxCoreOptions = {
  bundle: string
  storagePath: string
}

export class BareWorkletMostBoxCore implements MostBoxMobileCore {
  #options: BareWorkletMostBoxCoreOptions
  #worklet: Worklet | null = null
  #listeners = new Set<CoreListener>()
  #snapshot: MobileCoreSnapshot = {
    node: {
      status: 'idle',
      peerCount: 0,
      storagePath: '',
      error: '',
    },
    holdings: [],
    transfers: [],
    logs: [],
  }

  constructor(options: BareWorkletMostBoxCoreOptions) {
    this.#options = options
    this.#snapshot.node.storagePath = options.storagePath
  }

  async start() {
    if (this.#worklet) return

    this.#snapshot.node.status = 'starting'
    this.#emit()

    const worklet = new Worklet()
    worklet.start('/mostbox-mobile.bundle', this.#options.bundle, [
      this.#options.storagePath,
    ])
    this.#worklet = worklet
    this.#snapshot.node.status = 'ready'
    this.#emit()
  }

  async stop() {
    this.#snapshot.node.status = 'stopping'
    this.#emit()
    this.#worklet?.terminate()
    this.#worklet = null
    this.#snapshot.node.status = 'idle'
    this.#emit()
  }

  async publishFile(_input: PublishFileInput): Promise<MobileTransfer> {
    throw new Error('Bare Worklet publish RPC is not wired yet')
  }

  async downloadLink(_input: DownloadLinkInput): Promise<MobileTransfer> {
    throw new Error('Bare Worklet download RPC is not wired yet')
  }

  async listHoldings(): Promise<MobileHolding[]> {
    return this.#snapshot.holdings
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
      logs: this.#snapshot.logs.map(log => ({ ...log })),
    }
  }
}
