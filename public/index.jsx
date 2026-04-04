import { createRoot } from 'react-dom/client'
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './app.jsx'
import { ErrorBoundary } from './error-boundary.jsx'
import './app.css'

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', { message, source, lineno, colno, error })
}

window.onunhandledrejection = (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
}

const ChatPage = React.lazy(() => import('./chat-page.jsx'))

const root = createRoot(document.getElementById('root'))
root.render(
  <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/chat" element={
          <React.Suspense fallback={<div className="chat-loading">加载中...</div>}>
            <ChatPage />
          </React.Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
)
