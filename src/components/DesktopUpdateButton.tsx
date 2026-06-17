import { RefreshCw } from 'lucide-react'

import { useDesktopUpdate } from '~/hooks'
import { useI18n } from '~/lib/i18n'

export function DesktopUpdateButton() {
  const { t } = useI18n()
  const { state, installAndRestart } = useDesktopUpdate()
  const isChecking = state.status === 'checking'
  const isDownloading = state.status === 'downloading'
  const isDownloaded = state.status === 'downloaded'
  const isInstalling = state.status === 'installing'
  const isBusy = isChecking || isDownloading || isInstalling

  if (!isChecking && !isDownloading && !isDownloaded && !isInstalling) {
    return null
  }

  let label = t('desktopUpdate.install')
  if (isChecking) {
    label = t('desktopUpdate.checking')
  } else if (isDownloading) {
    label =
      state.progress > 0
        ? t('desktopUpdate.downloadingProgress', {
            progress: state.progress,
          })
        : t('desktopUpdate.downloading')
  } else if (isInstalling) {
    label = t('desktopUpdate.installing')
  }

  const title =
    isChecking || isDownloading
      ? t('desktopUpdate.downloadingTitle')
      : t('desktopUpdate.readyTitle', {
          version: state.version || state.filename,
        })

  return (
    <button
      type="button"
      className={`btn ${
        isDownloaded || isInstalling ? 'btn-primary' : 'btn-secondary'
      } desktop-update-button`}
      disabled={!isDownloaded || isInstalling}
      title={title}
      aria-live={isBusy ? 'polite' : undefined}
      onClick={() => {
        if (!isDownloaded) return
        void installAndRestart()
      }}
    >
      <RefreshCw size={16} className={isBusy ? 'spin' : undefined} />
      {label}
    </button>
  )
}
