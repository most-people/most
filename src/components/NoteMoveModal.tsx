import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, X } from 'lucide-react'
import type { NoteItem } from '~/stores/useAppStore'
import { ModalOverlay } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import {
  getNoteFullPath,
  normalizeNotePath,
} from '~server/src/utils/noteUtils.js'

export type NoteMoveTarget =
  | NoteItem
  | {
      name: string
      cid: string
      path: string
      type: 'directory'
      size: number
      created_at: number
      updated_at: number
    }

export type NoteDirectoryOption = {
  path: string
  name: string
  parentPath: string
  depth: number
}

function getNoteMoveTargetFullPath(target: NoteMoveTarget) {
  if (target.type === 'directory') {
    return normalizeNotePath(
      target.path ? `${target.path}/${target.name}` : target.name
    )
  }
  return getNoteFullPath(target)
}

export function NoteMoveModal({
  target,
  targetLabel,
  directories,
  onMove,
  onClose,
}: {
  target: NoteMoveTarget
  targetLabel?: string
  directories: NoteDirectoryOption[]
  onMove: (targetPath: string) => void | Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const currentPath = normalizeNotePath(target.path || '')
  const targetFullPath = getNoteMoveTargetFullPath(target)
  const usableDirectories = directories.filter(directory => {
    if (target.type !== 'directory') return true
    return (
      directory.path !== targetFullPath &&
      !directory.path.startsWith(`${targetFullPath}/`)
    )
  })
  const [selectedPath, setSelectedPath] = useState(currentPath)
  const [customPath, setCustomPath] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const normalizedCustomPath = normalizeNotePath(customPath)
  const finalPath = customPath.trim() ? normalizedCustomPath : selectedPath
  const isSamePath = normalizeNotePath(finalPath) === currentPath
  const rootLabel = t('note.move.rootDirectory')
  const childPathsByParent = new Map<string, NoteDirectoryOption[]>()

  for (const directory of usableDirectories) {
    const siblings = childPathsByParent.get(directory.parentPath) || []
    siblings.push(directory)
    childPathsByParent.set(directory.parentPath, siblings)
  }

  const visibleDirectories = usableDirectories.filter(directory => {
    if (!directory.parentPath) return true
    const ancestors = directory.parentPath.split('/').filter(Boolean)
    return ancestors.every((_, index) =>
      expandedPaths.has(ancestors.slice(0, index + 1).join('/'))
    )
  })

  const selectedBreadcrumbs = [
    { label: rootLabel, path: '' },
    ...selectedPath
      .split('/')
      .filter(Boolean)
      .map((part, index, parts) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
  ]

  function selectPath(path: string) {
    setSelectedPath(normalizeNotePath(path))
    setCustomPath('')
  }

  function selectDirectory(path: string) {
    selectPath(path)
    if (!childPathsByParent.has(path)) return

    setExpandedPaths(previous => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function handleConfirm() {
    if (!isSamePath) {
      onMove(finalPath)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="note-move-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{t('note.move.title')}</h3>
          <button className="btn btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="note-move-target">
          <span>{t('note.move.moving')}</span>
          <strong translate="no">{targetLabel || target.name}</strong>
        </div>
        <div className="note-move-path">
          {selectedBreadcrumbs.map((part, index) => (
            <React.Fragment key={part.path || 'root'}>
              {index > 0 && <span>/</span>}
              <button type="button" onClick={() => selectPath(part.path)}>
                <span translate={part.path ? 'no' : 'yes'}>{part.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="note-move-folder-list">
          <button
            type="button"
            className={`note-move-folder-item ${selectedPath === '' ? 'selected' : ''}`}
            onClick={() => selectPath('')}
          >
            <span className="note-move-folder-spacer" />
            <Folder className="note-move-folder-icon" size={16} />
            <span>{rootLabel}</span>
          </button>
          {usableDirectories.length === 0 ? (
            <p className="note-move-empty">{t('note.move.noFolders')}</p>
          ) : (
            visibleDirectories.map(directory => {
              const hasChildren = childPathsByParent.has(directory.path)
              const isExpanded = expandedPaths.has(directory.path)

              return (
                <button
                  type="button"
                  key={directory.path}
                  className={`note-move-folder-item note-move-depth-${Math.min(directory.depth, 4)} ${
                    selectedPath === directory.path ? 'selected' : ''
                  }`}
                  onClick={() => selectDirectory(directory.path)}
                >
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown className="note-move-expander" size={14} />
                    ) : (
                      <ChevronRight className="note-move-expander" size={14} />
                    )
                  ) : (
                    <span className="note-move-folder-spacer" />
                  )}
                  <Folder className="note-move-folder-icon" size={16} />
                  <span translate="no">{directory.name}</span>
                  {directory.parentPath && (
                    <small translate="no">{directory.parentPath}</small>
                  )}
                </button>
              )
            })
          )}
        </div>
        <input
          className="input input-compact"
          value={customPath}
          onChange={event => setCustomPath(event.target.value)}
          placeholder={t('note.move.pathPlaceholder')}
          translate="no"
        />
        <div className="note-move-destination">
          <span>{t('note.move.destinationLabel')}</span>
          <span translate={finalPath ? 'no' : 'yes'}>
            {finalPath || rootLabel}
          </span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={isSamePath}
          >
            {t('note.action.move')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
