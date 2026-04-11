import Link from 'next/link'

const steps = [
  {
    num: '1',
    title: '安装 Node.js',
    desc: '需要 Node.js 18 或更高版本。',
    link: 'https://nodejs.org',
    linkText: '下载 Node.js',
  },
  {
    num: '2',
    title: '运行 MostBox',
    desc: '一行命令启动，浏览器自动打开。',
    code: 'npx most-box@latest',
  },
  {
    num: '3',
    title: '开始分享',
    desc: '上传文件，复制链接，发给朋友即可。',
  },
]

export function QuickStart() {
  return (
    <section className="section" style={{ background: 'var(--color-bg-surface)' }}>
      <div className="container">
        <h2 className="heading-section">3 步开始</h2>
        <div className="quick-start-steps">
          {steps.map(step => (
            <div key={step.num} className="step">
              <span className="step-number">{step.num}</span>
              <div className="step-content">
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
                {step.code && <code>{step.code}</code>}
                {step.link && (
                  <p style={{ marginTop: 'var(--space-2)' }}>
                    <a href={step.link} target="_blank" rel="noopener noreferrer">
                      {step.linkText} <span className="arrow-right">→</span>
                    </a>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'var(--space-8)' }}>
          <Link href="/docs/getting-started/" className="btn-primary">
            完整安装指南 <span className="arrow-right">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}