import type { ReactNode } from 'react'

export type FeedbackLayerProps = {
  children: ReactNode
  modal?: boolean
  onRequestClose: () => void
  visible: boolean
}
