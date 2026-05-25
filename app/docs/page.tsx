'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { MarketingLayout } from '~/components/MarketingLayout'

const features = [
  {
    title: '无需注册',
    desc: '打开浏览器即用，没有账号、没有登录、没有隐私收集',
  },
  { title: 'P2P 直连', desc: 'Hyperswarm 网络发现，点对点传输，不限速不限量' },
  { title: '大文件流式传输', desc: 'GB 级文件轻松传，流式处理，内存占用低' },
  { title: '确定性链接', desc: '相同文件 = 相同 CID，链接可反复校验' },
  { title: '频道聊天', desc: 'P2P 加密即时通讯，创建频道与朋友实时聊天' },
  { title: '开源免费', desc: 'MIT 协议，自托管，数据完全由自己掌控' },
]

const steps = [
  {
    num: '1',
    title: '下载桌面客户端',
    desc: '支持 Windows、macOS 和 Linux。',
    link: '/download',
    linkText: '前往下载页',
  },
  {
    num: '2',
    title: '安装并运行',
    desc: '安装后打开应用，即可使用 P2P 文件分享和加密聊天。',
  },
  {
    num: '3',
    title: '开始分享',
    desc: '发布文件生成链接，或创建频道与朋友聊天。',
  },
]

const compareRows = [
  { feature: '注册登录', wechat: '需要', cloud: '需要', mostbox: '不需要' },
  { feature: '传输限速', wechat: '有限制', cloud: '有限制', mostbox: '不限速' },
  { feature: '文件大小', wechat: '有限制', cloud: '有限制', mostbox: '无限制' },
  { feature: '中心化', wechat: '是', cloud: '是', mostbox: '否 (P2P)' },
  {
    feature: '私密分享',
    wechat: '否',
    cloud: '部分',
    mostbox: '自行加密',
  },
  { feature: '开源', wechat: '否', cloud: '否', mostbox: 'MIT 协议' },
  { feature: '自托管', wechat: '否', cloud: '否', mostbox: '可以' },
]

export default function DocsPage() {
  return (
    <MarketingLayout>
      <div className="mkt-page mkt-page-wide">
        <header className="mkt-page-hero">
          <h1 className="mkt-page-title">MostBox 文档</h1>
          <p className="mkt-page-lead">
            P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。
          </p>
        </header>

        <section className="mkt-doc-section">
          <h2 className="mkt-doc-section-title">快速开始</h2>
          <div className="mkt-step-list">
            {steps.map(step => (
              <div key={step.num} className="mkt-step-item">
                <span className="mkt-step-number">{step.num}</span>
                <div className="mkt-step-body">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                  {step.link && (
                    <p className="mkt-step-link">
                      <a
                        href={step.link}
                        target="_blank"
                        rel="noopener noreferrer"
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

        <section className="mkt-doc-section">
          <h2 className="mkt-doc-section-title">核心功能</h2>
          <div className="mkt-feature-list">
            {features.map(feature => (
              <div key={feature.title} className="mkt-feature-row">
                <span className="mkt-feature-icon">
                  <Check size={16} strokeWidth={2} />
                </span>
                <div>
                  <strong>{feature.title}</strong>
                  <span>{feature.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mkt-doc-section">
          <h2 className="mkt-doc-section-title">为什么选择 MostBox？</h2>
          <div className="mkt-table-wrap">
            <table className="mkt-compare-table">
              <thead>
                <tr>
                  <th></th>
                  <th>微信/QQ</th>
                  <th>网盘</th>
                  <th className="is-mostbox">MostBox</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(row => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td>{row.wechat}</td>
                    <td>{row.cloud}</td>
                    <td className="is-mostbox">{row.mostbox}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mkt-page-footer">
          <Link href="/changelog/">查看更新日志 →</Link>
        </div>
      </div>
    </MarketingLayout>
  )
}
