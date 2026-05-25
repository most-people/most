'use client'

import Link from 'next/link'
import { changelog } from '~/content/changelog'
import { MarketingLayout } from '~/components/MarketingLayout'

function transformCategories(
  categories: Record<string, string[]>
): { name: string; items: string[] }[] {
  return Object.entries(categories).map(([name, items]) => ({ name, items }))
}

export default function ChangelogPage() {
  return (
    <MarketingLayout>
      <div className="mkt-page mkt-page-narrow">
        <h1 className="mkt-page-title">更新日志</h1>
        <p className="mkt-page-lead">
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
          <article key={entry.version} className="mkt-changelog-entry">
            <header className="mkt-changelog-header">
              <span className="mkt-changelog-version">{entry.version}</span>
              <span className="mkt-changelog-date">{entry.date}</span>
            </header>
            {transformCategories(entry.categories).map(cat => (
              <section key={cat.name} className="mkt-changelog-category">
                <h2 className="mkt-changelog-category-title">{cat.name}</h2>
                <ul className="mkt-changelog-list">
                  {cat.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        ))}

        <div className="mkt-page-footer">
          <Link href="/">← 返回首页</Link>
        </div>
      </div>
    </MarketingLayout>
  )
}
