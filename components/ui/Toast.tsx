import React, { useEffect } from 'react'

export function Toast({ message, type, onDone, index }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [])
  const stackIndex = Math.min(Math.max(index, 0), 5)
  return (
    <div className={`toast ${type} toast-stack-${stackIndex}`}>{message}</div>
  )
}
