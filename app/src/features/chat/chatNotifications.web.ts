// Web does not request native notification permissions or register a push service.
export async function loadChatNotificationPreference() {
  return false
}
export async function saveChatNotificationPreference(_enabled: boolean) {}
export async function hasChatNotificationPermission() {
  return false
}
export async function requestChatNotificationPermission(_name: string) {
  return false
}
export async function showChatNotification(_input: {
  scope: string
  channel: string
  title: string
  body: string
  shouldPresent: () => boolean
}) {}
export async function dismissChatNotifications() {}
export function watchChatNotificationOpens(_onOpen: (data: unknown) => void) {
  return () => {}
}
