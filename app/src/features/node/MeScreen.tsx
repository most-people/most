import {
  ArrowDownUp,
  ChevronRight,
  HardDrive,
  Radio,
  UserRound,
} from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import type { MobileCoreSnapshot } from '../../mobileCore/types'
import { useMostBoxTheme } from '../../ui/theme'

export type MeScreenProps = {
  snapshot: MobileCoreSnapshot
  username?: string
  onOpenFiles: () => void
  onOpenNode: () => void
  onOpenTransfers: () => void
}

export function MeScreen({
  snapshot,
  username,
  onOpenFiles,
  onOpenNode,
  onOpenTransfers,
}: MeScreenProps) {
  const theme = useMostBoxTheme()
  const styles = meStyles(theme)
  const { t } = useI18n()
  const displayName = username || t('me.defaultName')
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.address}>
            {snapshot.node.userAddress || t('me.localIdentity')}
          </Text>
        </View>
        <ChevronRight size={20} color={theme.colors.textMuted} />
      </View>

      <View style={styles.group}>
        <MeRow
          icon={<HardDrive size={20} color={theme.colors.accent} />}
          label={t('me.filesTitle')}
          meta={t('me.seedCount', { count: snapshot.holdings.length })}
          onPress={onOpenFiles}
          styles={styles}
        />
        <MeRow
          icon={<ArrowDownUp size={20} color={theme.colors.accent} />}
          label={t('nav.transfers')}
          onPress={onOpenTransfers}
          styles={styles}
        />
        <MeRow
          icon={<Radio size={20} color={theme.colors.info} />}
          label={t('me.nodeTitle')}
          meta={
            snapshot.node.status === 'ready'
              ? t('me.nodeReady')
              : t('me.nodeOffline')
          }
          onPress={onOpenNode}
          styles={styles}
        />
      </View>

      <View style={styles.group}>
        <MeRow
          icon={<UserRound size={20} color={theme.colors.textSecondary} />}
          label={t('me.about')}
          disabled
          onPress={() => undefined}
          styles={styles}
        />
      </View>
    </ScrollView>
  )
}

function MeRow({
  icon,
  label,
  meta,
  disabled,
  onPress,
  styles,
}: {
  icon: ReactNode
  label: string
  meta?: string
  disabled?: boolean
  onPress: () => void
  styles: ReturnType<typeof meStyles>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      <ChevronRight size={18} color={styles.colors.textMuted} />
    </Pressable>
  )
}

function meStyles(theme: ReturnType<typeof useMostBoxTheme>) {
  const { colors } = theme
  return {
    colors,
    content: { gap: 18, padding: 14, paddingBottom: 32 } as const,
    profileCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 94,
      padding: 16,
    } as const,
    avatar: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: 10,
      height: 56,
      justifyContent: 'center',
      width: 56,
    } as const,
    avatarText: {
      color: colors.onAccent,
      fontSize: 24,
      fontWeight: '700',
    } as const,
    profileText: { flex: 1, gap: 5 } as const,
    name: { color: colors.text, fontSize: 18, fontWeight: '700' } as const,
    address: { color: colors.textSecondary, fontSize: 11 } as const,
    group: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    } as const,
    row: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 66,
      paddingHorizontal: 14,
    } as const,
    rowIcon: { width: 28 } as const,
    rowText: { flex: 1, gap: 3 } as const,
    rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' } as const,
    rowMeta: { color: colors.textSecondary, fontSize: 11 } as const,
    pressed: { opacity: 0.6 } as const,
    disabled: { opacity: 0.72 } as const,
  }
}
