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

export type ChatAttachmentStatus = 'idle' | 'checking' | 'available' | 'error'

export function getAttachmentBaseFileName(fileName: string) {
  return String(fileName || '').split('/').pop() || fileName
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
  const { t } = useI18n()
  const isBusy = status === 'checking'
  const actionClassName =
    `ui-file-action chat-attachment-action ${status === 'error' ? 'error' : status === 'available' ? 'available' : ''}`.trim()
  const detail = Number.isFinite(attachment.size) && attachment.size > 0 ? formatBytes(attachment.size) : t('chat.mostboxFile')

  return (
    <button
      type="button"
      className="ui-file-card chat-attachment-card"
      onClick={() => onOpen?.(attachment)}
      disabled={pending || isBusy}
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
          {pending ? t('chat.sending') : detail}
        </span>
      </span>
      <span className={actionClassName} translate="yes">
        {isBusy ? (
          t('chat.checking')
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
