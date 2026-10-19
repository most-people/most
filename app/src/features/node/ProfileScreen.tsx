import { useMemo } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { Avatar, Style } from '@dicebear/core'
import planetsDefinition from '@dicebear/styles/planets.json'
import * as Clipboard from 'expo-clipboard'
import { useI18n } from '../../i18n'
import { AvatarSvg } from '../../ui/AvatarSvg'
import { IconButton, MostButton } from '../../ui/components'
import { useMostBoxTheme } from '../../ui/theme'

type ProfileScreenProps = {
  visible: boolean
  onClose: () => void
  username?: string
  address: string
}

export function ProfileScreen({
  visible,
  onClose,
  username,
  address,
}: ProfileScreenProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = createStyles(theme.colors)
  const xml = useMemo(
    () =>
      new Avatar(new Style(planetsDefinition), {
        seed: 'most.box@' + address,
      }).toString(),
    [address]
  )

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <IconButton
            accessibilityLabel={t('common.back')}
            variant="ghost"
            onPress={onClose}
          >
            <ArrowLeft size={22} color={theme.colors.text} />
          </IconButton>
          <Text style={styles.title}>{t('me.profile')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.avatar}>
              <AvatarSvg xml={xml} size={80} />
            </View>
            <Text style={styles.label}>{t('node.account.username')}</Text>
            <Text selectable style={styles.value}>
              {username || t('me.defaultName')}
            </Text>
            <Text style={styles.label}>{t('me.address')}</Text>
            <Text selectable style={styles.address}>
              {address || t('me.localIdentity')}
            </Text>
            <MostButton
              disabled={!address}
              onPress={() => Clipboard.setStringAsync(address)}
            >
              {t('common.copy')}
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
    title: { color: colors.text, fontSize: 18, fontWeight: '700' },
    content: { padding: 16 },
    card: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      gap: 12,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 12,
    },
    label: { color: colors.textSecondary, fontSize: 14 },
    value: { color: colors.text, fontSize: 20, fontWeight: '600' },
    address: { color: colors.text, fontSize: 14, flexShrink: 1 },
  })
}
