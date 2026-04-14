'use client'

import { Nav } from '../../../components/Nav'
import { Footer } from '../../../components/Footer'
import Link from 'next/link'

export default function GettingStartedPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: 64 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>快速开始</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            3 步开始使用 MostBox。
          </p>

          <section style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
              <span style={{
                flexShrink: 0, width: 36, height: 36, borderRadius: 9999,
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>1</span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>安装 Node.js</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  MostBox 需要 Node.js 18 或更高版本。
                </p>
                <a
                  href="https://nodejs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', fontSize: 14 }}
                >
                  下载 Node.js →
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
              <span style={{
                flexShrink: 0, width: 36, height: 36, borderRadius: 9999,
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>2</span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>运行 MostBox</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  一行命令启动，浏览器自动打开。
                </p>
                <code style={{ display: 'block', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px 16px', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  npx most-box@latest
                </code>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, width: 36, height: 36, borderRadius: 9999,
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>3</span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>开始分享</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  上传文件，复制链接，发给朋友即可。
                </p>
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 40, padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>访问场景</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600 }}>场景</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600 }}>命令</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>本地</td>
                  <td style={{ padding: '8px 0' }}><code>npx most-box</code></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>内网</td>
                  <td style={{ padding: '8px 0' }}><code>set MOSTBOX_HOST=0.0.0.0 && npx most-box</code></td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>外网</td>
                  <td style={{ padding: '8px 0' }}>Caddy 反向代理</td>
                </tr>
              </tbody>
            </table>
          </section>

          <div style={{ display: 'flex', gap: 24 }}>
            <Link href="/docs/" style={{ color: 'var(--accent)', fontSize: 14 }}>
              ← 文档首页
            </Link>
            <Link href="/changelog/" style={{ color: 'var(--accent)', fontSize: 14 }}>
              更新日志 →
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
