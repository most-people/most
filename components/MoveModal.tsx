import React, { useState } from 'react'
import { Folder, X } from 'lucide-react'
import { ModalOverlay } from '~/components/ui'

interface MoveItem {
  cid: string
  [key: string]: unknown
}

interface MoveFolder {
  name: string
  path: string
}

interface MoveModalProps {
  items: MoveItem[]
  allFolders: MoveFolder[]
  currentPath: string
  onMove: (targetPath: string) => void
  onClose: () => void
}

function generateBreadcrumbs(currentPath: string) {
  if (!currentPath) return []
  return [
    { path: '', name: '全部内容' },
    ...currentPath
      .split('/')
      .filter(Boolean)
      .map((part, i, arr) => ({
        path: arr.slice(0, i + 1).join('/'),
        name: part,
      })),
  ]
}

export function MoveModal({
  items,
  allFolders,
  currentPath,
  onMove,
  onClose,
}: MoveModalProps) {
  const [targetPath, setTargetPath] = useState('')
  const [customPath, setCustomPath] = useState(currentPath)

  const breadcrumbParts = generateBreadcrumbs(targetPath)

  function handleConfirm() {
    const finalPath = targetPath || customPath.trim()
    onMove(finalPath)
  }

  const visibleFolders = allFolders.filter(folder => {
    if (targetPath === '') {
      return !folder.path.includes('/')
    }
    const prefix = targetPath + '/'
    if (!folder.path.startsWith(prefix)) return false
    const relativePath = folder.path.substring(prefix.length)
    return !relativePath.includes('/')
  })

  return (
    <ModalOverlay onClose={onClose}>
      <div className="move-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>移动到</h3>
          <button type="button" onClick={onClose} className="btn btn-icon">
            <X size={18} />
          </button>
        </div>
        <p className="move-modal-desc">已选 {items.length} 个项目</p>
        <div className="move-new-folder">
          <input
            type="text"
            className="input"
            value={customPath}
            onChange={e => setCustomPath(e.target.value)}
            placeholder="输入路径创建嵌套文件夹"
          />
        </div>
        <p className="move-modal-hint">如 图片/壁纸</p>
        <div className="move-breadcrumb">
          {breadcrumbParts.map((part, i) => (
            <React.Fragment key={part.path}>
              {i > 0 && <span className="breadcrumb-separator">/</span>}
              <button
                type="button"
                onClick={() => {
                  setTargetPath(part.path)
                  setCustomPath(part.path)
                }}
                className={`move-breadcrumb-btn ${
                  targetPath === part.path && !customPath ? 'active' : ''
                }`}
              >
                {part.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="move-folder-list">
          {visibleFolders.length === 0 && (
            <p className="move-modal-empty">该目录下没有子文件夹</p>
          )}
          {visibleFolders.map(folder => (
            <button
              type="button"
              key={folder.path}
              onClick={() => setTargetPath(folder.path)}
              className={`move-folder-item ${
                targetPath === folder.path && !customPath ? 'selected' : ''
              }`}
            >
              <Folder size={16} />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn-primary"
          >
            移动
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
