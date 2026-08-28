import { Modal } from 'react-native'
import type { FeedbackLayerProps } from './feedbackLayerTypes'

export function FeedbackLayer({
  children,
  onRequestClose,
  visible,
}: FeedbackLayerProps) {
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
