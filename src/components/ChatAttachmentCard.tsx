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
import { formatBytes } from '~/lib/format'
import { useI18n } from '~/lib/i18n'

export type ChatAttachmentStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'downloading'
  | 'available'
  | 'error'

export function getAttachmentBaseFileName(fileName: string) {
  return (
    String(fileName || '')
      .split('/')
      .pop() || fileName
  )
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
  message,
  pending = false,
  onOpen,
}: {
  attachment: ChannelAttachment
  status?: ChatAttachmentStatus
  message?: string
  pending?: boolean
  onOpen?: (attachment: ChannelAttachment) => void
}) {
  const { t } = useI18n()
  const isChecking = status === 'checking'
  const isDownloading = status === 'downloading'
  const isBusy = pending || isChecking || isDownloading
  const actionClassName =
    `ui-file-action chat-attachment-action ${status === 'error' ? 'error' : status === 'available' ? 'available' : ''}`.trim()
  const detail =
    Number.isFinite(attachment.size) && attachment.size > 0
      ? formatBytes(attachment.size)
      : t('chat.mostboxFile')
  const displayDetail = pending ? t('chat.sending') : message || detail
  const actionLabel = pending
    ? t('chat.sending')
    : isChecking
      ? t('chat.checking')
      : isDownloading
        ? t('chat.attachment.downloading')
        : status === 'available'
          ? t('chat.attachment.preview')
          : status === 'error'
            ? t('chat.attachment.retry')
            : t('chat.attachment.download')

  return (
    <button
      type="button"
      className="ui-file-card chat-attachment-card"
      onClick={() => onOpen?.(attachment)}
      disabled={isBusy}
      title={attachment.link}
      translate="no"
    >
      <span className={`ui-file-icon chat-attachment-icon ${attachment.kind}`}>
        {isBusy ? (
          <Loader size={20} className="ui-spinner chat-attachment-spinner" />
        ) : (
          getAttachmentIcon(attachment.kind)
        )}
      </span>
      <span className="ui-file-info chat-attachment-info">
        <span className="ui-file-name chat-attachment-name" translate="no">
          {getAttachmentBaseFileName(attachment.fileName)}
        </span>
        <span className="ui-file-meta chat-attachment-meta" translate="yes">
          {displayDetail}
        </span>
      </span>
      <span className={actionClassName} translate="yes">
        {isBusy ? (
          <Loader size={15} className="ui-spinner chat-attachment-spinner" />
        ) : status === 'available' ? (
          <Eye size={16} />
        ) : status === 'error' ? (
          <AlertCircle size={17} />
        ) : (
          <Download size={16} />
        )}
        <span className="chat-attachment-action-label">{actionLabel}</span>
      </span>
    </button>
  )
}
