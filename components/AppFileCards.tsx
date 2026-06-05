'use client'

import { FileText, Film, Folder, Image as ImageIcon, Music } from 'lucide-react'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'

export interface AppFileItem {
  cid: string
  fileName: string
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
}

interface FolderCardProps {
  folder: AppFolderItem
  onClick: () => void
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
}: FileCardProps) {
  const subtype = getFileSubtype(file.fileName)
  let fileIcon = <FileText size={24} color="#fff" />

  if (subtype === 'image') {
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
      className={`card ${isSelected ? 'selected' : ''}`}
    >
      <div className={`card-icon ${file.starred ? 'starred' : 'file'}`}>
        {fileIcon}
      </div>
      <p className="card-name">{parseAppFileName(file.fileName).name}</p>
    </div>
  )
}

export function FolderCard({ folder, onClick }: FolderCardProps) {
  return (
    <div onClick={onClick} className="card">
      <div className="card-icon folder">
        <Folder size={28} color="#fff" />
      </div>
      <p className="card-name">{folder.name}</p>
    </div>
  )
}
