import Link from 'next/link'
import { FAQ } from './FAQ'
import { InstallTabs } from './InstallTabs'

const features = [
  { title: '无需注册', desc: '打开浏览器即用，没有账号、没有登录、没有隐私收集' },
  { title: 'P2P 直连', desc: 'Hyperswarm 网络发现，点对点传输，不限速不限量' },
  { title: '大文件流式传输', desc: 'GB 级文件轻松传，流式处理，内存占用低' },
  { title: '确定性链接', desc: '相同文件 = 相同 CID，一次发布永久有效' },
  { title: '频道聊天', desc: 'P2P 加密即时通讯，创建频道与朋友实时聊天' },
  { title: '开源免费', desc: 'MIT 协议，自托管，数据完全由自己掌控' },
]

const remoteMethods = [
  { title: '局域网', desc: '同一 WiFi 下直接访问，零配置。', tag: '最简单' },
  { title: 'Tailscale', desc: '虚拟局域网，手机也能用，自动组网。', tag: '推荐' },
  { title: 'Cloudflare Tunnel', desc: '免费 HTTPS，无需公网 IP，一行命令。', tag: '外网' },
  { title: 'Caddy 反代', desc: '自有 VPS + 域名，自动 HTTPS。', tag: '进阶' },
]

const steps = [
  { num: '1', title: '安装 Node.js', desc: '需要 Node.js 18 或更高版本。', link: 'https://nodejs.org', linkText: '下载 Node.js' },
  { num: '2', title: '运行 MostBox', desc: '一行命令启动，浏览器自动打开。', code: 'npx most-box@latest' },
  { num: '3', title: '开始分享', desc: '上传文件，复制链接，发给朋友即可。' },
]

export default function MarketingLanding() {
  return (
    <div className="mkt-landing">
      {/* Hero */}
      <section className="mkt-hero">
        <div className="mkt-container">
          <div className="mkt-hero-badge">开源免费 · P2P 加密</div>
          <h1 className="mkt-hero-title">
            P2P 文件分享<br />无需注册
          </h1>
          <p className="mkt-hero-desc">
            丢掉网盘，回归点对点。基于 Hyperswarm 的去中心化文件传输，不限速、不限量、不追踪。
          </p>
          <InstallTabs />
          <div className="mkt-hero-cta">
            <Link href="/docs/getting-started/" className="mkt-btn-primary">
              查看文档 →
            </Link>
            <a
              href="https://github.com/most-people/most"
              target="_blank"
              rel="noopener noreferrer"
              className="mkt-btn-secondary"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Screenshot placeholder */}
      <div className="mkt-container">
        <div className="mkt-screenshot-placeholder">
          MostBox 截图
        </div>
      </div>

      {/* Features */}
      <section className="mkt-section">
        <div className="mkt-container">
          <h2 className="mkt-heading">MostBox 是什么？</h2>
          <p className="mkt-section-desc">
            基于 Hyperswarm 的去中心化文件分享工具，让文件传输回归点对点，无需服务器中转。
          </p>
          <div className="mkt-features">
            {features.map(f => (
              <div key={f.title} className="mkt-feature">
                <span className="mkt-feature-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M3 8.5L6.5 12L13 4.5" /></svg>
                </span>
                <div>
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <Link href="/docs/architecture/" className="mkt-link">
            了解架构 →
          </Link>
        </div>
      </section>

      {/* Steps */}
      <section className="mkt-section mkt-section-alt">
        <div className="mkt-container">
          <h2 className="mkt-heading">3 步开始</h2>
          <div className="mkt-steps">
            {steps.map(step => (
              <div key={step.num} className="mkt-step">
                <span className="mkt-step-num">{step.num}</span>
                <div className="mkt-step-content">
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                  {step.code && (
                    <code className="mkt-code">{step.code}</code>
                  )}
                  {step.link && (
                    <p className="mkt-step-link">
                      <a href={step.link} target="_blank" rel="noopener noreferrer">
                        {step.linkText} →
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link href="/docs/getting-started/" className="mkt-btn-primary">
            完整安装指南 →
          </Link>
        </div>
      </section>

      {/* Remote Access */}
      <section className="mkt-section">
        <div className="mkt-container">
          <h2 className="mkt-heading">远程访问</h2>
          <p className="mkt-section-desc">
            MostBox 不只在本机运行。多种方式从任何设备访问你的文件。
          </p>
          <div className="mkt-remote-grid">
            {remoteMethods.map(m => (
              <div key={m.title} className="mkt-remote-card">
                <h4>{m.title}</h4>
                <p>{m.desc}</p>
                <span className="mkt-tag">{m.tag}</span>
              </div>
            ))}
          </div>
          <Link href="/docs/remote-access/" className="mkt-link">
            远程访问指南 →
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <FAQ />

      {/* CTA */}
      <section className="mkt-section mkt-section-alt mkt-cta">
        <div className="mkt-container">
          <h2 className="mkt-heading">开始使用 MostBox</h2>
          <p className="mkt-cta-desc">
            一行命令，即刻开始分享文件。
          </p>
          <div className="mkt-cta-install">
            <InstallTabs />
          </div>
        </div>
      </section>
    </div>
  )
}
