import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, RotateCcw } from 'lucide-react-native'
import type { MostBoxMobileCore } from '../../mobileCore/types'
import { useMostBoxTheme } from '../../ui/theme'
import { useI18n } from '../../i18n'
import { MostButton } from '../../ui/components'

type ChatImagePreviewProps = {
  client: MostBoxMobileCore
  cid: string
  fileName: string
  mimeType?: string
  active: boolean
  onLongPress: () => void
  onSave: () => void
  onOpen: () => void
}

export function ChatImagePreview({
  client,
  cid,
  fileName,
  mimeType,
  active,
  onLongPress,
  onSave,
  onOpen,
}: ChatImagePreviewProps) {
  const theme = useMostBoxTheme()
  const { t } = useI18n()
  const [fullScreen, setFullScreen] = useState(false)
  const [preview, setPreview] = useState<{ cid: string; uri: string } | null>(
    null
  )
  const [failedCid, setFailedCid] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!active) setFullScreen(false)
  }, [active])
  useEffect(() => {
    let running = true
    let previewUri = ''
    setFailedCid('')
    setPreview(null)
    const releasePreview = () => {
      if (
        previewUri.startsWith('blob:') &&
        typeof URL.revokeObjectURL === 'function'
      )
        URL.revokeObjectURL(previewUri)
    }
    // Export reads the exact CID content. Attachment metadata alone is never
    // enough to display an image as a locally verified file.
    void client
      .exportHolding({ cid, fileName, mimeType })
      .then(result => {
        const path = result.filePath
        const uri = /^(?:file:|content:|blob:|https?:)/.test(path)
          ? path
          : `file://${path}`
        previewUri = uri
        if (!running) {
          releasePreview()
          return
        }
        setPreview({ cid, uri })
      })
      .catch(() => {
        if (running) setFailedCid(cid)
      })
    return () => {
      running = false
      releasePreview()
    }
  }, [client, cid, fileName, mimeType, attempt])
  if (failedCid === cid)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.retryImagePreview', { fileName })}
        onPress={event => {
          event.stopPropagation()
          setAttempt(current => current + 1)
        }}
        style={styles.loading}
      >
        <RotateCcw size={22} color={theme.colors.textMuted} />
        <Text style={[styles.retry, { color: theme.colors.textMuted }]}>
          {t('common.retry')}
        </Text>
      </Pressable>
    )
  return preview?.cid === cid ? (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.previewImage', { fileName })}
        onPress={event => {
          event.stopPropagation()
          setFullScreen(true)
        }}
        onLongPress={onLongPress}
      >
        <Image
          source={{ uri: preview.uri }}
          resizeMode="contain"
          style={styles.image}
          onError={() => setFailedCid(cid)}
        />
      </Pressable>
      <Modal
        visible={fullScreen && active}
        animationType="fade"
        onRequestClose={() => setFullScreen(false)}
      >
        <SafeAreaView style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setFullScreen(false)}
              style={styles.close}
            >
              <ArrowLeft size={24} color="#fff" />
            </Pressable>
            <Text numberOfLines={1} style={styles.fileName}>
              {fileName}
            </Text>
          </View>
          <Image
            accessibilityLabel={fileName}
            source={{ uri: preview.uri }}
            resizeMode="contain"
            style={styles.fullImage}
          />
          <View style={styles.viewerActions}>
            <MostButton
              onPress={() => {
                setFullScreen(false)
                onSave()
              }}
            >
              {t('common.save')}
            </MostButton>
            <MostButton
              variant="ghost"
              onPress={() => {
                setFullScreen(false)
                onOpen()
              }}
            >
              {t('chat.openAttachment')}
            </MostButton>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  ) : (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.colors.textMuted} />
    </View>
  )
}

const styles = StyleSheet.create({
  image: { width: 192, height: 160, borderRadius: 8, marginBottom: 6 },
  loading: {
    width: 192,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retry: { fontSize: 14 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 56,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: { flex: 1, color: '#fff', fontSize: 16 },
  fullImage: { flex: 1, width: '100%' },
  viewerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
})
