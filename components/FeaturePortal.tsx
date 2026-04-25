'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FolderOpen,
  MessageSquare,
  Wallet,
  ArrowRight,
  ArrowUpRight,
  Zap,
  Check,
  ExternalLink,
  ArrowLeft,
  Ticket,
} from 'lucide-react'
import BackendGuidePanel from '~/components/BackendGuidePanel'
import {
  setBackendUrl,
  checkBackendConnection,
  getBackendUrlExport,
  detectSameOriginBackend,
  detectLocalhostBackend,
} from '~/server/src/utils/api'

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
    desc: '基于 Hyperswarm 的去中心化文件传输，让文件分享回归点对点。不限速、不限量、不追踪。',
    features: [
      '无需注册，打开浏览器即用',
      'Hyperswarm P2P 直连传输',
      'GB 级大文件流式处理',
      '相同文件 = 相同 CID，链接永久有效',
      '频道加密聊天，实时通讯',
      'MIT 开源，数据完全自主掌控',
    ],
    steps: [
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
      {
        num: '3',
        title: '开始分享',
        desc: '上传文件，复制链接，发给朋友即可。',
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
      '匿名 / 实名身份切换',
      '消息通过 Hyperswarm 网络同步',
      '离线消息自动同步',
      '无需注册即可使用',
    ],
    steps: [
      {
        num: '1',
        title: '启动 MostBox',
        desc: '运行后端服务',
        code: 'npx most-box@latest',
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
  {
    id: 'lottery',
    title: '彩票',
    subtitle: '去中心化彩票协议',
    icon: <Ticket size={28} />,
    path: '/lottery/',
    requiresBackend: false,
    hero: '完全链上、可验证、公平的彩票协议',
    desc: '基于智能合约的去中心化彩票系统。固定票价 1 USDC，多奖项分级，开奖结果完全由链上随机数决定，无人可操控。',
    features: [
      '固定票价 1 USDC，简单透明',
      '多奖项分级：一等奖 50%、二等奖 10%、三等奖 5%、参与奖 35%',
      'Chainlink VRF 提供可验证随机数',
      '完全链上执行，无托管风险',
      '所有结果公开可验证',
      '部署在 Base 链，低 gas 成本',
    ],
    steps: [
      {
        num: '1',
        title: '连接钱包',
        desc: '使用 MetaMask 或其他兼容钱包连接。',
      },
      {
        num: '2',
        title: '购买彩票',
        desc: '选择数量，确认购买，每张 1 USDC。',
      },
      {
        num: '3',
        title: '等待开奖',
        desc: '倒计时结束后自动开奖，奖金自动发放。',
      },
    ],
  },
]

/* ─── Component ─── */
export default function FeaturePortal() {
  const [selected, setSelected] = useState<string>('app')
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    async function detect() {
      const sameOrigin = await detectSameOriginBackend()
      if (sameOrigin) {
        setBackendUrl('')
        setBackendConnected(true)
        setChecking(false)
        return
      }
      const localhost = await detectLocalhostBackend()
      if (localhost) {
        setBackendUrl('http://localhost:1976')
        setBackendConnected(true)
        setChecking(false)
        return
      }
      setBackendConnected(false)
      setChecking(false)
    }
    detect()
  }, [])

  const activeFeature = features.find(f => f.id === selected) || features[0]
  const needsBackendAndDisconnected =
    activeFeature.requiresBackend && backendConnected === false

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
              const backendStatus = checking
                ? 'checking'
                : needsBackend
                  ? backendConnected
                    ? 'connected'
                    : 'disconnected'
                  : 'none'

              return (
                <button
                  key={f.id}
                  className={`portal-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSelected(f.id)
                    setShowGuide(false)
                  }}
                >
                  <Link
                    href={f.path}
                    className="portal-card-open-btn"
                    onClick={e => e.stopPropagation()}
                    title={`打开${f.title}`}
                  >
                    <ArrowUpRight size={16} />
                  </Link>
                  <div className="portal-card-icon">{f.icon}</div>
                  <div className="portal-card-title">{f.title}</div>
                  <div className="portal-card-subtitle">{f.subtitle}</div>
                  {needsBackend && (
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
                          需后端
                        </>
                      )}
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
            {showGuide && needsBackendAndDisconnected ? (
              <BackendGuidePanel
                featureName={activeFeature.title}
                onBack={() => setShowGuide(false)}
              />
            ) : (
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
                  <Link href={activeFeature.path} className="mkt-btn-primary">
                    进入 {activeFeature.title}
                    <ArrowRight size={16} />
                  </Link>
                  {activeFeature.requiresBackend &&
                    backendConnected === false && (
                      <button
                        className="mkt-btn-secondary"
                        onClick={() => setShowGuide(true)}
                      >
                        <Zap size={16} />
                        连接后端
                      </button>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
