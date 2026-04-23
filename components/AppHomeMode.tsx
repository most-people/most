import Link from 'next/link'
import { LogoIcon } from './icons/LogoIcon'

export default function AppHomeMode({ nodeId }: { nodeId: string }) {
  const shortId = nodeId ? nodeId.slice(0, 8) : ''

  return (
    <div className="app-home">
      <div className="app-home-card">
        <LogoIcon size={56} />
        <h1>MOST.BOX</h1>
        <div className="app-home-badge">
          <span className="badge-dot" />
          节点在线{shortId ? ` · ${shortId}` : ''}
        </div>
        <p>P2P 文件分享服务已就绪，进入文件管理开始使用。</p>
        <Link href="/app/" className="app-home-btn primary">
          打开文件管理 →
        </Link>
        <Link href="/app/chat/" className="app-home-btn secondary">
          频道聊天
        </Link>
      </div>
    </div>
  )
}
