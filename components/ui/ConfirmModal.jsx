'use client'

import React from 'react'
import { X } from 'lucide-react'
import { ModalOverlay } from './ModalOverlay'

export function ConfirmModal({ title, message, confirmText, onConfirm, onClose, danger, closeOnOverlayClick }) {
  return (
    <ModalOverlay onClose={onClose} closeOnOverlayClick={closeOnOverlayClick}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onClose} className="btn secondary">取消</button>
          <button onClick={onConfirm} className={`btn ${danger ? 'danger' : 'primary'}`}>{confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
  )
}
