import { Link } from '@tanstack/react-router'
import packageJson from '../../package.json'
import { useI18n } from '~/lib/i18n'

const footerLinks = [
  { to: '/about/', labelKey: 'footer.about' },
  { to: '/ping/', labelKey: 'footer.network' },
  {
    href: 'https://github.com/most-people/most',
    labelKey: null,
    label: 'GitHub',
    external: true,
  },
] as const

const version = packageJson.version

export function Footer() {
  const { t } = useI18n()

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
                  {t(link.labelKey)}
                </Link>
              )
            )}
          </div>
          <span className="mkt-footer-copy">
            © {new Date().getFullYear()} MOST PEOPLE · MIT License
          </span>
          <span className="mkt-footer-build" translate="no">
            v{version}
          </span>
        </div>
      </div>
    </footer>
  )
}
