import { Folder, FolderOpen, X } from 'lucide-react'
import { ModalOverlay } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

interface NoteVaultLocationModalProps {
  working: boolean
  onUseDefault: () => void | Promise<void>
  onSelectFolder: () => void | Promise<void>
  onClose: () => void
}

export function NoteVaultLocationModal({
  working,
  onUseDefault,
  onSelectFolder,
  onClose,
}: NoteVaultLocationModalProps) {
  const { t } = useI18n()

  return (
    <ModalOverlay onClose={working ? undefined : onClose}>
      <div className="confirm-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('profile.backup.noteVault.title')}</h3>
          <button
            type="button"
            className="btn btn-icon"
            disabled={working}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <p>{t('profile.backup.noteVault.message')}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={working}
            onClick={onSelectFolder}
          >
            <FolderOpen size={16} />
            {t('profile.backup.noteVault.selectFolder')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={working}
            onClick={onUseDefault}
          >
            <Folder size={16} />
            {t('profile.backup.noteVault.useDefault')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
