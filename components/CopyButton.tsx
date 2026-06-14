import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

interface CopyButtonProps {
  text: string
  label?: string
  copiedLabel?: string
  className?: string
  iconSize?: number
}

export function CopyButton({
  text,
  label,
  copiedLabel,
  className = 'btn btn-icon',
  iconSize = 14,
}: CopyButtonProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const resolvedCopiedLabel = copiedLabel || t('common.copied')
  const resolvedLabel = label || t('common.copy')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleCopy}
      title={copied ? resolvedCopiedLabel : resolvedLabel}
    >
      {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      {label ? (copied ? resolvedCopiedLabel : label) : null}
    </button>
  )
}
