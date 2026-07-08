import type { FileSubtype } from '~/lib/filePreview'
import { api, getApiUrl } from '~server/src/utils/api'

export interface ChannelAttachment {
  kind: FileSubtype
  cid: string
  fileName: string
  link: string
  mimeType?: string
  size?: number
}

export interface ChannelMention {
  address: string
  label: string
  start: number
  end: number
}

export interface ChannelMessage {
  id?: string | number
  type?: string
  event?: string
  clientMessageId?: string
  author: string
  authorName?: string
  avatar?: string
  content: string
  mentions?: ChannelMention[]
  timestamp: number
  pending?: boolean
  attachment?: ChannelAttachment
}

export interface Channel {
  name: string
  channelId?: string
  channelKey?: string
  remark?: string
  createdAt?: string
  lastMessageAt?: string
  coreKey?: string
  localWriterCoreKey?: string
  writerCoreKeys?: string[]
  type?: string
  peerCount?: number
  pinned?: boolean
}

export interface ChannelPeer {
  peerId: string
  authorName?: string
  memberAddresses?: string[]
  lastSeen?: number
}

export interface ChannelPresence {
  address: string
  displayName?: string
  avatar?: string
  profileUpdatedAt?: number
  lastSeen: number
  online: boolean
  local?: boolean
}

export interface SendMessageResult {
  message: ChannelMessage
}

export interface GetChannelsOptions {
  type?: string
}

export interface SendChannelMessageInput {
  channelName: string
  content: string
  clientMessageId?: string
  author: string
  authorName: string
  avatar?: string
  mentions?: ChannelMention[]
  attachment?: ChannelAttachment
}

export interface ChannelProfileInput {
  displayName?: string
  avatar?: string
}

export interface SetChannelRemarkResult {
  success: boolean
  remark: string
}

export interface SetChannelPinnedResult {
  success: boolean
  pinned: boolean
}

export interface CreateChannelResult extends Channel {
  success?: boolean
  key?: string
}

export const channelApi = {
  getChannels(options: GetChannelsOptions = {}) {
    const params = new URLSearchParams()
    if (options.type) params.set('type', options.type)
    const query = params.toString()
    return api
      .get<Channel[]>(query ? `/api/channels?${query}` : '/api/channels')
      .json()
  },

  createChannel(
    name: string,
    type = 'personal',
    profile: ChannelProfileInput = {}
  ) {
    return api
      .post<CreateChannelResult>('/api/channels', {
        json: { name, type, ...profile },
      })
      .json()
  },

  leaveChannel(name: string) {
    return api.delete('/api/channels', { json: { channelKey: name } }).json()
  },

  getChannelMessages(name: string, limit = 100, offset = 0) {
    return api
      .get<
        ChannelMessage[]
      >(`/api/channels/${encodeURIComponent(name)}/messages?limit=${limit}&offset=${offset}`)
      .json()
  },

  sendChannelMessage({
    channelName,
    content,
    clientMessageId,
    author,
    authorName,
    avatar,
    mentions,
    attachment,
  }: SendChannelMessageInput) {
    const json = {
      content,
      clientMessageId,
      author,
      authorName,
      avatar,
      mentions,
      attachment,
    }
    return api
      .post<SendMessageResult>(
        `/api/channels/${encodeURIComponent(channelName)}/messages`,
        { json }
      )
      .json()
  },

  getChannelPeers(name: string) {
    return api
      .get<ChannelPeer[]>(`/api/channels/${encodeURIComponent(name)}/peers`)
      .json()
  },

  getChannelPresence(name: string) {
    return api
      .get<
        ChannelPresence[]
      >(`/api/channels/${encodeURIComponent(name)}/presence`)
      .json()
  },

  setChannelRemark(name: string, remark: string) {
    return api
      .put<SetChannelRemarkResult>(
        `/api/channels/${encodeURIComponent(name)}/remark`,
        { json: { remark } }
      )
      .json()
  },

  setChannelPinned(name: string, pinned: boolean) {
    return api
      .put<SetChannelPinnedResult>(
        `/api/channels/${encodeURIComponent(name)}/pin`,
        { json: { pinned } }
      )
      .json()
  },

  getFileDownloadUrl(cid: string) {
    return getApiUrl(`/api/files/${cid}/download`)
  },
}
