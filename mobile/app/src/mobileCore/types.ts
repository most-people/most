export type NodeRuntimeStatus =
  'idle' | 'starting' | 'ready' | 'stopping' | 'error'

export type SeedStatus = 'queued' | 'joining' | 'active' | 'paused' | 'error'

export type TransferStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'waitingCore'

export type TransferKind = 'publish' | 'download'

export type LogLevel = 'info' | 'warn' | 'error'

export type P2PPingRole = 'host' | 'join'

export type P2PPingDirectionName = 'hostToJoin' | 'joinToHost'

export type P2PPingStatus =
  | 'preparing'
  | 'waiting'
  | 'discovering'
  | 'connecting'
  | 'verifying'
  | 'success'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'expired'

export type P2PPingErrorCode =
  | 'ANNOUNCE_FAILED'
  | 'PEER_NOT_FOUND'
  | 'CONNECTION_FAILED'
  | 'PING_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'

export type P2PPingDirection = {
  direction: P2PPingDirectionName
  initiatorRole: P2PPingRole
  status: Exclude<P2PPingStatus, 'partial'>
  phase: Exclude<P2PPingStatus, 'partial'>
  elapsedMs: number | null
  discoveredPeers: number
  localPeerKey: string | null
  remotePeerKey: string | null
  errorCode: P2PPingErrorCode | null
  errorMessage: string | null
}

export type P2PPing = {
  id: string
  role: P2PPingRole
  code: string
  status: P2PPingStatus
  phase: P2PPingStatus
  createdAt: string
  expiresAt: string
  completedAt: string | null
  elapsedMs: number | null
  discoveredPeers: number
  localPeerKey: string | null
  remotePeerKey: string | null
  errorCode: P2PPingErrorCode | null
  errorMessage: string | null
  directions: Record<P2PPingDirectionName, P2PPingDirection>
}

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
  p2pPing: P2PPing | null
  logs: MobileLogEntry[]
}

export type StartP2PPingInput = {
  role: P2PPingRole
  code?: string
}

export type CancelP2PPingInput = {
  id?: string
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

export type CancelDownloadInput = {
  cid: string
}

export type CancelDownloadResult = {
  cid: string
  snapshot: MobileCoreSnapshot
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
  startP2PPing: (input: StartP2PPingInput) => Promise<P2PPing>
  cancelP2PPing: (input?: CancelP2PPingInput) => Promise<P2PPing | null>
  publishFile: (input: PublishFileInput) => Promise<MobileTransfer>
  downloadLink: (input: DownloadLinkInput) => Promise<MobileTransfer>
  cancelDownload: (input: CancelDownloadInput) => Promise<CancelDownloadResult>
  exportHolding: (input: ExportHoldingInput) => Promise<ExportHoldingResult>
  deleteHolding: (input: DeleteHoldingInput) => Promise<DeleteHoldingResult>
  getSnapshot: () => MobileCoreSnapshot
  subscribe: (listener: CoreListener) => () => void
}
