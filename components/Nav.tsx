'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

function LogoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="var(--color-accent)" opacity="0.4" />
      <rect x="14" y="2" width="8" height="8" rx="2" fill="var(--color-accent)" opacity="0.7" />
      <rect x="2" y="14" width="8" height="8" rx="2" fill="var(--color-accent)" opacity="0.7" />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="var(--color-accent)" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
      <circle cx="8" cy="8" r="3.5" />
      <line x1="8" y1="1" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="15" y2="8" />
      <line x1="3" y1="3" x2="4.5" y2="4.5" />
      <line x1="11.5" y1="11.5" x2="13" y2="13" />
      <line x1="3" y1="13" x2="4.5" y2="11.5" />
      <line x1="11.5" y1="4.5" x2="13" y2="3" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
      <path d="M6 1.5A6.5 6.5 0 1 0 14.5 10 5 5 0 0 1 6 1.5z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

const navItems = [
  { href: '/docs/getting-started/', label: '文档' },
  { href: '/changelog/', label: '更新日志' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light')
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  return (
    <nav className="mkt-nav">
      <div className="mkt-nav-inner">
        <Link href="/" className="mkt-nav-logo">
          <LogoIcon />
          MostBox
        </Link>

        <div className={`mkt-nav-links ${open ? 'open' : ''}`}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button className="mkt-theme-toggle mkt-mobile-only" onClick={() => { setIsDarkMode(!isDarkMode); setOpen(false) }} aria-label="切换主题">
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
            {isDarkMode ? ' 亮色模式' : ' 暗色模式'}
          </button>
        </div>

        <div className="mkt-nav-cta">
          <button className="mkt-theme-toggle mkt-desktop-only" onClick={() => setIsDarkMode(!isDarkMode)} aria-label="切换主题">
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link href="/app/" className="mkt-btn-primary">
            打开文件管理
          </Link>
          <a
            href="https://github.com/most-people/most"
            target="_blank"
            rel="noopener noreferrer"
            className="mkt-btn-secondary"
          >
            GitHub
          </a>
          <button className="mkt-nav-mobile-toggle" onClick={() => setOpen(!open)} aria-label="菜单">
            <MenuIcon />
          </button>
        </div>
      </div>
    </nav>
  )
}