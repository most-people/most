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
  remark: string
  pinned: boolean
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
  storagePath: string
  error: string
}

export type MobileCoreSnapshot = {
  node: NodeState
  holdings: MobileHolding[]
  transfers: MobileTransfer[]
  channels: MobileChannel[]
  channelMessages: Record<string, MobileChannelMessage[]>
  channelPresence: Record<string, MobileChannelPresence[]>
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

export type LeaveChannelInput = {
  channelName: string
}

export type ChannelMetadataInput = {
  channelName: string
}

export type SetChannelRemarkInput = ChannelMetadataInput & {
  remark: string
}

export type SetChannelPinnedInput = ChannelMetadataInput & {
  pinned: boolean
}

export type LeaveChannelResult = {
  channelKey: string
  snapshot: MobileCoreSnapshot
}

export type SendChannelMessageInput = {
  channelName: string
  content: string
  author?: string
  authorName?: string
  attachment?: MobileChannelAttachment
}

export type ChannelPresenceInput = {
  channelName: string
  address?: string
  displayName?: string
  avatar?: string
  profileUpdatedAt?: number
  sessionId?: string
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
  leaveChannel: (input: LeaveChannelInput) => Promise<LeaveChannelResult>
  setChannelRemark: (input: SetChannelRemarkInput) => Promise<MobileChannel>
  setChannelPinned: (input: SetChannelPinnedInput) => Promise<MobileChannel>
  listChannels: () => Promise<MobileChannel[]>
  getChannelMessages: (channelName: string) => Promise<MobileChannelMessage[]>
  sendChannelMessage: (
    input: SendChannelMessageInput
  ) => Promise<MobileChannelMessage>
  getChannelPresence: (channelName: string) => Promise<MobileChannelPresence[]>
  joinChannelPresence: (
    input: ChannelPresenceInput
  ) => Promise<MobileChannelPresence[]>
  heartbeatChannelPresence: (
    input: ChannelPresenceInput
  ) => Promise<MobileChannelPresence[]>
  leaveChannelPresence: (
    input: ChannelPresenceInput
  ) => Promise<MobileChannelPresence[]>
  getSnapshot: () => MobileCoreSnapshot
  subscribe: (listener: CoreListener) => () => void
}
