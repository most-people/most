import { RefreshCw } from 'lucide-react'

import { useDesktopUpdate } from '~/hooks'
import { useI18n } from '~/lib/i18n'

export function DesktopUpdateButton() {
  const { t } = useI18n()
  const { state, installAndRestart } = useDesktopUpdate()
  const isInstalling = state.status === 'installing'

  if (state.status !== 'downloaded' && !isInstalling) return null

  return (
    <button
      type="button"
      className="btn btn-primary desktop-update-button"
      disabled={isInstalling}
      title={t('desktopUpdate.readyTitle', {
        version: state.version || state.filename,
      })}
      onClick={() => {
        void installAndRestart()
      }}
    >
      <RefreshCw size={16} />
      {isInstalling
        ? t('desktopUpdate.installing')
        : t('desktopUpdate.install')}
    </button>
  )
}
