import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  ChevronRight,
  Download,
  Files,
  ListChecks,
  MessageCircle,
  Network,
  RadioTower,
} from 'lucide-react-native'
import { useI18n } from '../../i18n'
import { PRODUCT_PROFILE } from '../../product/productProfile'
import { useMostBoxTheme } from '../../ui/theme'

type DiscoverScreenProps = {
  reselectToken: number
  onJoinChannel: () => void
  onReceiveFile: () => void
  onOpenFiles: () => void
  onOpenTransfers: () => void
  onOpenNode: () => void
  onOpenP2PPing: () => void
}

export function DiscoverScreen({
  reselectToken,
  onJoinChannel,
  onReceiveFile,
  onOpenFiles,
  onOpenTransfers,
  onOpenNode,
  onOpenP2PPing,
}: DiscoverScreenProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = createStyles(theme)
  const scrollRef = useRef<ScrollView>(null)
  useEffect(() => {
    if (reselectToken) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [reselectToken])
  const actions = [
    {
      title: t('p2pPing.title'),
      hint: t('p2pPing.entry'),
      Icon: RadioTower,
      onPress: onOpenP2PPing,
    },
    ...(PRODUCT_PROFILE.features.chat
      ? [
          {
            title: t('discover.joinChannel'),
            hint: t('discover.joinHint'),
            Icon: MessageCircle,
            onPress: onJoinChannel,
          },
        ]
      : []),
    {
      title: t('discover.receiveFile'),
      hint: t('discover.receiveHint'),
      Icon: Download,
      onPress: onReceiveFile,
    },
    {
      title: t('nav.files'),
      hint: t('discover.filesHint'),
      Icon: Files,
      onPress: onOpenFiles,
    },
    {
      title: t('nav.transfers'),
      hint: t('discover.transfersHint'),
      Icon: ListChecks,
      onPress: onOpenTransfers,
    },
    {
      title: t('nav.node'),
      hint: t('discover.nodeHint'),
      Icon: Network,
      onPress: onOpenNode,
    },
  ]
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('nav.discover')}
      </Text>
      <View style={styles.actions}>
        {actions.map(({ title, hint, Icon, onPress }, index) => (
          <Pressable
            key={title}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={hint}
            onPress={onPress}
            style={({ pressed }) => [
              styles.row,
              index ? styles.separator : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <View style={styles.icon}>
              <Icon size={23} color={theme.colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{title}</Text>
              <Text style={styles.hint}>{hint}</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  )
}

function createStyles({ colors, radii }: ReturnType<typeof useMostBoxTheme>) {
  return StyleSheet.create({
    content: { padding: 16, gap: 20 },
    title: {
      color: colors.text,
      fontSize: 23,
      fontWeight: '700',
      marginTop: 4,
    },
    actions: {
      backgroundColor: colors.surface,
      borderRadius: radii.medium,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      minHeight: 86,
    },
    separator: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    icon: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.small,
    },
    rowText: { flex: 1, gap: 5 },
    rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    pressed: { backgroundColor: colors.surfaceMuted },
  })
}
