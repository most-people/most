import type { FileSubtype } from '~/lib/filePreview'
import { api } from '~/server/src/utils/api'

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
  author: string
  authorName?: string
  content: string
  timestamp: number
  pending?: boolean
  attachment?: ChannelAttachment
}

export interface Channel {
  name: string
  remark?: string
  createdAt?: string
  coreKey?: string
  type?: string
  peerCount?: number
}

export interface SendMessageResult {
  message: ChannelMessage
}

export interface GetChannelsOptions {
  type?: string
  excludeType?: string
}

export interface SendChannelMessageInput {
  channelName: string
  content: string
  author: string
  authorName: string
  attachment?: ChannelAttachment
}

export interface SetChannelRemarkResult {
  success: boolean
  remark: string
}

export const channelApi = {
  getChannels(options: GetChannelsOptions = {}) {
    const params = new URLSearchParams()
    if (options.type) params.set('type', options.type)
    if (options.excludeType) params.set('excludeType', options.excludeType)
    const query = params.toString()
    return api
      .get<Channel[]>(query ? `/api/channels?${query}` : '/api/channels')
      .json()
  },

  createChannel(name: string, type = 'personal') {
    return api.post<Channel>('/api/channels', { json: { name, type } }).json()
  },

  leaveChannel(name: string) {
    return api.delete(`/api/channels/${encodeURIComponent(name)}`).json()
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
    attachment,
  }: SendChannelMessageInput) {
    return api
      .post<SendMessageResult>(
        `/api/channels/${encodeURIComponent(channelName)}/messages`,
        {
          json: attachment
            ? { content, author, authorName, attachment }
            : { content, author, authorName },
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
}
