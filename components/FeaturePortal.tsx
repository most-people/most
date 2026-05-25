'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  FolderOpen,
  MessageSquare,
  NotebookPen,
  Wallet,
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Download,
} from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'

/* ─── Types ─── */
interface FeatureDef {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  path: string
  requiresBackend: boolean
  hero: string
  desc: string
  features: string[]
  steps: {
    num: string
    title: string
    desc: string
    code?: string
    link?: string
    linkText?: string
  }[]
  extra?: React.ReactNode
}

/* ─── Data ─── */
const features: FeatureDef[] = [
  {
    id: 'app',
    title: 'MostBox',
    subtitle: 'P2P 文件分享',
    icon: <FolderOpen size={28} />,
    path: '/app/',
    requiresBackend: true,
    hero: 'P2P 文件分享，无需注册',
    desc: '基于 Hyperswarm 的去中心化文件传输，让文件分享回归点对点。MostBox 不是云盘；链接来自 CID，可用性来自当前在线种子。',
    features: [
      '无需注册，打开浏览器即用',
      'Hyperswarm P2P 直连传输',
      'GB 级大文件流式处理',
      '相同文件 = 相同 CID，链接可反复校验',
      '下载完成后默认继续做种',
      '相比微信、QQ 或网盘，不依赖中心化账号和云端托管',
      'Web 端负责展示，完整发布、下载和持续做种依赖桌面客户端',
      'MIT 开源，自托管，数据完全自主掌控',
    ],
    steps: [
      {
        num: '1',
        title: '下载桌面客户端',
        desc: '支持 Windows、macOS 和 Linux，桌面端提供完整的 P2P 能力。',
        link: '/download',
        linkText: '前往下载页',
      },
      {
        num: '2',
        title: '安装并运行',
        desc: '安装后打开应用，即可使用。',
      },
      {
        num: '3',
        title: '开始分享',
        desc: '发布文件生成 most:// 链接，朋友下载校验通过后也会成为新的种子。',
      },
    ],
  },
  {
    id: 'chat',
    title: 'P2P 聊天',
    subtitle: '频道加密通讯',
    icon: <MessageSquare size={28} />,
    path: '/chat/',
    requiresBackend: true,
    hero: '去中心化频道聊天',
    desc: '基于 Hypercore 的 P2P 加密即时通讯。创建频道，邀请朋友，端到端加密，无需服务器中转。',
    features: [
      'P2P 加密频道消息',
      '本地登录身份保护消息署名',
      '消息通过 Hyperswarm 网络同步',
      '离线消息自动同步',
      '无需中心化账号注册',
    ],
    steps: [
      {
        num: '1',
        title: '下载桌面客户端',
        desc: '支持 Windows、macOS 和 Linux。',
        link: '/download',
        linkText: '前往下载页',
      },
      { num: '2', title: '创建频道', desc: '输入任意频道名即可加入或创建。' },
      {
        num: '3',
        title: '开始聊天',
        desc: '发送消息，P2P 网络自动同步给所有在线节点。',
      },
    ],
  },
  {
    id: 'note',
    title: '笔记',
    subtitle: '加密云备份',
    icon: <NotebookPen size={28} />,
    path: '/note/',
    requiresBackend: false,
    hero: 'Web3 加密笔记',
    desc: '使用本地 Web3 密钥加密 Markdown 笔记，可在浏览器本地保存并按需同步到云端备份。',
    features: [
      'Markdown 块编辑器',
      '公开 / 私密笔记切换',
      '文件夹、搜索和移动',
      'Web3 登录态加密',
      '云端备份与恢复',
      '独立于 P2P 文件分享',
    ],
    steps: [
      {
        num: '1',
        title: '生成 Web3 账号',
        desc: '用用户名和密码派生本地密钥。',
      },
      {
        num: '2',
        title: '创建笔记',
        desc: '写 Markdown，按需切换为私密内容。',
      },
      {
        num: '3',
        title: '备份恢复',
        desc: '登录后可把加密笔记同步到云端。',
      },
    ],
  },
  {
    id: 'web3',
    title: 'Web3',
    subtitle: '账户工具箱',
    icon: <Wallet size={28} />,
    path: '/web3/',
    requiresBackend: false,
    hero: '确定性密钥派生工具箱',
    desc: '纯前端运行的 Web3 账户工具。输入用户名和密码，即可生成 Ed25519 / x25519 密钥对、助记词、以太坊地址，支持 PEM 导出和地址派生。',
    features: [
      '纯前端运行，无需后端',
      'Ed25519 / x25519 密钥对生成',
      'BIP-39 助记词派生',
      '以太坊地址与私钥导出',
      'PEM 格式密钥导出',
      '二维码展示地址与助记词',
    ],
    steps: [
      {
        num: '1',
        title: '输入用户名',
        desc: '用户名 + 密码（可选）作为种子。',
      },
      {
        num: '2',
        title: '查看密钥',
        desc: '即时生成 Ed25519、x25519 公钥与 IPNS ID。',
      },
      { num: '3', title: '导出使用', desc: '复制地址、导出 PEM、派生子地址。' },
    ],
  },
]

