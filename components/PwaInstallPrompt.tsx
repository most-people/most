'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { X, Download } from 'lucide-react'

declare global {
  interface Window {
    mostInstallPromptEvent: any
  }
}

const POPUP_COUNT_KEY = 'most-pwa-popup-count'
const INSTALLED_KEY = 'most-pwa-installed'
const TIMER_STARTED_KEY = 'most-pwa-timer-started'
const SHOWN_SESSION_KEY = 'most-pwa-shown-session'
const MAX_POPUP_COUNT = 2
const DELAY = 30000

export function PwaInstallPrompt() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 离开首页时隐藏弹窗
    if (pathname !== '/') {
      setVisible(false)
      return
    }

    // 基础检查
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) return

    if (localStorage.getItem(INSTALLED_KEY) === '1') return

    const popupCount = parseInt(localStorage.getItem(POPUP_COUNT_KEY) || '0', 10)
    if (popupCount >= MAX_POPUP_COUNT) return

    if (dismissedRef.current) return

    const alreadyShownThisSession =
      sessionStorage.getItem(SHOWN_SESSION_KEY) === '1'
    const timerStarted = sessionStorage.getItem(TIMER_STARTED_KEY)

    const showPrompt = () => {
      if (
        window.mostInstallPromptEvent &&
        pathname === '/' &&
        !dismissedRef.current
      ) {
        setVisible(true)
        if (!alreadyShownThisSession) {
          localStorage.setItem(
            POPUP_COUNT_KEY,
            String(
              parseInt(localStorage.getItem(POPUP_COUNT_KEY) || '0', 10) + 1
            )
          )
          sessionStorage.setItem(SHOWN_SESSION_KEY, '1')
        }
      }
    }

    let timeoutId: ReturnType<typeof setTimeout>

    if (alreadyShownThisSession) {
      // 本会话已显示过，回到首页直接恢复（除非用户关闭过）
      showPrompt()
    } else if (timerStarted) {
      const elapsed = Date.now() - parseInt(timerStarted, 10)
      if (elapsed >= DELAY) {
        showPrompt()
      } else {
        timeoutId = setTimeout(showPrompt, DELAY - elapsed)
      }
    } else {
      sessionStorage.setItem(TIMER_STARTED_KEY, String(Date.now()))
      timeoutId = setTimeout(showPrompt, DELAY)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      window.mostInstallPromptEvent = event

      const ts = sessionStorage.getItem(TIMER_STARTED_KEY)
      if (!ts) return
      if (Date.now() - parseInt(ts, 10) < DELAY) return
      if (dismissedRef.current) return
      showPrompt()
    }

    const handleAppInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1')
      setVisible(false)
      window.mostInstallPromptEvent = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      )
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [pathname])

  const handleDismiss = useCallback(() => {
    dismissedRef.current = true
    setVisible(false)
  }, [])

  const handleInstall = useCallback(async () => {
    const event = window.mostInstallPromptEvent
    if (!event) return

    event.prompt()
    const result = await event.userChoice
    if (result?.outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1')
      setVisible(false)
    }
    window.mostInstallPromptEvent = null
  }, [])

  if (!visible) return null

  return (
    <div className="pwa-install-card">
      <div className="pwa-install-header">
        <div className="pwa-install-brand">
          <img
            src="/pwa-512x512.png"
            alt="MostBox"
            className="pwa-install-icon"
          />
          <div className="pwa-install-info">
            <h3>MostBox</h3>
            <span>
              {typeof window !== 'undefined' ? window.location.host : ''}
            </span>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="pwa-install-close"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>

      <div className="pwa-install-divider" />

      <p className="pwa-install-desc">
        此网站具备 App 功能特性。在您的设备上安装，以享受更丰富的体验并便于访问。
      </p>

      <button onClick={handleInstall} className="pwa-install-btn">
        <Download size={14} />
        安装
      </button>
    </div>
  )
}
