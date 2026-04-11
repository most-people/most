import { changelog } from '../../content/changelog'

type CategoryKey = '新增' | '修复' | '重构' | '测试' | '文档'

const categoryOrder: CategoryKey[] = ['新增', '修复', '重构', '测试', '文档']

export default function Changelog() {
  return (
    <div className="container">
      <div style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-20)' }}>
        <h1 className="heading-hero" style={{ marginBottom: 'var(--space-4)' }}>更新日志</h1>
        <p className="body-large">MostBox 的版本更新记录。</p>

        {changelog.map(entry => (
          <div key={entry.version} className="changelog-entry">
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <span className="changelog-version">v{entry.version}</span>
              <span className="changelog-date">{entry.date}</span>
            </div>

            {categoryOrder.map(category => {
              const items = entry.categories[category as keyof typeof entry.categories]
              if (!items || items.length === 0) return null
              return (
                <div key={category}>
                  <div className="changelog-category">{category}</div>
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
    </div>
  )
}