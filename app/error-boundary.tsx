'use client'

import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 32,
          background: '#f8fafc', fontFamily: 'system-ui'
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>
            出错了
          </h1>
          <p style={{ color: '#64748b', marginBottom: 24, textAlign: 'center', maxWidth: 400 }}>
            发生了意外错误，请尝试重新加载页面
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: '#3b82f6', color: '#fff', fontSize: 14,
              cursor: 'pointer'
            }}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
