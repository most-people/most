import type { ReactNode } from 'react'

export type FeedbackLayerProps = {
  children: ReactNode
  onRequestClose: () => void
  visible: boolean
}
