'use client'

import {
  AlertCircle,
  Download,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Loader,
  Music,
} from 'lucide-react'
import type { ChannelAttachment } from '~/lib/channelApi'

export type ChatAttachmentStatus = 'idle' | 'checking' | 'available' | 'error'

export function formatAttachmentSize(bytes?: number) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function getAttachmentBaseFileName(fileName: string) {
  const parts = String(fileName || '').split('/')
  return parts[parts.length - 1] || fileName
}

function getAttachmentIcon(kind: ChannelAttachment['kind']) {
  if (kind === 'image') return <ImageIcon size={20} />
  if (kind === 'video') return <Film size={20} />
  if (kind === 'audio') return <Music size={20} />
  return <FileText size={20} />
}

export function ChatAttachmentCard({
  attachment,
  status = 'idle',
  pending = false,
  onOpen,
}: {
  attachment: ChannelAttachment
  status?: ChatAttachmentStatus
  pending?: boolean
  onOpen?: (attachment: ChannelAttachment) => void
}) {
  const isBusy = status === 'checking'
  const actionClassName = [
    'ui-file-action',
    'chat-attachment-action',
    status === 'error' ? 'error' : '',
    status === 'available' ? 'available' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const detail = formatAttachmentSize(attachment.size) || 'MostBox 文件'

  return (
    <button
      type="button"
      className="ui-file-card chat-attachment-card"
      onClick={() => onOpen?.(attachment)}
      disabled={pending || isBusy}
      title={attachment.link}
    >
      <span className={`ui-file-icon chat-attachment-icon ${attachment.kind}`}>
        {isBusy ? (
          <Loader size={20} className="ui-spinner chat-attachment-spinner" />
        ) : (
          getAttachmentIcon(attachment.kind)
        )}
      </span>
      <span className="ui-file-info chat-attachment-info">
        <span className="ui-file-name chat-attachment-name">
          {getAttachmentBaseFileName(attachment.fileName)}
        </span>
        <span className="ui-file-meta chat-attachment-meta">
          {pending ? '发送中...' : detail}
        </span>
      </span>
      <span className={actionClassName}>
        {isBusy ? (
          '检测中'
        ) : status === 'available' ? (
          <Eye size={16} />
        ) : status === 'error' ? (
          <AlertCircle size={17} />
        ) : (
          <Download size={16} />
        )}
      </span>
    </button>
  )
}
