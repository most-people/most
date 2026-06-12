import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

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
  copiedLabel = '已复制',
  className = 'btn btn-icon',
  iconSize = 14,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

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
      title={copied ? copiedLabel : label || '复制'}
    >
      {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      {label ? (copied ? copiedLabel : label) : null}
    </button>
  )
}
