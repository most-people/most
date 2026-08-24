import type {
  CancelDownloadInput,
  CancelP2PPingInput,
  CoreListener,
  DeleteHoldingInput,
  DownloadLinkInput,
  ExportHoldingInput,
  MobileCoreSnapshot,
  MobileIdentity,
  MostBoxMobileClient,
  MostBoxMobileCore,
  PublishFileInput,
  RemoteNodeConfig,
  StartP2PPingInput,
} from './types'
import { BareWorkletMostBoxCore } from './workletClient'
import { RemoteMostBoxCore } from '../remoteNode/remoteCore'
import {
  buildNodeHistory,
  clearPreferredRemote,
  normalizeRemoteUrl,
  saveRemoteNode,
  type StoredRemoteNode,
} from '../remoteNode/connectionHistory'
import { createMobileIdentity } from '../remoteNode/identity'
import {
  loadMobileIdentity,
  loadRemoteNodes,
  saveMobileIdentity,
  saveRemoteNodes,
} from '../remoteNode/storage'
import { hasActiveTransfers, startPreferredOrLocal } from './nodeSelection'

type MobileNodeClientOptions = {
  bundle: string | Uint8Array
  storagePath: string
}

export class MobileNodeClient implements MostBoxMobileClient {
  #local: BareWorkletMostBoxCore
  #active: MostBoxMobileCore
  #activeUnsubscribe: (() => void) | null = null
  #listeners = new Set<CoreListener>()
  #snapshot: MobileCoreSnapshot
  #identity: MobileIdentity | null = null
  #nodes: StoredRemoteNode[] = []
  #mode: 'local' | 'remote' = 'local'
  #remoteConfig: RemoteNodeConfig | null = null
  #started = false
  #fallbackFrom = ''

  constructor(options: MobileNodeClientOptions) {
    this.#local = new BareWorkletMostBoxCore(options)
    this.#active = this.#local
    this.#snapshot = this.#decorateSnapshot(this.#local.getSnapshot())
    this.#subscribeActive()
  }

  async start() {
    if (this.#started) {
      await this.#active.start()
      return
    }
    this.#started = true
    ;[this.#identity, this.#nodes] = await Promise.all([
      loadMobileIdentity(),
      loadRemoteNodes(),
    ])
    const preferred = this.#nodes.find(node => node.preferred) || null
    const selection = await startPreferredOrLocal<MostBoxMobileCore>({
      preferred,
      startRemote: async config => {
        const remote = new RemoteMostBoxCore(config, this.#identity)
        try {
          await remote.start()
          return remote
        } catch (error) {
          await remote.stop()
          throw error
        }
      },
      startLocal: async () => {
        await this.#local.start()
        return this.#local
      },
    })
    this.#fallbackFrom = selection.fallbackFrom
    await this.#activate(selection.node, selection.mode, selection.config)
  }

  async stop() {
    this.#started = false
    await this.#active.stop()
  }

