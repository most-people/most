import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as FileSystem from 'expo-file-system/legacy'

const CHANNEL_ID = 'mostbox-chat-messages'
const notificationIds = new Set<string>()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: AppState.currentState !== 'active',
    shouldShowList: AppState.currentState !== 'active',
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

function preferenceUri() {
  if (!FileSystem.documentDirectory)
    throw new Error('Notification preferences are unavailable')
  return `${FileSystem.documentDirectory}mostbox-chat-notifications.json`
}

export async function loadChatNotificationPreference() {
  try {
    const value: unknown = JSON.parse(
      await FileSystem.readAsStringAsync(preferenceUri())
    )
    return Boolean(
      value &&
      typeof value === 'object' &&
      'enabled' in value &&
      value.enabled === true
    )
  } catch {
    return false
  }
}

export async function saveChatNotificationPreference(enabled: boolean) {
  await FileSystem.writeAsStringAsync(
    preferenceUri(),
    JSON.stringify({ enabled })
  )
}

export async function hasChatNotificationPermission() {
  const permission = await Notifications.getPermissionsAsync()
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  )
}

export async function requestChatNotificationPermission(name: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
  }
  if (await hasChatNotificationPermission()) return true
  const permission = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  })
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  )
}

export async function showChatNotification(input: {
  scope: string
  channel: string
  title: string
  body: string
  shouldPresent: () => boolean
}) {
  const identifier = `mostbox-chat:${encodeURIComponent(input.scope)}:${encodeURIComponent(input.channel)}`
  // Replacing one notification per conversation keeps bursts from filling the tray.
  await Notifications.dismissNotificationAsync(identifier)
  if (!input.shouldPresent()) return
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: input.title,
      body: input.body,
      data: {
        kind: 'mostbox-chat',
        scope: input.scope,
        channel: input.channel,
      },
      sound: false,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  })
  notificationIds.add(identifier)
  if (!input.shouldPresent()) {
    await Notifications.dismissNotificationAsync(identifier)
    notificationIds.delete(identifier)
  }
}

export async function dismissChatNotifications() {
  const presented = await Notifications.getPresentedNotificationsAsync()
  const ids = new Set([
    ...notificationIds,
    ...presented
      .filter(item => item.request.content.data?.kind === 'mostbox-chat')
      .map(item => item.request.identifier),
  ])
  await Promise.all(
    [...ids].map(id => Notifications.dismissNotificationAsync(id))
  )
  notificationIds.clear()
}

export function watchChatNotificationOpens(onOpen: (data: unknown) => void) {
  const handle = (response: Notifications.NotificationResponse) => {
    onOpen(response.notification.request.content.data)
    void Notifications.clearLastNotificationResponseAsync().catch(() => {})
  }
  const subscription =
    Notifications.addNotificationResponseReceivedListener(handle)
  const previous = Notifications.getLastNotificationResponse()
  if (previous) handle(previous)
  return () => subscription.remove()
}
