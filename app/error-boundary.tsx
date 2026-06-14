import React from 'react'
import {
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  translateMessage,
  type MessageKey,
} from '~/lib/i18n'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

function readErrorBoundaryLocale() {
  if (typeof window === 'undefined') return undefined
  try {
    return normalizeLocale(
      window.localStorage.getItem(LOCALE_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY)
    )
  } catch {
    return undefined
  }
}

function t(key: MessageKey) {
  return translateMessage(key, readErrorBoundaryLocale())
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-page">
          <h1 className="error-boundary-title">{t('errorBoundary.title')}</h1>
          <p className="error-boundary-desc">
            {t('errorBoundary.desc')}
          </p>
          <button onClick={this.handleReload} className="error-boundary-btn">
            {t('errorBoundary.reload')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
