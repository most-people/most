import Link from 'next/link'

function LogoIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="var(--color-accent)" opacity="0.4" />
      <rect x="14" y="2" width="8" height="8" rx="2" fill="var(--color-accent)" opacity="0.7" />
      <rect x="2" y="14" width="8" height="8" rx="2" fill="var(--color-accent)" opacity="0.7" />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="var(--color-accent)" />
    </svg>
  )
}

export default function AppHomeMode({ nodeId }: { nodeId: string }) {
  const shortId = nodeId ? nodeId.slice(0, 8) : ''

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100dvh - 64px - 80px)',
      textAlign: 'center',
      fontFamily: 'var(--font-mono)',
      padding: '0 24px',
    }}>
      <LogoIcon size={56} />
      <h1 style={{
        fontSize: 40,
        fontWeight: 700,
        letterSpacing: -0.03,
        marginTop: 16,
        marginBottom: 8,
      }}>
        MostBox
      </h1>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 9999,
        background: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
        marginBottom: 24,
      }}>
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--color-success)',
          flexShrink: 0,
        }} />
        节点在线{shortId ? ` · ${shortId}` : ''}
      </div>
      <p style={{
        fontSize: 16,
        color: 'var(--color-text-secondary)',
        maxWidth: '40ch',
        lineHeight: 1.6,
        marginBottom: 32,
      }}>
        P2P 文件分享服务已就绪，进入文件管理开始使用。
      </p>
      <Link
        href="/app/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 600,
          color: '#fff',
          background: 'var(--color-accent)',
          borderRadius: 12,
          textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
          transition: 'background 0.15s ease',
        }}
      >
        打开文件管理 →
      </Link>
      <Link
        href="/app/chat/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
          marginTop: 12,
          transition: 'all 0.15s ease',
        }}
      >
        频道聊天
      </Link>
    </div>
  )
}