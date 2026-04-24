'use client'

import React, { useState, useCallback } from 'react'
import {
  ArrowLeft,
  Loader,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import { setBackendUrl, checkBackendConnection } from '../server/src/utils/api'

interface BackendGuidePanelProps {
  featureName: string
  onBack?: () => void
}

export default function BackendGuidePanel({
  featureName,
  onBack,
}: BackendGuidePanelProps) {
  const [inputUrl, setInputUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')

  const handleConnect = useCallback(async () => {
    const url = inputUrl.trim()
    if (!url) return
    setChecking(true)
    setStatus('idle')
    setBackendUrl(url)
    const ok = await checkBackendConnection()
    setChecking(false)
    if (ok) {
      setStatus('success')
      setStatusMsg('连接成功！页面即将刷新...')
      setTimeout(() => window.location.reload(), 800)
    } else {
      setStatus('error')
      setStatusMsg('无法连接到该地址，请检查后重试')
    }
  }, [inputUrl])

  return (
    <div className="backend-guide">
      <div className="backend-guide-card">
        <div className="backend-guide-header">
          {status === 'idle' && (
            <AlertCircle size={32} color="var(--warning)" />
          )}
          {status === 'success' && (
            <CheckCircle size={32} color="var(--success)" />
          )}
          {status === 'error' && <XCircle size={32} color="var(--danger)" />}
          <h2>需要后端服务</h2>
        </div>
        <p className="backend-guide-desc">
          <strong>{featureName}</strong> 需要运行 MostBox 后端服务才能使用。
        </p>

        <div className="backend-guide-input-wrap">
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="http://localhost:1976"
            className="backend-guide-input"
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
          />
          <button
            onClick={handleConnect}
            disabled={checking || !inputUrl.trim()}
            className="backend-guide-connect-btn"
          >
            {checking ? <Loader size={16} className="spin" /> : '连接'}
          </button>
        </div>

        {status !== 'idle' && (
          <p className={`backend-guide-status ${status}`}>{statusMsg}</p>
        )}

        <div className="backend-guide-divider" />

        <div className="backend-guide-steps">
          <h3>快速启动后端</h3>
          <div className="backend-guide-step">
            <span className="step-num">1</span>
            <div>
              <strong>安装 Node.js</strong>
              <p>需要 Node.js 18 或更高版本</p>
            </div>
          </div>
          <div className="backend-guide-step">
            <span className="step-num">2</span>
            <div>
              <strong>运行 MostBox</strong>
              <code className="backend-guide-code">npx most-box@latest</code>
            </div>
          </div>
          <div className="backend-guide-step">
            <span className="step-num">3</span>
            <div>
              <strong>输入后端地址</strong>
              <p>服务默认运行在 http://localhost:1976</p>
            </div>
          </div>
        </div>

        {onBack && (
          <button onClick={onBack} className="backend-guide-back-btn">
            <ArrowLeft size={14} />
            返回首页
          </button>
        )}
      </div>
    </div>
  )
}
