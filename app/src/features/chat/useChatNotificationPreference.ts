import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking } from 'react-native'
import { useI18n } from '../../i18n'
import { useFeedback } from '../../ui/feedback'
import {
  dismissChatNotifications,
  hasChatNotificationPermission,
  loadChatNotificationPreference,
  requestChatNotificationPermission,
  saveChatNotificationPreference,
} from './chatNotifications'

export function useChatNotificationPreference() {
  const { t } = useI18n()
  const { alert, toast } = useFeedback()
  const [enabled, setEnabled] = useState(false)
  const [permissionAllowed, setPermissionAllowed] = useState(false)
  const [ready, setReady] = useState(false)
  const [working, setWorking] = useState(false)
  const preferenceRef = useRef(false)
  useEffect(() => {
    let running = true
    const refresh = async () => {
      const allowed =
        preferenceRef.current && (await hasChatNotificationPermission())
      if (running) setPermissionAllowed(allowed)
    }
    void loadChatNotificationPreference()
      .then(async preference => {
        preferenceRef.current = preference
        if (running) setEnabled(preference)
        await refresh()
        if (running) setReady(true)
      })
      .catch(() => {
        if (running) setReady(true)
      })
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh().catch(() => {})
    })
    return () => {
      running = false
      subscription.remove()
    }
  }, [])
  const toggle = useCallback(async () => {
    if (!ready || working) return
    setWorking(true)
    try {
      const next = !enabled
      if (
        next &&
        !(await requestChatNotificationPermission(
          t('chat.notifications.title')
        ))
      ) {
        alert(
          t('chat.notifications.title'),
          t('chat.notifications.permissionDenied'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('chat.notifications.openSettings'),
              onPress: () => {
                void Linking.openSettings().catch(() => {})
              },
            },
          ]
        )
        return
      }
      await saveChatNotificationPreference(next)
      preferenceRef.current = next
      setEnabled(next)
      if (next) setPermissionAllowed(true)
      if (!next) await dismissChatNotifications().catch(() => {})
    } catch {
      toast(t('chat.notifications.failed'), 'error')
    } finally {
      setWorking(false)
    }
  }, [ready, working, enabled, alert, toast, t])
  return { enabled, permissionAllowed, ready, working, toggle }
}
