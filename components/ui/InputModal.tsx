'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { ModalOverlay } from './ModalOverlay'

interface InputModalProps {
  title: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  onConfirm: (value: string) => void | Promise<void>
  onClose: () => void
  isLoading?: boolean
  loadingText?: string
}

export function InputModal({
  title,
  placeholder,
  defaultValue,
  confirmText,
  onConfirm,
  onClose,
  isLoading,
  loadingText,
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue || '')
  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="input-modal modal-glass"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close-btn">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && value.trim() && !isLoading)
              onConfirm(value.trim())
          }}
          className="modal-input modal-input-glass"
        />
        <div className="modal-actions">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn secondary"
          >
            取消
          </button>
          <button
            onClick={() => value.trim() && onConfirm(value.trim())}
            disabled={!value.trim() || isLoading}
            className="btn primary"
            style={{ opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? loadingText || '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
