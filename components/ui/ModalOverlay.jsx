'use client'

import React from 'react'

export function ModalOverlay({ children, onClose, closeOnOverlayClick = false }) {
  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose?.()
    }
  }
  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      {children}
    </div>
  )
}
