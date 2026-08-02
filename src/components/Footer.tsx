import { Link } from '@tanstack/react-router'
import packageJson from '../../package.json'
import { useI18n } from '~/lib/i18n'

const footerLinks = [
  { to: '/about/', labelKey: 'footer.about' },
  { to: '/docs/', labelKey: 'footer.docs' },
  { to: '/ping/', labelKey: 'footer.network' },
] as const

const version = packageJson.version

export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-inner">
          <div className="mkt-footer-links">
            {footerLinks.map(link => (
              <Link key={link.to} to={link.to}>
                {t(link.labelKey)}
              </Link>
            ))}
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
