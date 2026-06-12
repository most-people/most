import { Link } from '@tanstack/react-router'

const footerLinks = [
  { to: '/', label: '关于' },
  { to: '/ping/', label: '网络' },
  {
    href: 'https://github.com/most-people/most',
    label: 'GitHub',
    external: true,
  },
] as const

export function Footer() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-inner">
          <div className="mkt-footer-links">
            {footerLinks.map(link =>
              'external' in link ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              ) : (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              )
            )}
          </div>
          <span className="mkt-footer-copy">
            © {new Date().getFullYear()} MOST PEOPLE · MIT License
          </span>
        </div>
      </div>
    </footer>
  )
}
