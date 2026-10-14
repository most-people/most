import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import appConfig from '../../../app.json'
import { PRODUCT_PROFILE } from '../../product/productProfile'
import { useI18n } from '../../i18n'
import { IconButton, MostButton } from '../../ui/components'
import { useMostBoxTheme } from '../../ui/theme'

type AboutMostBoxProps = {
  visible: boolean
  onClose: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenSupport: () => void
}

export function AboutMostBox({
  visible,
  onClose,
  onOpenPrivacy,
  onOpenTerms,
  onOpenSupport,
}: AboutMostBoxProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = createStyles(theme.colors)
  const open = (action: () => void) => {
    onClose()
    action()
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <IconButton
            accessibilityLabel={t('common.close')}
            variant="ghost"
            onPress={onClose}
          >
            <ArrowLeft size={22} color={theme.colors.text} />
          </IconButton>
          <Text style={styles.headerTitle}>{t('me.about')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.name}>{PRODUCT_PROFILE.displayName}</Text>
          <Text style={styles.version}>
            {t('me.aboutVersion', { version: appConfig.expo.version })}
          </Text>
          <Text style={styles.description}>
            {t(
              PRODUCT_PROFILE.features.chat ? 'me.aboutChat' : 'me.aboutFiles'
            )}
          </Text>
          <Text style={styles.boundary}>{t('me.aboutAvailability')}</Text>
          {Platform.OS !== 'web' ? (
            <Text style={styles.boundary}>{t('me.aboutMobileBackground')}</Text>
          ) : null}
          {PRODUCT_PROFILE.features.chat ? (
            <Text style={styles.boundary}>{t('me.aboutChatBoundary')}</Text>
          ) : null}
          <View style={styles.actions}>
            <MostButton onPress={() => open(onOpenPrivacy)}>
              {t('node.about.privacy')}
            </MostButton>
            <MostButton variant="ghost" onPress={() => open(onOpenTerms)}>
              {t('node.about.terms')}
            </MostButton>
            <MostButton variant="ghost" onPress={() => open(onOpenSupport)}>
              {t('node.about.support')}
            </MostButton>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

function createStyles(colors: ReturnType<typeof useMostBoxTheme>['colors']) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
    },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    content: { padding: 24, gap: 18 },
    name: {
      color: colors.text,
      fontSize: 30,
      fontWeight: '700',
      marginTop: 30,
    },
    version: { color: colors.textSecondary, fontSize: 14 },
    description: { color: colors.text, fontSize: 18, lineHeight: 27 },
    boundary: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
    actions: { gap: 12, marginTop: 12 },
  })
}
