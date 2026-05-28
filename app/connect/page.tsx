import '~/styles/marketing.css'
import '~/styles/connect.css'

import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FolderOpen,
  HardDrive,
  Server,
} from 'lucide-react'
import RemoteNodeConnectPanel from '~/components/RemoteNodeConnectPanel'

export const metadata = {
  title: '连接 MostBox 节点',
  description: '连接远程 MostBox 节点，使用 P2P 文件分享与聊天功能',
}

export default function ConnectPage() {
  return (
    <div className="connect-page">
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link href="/" className="mkt-nav-logo">
            <ArrowLeft size={18} />
            <span>MOST PEOPLE</span>
          </Link>
        </div>
      </nav>

      <main className="connect-main">
        <section className="connect-hero">
          <div className="mkt-container">
            <div className="connect-hero-icon">
              <Server size={40} />
            </div>
            <h1 className="connect-hero-title">连接节点</h1>
            <p className="connect-hero-desc">
              连接你信任的 MostBox 远程节点，或回到本地
              daemon。远程节点需要节点地址和邀请码。
            </p>
          </div>
        </section>

        <section className="connect-content">
          <div className="mkt-container">
            <div className="connect-grid">
              <div className="connect-tool-panel">
                <RemoteNodeConnectPanel />
              </div>

              <aside className="connect-side-panel" aria-label="相关入口">
                <h2>相关入口</h2>
                <div className="connect-link-list">
                  <Link href="/admin" className="connect-link-row">
                    <HardDrive size={18} />
                    <span>
                      <strong>节点管理</strong>
                      <small>查看本地 daemon、做种和日志</small>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                  <Link href="/app/" className="connect-link-row">
                    <FolderOpen size={18} />
                    <span>
                      <strong>进入 MostBox</strong>
                      <small>发布、下载和管理文件</small>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                  <Link href="/download" className="connect-link-row">
                    <Download size={18} />
                    <span>
                      <strong>下载客户端</strong>
                      <small>安装完整 P2P 能力</small>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
