import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'
import { ModalOverlay } from '~/components/ui'
import RemoteNodeConnectPanel from '~/components/RemoteNodeConnectPanel'
import { useI18n } from '~/lib/i18n'

export default function ConnectModal() {
  const showConnectModal = useAppStore(s => s.showConnectModal)
  const closeConnectModal = useAppStore(s => s.closeConnectModal)
  const { t } = useI18n()

  if (!showConnectModal) return null

  const modal = (
    <ModalOverlay onClose={closeConnectModal}>
      <div className="connect-modal">
        <div className="connect-modal-header">
          <h3>{t('connectModal.title')}</h3>
          <button
            className="connect-modal-close"
            onClick={closeConnectModal}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="connect-modal-body">
          <RemoteNodeConnectPanel variant="drawer" />
        </div>
      </div>
    </ModalOverlay>
  )

  return createPortal(modal, document.body)
}
