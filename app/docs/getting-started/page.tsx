'use client'

import Link from 'next/link'
import { MarketingLayout } from '~/components/MarketingLayout'

export default function GettingStartedPage() {
  return (
    <MarketingLayout>
      <main style={{ paddingTop: 64 }}>
        <div
          style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            快速开始
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            下载桌面客户端，获得完整的 P2P 体验。
          </p>

          <section style={{ marginBottom: 40 }}>
            <div
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: 24,
              }}
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
                1
              </span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  下载桌面客户端
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                    marginBottom: 12,
                  }}
                >
                  支持 Windows、macOS 和
                  Linux。数据完全本地存储，无需上传到任何服务器。
                </p>
                <Link
                  href="/download"
                  style={{ color: 'var(--accent)', fontSize: 14 }}
                >
                  前往下载页 →
                </Link>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: 24,
              }}
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
                2
              </span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  安装并运行
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                    marginBottom: 12,
                  }}
                >
                  安装后打开应用，即可使用 P2P 文件分享和加密聊天功能。
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
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
                3
              </span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  开始使用
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  上传文件生成分享链接，或创建频道与朋友聊天。
                </p>
              </div>
            </div>
          </section>

          <section
            style={{
              marginBottom: 40,
              padding: 20,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              Web 端 vs 桌面端
            </h3>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '8px 0',
                      fontWeight: 600,
                    }}
                  >
                    功能
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '8px 0',
                      fontWeight: 600,
                    }}
                  >
                    Web 端
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '8px 0',
                      fontWeight: 600,
                    }}
                  >
                    桌面端
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 0' }}>P2P 文件分享</td>
                  <td style={{ padding: '8px 0', color: 'var(--warning)' }}>
                    仅展示
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--success)' }}>
                    完整
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 0' }}>P2P 加密聊天</td>
                  <td style={{ padding: '8px 0', color: 'var(--warning)' }}>
                    仅展示
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--success)' }}>
                    完整
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 0' }}>文件存储</td>
                  <td
                    style={{ padding: '8px 0', color: 'var(--text-secondary)' }}
                  >
                    不支持
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--success)' }}>
                    持久化存储
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 0' }}>离线消息</td>
                  <td
                    style={{ padding: '8px 0', color: 'var(--text-secondary)' }}
                  >
                    不支持
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--success)' }}>
                    支持
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0' }}>大文件传输</td>
                  <td
                    style={{ padding: '8px 0', color: 'var(--text-secondary)' }}
                  >
                    不支持
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--success)' }}>
                    无限制
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <div style={{ display: 'flex', gap: 24 }}>
            <Link
              href="/docs/"
              style={{ color: 'var(--accent)', fontSize: 14 }}
            >
              ← 文档首页
            </Link>
            <Link
              href="/changelog/"
              style={{ color: 'var(--accent)', fontSize: 14 }}
            >
              更新日志 →
            </Link>
          </div>
        </div>
      </main>
    </MarketingLayout>
  )
}
