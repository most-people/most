import React, { useEffect } from 'react'
import { useHotkeys } from '~/hooks'

interface ModalOverlayProps {
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

export function ModalOverlay({
  children,
  onClose,
  className = '',
}: ModalOverlayProps) {
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

  return (
    <div className={['modal-overlay', className].filter(Boolean).join(' ')}>
      <div className="modal-overlay-backdrop" />
      <div className="modal-glass">{children}</div>
    </div>
  )
}
