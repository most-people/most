'use client'

import Link from 'next/link'
import { MarketingLayout } from '~/components/MarketingLayout'

const setupSteps = [
  {
    num: '1',
    title: '下载桌面客户端',
    desc: '支持 Windows、macOS 和 Linux。数据完全本地存储，无需上传到任何服务器。',
    link: '/download',
    linkText: '前往下载页 →',
  },
  {
    num: '2',
    title: '安装并运行',
    desc: '安装后打开应用，即可使用 P2P 文件分享和加密聊天功能。',
  },
  {
    num: '3',
    title: '开始使用',
    desc: '发布文件生成分享链接，或创建频道与朋友聊天。',
  },
]

const capabilityRows = [
  { feature: 'P2P 文件分享', web: '仅展示', desktop: '完整', webTone: 'warning' },
  { feature: 'P2P 加密聊天', web: '仅展示', desktop: '完整', webTone: 'warning' },
  {
    feature: '文件存储',
    web: '不支持',
    desktop: '持久化存储',
    webTone: 'muted',
  },
  {
    feature: '离线消息',
    web: '不支持',
    desktop: '支持',
    webTone: 'muted',
  },
  {
    feature: '大文件传输',
    web: '不支持',
    desktop: '无限制',
    webTone: 'muted',
  },
]

export default function GettingStartedPage() {
  return (
    <MarketingLayout>
      <div className="mkt-page mkt-page-narrow">
        <h1 className="mkt-page-title mkt-page-title-compact">快速开始</h1>
        <p className="mkt-page-lead mkt-page-lead-compact">
          下载桌面客户端，获得完整的 P2P 体验。
        </p>

        <section className="mkt-doc-section mkt-doc-section-compact">
          <div className="mkt-step-list">
            {setupSteps.map(step => (
              <div key={step.num} className="mkt-step-item">
                <span className="mkt-step-number">{step.num}</span>
                <div className="mkt-step-body">
                  <h2>{step.title}</h2>
                  <p>{step.desc}</p>
                  {step.link && (
                    <Link href={step.link} className="mkt-inline-link">
                      {step.linkText}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mkt-compare-panel">
          <h2>Web 端 vs 桌面端</h2>
          <table className="mkt-capability-table">
            <thead>
              <tr>
                <th>功能</th>
                <th>Web 端</th>
                <th>桌面端</th>
              </tr>
            </thead>
            <tbody>
              {capabilityRows.map(row => (
                <tr key={row.feature}>
                  <td>{row.feature}</td>
                  <td className={`is-${row.webTone}`}>{row.web}</td>
                  <td className="is-success">{row.desktop}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mkt-link-row">
          <Link href="/docs/">← 文档首页</Link>
          <Link href="/changelog/">更新日志 →</Link>
        </div>
      </div>
    </MarketingLayout>
  )
}
