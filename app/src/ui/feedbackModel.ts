export function runFeedbackAction(dismiss: () => void, action?: () => void) {
  dismiss()
  action?.()
}