  async connectRemote(input: RemoteNodeConfig) {
    this.#assertSwitchAllowed()
    const url = normalizeRemoteUrl(input.url)
    if (!url) throw new Error('Enter a valid HTTP or HTTPS node URL')
    const config = { url, invite: input.invite.trim() }
    const remote = new RemoteMostBoxCore(config, this.#identity)
    try {
      await remote.start()
    } catch (error) {
      await remote.stop()
      throw error
    }
    await this.#activate(remote, 'remote', config)
    this.#fallbackFrom = ''
    this.#nodes = saveRemoteNode(this.#nodes, config)
    await saveRemoteNodes(this.#nodes)
    this.#emit()
  }

  async switchToLocal() {
    this.#assertSwitchAllowed()
    if (this.#mode === 'local') return
    await this.#local.start()
    await this.#activate(this.#local, 'local', null)
    this.#fallbackFrom = ''
    this.#nodes = clearPreferredRemote(this.#nodes)
    await saveRemoteNodes(this.#nodes)
    this.#emit()
  }

  async signIn(input: { username: string; password: string }) {
    this.#assertSwitchAllowed()
    const identity = createMobileIdentity(input.username, input.password)
    if (this.#mode === 'remote' && this.#remoteConfig) {
      const remote = new RemoteMostBoxCore(this.#remoteConfig, identity)
      try {
        await remote.start()
      } catch (error) {
        await remote.stop()
        throw error
      }
      await saveMobileIdentity(identity)
      this.#identity = identity
      await this.#activate(remote, 'remote', this.#remoteConfig)
    } else {
      await saveMobileIdentity(identity)
      this.#identity = identity
      this.#snapshot = this.#decorateSnapshot(this.#active.getSnapshot())
      this.#emit()
    }
    return identity
  }

  async signOut() {
    this.#assertSwitchAllowed()
    await saveMobileIdentity(null)
    this.#identity = null
    if (this.#mode === 'remote' && this.#remoteConfig) {
      const remote = new RemoteMostBoxCore(this.#remoteConfig, null)
      try {
        await remote.start()
        await this.#activate(remote, 'remote', this.#remoteConfig)
      } catch (error) {
        await this.#activate(remote, 'remote', this.#remoteConfig)
        throw error
      }
    } else {
      this.#snapshot = this.#decorateSnapshot(this.#active.getSnapshot())
      this.#emit()
    }
  }

  getNodeHistory() {
    return buildNodeHistory(
      this.#nodes,
      this.#mode,
      this.#remoteConfig?.url || ''
    )
  }

  startP2PPing(input: StartP2PPingInput) {
    return this.#active.startP2PPing(input)
  }

  cancelP2PPing(input: CancelP2PPingInput = {}) {
    return this.#active.cancelP2PPing(input)
  }

  publishFile(input: PublishFileInput) {
    return this.#active.publishFile(input)
  }

  downloadLink(input: DownloadLinkInput) {
    return this.#active.downloadLink(input)
  }

  cancelDownload(input: CancelDownloadInput) {
    return this.#active.cancelDownload(input)
  }

  exportHolding(input: ExportHoldingInput) {
    return this.#active.exportHolding(input)
  }

  deleteHolding(input: DeleteHoldingInput) {
    return this.#active.deleteHolding(input)
  }

  getSnapshot() {
    return this.#clone(this.#snapshot)
  }

  subscribe(listener: CoreListener) {
    this.#listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.#listeners.delete(listener)
  }

  async #activate(
    next: MostBoxMobileCore,
    mode: 'local' | 'remote',
    config: RemoteNodeConfig | null
  ) {
    const previous = this.#active
    this.#activeUnsubscribe?.()
    this.#active = next
    this.#mode = mode
    this.#remoteConfig = config
    this.#subscribeActive()
    if (previous !== next) await previous.stop()
    this.#snapshot = this.#decorateSnapshot(next.getSnapshot())
    this.#emit()
  }

  #subscribeActive() {
    this.#activeUnsubscribe?.()
    this.#activeUnsubscribe = this.#active.subscribe(snapshot => {
      this.#snapshot = this.#decorateSnapshot(snapshot)
      this.#emit()
    })
  }

  #decorateSnapshot(snapshot: MobileCoreSnapshot): MobileCoreSnapshot {
    return {
      ...this.#clone(snapshot),
      node: {
        ...snapshot.node,
        mode: this.#mode,
        endpoint: this.#mode === 'remote' ? this.#remoteConfig?.url || '' : '',
        authenticated:
          this.#mode === 'local' ? true : snapshot.node.authenticated === true,
        userAddress: this.#identity?.address || '',
        username: this.#identity?.username || '',
        fallbackFrom: this.#mode === 'local' ? this.#fallbackFrom : '',
      },
    }
  }

  #assertSwitchAllowed() {
    if (hasActiveTransfers(this.#snapshot)) {
      throw new Error(
        'Finish or cancel active transfers before switching nodes'
      )
    }
  }

  #emit() {
    const snapshot = this.getSnapshot()
    for (const listener of this.#listeners) listener(snapshot)
  }

  #clone(snapshot: MobileCoreSnapshot): MobileCoreSnapshot {
    return {
      node: { ...snapshot.node },
      holdings: snapshot.holdings.map(item => ({ ...item })),
      transfers: snapshot.transfers.map(item => ({ ...item })),
      p2pPing: snapshot.p2pPing
        ? {
            ...snapshot.p2pPing,
            directions: {
              hostToJoin: { ...snapshot.p2pPing.directions.hostToJoin },
              joinToHost: { ...snapshot.p2pPing.directions.joinToHost },
            },
          }
        : null,
      logs: snapshot.logs.map(item => ({ ...item })),
    }
  }
}
