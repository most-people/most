import { api, getApiUrl } from '~/server/src/utils/api'
import type { FileSubtype } from '~/lib/filePreview'

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

export const channelApi = {
  getChannels: () => api.get<Channel[]>('/api/channels').json(),
  createChannel: (name: string, type: string) =>
    api.post('/api/channels', { json: { name, type } }).json(),
  leaveChannel: (name: string) =>
    api.delete(`/api/channels/${encodeURIComponent(name)}`).json(),
  getChannelMessages: (name: string, limit = 100, offset = 0) =>
    api
      .get<
        ChannelMessage[]
      >(`/api/channels/${encodeURIComponent(name)}/messages?limit=${limit}&offset=${offset}`)
      .json(),
  sendChannelMessage: (
    name: string,
    content: string,
    author: string,
    authorName: string,
    attachment?: ChannelAttachment
  ) =>
    api
      .post<SendMessageResult>(
        `/api/channels/${encodeURIComponent(name)}/messages`,
        {
          json: attachment
            ? { content, author, authorName, attachment }
            : { content, author, authorName },
        }
      )
      .json(),
  getChannelPeers: (name: string) =>
    api.get<string[]>(`/api/channels/${encodeURIComponent(name)}/peers`).json(),
  setChannelRemark: (name: string, remark: string) =>
    api
      .put<{
        success: boolean
        remark: string
      }>(`/api/channels/${encodeURIComponent(name)}/remark`, {
        json: { remark },
      })
      .json(),
  getFileDownloadUrl: (cid: string) => getApiUrl(`/api/files/${cid}/download`),
}
