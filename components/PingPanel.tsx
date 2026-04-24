'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import {
  MessageCircle,
  ShoppingCart,
  Search,
  Cloud,
  Play,
  Terminal,
  Bot,
  AtSign,
  Users,
  Camera,
  MessageSquare,
  BookOpen,
  Film,
  Smartphone,
  Monitor,
  Send,
  MessagesSquare,
  Music,
  Briefcase,
  HelpCircle,
  Package,
  Triangle,
  Code2,
  RotateCw,
  Wifi,
} from 'lucide-react'

interface PingTarget {
  name: string
  host: string
  icon: string
  fallback: React.ReactNode
}

interface PingResult {
  status: 'pending' | 'ok' | 'timeout'
  latency: number
}

const TARGETS: PingTarget[] = [
  {
    name: 'Google',
    host: 'google.com',
    icon: 'simple-icons:google',
    fallback: <Search size={20} />,
  },
  {
    name: 'Cloudflare',
    host: 'cloudflare.com',
    icon: 'simple-icons:cloudflare',
    fallback: <Cloud size={20} />,
  },
  {
    name: 'YouTube',
    host: 'youtube.com',
    icon: 'simple-icons:youtube',
    fallback: <Play size={20} />,
  },
  {
    name: 'GitHub',
    host: 'github.com',
    icon: 'simple-icons:github',
    fallback: <Terminal size={20} />,
  },
  {
    name: 'ChatGPT',
    host: 'chatgpt.com',
    icon: 'simple-icons:openai',
    fallback: <Bot size={20} />,
  },
  {
    name: 'X',
    host: 'x.com',
    icon: 'simple-icons:x',
    fallback: <AtSign size={20} />,
  },
  {
    name: 'Instagram',
    host: 'instagram.com',
    icon: 'simple-icons:instagram',
    fallback: <Camera size={20} />,
  },
  {
    name: 'Reddit',
    host: 'reddit.com',
    icon: 'simple-icons:reddit',
    fallback: <MessageSquare size={20} />,
  },
  {
    name: 'Wikipedia',
    host: 'wikipedia.org',
    icon: 'simple-icons:wikipedia',
    fallback: <BookOpen size={20} />,
  },
  {
    name: 'Apple',
    host: 'apple.com',
    icon: 'simple-icons:apple',
    fallback: <Smartphone size={20} />,
  },

  {
    name: 'Telegram',
    host: 'telegram.org',
    icon: 'simple-icons:telegram',
    fallback: <Send size={20} />,
  },
  {
    name: 'Discord',
    host: 'discord.com',
    icon: 'simple-icons:discord',
    fallback: <MessagesSquare size={20} />,
  },
  {
    name: 'TikTok',
    host: 'tiktok.com',
    icon: 'simple-icons:tiktok',
    fallback: <Music size={20} />,
  },
  {
    name: 'npm',
    host: 'npmjs.com',
    icon: 'simple-icons:npm',
    fallback: <Package size={20} />,
  },
  {
    name: 'Vercel',
    host: 'vercel.com',
    icon: 'simple-icons:vercel',
    fallback: <Triangle size={20} />,
  },
]

const TIMEOUT = 5000

function BrandIcon({
  icon,
  fallback,
}: {
  icon: string
  fallback: React.ReactNode
}) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => setLoaded(true)
    img.onerror = () => setLoaded(false)
    img.src = `https://api.iconify.design/${icon.replace(':', '/')}.svg`
  }, [icon])

  return (
    <span className="brand-icon-wrap">
      <span className={`brand-icon-fallback ${loaded ? 'hidden' : ''}`}>
        {fallback}
      </span>
      <span className={`brand-icon-real ${loaded ? 'visible' : ''}`}>
        <Icon icon={icon} width={20} height={20} />
      </span>
    </span>
  )
}

