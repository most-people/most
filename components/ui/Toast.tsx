'use client'

import React, { useEffect } from 'react'

export function Toast({ message, type, onDone, index }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      className={`toast ${type}`}
      style={{ bottom: 24 + index * 60 }}
    >
      {message}
    </div>
  )
}
