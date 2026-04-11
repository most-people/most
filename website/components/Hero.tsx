'use client'

import { useState } from 'react'
import Link from 'next/link'
import { InstallTabs } from './InstallTabs'

export function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="badge" style={{ marginBottom: 'var(--space-6)' }}>
          开源免费 · P2P 加密
        </div>
        <h1>
          P2P 文件分享<br />无需注册
        </h1>
        <p>
          丢掉网盘，回归点对点。基于 Hyperswarm 的去中心化文件传输，不限速、不限量、不追踪。
        </p>
        <InstallTabs />
        <div className="hero-actions">
          <Link href="/docs/getting-started/" className="btn-primary">
            查看文档
            <span className="arrow-right">→</span>
          </Link>
          <a href="https://github.com/most-people/most" target="_blank" rel="noopener noreferrer" className="btn-secondary">
            GitHub
          </a>
        </div>
      </div>
    </section>
  )
}