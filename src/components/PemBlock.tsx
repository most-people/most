import { Download } from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import { useI18n } from '~/lib/i18n'

interface PemBlockProps {
  label: string
  pem: string
  filename: string
}

export function PemBlock({ label, pem, filename }: PemBlockProps) {
  const { t } = useI18n()

  function handleDownload() {
    const blob = new Blob([pem], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="web3-pem-block ui-glass-surface">
      <div className="web3-pem-header">
        <span className="web3-pem-label">{label}</span>
        <div className="web3-pem-actions">
          <CopyButton
            text={pem}
            label={t('common.copy')}
            className="btn btn-sm"
            iconSize={14}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleDownload}
            title={t('common.download')}
          >
            <Download size={14} />
            {t('common.download')}
          </button>
        </div>
      </div>
      <textarea
        className="textarea mono"
        value={pem}
        readOnly
        rows={6}
        translate="no"
      />
    </div>
  )
}
