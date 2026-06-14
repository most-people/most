import React from 'react'
import { X } from 'lucide-react'
import { ModalOverlay } from '~/components/ui/ModalOverlay'
import { useI18n } from '~/lib/i18n'

interface ConfirmModalProps {
  title: string
  message?: string
  confirmText?: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
  danger?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmText,
  onConfirm,
  onClose,
  danger,
}: ConfirmModalProps) {
  const { t } = useI18n()

  return (
    <ModalOverlay onClose={onClose}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="btn btn-icon">
            <X size={18} />
          </button>
        </div>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