export function PingPanel() {
  const [results, setResults] = useState<Map<string, PingResult>>(new Map())
  const [runningAll, setRunningAll] = useState(false)
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  const runSingleTest = useCallback((host: string) => {
    setResults(prev => {
      const m = new Map(prev)
      m.set(host, { status: 'pending', latency: 0 })
      return m
    })

    const controller = new AbortController()
    abortRefs.current.set(host, controller)

    const start = performance.now()

    const finish = (status: PingResult['status'], latency: number) => {
      setResults(prev => {
        const m = new Map(prev)
        m.set(host, { status, latency })
        return m
      })
    }

    const timer = setTimeout(() => {
      controller.abort()
    }, TIMEOUT)

    fetch(`https://${host}/`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(() => {
        clearTimeout(timer)
        finish('ok', Math.round(performance.now() - start))
      })
      .catch(() => {
        clearTimeout(timer)
        finish('timeout', 0)
      })
  }, [])

  const runAllTests = useCallback(() => {
    setRunningAll(true)
    const next = new Map<string, PingResult>()
    TARGETS.forEach(t => {
      next.set(t.host, { status: 'pending', latency: 0 })
    })
    setResults(next)

    const pending = new Set(TARGETS.map(t => t.host))

    TARGETS.forEach(target => {
      const controller = new AbortController()
      abortRefs.current.set(target.host, controller)

      const start = performance.now()

      const finish = (status: PingResult['status'], latency: number) => {
        if (!pending.has(target.host)) return
        pending.delete(target.host)
        setResults(prev => {
          const m = new Map(prev)
          m.set(target.host, { status, latency })
          return m
        })
        if (pending.size === 0) {
          setRunningAll(false)
        }
      }

      const timer = setTimeout(() => {
        controller.abort()
      }, TIMEOUT)

      fetch(`https://${target.host}/`, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(() => {
          clearTimeout(timer)
          finish('ok', Math.round(performance.now() - start))
        })
        .catch(() => {
          clearTimeout(timer)
          finish('timeout', 0)
        })
    })
  }, [])

  useEffect(() => {
    runAllTests()
    return () => {
      abortRefs.current.forEach(c => c.abort())
      abortRefs.current.clear()
    }
  }, [runAllTests])

  return (
    <div className="ping-page">
      <div className="ping-header">
        <div className="ping-title-wrap">
          <Wifi size={28} className="ping-title-icon" />
          <div>
            <h1 className="ping-title">网络连通性</h1>
            <p className="ping-subtitle">
              通过向对应网站发送请求进行测试，延迟值仅供参考。
            </p>
          </div>
        </div>
        <button
          className="ping-refresh-btn"
          onClick={runAllTests}
          disabled={runningAll}
          aria-label="重新测试全部"
          title="重新测试全部"
        >
          <RotateCw size={18} className={runningAll ? 'ping-spin' : ''} />
        </button>
      </div>

      <div className="ping-grid">
        {TARGETS.map(target => {
          const result = results.get(target.host)
          const isPending = !result || result.status === 'pending'
          const isTimeout = result?.status === 'timeout'

          return (
            <div
              key={target.host}
              className={`ping-card ${isPending ? 'pending' : ''}`}
            >
              <div className="ping-card-top">
                <span className="ping-card-icon">
                  <BrandIcon icon={target.icon} fallback={target.fallback} />
                </span>
                <a
                  href={`https://${target.host}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ping-card-name"
                >
                  {target.name}
                </a>
                <button
                  className="ping-card-refresh"
                  onClick={() => runSingleTest(target.host)}
                  disabled={isPending}
                  aria-label={`重新测试 ${target.name}`}
                  title="重新测试"
                >
                  <RotateCw
                    size={13}
                    className={isPending ? 'ping-spin' : ''}
                  />
                </button>
              </div>

              <div className="ping-card-bottom">
                {isPending ? (
                  <span className="ping-pulse-dot" />
                ) : (
                  <span
                    className="ping-status-label"
                    style={{
                      color: isTimeout ? 'var(--danger)' : 'var(--success)',
                    }}
                  >
                    {isTimeout ? '不可用' : '可用'}
                  </span>
                )}

                <span
                  className="ping-latency"
                  style={
                    isPending
                      ? { color: 'var(--text-muted)' }
                      : {
                          color: isTimeout ? 'var(--danger)' : 'var(--success)',
                        }
                  }
                >
                  {isPending
                    ? '--'
                    : isTimeout
                      ? '超时'
                      : `${result!.latency} ms`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
