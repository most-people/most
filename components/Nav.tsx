import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Download, Moon, Sun } from 'lucide-react'
import { LanguageToggle } from '~/components/LanguageToggle'
import { LogoIcon } from '~/components/icons/LogoIcon'

export function Nav() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches
    if (saved === 'dark' || (!saved && prefersDark)) {
      setIsDarkMode(true)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      isDarkMode ? 'dark' : 'light'
    )
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  return (
    <>
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link to="/" className="mkt-nav-logo">
            <LogoIcon />
            MOST PEOPLE
          </Link>

          <div className="mkt-nav-cta">
            <button
              className="mkt-theme-toggle"
              onClick={() => setIsDarkMode(!isDarkMode)}
              aria-label="切换主题"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <LanguageToggle className="mkt-theme-toggle" />
            <Link to="/download/" className="btn btn-primary mkt-nav-preview">
              <Download size={16} />
              下载客户端
            </Link>
            <Link to="/app/" className="btn btn-secondary">
              打开 Web
            </Link>
          </div>
        </div>
      </nav>
    </>
  )
}
