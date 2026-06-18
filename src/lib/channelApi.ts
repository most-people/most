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

export interface ChannelMessage {
  id?: string | number
  type?: string
  author: string
  authorName?: string
  avatar?: string
  content: string
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

export interface SendMessageResult {
  message: ChannelMessage
}

export interface GetChannelsOptions {
  type?: string
}

export interface SendChannelMessageInput {
  channelName: string
  content: string
  author: string
  authorName: string
  avatar?: string
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
      .get<ChannelMessage[]>(
        `/api/channels/${encodeURIComponent(name)}/messages?limit=${limit}&offset=${offset}`
      )
      .json()
  },

  sendChannelMessage({
    channelName,
    content,
    author,
    authorName,
    avatar,
    attachment,
  }: SendChannelMessageInput) {
    return api
      .post<SendMessageResult>(
        `/api/channels/${encodeURIComponent(channelName)}/messages`,
        {
          json: attachment
            ? { content, author, authorName, avatar, attachment }
            : { content, author, authorName, avatar },
        }
      )
      .json()
  },

  getChannelPeers(name: string) {
    return api
      .get<string[]>(`/api/channels/${encodeURIComponent(name)}/peers`)
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
