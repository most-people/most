import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { useI18n } from '../../i18n'
import { IconButton } from '../../ui/components'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'
import type {
  WebFilePreviewFile,
  WebFilePreviewProps,
} from './webFilePreviewTypes'
import './webFilePreview.css'

export type { WebFilePreviewFile, WebFilePreviewProps }

export function WebFilePreview({ file, onClose }: WebFilePreviewProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = webFilePreviewStyles[theme.mode]
  const isText = file ? isTextMimeType(file.mimeType) : false
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textFailed, setTextFailed] = useState(false)

  useEffect(() => {
    setTextContent(null)
    setTextFailed(false)
    if (!file || !isText) return

    let cancelled = false
    void fetch(file.fileUri)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.text()
      })
      .then(content => {
        if (!cancelled) setTextContent(content)
      })
      .catch(() => {
        if (!cancelled) setTextFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [file, isText])

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(file)}
    >
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text numberOfLines={1} style={styles.title}>
              {file?.fileName || ''}
            </Text>
            <IconButton
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              variant="ghost"
            >
              <X size={20} color={theme.colors.textSecondary} />
            </IconButton>
          </View>
          {file ? renderPreview() : null}
        </View>
      </View>
    </Modal>
  )

  function renderPreview() {
    if (!file) return null
    if (file.mimeType.startsWith('image/')) {
      return (
        <img
          alt={file.fileName}
          className="web-file-preview-image"
          src={file.fileUri}
        />
      )
    }
    if (file.mimeType.startsWith('audio/')) {
      return (
        <div className="web-file-preview-media">
          <audio controls src={file.fileUri} />
        </div>
      )
    }
    if (file.mimeType.startsWith('video/')) {
      return (
        <video className="web-file-preview-video" controls src={file.fileUri} />
      )
    }
    if (isText) {
      if (textFailed) {
        return (
          <View style={styles.status}>
            <Text style={styles.statusText}>{t('app.file.previewFailed')}</Text>
          </View>
        )
      }
      if (textContent === null) {
        return (
          <View style={styles.status}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.statusText}>
              {t('app.file.previewLoading')}
            </Text>
          </View>
        )
      }
      return <pre className="web-file-preview-text">{textContent}</pre>
    }
    if (file.mimeType === 'application/pdf') {
      return (
        <object
          aria-label={file.fileName}
          className="web-file-preview-document"
          data={file.fileUri}
          type={file.mimeType}
        >
          <View style={styles.status}>
            <Text style={styles.statusText}>{t('app.file.unsupported')}</Text>
          </View>
        </object>
      )
    }
    return (
      <View style={styles.status}>
        <Text style={styles.statusText}>{t('app.file.unsupported')}</Text>
      </View>
    )
  }
}

function isTextMimeType(mimeType: string) {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  )
}

function createStyles(theme: MostBoxTheme) {
  return StyleSheet.create({
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(10, 12, 18, 0.72)',
      flex: 1,
      justifyContent: 'center',
      padding: 12,
    },
    panel: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
      borderRadius: 8,
      borderWidth: 1,
      height: '100%',
      maxWidth: 960,
      overflow: 'hidden',
      width: '100%',
    },
    header: {
      alignItems: 'center',
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 12,
    },
    title: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
    },
    status: {
      alignItems: 'center',
      flex: 1,
      gap: 12,
      justifyContent: 'center',
      padding: 24,
    },
    statusText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
    },
  })
}

const webFilePreviewStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
}
