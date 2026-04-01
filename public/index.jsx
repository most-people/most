import { createRoot } from 'react-dom/client'
import React from 'react'
import App from './app.jsx'
import { ErrorBoundary } from './error-boundary.jsx'
import './app.css'

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', { message, source, lineno, colno, error })
}

window.onunhandledrejection = (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
}

const root = createRoot(document.getElementById('root'))
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)