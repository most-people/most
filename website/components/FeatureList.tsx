import Link from 'next/link'

const features = [
  {
    title: '无需注册',
    desc: '打开浏览器即用，没有账号、没有登录、没有隐私收集',
  },
  {
    title: 'P2P 直连',
    desc: 'Hyperswarm 网络发现，点对点传输，不限速不限量',
  },
  {
    title: '大文件流式传输',
    desc: 'GB 级文件轻松传，流式处理，内存占用低',
  },
  {
    title: '确定性链接',
    desc: '相同文件 = 相同 CID，一次发布永久有效',
  },
  {
    title: '频道聊天',
    desc: 'P2P 加密即时通讯，创建频道与朋友实时聊天',
  },
  {
    title: '开源免费',
    desc: 'MIT 协议，自托管，数据完全由自己掌控',
  },
]

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <path d="M3 8.5L6.5 12L13 4.5" />
    </svg>
  )
}

export function FeatureList() {
  return (
    <section className="section">
      <div className="container">
        <h2 className="heading-section">MostBox 是什么？</h2>
        <p className="body-large" style={{ marginBottom: 'var(--space-8)' }}>
          基于 Hyperswarm 的去中心化文件分享工具，让文件传输回归点对点，无需服务器中转。
        </p>
        <div className="feature-list">
          {features.map(f => (
            <div key={f.title} className="feature-item">
              <span className="feature-icon"><CheckIcon /></span>
              <div className="feature-text">
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'var(--space-8)' }}>
          <Link href="/docs/architecture/" className="btn-secondary">
            了解架构 <span className="arrow-right">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}