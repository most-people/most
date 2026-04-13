import { changelog } from '../../../content/changelog'

type CategoryKey = '新增' | '修复' | '重构' | '测试' | '文档'

const categoryOrder: CategoryKey[] = ['新增', '修复', '重构', '测试', '文档']

export const metadata = {
  title: '更新日志 - MostBox',
  description: 'MostBox 版本更新记录。',
}

export default function Changelog() {
  return (
    <div className="mkt-container mkt-section">
      <h1 className="mkt-heading">更新日志</h1>
      <p className="mkt-body-large">MostBox 的版本更新记录。</p>

      {changelog.map(entry => (
        <div key={entry.version} className="mkt-changelog-entry">
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span className="mkt-changelog-version">v{entry.version}</span>
            <span className="mkt-changelog-date">{entry.date}</span>
          </div>

          {categoryOrder.map(category => {
            const items = entry.categories[category as keyof typeof entry.categories]
            if (!items || items.length === 0) return null
            return (
              <div key={category}>
                <div className="mkt-changelog-category">{category}</div>
                <ul>
                  {items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}