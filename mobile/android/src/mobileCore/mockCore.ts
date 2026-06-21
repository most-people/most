import { parseMostLink } from './protocol'
import type {
  CoreListener,
  DownloadLinkInput,
  MobileCoreSnapshot,
  MobileLogEntry,
  MobileTransfer,
  MostBoxMobileCore,
  PublishFileInput,
} from './types'

function createInitialSnapshot(): MobileCoreSnapshot {
  return {
    node: {
      status: 'idle',
      peerCount: 0,
      storagePath: 'android-app-sandbox',
      error: '',
    },
    holdings: [],
    transfers: [],
    logs: [],
  }
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

export class MockMostBoxCore implements MostBoxMobileCore {
  #snapshot = createInitialSnapshot()
  #listeners = new Set<CoreListener>()

  async start() {
    this.#patch({
      node: {
        ...this.#snapshot.node,
        status: 'starting',
        error: '',
      },
    })
    this.#log('info', 'Android P2P core 正在启动')

    await Promise.resolve()

    this.#patch({
      node: {
        ...this.#snapshot.node,
        status: 'ready',
      },
    })
    this.#log('warn', '当前使用开发占位 core，尚未连接 Hyperswarm')
  }

  async stop() {
    this.#patch({
      node: {
        ...this.#snapshot.node,
        status: 'stopping',
      },
    })
    this.#log('info', 'Android P2P core 正在停止')

    await Promise.resolve()

    this.#patch({
      node: {
        ...this.#snapshot.node,
        status: 'idle',
        peerCount: 0,
      },
    })
  }

  async publishFile(input: PublishFileInput) {
    const transfer: MobileTransfer = {
      id: createId('publish'),
      kind: 'publish',
      status: 'waitingCore',
      fileName: input.name,
      progress: 0,
      message: '等待接入 Bare Worklet P2P core 后计算 CID 并做种',
    }

    this.#snapshot.transfers = [transfer, ...this.#snapshot.transfers]
    this.#log(
      'warn',
      `已接收 ${input.name}，真实发布将在 P2P core 接入后启用`
    )
    this.#emit()
    return transfer
  }

  async downloadLink(input: DownloadLinkInput) {
    const parsed = parseMostLink(input.link)
    const transfer: MobileTransfer = {
      id: createId('download'),
      kind: 'download',
      status: 'waitingCore',
      fileName: parsed.filename,
      cid: parsed.cid,
      link: input.link,
      progress: 0,
      message: '等待接入 Bare Worklet P2P core 后发现 peer 并下载',
    }

    this.#snapshot.transfers = [transfer, ...this.#snapshot.transfers]
    this.#log(
      'warn',
      `已解析 ${parsed.cid.slice(0, 12)}，真实下载将在 P2P core 接入后启用`
    )
    this.#emit()
    return transfer
  }

  async listHoldings() {
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

  #patch(patch: Partial<MobileCoreSnapshot>) {
    this.#snapshot = {
      ...this.#snapshot,
      ...patch,
    }
    this.#emit()
  }

  #log(level: MobileLogEntry['level'], message: string) {
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
      logs: this.#snapshot.logs.map(log => ({ ...log })),
    }
  }
}
