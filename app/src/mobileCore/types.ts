export type NodeRuntimeStatus =
  'idle' | 'starting' | 'ready' | 'stopping' | 'error'

export type SeedStatus = 'queued' | 'joining' | 'active' | 'paused' | 'error'

export type TransferStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'waitingCore'

export type TransferKind = 'publish' | 'download'

export type LogLevel = 'info' | 'warn' | 'error'

export type NodeMode = 'local' | 'remote'

/** 持久化的身份只含设备密钥和授权证书，不含账号种子。 */
export type MobileIdentity = {
  /** 2 = v2 chat identity; older stored identities sign in again. */
  version: number
  username: string
  address: string
  syncKey: string
  device: { publicKey: string; secretKey: string; cert: string }
}

export type RemoteNodeConfig = {
  url: string
  invite: string
}

export type NodeHistoryItem = RemoteNodeConfig & {
  local: boolean
  preferred: boolean
  current: boolean
  updatedAt: number
  accountSync?: boolean
}

export type AccountSyncInfo = {
  /** 已登录且连接着远程节点时才有账号同步可设置。 */
  available: boolean
  /** 本机 daemon（回环地址）自动同步，不需要授权。 */
  automatic: boolean
  enabled: boolean
  devices: number
}

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
  kind?: 'file' | 'collection'
  folderShare?: boolean
  fileCount?: number
  size: number
  status: SeedStatus
  topicJoined: boolean
  peerCount: number
  source: 'published' | 'downloaded'
  shareLink: string
  localAvailable?: boolean
  localPath?: string
}

export type MobileTransfer = {
  phase?: 'downloading' | 'verifying' | 'completed'
  totalBytes?: number
  completedBytes?: number
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

export type MobileChannelAttachment = {
  kind: 'image' | 'video' | 'audio' | 'text' | 'file'
  cid: string
  fileName: string
  link: string
  mimeType?: string
  size?: number
}

export type MobileChannel = {
  name: string
  channelId: string
  channelKey: string
  key: string
  type: string
  /** Public channel (channel-keys §4). */
  public?: boolean
  remark: string
  pinned: boolean
  createdAt: string
  lastMessageAt: string
  localWriterCoreKey: string
  writerCoreKeys: string[]
  peerCount: number
}

export type MobileChannelMessage = {
  clientMessageId?: string
  type?: string
  author: string
  authorName: string
  content: string
  timestamp: number
  attachment?: MobileChannelAttachment
}

export type MobileChannelPresence = {
  channelKey: string
  channelId: string
  address: string
  displayName?: string
  avatar?: string
  profileUpdatedAt?: number
  lastSeen: number
  online: boolean
  local?: boolean
  status?: string
  sessionId?: string
}

export type NodeState = {
  status: NodeRuntimeStatus
  peerCount: number
  /** HyperDHT 是否能连上 P2P 网络；未知时缺省 */
  networkOnline?: boolean
  storagePath: string
  error: string
  mode?: NodeMode
  endpoint?: string
  authenticated?: boolean
  userAddress?: string
  username?: string
  /** Device certificate expiry and when to remind about renewal (ms). */
  deviceCertExpiresAt?: number
  deviceCertRenewAt?: number
  fallbackFrom?: string
}

export type MobileCoreSnapshot = {
  node: NodeState
  holdings: MobileHolding[]
  transfers: MobileTransfer[]
  p2pPing: P2PPing | null
  logs: MobileLogEntry[]
  channels?: MobileChannel[]
  channelMessages?: Record<string, MobileChannelMessage[]>
  channelPresence?: Record<string, MobileChannelPresence[]>
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
  webFile?: Blob
}

export type DownloadLinkInput = {
  link: string
}

export type ShareFolderInput = {
  path: string
}

export type ShareFolderResult = {
  cid: string
  fileName: string
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
  mimeType?: string
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

export type CreateChannelInput = { name: string; type?: string }
export type LeaveChannelInput = { channelName: string }
export type SetChannelRemarkInput = { channelName: string; remark: string }
export type SetChannelPinnedInput = { channelName: string; pinned: boolean }
export type LeaveChannelResult = {
  channelKey: string
  snapshot: MobileCoreSnapshot
}
/** A message body signed by this device (docs/protocol/v2/signatures.md §4). */
export type SendChannelMessageInput = {
  channelName: string
  signed: {
    body: Record<string, unknown>
    device: string
    cert: string
    sig: string
  }
}
export type ChannelPresenceInput = SendChannelMessageInput & {
  action: 'join' | 'leave' | 'heartbeat'
}

export type MobileMemberProfile = {
  address: string
  displayName?: string
  avatar?: string
  tag?: Record<string, string> | null
  profileUpdatedAt?: number
}

export type CoreListener = (snapshot: MobileCoreSnapshot) => void

export type MostBoxMobileCore = {
  start: () => Promise<void>
  stop: () => Promise<void>
  startP2PPing: (input: StartP2PPingInput) => Promise<P2PPing>
  cancelP2PPing: (input?: CancelP2PPingInput) => Promise<P2PPing | null>
  publishFile: (input: PublishFileInput) => Promise<MobileTransfer>
  shareFolder: (input: ShareFolderInput) => Promise<ShareFolderResult>
  downloadLink: (input: DownloadLinkInput) => Promise<MobileTransfer>
  cancelDownload: (input: CancelDownloadInput) => Promise<CancelDownloadResult>
  exportHolding: (input: ExportHoldingInput) => Promise<ExportHoldingResult>
  deleteHolding: (input: DeleteHoldingInput) => Promise<DeleteHoldingResult>
  getSnapshot: () => MobileCoreSnapshot
  subscribe: (listener: CoreListener) => () => void
  createChannel?: (input: CreateChannelInput) => Promise<MobileChannel>
  listChannels?: () => Promise<MobileChannel[]>
  leaveChannel?: (input: LeaveChannelInput) => Promise<void>
  setChannelRemark?: (input: SetChannelRemarkInput) => Promise<void>
  setChannelPinned?: (input: SetChannelPinnedInput) => Promise<void>
  getChannelMessages?: (
    channelName: string,
    options?: { limit?: number; offset?: number }
  ) => Promise<MobileChannelMessage[]>
  sendChannelPresence?: (input: ChannelPresenceInput) => Promise<void>
  getChannelMemberProfiles?: (
    channelName: string
  ) => Promise<MobileMemberProfile[]>
  updateChannelMemberProfile?: (input: SendChannelMessageInput) => Promise<void>
  sendChannelMessage?: (
    input: SendChannelMessageInput
  ) => Promise<MobileChannelMessage>
}

export type MostBoxMobileClient = MostBoxMobileCore & {
  getIdentity?: () => MobileIdentity | null
  connectRemote: (input: RemoteNodeConfig) => Promise<void>
  switchToLocal: () => Promise<void>
  signIn: (input: {
    username: string
    password: string
    /** Device certificate validity; defaults to 30 days. */
    ttlMs?: number
  }) => Promise<MobileIdentity>
  signOut: () => Promise<void>
  getNodeHistory: () => NodeHistoryItem[]
  getAccountSync: () => Promise<AccountSyncInfo>
  setAccountSync: (enabled: boolean) => Promise<AccountSyncInfo>
  /** Dev only: native scrypt timing in the Bare backend. */
  runNativeScryptBenchmark?: () => Promise<NativeScryptRun[]>
}

export type NativeScryptRun = {
  logN: number
  memoryMiB: number
  timesMs: number[]
  medianMs: number | null
  error?: string
}
