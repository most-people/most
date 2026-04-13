import Link from 'next/link'

const footerLinks = [
  { href: '/', label: '关于' },
  { href: '/docs/getting-started/', label: '文档' },
  { href: '/changelog/', label: '更新日志' },
  { href: 'https://github.com/most-people/most', label: 'GitHub', external: true },
]

export function Footer() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-inner">
          <div className="mkt-footer-links">
            {footerLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <span className="mkt-footer-copy">
            © {new Date().getFullYear()} MostBox · MIT License
          </span>
        </div>
      </div>
    </footer>
  )
}