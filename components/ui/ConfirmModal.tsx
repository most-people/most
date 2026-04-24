'use client'

import React from 'react'
import { X } from 'lucide-react'
import { ModalOverlay } from '~/components/ui/ModalOverlay'

interface ConfirmModalProps {
  title: string
  message?: string
  confirmText?: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
  danger?: boolean
  closeOnOverlayClick?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmText,
  onConfirm,
  onClose,
  danger,
  closeOnOverlayClick,
}: ConfirmModalProps) {
  return (
    <ModalOverlay onClose={onClose} closeOnOverlayClick={closeOnOverlayClick}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close-btn">
            <X size={18} />
          </button>
        </div>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onClose} className="btn secondary">
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`btn ${danger ? 'danger' : 'primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
