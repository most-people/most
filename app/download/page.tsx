import '~/styles/marketing.css'
import '~/styles/download.css'
import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import DownloadOptions from '~/components/DownloadOptions'

export const metadata = {
  title: '下载 MostBox 桌面客户端',
  description: '下载 MostBox 桌面客户端，获得完整的 P2P 文件分享和聊天功能',
}

const webVsDesktop = [
  { feature: 'P2P 文件分享', web: '仅展示', desktop: '完整' },
  { feature: 'P2P 加密聊天', web: '仅展示', desktop: '完整' },
  { feature: '文件存储', web: '不支持', desktop: '持久化存储' },
  { feature: '离线消息', web: '不支持', desktop: '支持' },
  { feature: '大文件传输', web: '不支持', desktop: '10GB 上限内' },
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
            Web 端可连接已有 MostBox 节点；桌面客户端内置本地 P2P
            节点，提供发布、下载校验和持续做种的最佳体验。
          </p>
        </div>
      </section>

      <section className="download-platforms">
        <div className="mkt-container">
          <h2 className="download-section-title">选择你的平台</h2>
          <DownloadOptions />
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
          <Link href="/" className="btn btn-primary">
            返回首页
          </Link>
        </div>
      </section>

      <footer className="mkt-footer">
        <div className="mkt-container">
          <div className="mkt-footer-inner">
            <p className="mkt-footer-copy">MostBox</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
