import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import {
  Search,
  Cloud,
  Play,
  Terminal,
  Bot,
  AtSign,
  Camera,
  MessagesSquare,
  BookOpen,
  Smartphone,
  Send,
  Music,
  Package,
  Triangle,
  RotateCw,
  Wifi,
} from 'lucide-react'
import { useI18n } from '~/lib/i18n'

interface PingTarget {
  name: string
  host: string
  category: PingCategory
  icon: string
  fallback: React.ReactNode
}

type PingCategory = 'essential' | 'developer' | 'ai' | 'social' | 'messaging'

interface PingResult {
  status: 'pending' | 'ok' | 'timeout'
  latency: number
}

const TARGETS: PingTarget[] = [
  {
    name: 'Google',
    host: 'google.com',
    category: 'essential',
    icon: 'simple-icons:google',
    fallback: <Search size={20} />,
  },
  {
    name: 'Cloudflare',
    host: 'cloudflare.com',
    category: 'essential',
    icon: 'simple-icons:cloudflare',
    fallback: <Cloud size={20} />,
  },
  {
    name: 'YouTube',
    host: 'youtube.com',
    category: 'social',
    icon: 'simple-icons:youtube',
    fallback: <Play size={20} />,
  },
  {
    name: 'GitHub',
    host: 'github.com',
    category: 'developer',
    icon: 'simple-icons:github',
    fallback: <Terminal size={20} />,
  },
  {
    name: 'ChatGPT',
    host: 'chatgpt.com',
    category: 'ai',
    icon: 'simple-icons:openai',
    fallback: <Bot size={20} />,
  },
  {
    name: '豆包',
    host: 'www.doubao.com',
    category: 'ai',
    icon: 'simple-icons:bytedance',
    fallback: <Bot size={20} />,
  },
  {
    name: 'X',
    host: 'x.com',
    category: 'social',
    icon: 'simple-icons:x',
    fallback: <AtSign size={20} />,
  },
  {
    name: 'Instagram',
    host: 'instagram.com',
    category: 'social',
    icon: 'simple-icons:instagram',
    fallback: <Camera size={20} />,
  },
  {
    name: 'Reddit',
    host: 'reddit.com',
    category: 'social',
    icon: 'simple-icons:reddit',
    fallback: <MessagesSquare size={20} />,
  },
  {
    name: 'Wikipedia',
    host: 'wikipedia.org',
    category: 'social',
    icon: 'simple-icons:wikipedia',
    fallback: <BookOpen size={20} />,
  },
  {
    name: 'Apple',
    host: 'apple.com',
    category: 'essential',
    icon: 'simple-icons:apple',
    fallback: <Smartphone size={20} />,
  },

  {
    name: 'Telegram',
    host: 'telegram.org',
    category: 'messaging',
    icon: 'simple-icons:telegram',
    fallback: <Send size={20} />,
  },
  {
    name: 'Discord',
    host: 'discord.com',
    category: 'messaging',
    icon: 'simple-icons:discord',
    fallback: <MessagesSquare size={20} />,
  },
  {
    name: 'TikTok',
    host: 'tiktok.com',
    category: 'social',
    icon: 'simple-icons:tiktok',
    fallback: <Music size={20} />,
  },
  {
    name: 'npm',
    host: 'npmjs.com',
    category: 'developer',
    icon: 'simple-icons:npm',
    fallback: <Package size={20} />,
  },
  {
    name: 'Vercel',
    host: 'vercel.com',
    category: 'developer',
    icon: 'simple-icons:vercel',
    fallback: <Triangle size={20} />,
  },
]

const CATEGORIES: PingCategory[] = [
  'essential',
  'developer',
  'ai',
  'social',
  'messaging',
]

const TIMEOUT = 5000

function getProbeOptions(host: string) {
  return {
    url: `https://${host}/robots.txt`,
    method: 'GET' as const,
  }
}

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
  const { t, formatNumber } = useI18n()
  const [results, setResults] = useState<Map<string, PingResult>>(new Map())
  const [runningAll, setRunningAll] = useState(false)
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  useEffect(() => {
    document.title = t('ping.meta.title')
  }, [t])

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

    const probe = getProbeOptions(host)
    fetch(probe.url, {
      method: probe.method,
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

      const probe = getProbeOptions(target.host)
      fetch(probe.url, {
        method: probe.method,
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
    <div className="ping-internet-panel">
      <div className="ping-header">
        <div className="ping-title-wrap">
          <Wifi size={28} className="ping-title-icon" />
          <div>
            <h1 className="ping-title">{t('ping.title')}</h1>
            <p className="ping-subtitle">{t('ping.subtitle')}</p>
            <p className="ping-reference">
              <a href="https://ipcheck.ing/" target="_blank" rel="noreferrer">
                ipcheck.ing
              </a>
            </p>
          </div>
        </div>
        <button
          className="btn btn-icon"
          onClick={runAllTests}
          disabled={runningAll}
          aria-label={t('ping.retryAll')}
          title={t('ping.retryAll')}
        >
          <RotateCw size={18} className={runningAll ? 'ping-spin' : ''} />
        </button>
      </div>

      <div className="ping-categories">
        {CATEGORIES.map(category => (
          <section key={category} className="ping-category">
            <h2 className="ping-category-title">
              {t(`ping.category.${category}`)}
            </h2>
            <div className="ping-grid">
              {TARGETS.filter(target => target.category === category).map(
                target => {
                  const result = results.get(target.host)
                  const isPending = !result || result.status === 'pending'
                  const isTimeout = result?.status === 'timeout'

                  return (
                    <div
                      key={target.host}
                      className={`ping-card ui-glass-surface ui-glass-surface-interactive ${isPending ? 'pending' : ''}`}
                    >
                      <div className="ping-card-top">
                        <span className="ping-card-icon">
                          <BrandIcon
                            icon={target.icon}
                            fallback={target.fallback}
                          />
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
                          aria-label={t('ping.retryOne', { name: target.name })}
                          title={t('ping.retry')}
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
                            className={`ping-status-label ${isTimeout ? 'is-error' : 'is-success'}`}
                          >
                            {isTimeout
                              ? t('ping.unavailable')
                              : t('ping.available')}
                          </span>
                        )}

                        <span
                          className={`ping-latency ${
                            isPending
                              ? 'is-muted'
                              : isTimeout
                                ? 'is-error'
                                : 'is-success'
                          }`}
                        >
                          {isPending
                            ? '--'
                            : isTimeout
                              ? t('ping.timeout')
                              : `${formatNumber(result!.latency)} ms`}
                        </span>
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
