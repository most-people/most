import Link from 'next/link'

const methods = [
  {
    title: '局域网',
    desc: '同一 WiFi 下直接访问，零配置。',
    tag: '最简单',
  },
  {
    title: 'Tailscale',
    desc: '虚拟局域网，手机也能用，自动组网。',
    tag: '推荐',
  },
  {
    title: 'Cloudflare Tunnel',
    desc: '免费 HTTPS，无需公网 IP，一行命令。',
    tag: '外网',
  },
  {
    title: 'Caddy 反代',
    desc: '自有 VPS + 域名，自动 HTTPS。',
    tag: '进阶',
  },
]

export function RemoteAccess() {
  return (
    <section className="section">
      <div className="container">
        <h2 className="heading-section">远程访问</h2>
        <p className="body-large" style={{ marginBottom: 'var(--space-6)' }}>
          MostBox 不只在本机运行。多种方式从任何设备访问你的文件。
        </p>
        <div className="remote-cards">
          {methods.map(m => (
            <div key={m.title} className="remote-card">
              <h4>{m.title}</h4>
              <p>{m.desc}</p>
              <span className="card-tag">{m.tag}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Link href="/docs/remote-access/" className="btn-secondary">
            远程访问指南 <span className="arrow-right">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}