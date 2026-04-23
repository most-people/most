'use client'

import '../../styles/marketing.css'

import { Nav } from '../../components/Nav'
import { Footer } from '../../components/Footer'
import Link from 'next/link'
import { Check } from 'lucide-react'

const features = [
  {
    title: '无需注册',
    desc: '打开浏览器即用，没有账号、没有登录、没有隐私收集',
  },
  { title: 'P2P 直连', desc: 'Hyperswarm 网络发现，点对点传输，不限速不限量' },
  { title: '大文件流式传输', desc: 'GB 级文件轻松传，流式处理，内存占用低' },
  { title: '确定性链接', desc: '相同文件 = 相同 CID，一次发布永久有效' },
  { title: '频道聊天', desc: 'P2P 加密即时通讯，创建频道与朋友实时聊天' },
  { title: '开源免费', desc: 'MIT 协议，自托管，数据完全由自己掌控' },
]

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
  { num: '3', title: '开始分享', desc: '上传文件，复制链接，发给朋友即可。' },
]

const remoteMethods = [
  { title: '局域网', desc: '同一 WiFi 下直接访问，零配置。', tag: '最简单' },
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
  { title: 'Caddy 反代', desc: '自有 VPS + 域名，自动 HTTPS。', tag: '进阶' },
]

const compareRows = [
  { feature: '注册登录', wechat: '需要', cloud: '需要', mostbox: '不需要' },
  { feature: '传输限速', wechat: '有限制', cloud: '有限制', mostbox: '不限速' },
  { feature: '文件大小', wechat: '有限制', cloud: '有限制', mostbox: '无限制' },
  { feature: '中心化', wechat: '是', cloud: '是', mostbox: '否 (P2P)' },
  { feature: '端到端加密', wechat: '否', cloud: '部分', mostbox: '是' },
  { feature: '开源', wechat: '否', cloud: '否', mostbox: 'MIT 协议' },
  { feature: '自托管', wechat: '否', cloud: '否', mostbox: '可以' },
]

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: 64 }}>
        <div
          style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}
        >
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            MostBox 文档
          </h1>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              marginBottom: 48,
              maxWidth: '50ch',
              margin: '0 auto 48px',
            }}
          >
            P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。
          </p>

          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
              快速开始
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {steps.map(step => (
                <div
                  key={step.num}
                  style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      borderRadius: 9999,
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {step.num}
                  </span>
                  <div style={{ flex: 1 }}>
                    <h4
                      style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}
                    >
                      {step.title}
                    </h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {step.desc}
                    </p>
                    {step.code && (
                      <code
                        style={{
                          display: 'block',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '12px 16px',
                          marginTop: 8,
                          fontSize: 13,
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto',
                        }}
                      >
                        {step.code}
                      </code>
                    )}
                    {step.link && (
                      <p style={{ marginTop: 8 }}>
                        <a
                          href={step.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, color: 'var(--accent)' }}
                        >
                          {step.linkText} →
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
              核心功能
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {features.map(f => (
                <div
                  key={f.title}
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                >
                  <span
                    style={{
                      color: 'var(--accent)',
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    <Check size={16} strokeWidth={2} />
                  </span>
                  <div>
                    <strong
                      style={{
                        display: 'block',
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      {f.title}
                    </strong>
                    <span
                      style={{ color: 'var(--text-secondary)', fontSize: 13 }}
                    >
                      {f.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
              为什么选择 MostBox？
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '12px 16px',
                        fontWeight: 600,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    ></th>
                    <th
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontWeight: 600,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      微信/QQ
                    </th>
                    <th
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontWeight: 600,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      网盘
                    </th>
                    <th
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontWeight: 600,
                        fontSize: 11,
                        color: 'var(--accent)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      MostBox
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map(row => (
                    <tr
                      key={row.feature}
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                    >
                      <td style={{ padding: '12px 16px' }}>{row.feature}</td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {row.wechat}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {row.cloud}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          color: 'var(--accent)',
                          fontWeight: 600,
                        }}
                      >
                        {row.mostbox}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
              远程访问
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              MostBox 不只在本机运行。多种方式从任何设备访问你的文件。
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 16,
              }}
            >
              {remoteMethods.map(m => (
                <div
                  key={m.title}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 16,
                    padding: 20,
                  }}
                >
                  <h4
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 15,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {m.title}
                  </h4>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {m.desc}
                  </p>
                  <span
                    style={{
                      display: 'inline-block',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--accent)',
                      background: 'rgba(59,130,246,0.1)',
                      padding: '4px 8px',
                      borderRadius: 3,
                      marginTop: 8,
                    }}
                  >
                    {m.tag}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div style={{ marginTop: 48 }}>
            <Link
              href="/changelog/"
              style={{ color: 'var(--accent)', fontSize: 14 }}
            >
              查看更新日志 →
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
