import Link from 'next/link'

const footerLinks = [
  { href: '/docs/getting-started/', label: '文档' },
  { href: '/changelog/', label: '更新日志' },
  { href: 'https://github.com/most-people/most', label: 'GitHub', external: true },
]

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-links">
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
          <span className="footer-copy">
            © {new Date().getFullYear()} MostBox · MIT License
          </span>
        </div>
      </div>
    </footer>
  )
}