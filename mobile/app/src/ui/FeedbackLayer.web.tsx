import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { StyleSheet, View } from 'react-native'
import type { FeedbackLayerProps } from './feedbackLayerTypes'

export function FeedbackLayer({
  children,
  onRequestClose,
  visible,
}: FeedbackLayerProps) {
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onRequestClose, visible])

  if (!visible || typeof document === 'undefined') return null

  return createPortal(
    <View pointerEvents="box-none" style={styles.layer}>
      {children}
    </View>,
    document.body
  )
}

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    position: 'fixed' as never,
    right: 0,
    top: 0,
    zIndex: 2147483647,
  },
})
