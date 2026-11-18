// Client-side signing of v2 chat bodies (docs/protocol/v2/signatures.md §4).
// The node accepts a body only if it is already in normal form, so the
// optional fields go through the same normalizers the node checks with.
import nacl from 'tweetnacl'
import { signedPayload, toBase64Url } from '~server/src/core/chatSigning.js'
import {
  normalizeAvatar,
  normalizeDisplayName,
} from '~server/src/core/shared.js'
import { normalizeLocalizedChatTag } from '~server/src/utils/chatLabels.js'
import type { ChannelAttachment, ChannelMention } from '~/lib/channelApi'
import type { LocalizedTag } from '~/lib/localizedTag'
import type { DeviceCredential } from '~/stores/userStore'

const CHANNEL_ID_REGEX = /^[0-9a-f]{64}$/

export interface SignedEnvelope<Body> {
  body: Body
  device: string
  cert: string
  sig: string
}

export interface MessageBody {
  kind: 'message'
  channelId: string
  author: string
  id: string
  createdAt: number
  content: string
  authorName?: string
  avatar?: string
  authorTag?: LocalizedTag
  mentions?: ChannelMention[]
  attachment?: ChannelAttachment
}

interface MessageBodyInput {
  channelId: string
  author: string
  id: string
  content: string
  authorName?: string
  avatar?: string
  authorTag?: LocalizedTag
  mentions?: ChannelMention[]
  attachment?: ChannelAttachment
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

export function isChannelId(value: string) {
  return CHANNEL_ID_REGEX.test(value)
}

export function buildMessageBody(input: MessageBodyInput): MessageBody {
  if (!isChannelId(input.channelId)) {
    throw new Error('Unknown channel ID')
  }
  const author = input.author.toLowerCase()
  const body: MessageBody = {
    kind: 'message',
    channelId: input.channelId,
    author,
    id: input.id,
    createdAt: Date.now(),
    content: input.content.trim(),
  }
  const authorName = normalizeDisplayName(input.authorName, author.slice(0, 10))
  if (authorName) body.authorName = authorName
  const avatar = normalizeAvatar(input.avatar)
  if (avatar) body.avatar = avatar
  const authorTag = normalizeLocalizedChatTag(input.authorTag) as
    LocalizedTag | undefined
  if (authorTag) body.authorTag = authorTag
  if (input.mentions && input.mentions.length > 0) {
    body.mentions = input.mentions.map(mention => ({
      address: mention.address.toLowerCase(),
      label: mention.label,
      start: mention.start,
      end: mention.end,
    }))
  }
  if (input.attachment) {
    const attachment = { ...input.attachment }
    // Undefined fields are dropped by JSON, but must not reach the signature.
    for (const key of Object.keys(attachment) as (keyof ChannelAttachment)[]) {
      if (attachment[key] === undefined) delete attachment[key]
    }
    body.attachment = attachment
  }
  return body
}

export function signChatBody<Body extends { kind: string }>(
  body: Body,
  device: DeviceCredential
): SignedEnvelope<Body> {
  const signature = nacl.sign.detached(
    signedPayload(body),
    hexToBytes(device.secretKey)
  )
  return {
    body,
    device: device.publicKey,
    cert: device.cert,
    sig: toBase64Url(signature),
  }
}
