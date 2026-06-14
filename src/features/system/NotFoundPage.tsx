import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Compass, Home } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

export default function NotFound() {
  const navigate = useNavigate()
  const { t } = useI18n()

  function goBack() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    navigate({ to: '/' })
  }

  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon">
          <Compass size={48} strokeWidth={1.5} />
        </div>
        <h1 className="not-found-title">{t('notFound.title')}</h1>
        <p className="not-found-desc">
          {t('notFound.desc')}
        </p>
        <div className="not-found-actions">
          <button onClick={goBack} className="btn btn-secondary">
            <ArrowLeft size={16} />
            {t('common.back')}
          </button>
          <Link to="/" className="btn btn-primary">
            <Home size={16} />
            {t('common.backHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}
