import React, { useState } from 'react'
import { X } from 'lucide-react'
import { ModalOverlay } from '~/components/ui/ModalOverlay'
import { useI18n } from '~/lib/i18n'

interface InputModalProps {
  title: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  onConfirm: (value: string) => void | Promise<void>
  onClose: () => void
  isLoading?: boolean
  loadingText?: string
  validate?: (value: string) => string
  allowEmpty?: boolean
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
  validate,
  allowEmpty = false,
}: InputModalProps) {
  const { t } = useI18n()
  const [value, setValue] = useState(defaultValue || '')
  const trimmedValue = value.trim()
  const validationError = trimmedValue && validate ? validate(trimmedValue) : ''
  const canConfirm =
    (allowEmpty || Boolean(trimmedValue)) && !validationError && !isLoading

  function handleConfirm() {
    if (!canConfirm) return
    onConfirm(trimmedValue)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="input-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="btn btn-icon">
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
            if (e.key === 'Enter') handleConfirm()
          }}
          className="input input-compact"
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? 'input-modal-error' : undefined}
        />
        {validationError && (
          <p className="input-modal-error" id="input-modal-error">
            {validationError}
          </p>
        )}
        <div className="modal-actions">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`btn btn-primary ${isLoading ? 'btn-loading' : ''}`}
          >
            {isLoading ? loadingText || t('common.processing') : confirmText}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
