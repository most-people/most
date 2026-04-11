'use client'

import { useState } from 'react'
import Link from 'next/link'

function LogoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="currentColor" opacity="0.3" />
      <rect x="14" y="2" width="8" height="8" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="2" y="14" width="8" height="8" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="currentColor" />
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

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          <LogoIcon />
          MostBox
        </Link>

        <div className={`nav-links ${open ? 'open' : ''}`}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="nav-cta">
          <a
            href="https://github.com/most-people/most"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-2) var(--space-4)' }}
          >
            GitHub
          </a>
          <button className="nav-mobile-toggle" onClick={() => setOpen(!open)} aria-label="菜单">
            <MenuIcon />
          </button>
        </div>
      </div>
    </nav>
  )
}