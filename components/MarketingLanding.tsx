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

const rows = [
  { feature: '注册登录', wechat: '需要', cloud: '需要', mostbox: '不需要' },
  { feature: '传输限速', wechat: '有限制', cloud: '有限制', mostbox: '不限速' },
  { feature: '文件大小', wechat: '有限制', cloud: '有限制', mostbox: '无限制' },
  { feature: '中心化', wechat: '是', cloud: '是', mostbox: '否 (P2P)' },
  { feature: '端到端加密', wechat: '否', cloud: '部分', mostbox: '是' },
  { feature: '开源', wechat: '否', cloud: '否', mostbox: 'MIT 协议' },
  { feature: '自托管', wechat: '否', cloud: '否', mostbox: '可以' },
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
    <div style={{ fontFamily: 'var(--font-mono)' }}>
      <section style={{ textAlign: 'center', padding: '80px 24px 48px', background: 'var(--color-bg)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 9999,
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            marginBottom: 24,
          }}>
            开源免费 · P2P 加密
          </div>
          <h1 style={{ fontSize: 60, fontWeight: 700, letterSpacing: -0.03, lineHeight: 1.05, marginBottom: 16 }}>
            P2P 文件分享<br />无需注册
          </h1>
          <p style={{ fontSize: 18, color: 'var(--color-text-secondary)', maxWidth: '36ch', margin: '0 auto 32px', lineHeight: 1.6 }}>
            丢掉网盘，回归点对点。基于 Hyperswarm 的去中心化文件传输，不限速、不限量、不追踪。
          </p>
          <InstallTabs />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
            <Link href="/docs/getting-started/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', fontSize: 15, fontWeight: 500,
              color: '#fff', background: 'var(--color-accent)',
              borderRadius: 12, textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
              查看文档 →
            </Link>
            <a href="https://github.com/most-people/most" target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', fontSize: 15, fontWeight: 500,
              color: 'var(--color-text)', background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
              GitHub
            </a>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 48px' }}>
        <div style={{
          background: 'var(--color-bg-tertiary)', border: '1px dashed var(--color-border)',
          borderRadius: 16, aspectRatio: '16/9', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)',
        }}>
          MostBox 截图
        </div>
      </div>

      <section style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
            MostBox 是什么？
          </h2>
          <p style={{ fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1.7, maxWidth: '65ch', marginBottom: 32 }}>
            基于 Hyperswarm 的去中心化文件分享工具，让文件传输回归点对点，无需服务器中转。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {features.map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--color-accent)', marginTop: 2, flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M3 8.5L6.5 12L13 4.5" /></svg>
                </span>
                <div>
                  <strong style={{ display: 'block', fontWeight: 600 }}>{f.title}</strong>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Link href="/docs/architecture/" style={{ fontSize: 13, color: 'var(--color-accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
              了解架构 →
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 0', background: 'var(--color-bg-secondary)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
            为什么选择 MostBox？
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}></th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>微信/QQ</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>网盘</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, fontSize: 11, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MostBox</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.feature} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 16px' }}>{row.feature}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{row.wechat}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{row.cloud}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-accent)', fontWeight: 600 }}>{row.mostbox}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 0', background: 'var(--color-bg-secondary)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
            3 步开始
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {steps.map(step => (
              <div key={step.num} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: 9999,
                  background: 'var(--color-accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
                }}>{step.num}</span>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{step.title}</h4>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{step.desc}</p>
                  {step.code && (
                    <code style={{ display: 'block', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', marginTop: 8, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                      {step.code}
                    </code>
                  )}
                  {step.link && (
                    <p style={{ marginTop: 8 }}>
                      <a href={step.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                        {step.linkText} →
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Link href="/docs/getting-started/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', fontSize: 15, fontWeight: 500,
              color: '#fff', background: 'var(--color-accent)',
              borderRadius: 12, textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
              完整安装指南 →
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
            远程访问
          </h2>
          <p style={{ fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            MostBox 不只在本机运行。多种方式从任何设备访问你的文件。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {remoteMethods.map(m => (
              <div key={m.title} style={{
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                borderRadius: 16, padding: 20,
              }}>
                <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{m.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{m.desc}</p>
                <span style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: 'var(--color-accent)', background: 'rgba(59,130,246,0.1)', padding: '4px 8px', borderRadius: 3, marginTop: 8 }}>{m.tag}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <Link href="/docs/remote-access/" style={{ fontSize: 13, color: 'var(--color-accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
              远程访问指南 →
            </Link>
          </div>
        </div>
      </section>

      <FAQ />

      <section style={{ padding: '80px 0', background: 'var(--color-bg-secondary)', textAlign: 'center' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
            开始使用 MostBox
          </h2>
          <p style={{ fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 auto 32px', maxWidth: '40ch' }}>
            一行命令，即刻开始分享文件。
          </p>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <InstallTabs />
          </div>
        </div>
      </section>
    </div>
  )
}