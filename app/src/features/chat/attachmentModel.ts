import {
  normalizeChatAttachment,
  type ChatAttachment,
  type ChatMessage,
} from '../../chat/chatProtocol'
import { parseIncomingMostLink } from '../../mobileCore/protocol'
import type { MobileHolding, MobileTransfer } from '../../mobileCore/types'

export function getMessageAttachment(
  message: Pick<ChatMessage, 'attachment' | 'content'>
): ChatAttachment | null {
  try {
    if (message.attachment) return normalizeChatAttachment(message.attachment)
    const intent = parseIncomingMostLink(message.content)
    return intent ? { kind: 'file', ...intent } : null
  } catch {
    return null
  }
}

export function getAttachmentState(
  cid: string,
  holdings: MobileHolding[],
  transfers: MobileTransfer[]
) {
  const holding = holdings.find(
    item => item.cid === cid && item.localAvailable === true
  )
  if (holding)
    return { status: 'available' as const, holding, transfer: undefined }
  const downloads = transfers.filter(
    item => item.cid === cid && item.kind === 'download'
  )
  const transfer =
    downloads.find(item => item.status === 'running') || downloads[0]
  const status =
    transfer?.status === 'running'
      ? 'running'
      : transfer?.status === 'failed'
        ? 'failed'
        : 'ready'
  return { status, holding: undefined, transfer }
}

export function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(1)} MiB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GiB`
}
