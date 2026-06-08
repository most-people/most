export interface ChatJoinInviteChannel {
  id: string
  name?: string
}

export interface ChatJoinInvitePayload {
  node_url?: string
  node_invite?: string
  locale?: string
  uid: string
  identity?: 'user' | 'service' | 'service_ai'
  avatar?: string
  name?: string
  channels: ChatJoinInviteChannel[]
}

export interface ChatJoinInviteField {
  name: string
  required: boolean
  description: string
}

export const CHAT_JOIN_INVITE_FIELDS: ChatJoinInviteField[] = [
  {
    name: 'node_url',
    required: false,
    description: 'Web 端未连接后端时，用于连接远程节点。',
  },
  {
    name: 'node_invite',
    required: false,
    description: '配合 node_url 作为远程节点邀请码。',
  },
  {
    name: 'uid',
    required: true,
    description: '作为用户名，密码为空，用于生成账户并自动登录。',
  },
  {
    name: 'identity',
    required: false,
    description: '邀请身份类型；user 为普通用户视图。',
  },
  {
    name: 'avatar',
    required: false,
    description: '覆盖默认头像。',
  },
  {
    name: 'name',
    required: false,
    description: '覆盖默认昵称。',
  },
  {
    name: 'locale',
    required: false,
    description: '预留给多语言切换，当前暂不执行。',
  },
  {
    name: 'channels[].id',
    required: true,
    description: '频道 ID，用于自动加入频道。',
  },
  {
    name: 'channels[].name',
    required: false,
    description: '频道备注，不作为频道 ID。',
  },
]
