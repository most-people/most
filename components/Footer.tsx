import Link from '~/lib/routerCompat'

const footerLinks = [
  { href: '/', label: '关于' },
  { href: '/ping/', label: '网络' },
  {
    href: 'https://github.com/most-people/most',
    label: 'GitHub',
    external: true,
  },
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
                {...(link.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <span className="mkt-footer-copy">
            © {new Date().getFullYear()} MOST PEOPLE · MIT License
          </span>
        </div>
      </div>
    </footer>
  )
}
