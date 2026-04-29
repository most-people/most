import '~/styles/marketing.css'
import '~/styles/download.css'
import Link from 'next/link'
import { ArrowLeft, Download, Monitor, Apple, Laptop } from 'lucide-react'

export const metadata = {
  title: '下载 MostBox 桌面客户端',
  description: '下载 MostBox 桌面客户端，获得完整的 P2P 文件分享和聊天功能',
}

const platforms = [
  {
    name: 'Windows',
    icon: <Monitor size={32} />,
    ext: '.exe',
    desc: 'Windows 10 或更高版本',
    link: '#',
  },
  {
    name: 'macOS',
    icon: <Apple size={32} />,
    ext: '.dmg',
    desc: 'macOS 12 Monterey 或更高版本',
    link: '#',
  },
  {
    name: 'Linux',
    icon: <Laptop size={32} />,
    ext: '.AppImage',
    desc: 'Ubuntu 20.04+ / Debian 11+ / 其他主流发行版',
    link: '#',
  },
]

const webVsDesktop = [
  { feature: 'P2P 文件分享', web: '仅展示', desktop: '完整' },
  { feature: 'P2P 加密聊天', web: '仅展示', desktop: '完整' },
  { feature: '文件存储', web: '不支持', desktop: '持久化存储' },
  { feature: '离线消息', web: '不支持', desktop: '支持' },
  { feature: '大文件传输', web: '不支持', desktop: '无限制' },
]

export default function DownloadPage() {
  return (
    <div className="download-page">
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link href="/" className="mkt-nav-logo">
            <ArrowLeft size={18} />
            <span>MOST PEOPLE</span>
          </Link>
        </div>
      </nav>

      <section className="download-hero">
        <div className="mkt-container">
          <div className="download-hero-icon">
            <Download size={40} />
          </div>
          <h1 className="download-hero-title">下载桌面客户端</h1>
          <p className="download-hero-desc">
            Web 端仅用于界面展示，所有数据均为模拟。下载桌面客户端，获得完整的
            P2P 文件分享和加密聊天体验。
          </p>
        </div>
      </section>

      <section className="download-platforms">
        <div className="mkt-container">
          <h2 className="download-section-title">选择你的平台</h2>
          <div className="download-platform-grid">
            {platforms.map(p => (
              <a key={p.name} href={p.link} className="download-platform-card">
                <div className="download-platform-icon">{p.icon}</div>
                <h3>{p.name}</h3>
                <p>{p.desc}</p>
                <span className="download-platform-btn">
                  <Download size={16} />
                  下载 {p.ext}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="download-comparison">
        <div className="mkt-container">
          <h2 className="download-section-title">Web 端 vs 桌面端</h2>
          <div className="download-table-wrap">
            <table className="download-table">
              <thead>
                <tr>
                  <th>功能</th>
                  <th>Web 端</th>
                  <th>桌面端</th>
                </tr>
              </thead>
              <tbody>
                {webVsDesktop.map(row => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td className="col-web">{row.web}</td>
                    <td className="col-desktop">{row.desktop}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="download-cta">
        <div className="mkt-container">
          <p className="download-cta-desc">
            数据完全本地存储，无需上传到任何服务器。
          </p>
          <Link href="/" className="mkt-btn-primary">
            返回首页
          </Link>
        </div>
      </section>

      <footer className="mkt-footer">
        <div className="mkt-container">
          <div className="mkt-footer-inner">
            <div className="mkt-footer-links">
              <Link href="/docs">文档</Link>
              <Link href="/changelog">更新日志</Link>
            </div>
            <p className="mkt-footer-copy">MostBox 0.0.5</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
