import { useState } from 'react'
import {
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { Copy, Share2 } from 'lucide-react-native'
import { useI18n } from '../../i18n'
import { BottomSheetCard, MostButton } from '../../ui/components'
import { useMostBoxTheme } from '../../ui/theme'
import type { JoinedChannel } from './conversationModel'

type ChannelShareSheetProps = {
  channel: JoinedChannel
  onClose: () => void
}

export function ChannelShareSheet({
  channel,
  onClose,
}: ChannelShareSheetProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = createStyles(theme.colors)
  const [working, setWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const name = `#${channel.name}`
  const run = async (share: boolean) => {
    if (working) return
    setWorking(true)
    setError('')
    try {
      if (share && Platform.OS !== 'web') {
        await Share.share({ message: name, title: `MostBox · ${name}` })
      } else if (share && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text: name, title: `MostBox · ${name}` })
      } else {
        await Clipboard.setStringAsync(name)
        setCopied(true)
      }
    } catch (nextError) {
      if (!(nextError instanceof Error && nextError.name === 'AbortError'))
        setError(t('chat.channelShareFailed'))
    } finally {
      setWorking(false)
    }
  }
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <BottomSheetCard>
            <Text accessibilityRole="header" style={styles.title}>
              {t('chat.channelInfo')}
            </Text>
            {channel.remark ? (
              <Text style={styles.remark}>{channel.remark}</Text>
            ) : null}
            <Text selectable style={styles.name}>
              {name}
            </Text>
            <Text style={styles.hint}>{t('chat.channelShareHint')}</Text>
            {copied ? (
              <Text accessibilityRole="alert" style={styles.success}>
                {t('chat.copied')}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <MostButton
                disabled={working}
                onPress={() => void run(false)}
                icon={<Copy size={18} color={theme.colors.text} />}
              >
                {t('chat.copyChannelName')}
              </MostButton>
              <MostButton
                disabled={working}
                onPress={() => void run(true)}
                icon={<Share2 size={18} color={theme.colors.text} />}
              >
                {t('chat.shareChannel')}
              </MostButton>
              <MostButton variant="ghost" onPress={onClose}>
                {t('common.close')}
              </MostButton>
            </View>
          </BottomSheetCard>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

function createStyles(colors: ReturnType<typeof useMostBoxTheme>['colors']) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    scroll: { flexGrow: 1, justifyContent: 'flex-end' },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    remark: { color: colors.text, fontSize: 17, marginTop: 16 },
    name: {
      color: colors.text,
      fontSize: 21,
      fontWeight: '600',
      marginVertical: 16,
    },
    hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
    success: { color: colors.accent, marginTop: 12 },
    error: { color: colors.danger, marginTop: 12 },
    actions: { gap: 12, marginTop: 20 },
  })
}
