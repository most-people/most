import { Modal, StyleSheet, View } from 'react-native'
import type { FeedbackLayerProps } from './feedbackLayerTypes'

export function FeedbackLayer({
  children,
  modal = true,
  onRequestClose,
  visible,
}: FeedbackLayerProps) {
  if (!modal) {
    if (!visible) return null
    return <View style={styles.inlineLayer}>{children}</View>
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      {children}
    </Modal>
  )
}

const styles = StyleSheet.create({
  inlineLayer: {
    pointerEvents: 'box-none',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
})
