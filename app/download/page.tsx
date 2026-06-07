import '~/styles/marketing.css'
import '~/styles/download.css'
import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import DownloadOptions from '~/components/DownloadOptions'

export const metadata = {
  title: '下载 MostBox 桌面客户端',
  description:
    '下载 MostBox 桌面客户端，获得完整的 P2P 文件分享、下载校验和持续做种能力',
}

const webVsDesktop = [
  { feature: '节点能力', web: '连接已有节点', desktop: '内置本地节点' },
  { feature: 'P2P 文件分享', web: '依赖所连节点', desktop: '完整支持' },
  { feature: '下载校验', web: '依赖所连节点', desktop: '完整支持' },
  { feature: '持续做种', web: '依赖所连节点', desktop: '默认开启' },
  { feature: '大文件传输', web: '依赖所连节点', desktop: '10GB 上限内' },
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
            桌面客户端是当前 MVP 的首选入口，内置本地 P2P
            节点，提供发布、下载校验和持续做种的完整能力。Web
            端只连接已有 MostBox 节点。
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
            {
              '桌面端无需单独安装 Node.js；npm 入口请使用 Node.js >= 22.12 运行 npx most-box@latest。'
            }
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
