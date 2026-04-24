'use client'

import { useState, useEffect } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import Link from 'next/link'
import { Sun, Moon, Menu } from 'lucide-react'
import { LogoIcon } from './icons/LogoIcon'

const navItems = [
  { href: '/docs/getting-started/', label: '文档' },
  { href: '/changelog/', label: '更新日志' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
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
          <Link href="/" className="mkt-nav-logo">
            <LogoIcon />
            MOST PEOPLE
          </Link>

          <div className={`mkt-nav-links ${open ? 'open' : ''}`}>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <button
              className="mkt-theme-toggle mkt-mobile-only"
              onClick={() => {
                setIsDarkMode(!isDarkMode)
                setOpen(false)
              }}
              aria-label="切换主题"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              {isDarkMode ? ' 亮色模式' : ' 暗色模式'}
            </button>
          </div>

          <div className="mkt-nav-cta">
            <button
              className="mkt-theme-toggle mkt-desktop-only"
              onClick={() => setIsDarkMode(!isDarkMode)}
              aria-label="切换主题"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link href="/app/" className="mkt-btn-primary">
              开始使用
            </Link>

            <button
              className="mkt-nav-mobile-toggle"
              onClick={() => setOpen(!open)}
              aria-label="菜单"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
