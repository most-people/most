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

export function InputModal({ title, placeholder, defaultValue, confirmText, onConfirm, onClose, isLoading, loadingText }: InputModalProps) {
  const [value, setValue] = useState(defaultValue || '')
  return (
    <ModalOverlay onClose={onClose}>
      <div className="input-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !isLoading) onConfirm(value.trim()) }}
          className="modal-input"
        />
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading} className="btn secondary">取消</button>
          <button onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim() || isLoading} className="btn primary" style={{ opacity: isLoading ? 0.7 : 1 }}>{isLoading ? (loadingText || '处理中...') : confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
  )
}
