'use client'

import React from 'react'
import { useHotkeys } from '~/hooks'

export function ModalOverlay({
  children,
  onClose,
  closeOnOverlayClick = false,
}) {
  useHotkeys(onClose ? [['Escape', onClose]] : [])

  const handleOverlayClick = e => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose?.()
    }
  }
  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-overlay-backdrop" />
      <div className="modal-glass">{children}</div>
    </div>
  )
}
