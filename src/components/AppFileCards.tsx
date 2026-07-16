import {
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Music,
  Share2,
} from 'lucide-react'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'
import { formatBytes } from '~/lib/format'

export interface AppFileItem {
  cid: string
  fileName: string
  kind?: 'file' | 'collection'
  size?: number
  fileCount?: number
  downloadedCount?: number
  starred?: boolean
  subtype?: FileSubtype
  [key: string]: unknown
}

export interface AppFolderItem {
  name: string
  path: string
}

interface FileCardProps {
  file: AppFileItem
  isSelected: boolean
  onSelect: (cid: string) => void
  onPreview: (file: AppFileItem) => void
  onShare?: (file: AppFileItem) => void
  shareLabel?: string
}

interface FolderCardProps {
  folder: AppFolderItem
  onClick: () => void
  onShare?: () => void
  shareLabel?: string
}

export function parseAppFileName(fullPath: string) {
  const lastSlash = fullPath.lastIndexOf('/')
  if (lastSlash === -1) return { folder: '', name: fullPath }
  return {
    folder: fullPath.substring(0, lastSlash),
    name: fullPath.substring(lastSlash + 1),
  }
}

export function FileCard({
  file,
  isSelected,
  onSelect,
  onPreview,
  onShare,
  shareLabel = 'Share',
}: FileCardProps) {
  const subtype = getFileSubtype(file.fileName)
  let fileIcon = <FileText size={24} color="#fff" />
  const isCollection = file.kind === 'collection'
  const fileCount = Number(file.fileCount) || 0
  const downloadedCount = Number(file.downloadedCount) || 0

  if (isCollection) {
    fileIcon = <Folder size={24} color="#fff" />
  } else if (subtype === 'image') {
    fileIcon = <ImageIcon size={24} color="#fff" />
  } else if (subtype === 'video') {
    fileIcon = <Film size={24} color="#fff" />
  } else if (subtype === 'audio') {
    fileIcon = <Music size={24} color="#fff" />
  }

  return (
    <div
      data-id={file.cid}
      onClick={() => onSelect(file.cid)}
      onDoubleClick={() => onPreview(file)}
      className={`card shareable-card ui-glass-surface ui-glass-surface-subtle ${isSelected ? 'selected' : ''}`}
    >
      {onShare && (
        <button
          type="button"
          className="card-share-btn"
          aria-label={shareLabel}
          title={shareLabel}
          onClick={event => {
            event.stopPropagation()
            onShare(file)
          }}
        >
          <Share2 size={14} />
        </button>
      )}
      <div
        className={`card-icon ${file.starred ? 'starred' : isCollection ? 'folder' : 'file'}`}
      >
        {fileIcon}
      </div>
      <p className="card-name" translate="no">
        {parseAppFileName(file.fileName).name}
      </p>
      {isCollection && (
        <p className="card-meta">
          <span>{`${downloadedCount}/${fileCount}`}</span>
          <span>{formatBytes(Number(file.size) || 0)}</span>
        </p>
      )}
    </div>
  )
}

export function FolderCard({
  folder,
  onClick,
  onShare,
  shareLabel = 'Share',
}: FolderCardProps) {
  return (
    <div
      onClick={onClick}
      className="card shareable-card ui-glass-surface ui-glass-surface-subtle"
    >
      {onShare && (
        <button
          type="button"
          className="card-share-btn"
          aria-label={shareLabel}
          title={shareLabel}
          onClick={event => {
            event.stopPropagation()
            onShare()
          }}
        >
          <Share2 size={14} />
        </button>
      )}
      <div className="card-icon folder">
        <Folder size={28} color="#fff" />
      </div>
      <p className="card-name" translate="no">
        {folder.name}
      </p>
    </div>
  )
}
