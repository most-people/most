// Client-side signing of v2 chat bodies (docs/protocol/v2/signatures.md §4).
// Nodes accept a body only in normal form, so optional fields are normalized
// here the way the nodes check them. The web client has the same logic in
// src/lib/chatSigning.ts.
import nacl from 'tweetnacl'
import { signedPayload, toBase64Url } from '../../shared/chat-signing.mjs'
import type { MobileIdentity } from '../mobileCore/types'

const CHANNEL_ID_REGEX = /^[0-9a-f]{64}$/
const DISPLAY_NAME_MAX_LENGTH = 50

export type SignedEnvelope = {
  body: Record<string, unknown>
  device: string
  cert: string
  sig: string
}

export type MessageBodyInput = {
  channelId: string
  author: string
  id: string
  content: string
  authorName?: string
  attachment?: object | null
  mentions?: Array<{
    address: string
    label: string
    start: number
    end: number
  }>
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

export function buildMessageBody(input: MessageBodyInput) {
  if (!isChannelId(input.channelId)) throw new Error('Unknown channel ID')
  const author = input.author.toLowerCase()
  const body: Record<string, unknown> = {
    kind: 'message',
    channelId: input.channelId,
    author,
    id: input.id,
    createdAt: Date.now(),
    content: input.content.trim(),
  }
  const authorName = (
    String(input.authorName || '').trim() || author.slice(0, 10)
  ).slice(0, DISPLAY_NAME_MAX_LENGTH)
  body.authorName = authorName
  if (input.mentions && input.mentions.length > 0) {
    body.mentions = input.mentions.map(mention => ({
      address: mention.address.toLowerCase(),
      label: mention.label,
      start: mention.start,
      end: mention.end,
    }))
  }
  if (input.attachment) {
    // JSON drops undefined fields, so the signature must not cover them.
    body.attachment = Object.fromEntries(
      Object.entries(input.attachment).filter(
        ([, value]) => value !== undefined
      )
    )
  }
  return body
}

export function signChatBody(
  body: Record<string, unknown>,
  identity: Pick<MobileIdentity, 'device'>
): SignedEnvelope {
  const signature = nacl.sign.detached(
    signedPayload(body),
    hexToBytes(identity.device.secretKey)
  )
  return {
    body,
    device: identity.device.publicKey,
    cert: identity.device.cert,
    sig: toBase64Url(signature),
  }
}
