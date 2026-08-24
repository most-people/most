import { Link } from '@tanstack/react-router'
import packageJson from '../../package.json'
import { useI18n } from '~/lib/i18n'
import { useAppStore } from '~/stores/useAppStore'

const footerLinks = [
  { to: '/about/', labelKey: 'footer.about' },
  { to: '/docs/', labelKey: 'footer.docs' },
  { to: '/ping/', labelKey: 'footer.network' },
] as const

const version = packageJson.version

type FooterBackendStatus = 'checking' | 'connected' | 'disconnected'

function getFooterBackendStatus(hasBackend: boolean | null) {
  if (hasBackend === true) return 'connected'
  if (hasBackend === false) return 'disconnected'
  return 'checking'
}

function formatBackendHost(backendUrl: string) {
  try {
    return new URL(backendUrl).host
  } catch {
    return ''
  }
}

export function Footer() {
  const hasBackend = useAppStore(state => state.hasBackend)
  const activeBackendUrl = useAppStore(state => state.activeBackendUrl)
  const { t } = useI18n()
  const backendStatus: FooterBackendStatus = getFooterBackendStatus(hasBackend)
  const connectedNodeHost = formatBackendHost(activeBackendUrl)
  const backendStatusLabel =
    backendStatus === 'connected'
      ? connectedNodeHost || t('common.status.connected')
      : backendStatus === 'disconnected'
        ? t('common.status.needsConnection')
        : t('common.status.checking')
  const backendStatusAriaLabel =
    backendStatus === 'connected' && connectedNodeHost
      ? `${t('common.status.connected')}: ${connectedNodeHost}`
      : backendStatusLabel

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
          <div className="mkt-footer-meta">
            <span
              className={`mkt-footer-node-status ${backendStatus}`}
              aria-label={backendStatusAriaLabel}
            >
              <span
                className={`status-dot ${backendStatus}`}
                aria-hidden="true"
              />
              <span
                className="mkt-footer-node-status-label"
                translate={connectedNodeHost ? 'no' : undefined}
              >
                {backendStatusLabel}
              </span>
            </span>
            <span className="mkt-footer-build" translate="no">
              v{version}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
