import { useState } from 'react'
import { Platform, Text, View, StyleSheet } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useBackgroundService } from '../../mobileCore/backgroundService'
import { useI18n } from '../../i18n'
import { useFeedback } from '../../ui/feedback'
import { MostButton } from '../../ui/components'
import { useMostBoxTheme } from '../../ui/theme'
import { PRODUCT_PROFILE } from '../../product/productProfile'

type BackgroundServicePanelProps = {
  localReady: boolean
}

export function BackgroundServicePanel({
  localReady,
}: BackgroundServicePanelProps) {
  const background = useBackgroundService()
  const { t } = useI18n()
  const { toast } = useFeedback()
  const theme = useMostBoxTheme()
  const [busy, setBusy] = useState(false)
  if (!background.available || !PRODUCT_PROFILE.features.backgroundSeeding)
    return null
  const toggle = async () => {
    setBusy(true)
    try {
      if (background.running) await background.stop()
      else {
        if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
          const permission = await Notifications.requestPermissionsAsync()
          if (!permission.granted) {
            toast(t('node.background.permission'), 'error')
            return
          }
        }
        await background.start(
          t('node.background.title'),
          t('node.background.notification'),
          t('node.background.stop')
        )
      }
    } catch {
      toast(t('node.background.failed'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={theme.mode === 'dark' ? styles.dark : styles.light}>
        {t('node.background.description')}
      </Text>
      <MostButton
        disabled={busy || (!localReady && !background.running)}
        onPress={() => void toggle()}
      >
        {t(
          background.running ? 'node.background.stop' : 'node.background.start'
        )}
      </MostButton>
    </View>
  )
}
const styles = StyleSheet.create({
  panel: { gap: 10, marginTop: 12 },
  light: { color: '#475569', fontSize: 13 },
  dark: { color: '#CBD5E1', fontSize: 13 },
})
