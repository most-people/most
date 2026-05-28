'use client'

import React, { useEffect } from 'react'
import { useHotkeys } from '~/hooks'

export function ModalOverlay({
  children,
  onClose,
  closeOnOverlayClick = false,
}) {
  useHotkeys(onClose ? [['Escape', onClose]] : [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const updateModalViewport = () => {
      document.documentElement.style.setProperty(
        '--modal-visual-height',
        `${viewport.height}px`
      )
      document.documentElement.style.setProperty(
        '--modal-visual-top',
        `${viewport.offsetTop}px`
      )
    }

    updateModalViewport()
    viewport.addEventListener('resize', updateModalViewport)
    viewport.addEventListener('scroll', updateModalViewport)

    return () => {
      viewport.removeEventListener('resize', updateModalViewport)
      viewport.removeEventListener('scroll', updateModalViewport)
      document.documentElement.style.removeProperty('--modal-visual-height')
      document.documentElement.style.removeProperty('--modal-visual-top')
    }
  }, [])

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
