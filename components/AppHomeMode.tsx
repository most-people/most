import Link from 'next/link'

function LogoIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="var(--accent)" opacity="0.4" />
      <rect x="14" y="2" width="8" height="8" rx="2" fill="var(--accent)" opacity="0.7" />
      <rect x="2" y="14" width="8" height="8" rx="2" fill="var(--accent)" opacity="0.7" />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="var(--accent)" />
    </svg>
  )
}

export default function AppHomeMode({ nodeId }: { nodeId: string }) {
  const shortId = nodeId ? nodeId.slice(0, 8) : ''

  return (
    <div className="app-home">
      <div className="app-home-card">
        <LogoIcon size={56} />
        <h1>MostBox</h1>
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
