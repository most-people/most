export type NodeRuntimeStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'error'

export type SeedStatus = 'queued' | 'joining' | 'active' | 'paused' | 'error'

export type TransferStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waitingCore'

export type TransferKind = 'publish' | 'download'

export type LogLevel = 'info' | 'warn' | 'error'

export type MobileHolding = {
  cid: string
  fileName: string
  size: number
  status: SeedStatus
  topicJoined: boolean
  peerCount: number
  source: 'published' | 'downloaded'
  shareLink: string
  localPath?: string
}

export type MobileTransfer = {
  id: string
  kind: TransferKind
  status: TransferStatus
  fileName: string
  cid?: string
  link?: string
  progress: number
  message: string
}

export type MobileLogEntry = {
  id: string
  time: string
  level: LogLevel
  message: string
}

export type MobileChannel = {
  name: string
  channelId: string
  channelKey: string
  key: string
  type: string
  createdAt: string
  lastMessageAt: string
  localWriterCoreKey: string
  writerCoreKeys: string[]
  peerCount: number
}

export type MobileChannelMessage = {
  type?: string
  author: string
  authorName: string
  content: string
  timestamp: number
}

export type NodeState = {
  status: NodeRuntimeStatus
  peerCount: number
  storagePath: string
  error: string
}

export type MobileCoreSnapshot = {
  node: NodeState
  holdings: MobileHolding[]
  transfers: MobileTransfer[]
  channels: MobileChannel[]
  channelMessages: Record<string, MobileChannelMessage[]>
  logs: MobileLogEntry[]
}

export type PublishFileInput = {
  uri: string
  name: string
  size: number
  mimeType?: string
  contentBytes?: Uint8Array
}

export type DownloadLinkInput = {
  link: string
}

export type ExportHoldingInput = {
  cid: string
  fileName?: string
}

export type DeleteHoldingInput = {
  cid: string
}

export type DeleteHoldingResult = {
  cid: string
  snapshot: MobileCoreSnapshot
}

export type CreateChannelInput = {
  name: string
  type?: string
}

export type SendChannelMessageInput = {
  channelName: string
  content: string
  author?: string
  authorName?: string
}

export type ExportHoldingResult = {
  filePath: string
  fileName: string
  size: number
  holding: MobileHolding
}

export type CoreListener = (snapshot: MobileCoreSnapshot) => void

export type MostBoxMobileCore = {
  start: () => Promise<void>
  stop: () => Promise<void>
  publishFile: (input: PublishFileInput) => Promise<MobileTransfer>
  downloadLink: (input: DownloadLinkInput) => Promise<MobileTransfer>
  exportHolding: (input: ExportHoldingInput) => Promise<ExportHoldingResult>
  deleteHolding: (input: DeleteHoldingInput) => Promise<DeleteHoldingResult>
  listHoldings: () => Promise<MobileHolding[]>
  createChannel: (input: CreateChannelInput) => Promise<MobileChannel>
  listChannels: () => Promise<MobileChannel[]>
  getChannelMessages: (
    channelName: string
  ) => Promise<MobileChannelMessage[]>
  sendChannelMessage: (
    input: SendChannelMessageInput
  ) => Promise<MobileChannelMessage>
  getSnapshot: () => MobileCoreSnapshot
  subscribe: (listener: CoreListener) => () => void
}
