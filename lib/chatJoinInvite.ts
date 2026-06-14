import type { MessageKey } from '~/lib/i18n'

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
  logo?: string
  avatar?: string
  name?: string
  channels: ChatJoinInviteChannel[]
}

export interface ChatJoinInviteField {
  name: string
  required: boolean
  descriptionKey: MessageKey
}

export const CHAT_JOIN_INVITE_FIELDS: ChatJoinInviteField[] = [
  {
    name: 'node_url',
    required: false,
    descriptionKey: 'chatJoin.field.nodeUrl',
  },
  {
    name: 'node_invite',
    required: false,
    descriptionKey: 'chatJoin.field.nodeInvite',
  },
  {
    name: 'uid',
    required: true,
    descriptionKey: 'chatJoin.field.uid',
  },
  {
    name: 'identity',
    required: false,
    descriptionKey: 'chatJoin.field.identity',
  },
  {
    name: 'logo',
    required: false,
    descriptionKey: 'chatJoin.field.logo',
  },
  {
    name: 'avatar',
    required: false,
    descriptionKey: 'chatJoin.field.avatar',
  },
  {
    name: 'name',
    required: false,
    descriptionKey: 'chatJoin.field.name',
  },
  {
    name: 'locale',
    required: false,
    descriptionKey: 'chatJoin.field.locale',
  },
  {
    name: 'channels[].id',
    required: true,
    descriptionKey: 'chatJoin.field.channelId',
  },
  {
    name: 'channels[].name',
    required: false,
    descriptionKey: 'chatJoin.field.channelName',
  },
]
