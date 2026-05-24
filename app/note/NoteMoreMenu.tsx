'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  Moon,
  MoreHorizontal,
  Sun,
  Upload,
} from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import type { NoteBackupSyncState } from '~/app/note/useNoteBackupSync'

interface NoteMoreMenuProps {
  sync: NoteBackupSyncState
}

export function NoteMoreMenu({ sync }: NoteMoreMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const wallet = useUserStore(s => s.wallet)
  const busy = sync.action !== null

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  function handleThemeToggle() {
    setOpen(false)
    setIsDarkMode(!isDarkMode)
  }

  async function runMenuAction(action: () => Promise<unknown> | unknown) {
    setOpen(false)
    await action()
  }

  return (
    <div className="note-more" ref={menuRef}>
      <button
        className="btn btn-icon note-more-trigger"
        onClick={() => setOpen(value => !value)}
        title="更多"
        aria-label="更多"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="note-more-menu">
          <div className={`note-sync-status ${sync.hasConflict ? 'conflict' : ''}`}>
            <span className="note-sync-status-icon">
              {sync.hasConflict ? (
                <AlertTriangle size={16} />
              ) : sync.status === 'synced' ? (
                <CheckCircle2 size={16} />
              ) : (
                <Cloud size={16} />
              )}
            </span>
            <span>
              <strong>云同步</strong>
              <small>{sync.statusLabel}</small>
            </span>
          </div>

          <button
            className="note-more-item"
            onClick={() => runMenuAction(sync.exportLocalBackup)}
            disabled={!wallet || busy}
          >
            <Upload size={16} />
            本地导出
          </button>
          <button
            className="note-more-item"
            onClick={() => runMenuAction(sync.importLocalBackup)}
            disabled={!wallet || busy}
          >
            <Download size={16} />
            本地导入
          </button>

          <div className="note-more-separator" />

          <button className="note-more-item" onClick={handleThemeToggle}>
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            {isDarkMode ? '浅色模式' : '深色模式'}
          </button>
        </div>
      )}
    </div>
  )
}
