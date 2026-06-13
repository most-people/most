import React, { useEffect } from 'react'
import { useI18n } from '~/lib/i18n'

export function Toast({ message, type, onDone, index }) {
  const { t } = useI18n()

  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [])
  const stackIndex = Math.min(Math.max(index, 0), 5)
  return (
    <div className={`toast ${type} toast-stack-${stackIndex}`}>
      {t(message)}
    </div>
  )
}