/* ─── Component ─── */
export default function FeaturePortal() {
  const hasBackend = useAppStore(s => s.hasBackend)
  const [selected, setSelected] = useState<string>('app')

  const activeFeature = features.find(f => f.id === selected) || features[0]

  return (
    <div className="portal-page">
      {/* Hero */}
      <section className="portal-hero">
        <div className="mkt-container">
          <h1 className="portal-hero-title">MOST PEOPLE</h1>
          <p className="portal-hero-subtitle">去中心化 P2P 工具箱</p>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="portal-cards-section">
        <div className="mkt-container">
          <div className="portal-cards">
            {features.map(f => {
              const isActive = selected === f.id
              const needsBackend = f.requiresBackend
              const backendStatus = needsBackend
                ? hasBackend === true
                  ? 'connected'
                  : hasBackend === false
                    ? 'disconnected'
                    : 'checking'
                : 'none'

              return (
                <button
                  key={f.id}
                  className={`portal-card ${isActive ? 'active' : ''}`}
                  onClick={() => setSelected(f.id)}
                >
                  <Link
                    href={f.path}
                    className="btn btn-icon portal-card-open-btn"
                    onClick={e => e.stopPropagation()}
                    title={`打开${f.title}`}
                  >
                    <ArrowUpRight size={16} />
                  </Link>
                  <div className="portal-card-icon">{f.icon}</div>
                  <div className="portal-card-title">{f.title}</div>
                  <div className="portal-card-subtitle">{f.subtitle}</div>
                  {needsBackend ? (
                    <div className={`portal-card-status ${backendStatus}`}>
                      {backendStatus === 'checking' && (
                        <>
                          <span className="status-dot checking" />
                          检测中
                        </>
                      )}
                      {backendStatus === 'connected' && (
                        <>
                          <span className="status-dot connected" />
                          已连接
                        </>
                      )}
                      {backendStatus === 'disconnected' && (
                        <>
                          <span className="status-dot disconnected" />
                          需下载
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="portal-card-status ready">
                      <span className="status-dot ready" />
                      已就绪
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Marketing Content */}
      <section className="portal-marketing">
        <div className="mkt-container">
          <div className="portal-marketing-inner">
            <>
              <div className="portal-marketing-header">
                <h2>{activeFeature.hero}</h2>
                <p>{activeFeature.desc}</p>
              </div>

              <div className="portal-marketing-features">
                {activeFeature.features.map((feat, i) => (
                  <div key={i} className="portal-feature-item">
                    <span className="portal-feature-icon">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <div className="portal-marketing-steps">
                {activeFeature.steps.map(step => (
                  <div key={step.num} className="portal-step">
                    <span className="portal-step-num">{step.num}</span>
                    <div className="portal-step-content">
                      <strong>{step.title}</strong>
                      <p>{step.desc}</p>
                      {step.code && (
                        <code className="portal-step-code">{step.code}</code>
                      )}
                      {step.link && (
                        <p className="portal-step-link">
                          <a
                            href={step.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {step.linkText} <ExternalLink size={12} />
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="portal-actions">
                <Link href={activeFeature.path} className="btn btn-primary">
                  进入 {activeFeature.title}
                  <ArrowRight size={16} />
                </Link>
                {activeFeature.requiresBackend && hasBackend === false && (
                  <Link href="/download" className="btn btn-secondary">
                    <Download size={16} />
                    下载桌面客户端
                  </Link>
                )}
              </div>
            </>
          </div>
        </div>
      </section>
    </div>
  )
}
