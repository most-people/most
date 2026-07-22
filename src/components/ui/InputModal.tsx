import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { ModalOverlay } from '~/components/ui/ModalOverlay'
import { useI18n } from '~/lib/i18n'

interface InputModalProps {
  title: string
  hint?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  onConfirm: (value: string) => void | Promise<void>
  onClose: () => void
  isLoading?: boolean
  loadingText?: string
  validate?: (value: string) => string
  allowEmpty?: boolean
  onGenerateValue?: () => string
  generateValueLabel?: string
}

export function InputModal({
  title,
  hint,
  placeholder,
  defaultValue,
  confirmText,
  onConfirm,
  onClose,
  isLoading,
  loadingText,
  validate,
  allowEmpty = false,
  onGenerateValue,
  generateValueLabel,
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

  function handleGenerateValue() {
    const generatedValue = onGenerateValue?.()
    if (generatedValue) setValue(generatedValue)
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
        <div className="input-modal-input-row">
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
            aria-describedby={
              validationError
                ? 'input-modal-error'
                : hint
                  ? 'input-modal-hint'
                  : undefined
            }
          />
          {onGenerateValue && (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={handleGenerateValue}
              disabled={isLoading}
              aria-label={generateValueLabel}
              title={generateValueLabel}
            >
              <RefreshCw size={17} />
            </button>
          )}
        </div>
        {hint && !validationError && (
          <p className="input-modal-hint" id="input-modal-hint">
            {hint}
          </p>
        )}
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
