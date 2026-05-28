'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { KeyRound, Check, AlertCircle, Sun, Moon, ArrowLeft } from 'lucide-react'
import AppShell from '~/components/AppShell'
import { useAppStore } from '~/app/app/useAppStore'

function ChatJoinPage() {
  const searchParams = useSearchParams()
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)

  const [decrypted, setDecrypted] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = searchParams.get('token')
    const pub = searchParams.get('pub')

    if (!token) {
      setError('缺少 token 参数')
      setLoading(false)
      return
    }

    if (!pub) {
      setError('缺少 pub 参数')
      setLoading(false)
      return
    }

    async function decrypt() {
      try {
        const response = await fetch(
          'https://api.most.box/api/chat.join.decrypt',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, pub }),
          }
        )

        const data = await response.json()

        if (!response.ok) {
          setError(data.error || '解密失败')
        } else {
          setDecrypted(JSON.stringify(data, null, 2))
          console.log('[ChatJoin] Decrypted:', data)
        }
      } catch (err) {
        setError(
          `请求出错: ${err instanceof Error ? err.message : String(err)}`
        )
      }

      setLoading(false)
    }

    decrypt()
  }, [searchParams])

  return (
    <AppShell
      sidebar={() => (
        <div
          className="sidebar-header sidebar-header-link"
          onClick={() => (window.location.href = '/chat')}
        >
          <ArrowLeft size={18} />
          <h1>MOST PEOPLE</h1>
        </div>
      )}
      headerTitle={<h2 className="header-title">加入频道</h2>}
      headerRight={
        <button
          className="btn btn-icon"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="切换主题"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      }
    >
      <div className="chat-join-container">
        {loading ? (
          <div className="chat-join-loading">
            <KeyRound size={32} />
            <p>正在解密...</p>
          </div>
        ) : error ? (
          <div className="chat-join-error">
            <AlertCircle size={32} />
            <p>{error}</p>
          </div>
        ) : (
          <div className="chat-join-success">
            <Check size={32} />
            <p>解密成功</p>
            <pre className="chat-join-result">{decrypted}</pre>
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default ChatJoinPage
