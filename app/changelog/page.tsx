'use client'

import Link from 'next/link'
import { changelog } from '../../content/changelog'
import { MarketingLayout } from '../../components/MarketingLayout'

function transformCategories(
  categories: Record<string, string[]>
): { name: string; items: string[] }[] {
  return Object.entries(categories).map(([name, items]) => ({ name, items }))
}

export default function ChangelogPage() {
  return (
    <MarketingLayout>
      <main style={{ paddingTop: 64 }}>
        <div
          style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            更新日志
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 48 }}>
            本项目所有重要变更将记录在此文件中。格式遵循{' '}
            <a
              href="https://keepachangelog.com/en/1.0.0/"
              target="_blank"
              rel="noopener"
            >
              Keep a Changelog
            </a>
            。
          </p>

          {changelog.map(entry => (
            <div
              key={entry.version}
              style={{
                marginBottom: 48,
                paddingBottom: 48,
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 600 }}>
                  {entry.version}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  {entry.date}
                </span>
              </div>
              {transformCategories(entry.categories).map(cat => (
                <div key={cat.name} style={{ marginBottom: 20 }}>
                  <h3
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    {cat.name}
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {cat.items.map(item => (
                      <li
                        key={item}
                        style={{
                          padding: '4px 0',
                          paddingLeft: 16,
                          position: 'relative',
                          color: 'var(--text-secondary)',
                          fontSize: 14,
                        }}
                      >
                        <span style={{ position: 'absolute', left: 0 }}>•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}

          <div style={{ marginTop: 48 }}>
            <Link href="/" style={{ color: 'var(--accent)', fontSize: 14 }}>
              ← 返回首页
            </Link>
          </div>
        </div>
      </main>
    </MarketingLayout>
  )
}
