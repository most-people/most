import {
  ArrowDownUp,
  Bell,
  ChevronRight,
  HardDrive,
  Languages,
  Radio,
  UserRound,
} from 'lucide-react-native'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useMemo, type ReactNode } from 'react'
import { AvatarSvg } from '../../ui/AvatarSvg'
import { Avatar, Style } from '@dicebear/core'
import planetsDefinition from '@dicebear/styles/planets.json'
import { localeNames, useI18n, type MessageKey } from '../../i18n'
import type { MobileCoreSnapshot } from '../../mobileCore/types'
import { PRODUCT_PROFILE } from '../../product/productProfile'
import {
  useMostBoxTheme,
  useThemePreference,
  type ThemePreference,
} from '../../ui/theme'

export type MeScreenProps = {
  snapshot: MobileCoreSnapshot
  username?: string
  onOpenProfile: () => void
  onOpenLanguage: () => void
  onOpenFiles: () => void
  onOpenNode: () => void
  onOpenTransfers: () => void
  onOpenAbout: () => void
  notificationsEnabled: boolean
  notificationPermissionAllowed: boolean
  notificationsDisabled: boolean
  onToggleNotifications: () => void
}

export function MeScreen({
  snapshot,
  username,
  onOpenProfile,
  onOpenLanguage,
  onOpenFiles,
  onOpenNode,
  onOpenTransfers,
  onOpenAbout,
  notificationsEnabled,
  notificationPermissionAllowed,
  notificationsDisabled,
  onToggleNotifications,
}: MeScreenProps) {
  const theme = useMostBoxTheme()
  const styles = meStyles(theme)
  const { locale, t } = useI18n()
  const { preference, setPreference } = useThemePreference()
  const address = snapshot.node.userAddress
  const avatarXml = useMemo(
    () =>
      address
        ? new Avatar(new Style(planetsDefinition), {
            seed: 'most.box@' + address,
          }).toString()
        : null,
    [address]
  )
  const displayName = username || t('me.defaultName')

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('me.profile')}
        onPress={onOpenProfile}
        style={({ pressed }) => [
          styles.profileCard,
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={styles.avatar} accessibilityLabel={t('me.avatar')}>
          {avatarXml ? (
            <AvatarSvg xml={avatarXml} size={56} />
          ) : (
            <UserRound size={28} color={theme.colors.textSecondary} />
          )}
        </View>
        <View style={styles.profileText}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.address}>
            {snapshot.node.userAddress || t('me.localIdentity')}
          </Text>
        </View>
        <ChevronRight size={20} color={theme.colors.textMuted} />
      </Pressable>

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
          last
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
        {PRODUCT_PROFILE.features.chat && Platform.OS !== 'web' ? (
          <MeRow
            icon={<Bell size={20} color={theme.colors.accent} />}
            label={t('chat.notifications.title')}
            meta={t(
              !notificationsEnabled
                ? 'chat.notifications.off'
                : notificationPermissionAllowed
                  ? 'chat.notifications.on'
                  : 'chat.notifications.blocked'
            )}
            disabled={notificationsDisabled}
            onPress={onToggleNotifications}
            styles={styles}
          />
        ) : null}
        <MeRow
          icon={<Languages size={20} color={theme.colors.textSecondary} />}
          last
          label={t('common.language.choose')}
          meta={localeNames[locale]}
          onPress={onOpenLanguage}
          styles={styles}
        />
      </View>

      <View style={[styles.group, styles.appearance]}>
        <Text style={styles.name}>{t('me.theme')}</Text>
        <View style={styles.themeOptions}>
          {(['system', 'light', 'dark'] as const).map(option => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={t(themeLabelKeys[option])}
              accessibilityState={{ checked: preference === option }}
              onPress={() => setPreference(option)}
              style={({ pressed }) => [
                styles.themeOption,
                preference === option ? styles.themeOptionSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.preview}>
                {(option === 'system'
                  ? (['light', 'dark'] as const)
                  : [option]
                ).map(mode => (
                  <View
                    key={mode}
                    style={[
                      styles.previewHalf,
                      mode === 'dark'
                        ? styles.previewDark
                        : styles.previewLight,
                    ]}
                  >
                    <View
                      style={[
                        styles.previewCard,
                        mode === 'dark'
                          ? styles.previewCardDark
                          : styles.previewCardLight,
                      ]}
                    >
                      <View
                        style={[styles.previewLine, styles.previewShortLine]}
                      />
                      <View style={styles.previewLine} />
                    </View>
                  </View>
                ))}
              </View>
              <Text
                style={[
                  styles.themeLabel,
                  preference === option ? styles.themeLabelSelected : null,
                ]}
              >
                {t(themeLabelKeys[option])}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <MeRow
          icon={<UserRound size={20} color={theme.colors.textSecondary} />}
          label={t('me.about')}
          last
          onPress={onOpenAbout}
          styles={styles}
        />
      </View>
    </ScrollView>
  )
}

const themeLabelKeys = {
  system: 'common.theme.system',
  light: 'common.theme.light',
  dark: 'common.theme.dark',
} as const satisfies Record<ThemePreference, MessageKey>

function MeRow({
  icon,
  label,
  meta,
  disabled,
  last,
  onPress,
  styles,
}: {
  icon: ReactNode
  label: string
  meta?: string
  disabled?: boolean
  last?: boolean
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
        last ? styles.lastRow : null,
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
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
      borderRadius: 10,
      height: 56,
      justifyContent: 'center',
      width: 56,
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
    lastRow: { borderBottomWidth: 0 } as const,
    rowText: { flex: 1, gap: 3 } as const,
    rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' } as const,
    rowMeta: { color: colors.textSecondary, fontSize: 11 } as const,
    appearance: { padding: 16, gap: 14 } as const,
    themeOptions: {
      flexDirection: 'row',
      gap: 10,
      maxWidth: 420,
      width: '100%',
    } as const,
    themeOption: {
      flex: 1,
      minWidth: 0,
      gap: 8,
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    } as const,
    themeOptionSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceMuted,
    } as const,
    preview: {
      height: 64,
      borderRadius: 4,
      overflow: 'hidden',
      flexDirection: 'row',
    } as const,
    previewHalf: { flex: 1, justifyContent: 'center', padding: 8 } as const,
    previewLight: { backgroundColor: '#e8eaf0' } as const,
    previewDark: { backgroundColor: '#575a62' } as const,
    previewCard: {
      height: 30,
      borderRadius: 4,
      padding: 6,
      justifyContent: 'center',
      gap: 5,
    } as const,
    previewLine: {
      height: 3,
      borderRadius: 2,
      backgroundColor: '#a2a5ae',
    } as const,
    previewShortLine: { width: '55%' } as const,
    previewCardLight: { backgroundColor: '#ffffff' } as const,
    previewCardDark: { backgroundColor: '#1c1c1e' } as const,
    themeLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    } as const,
    themeLabelSelected: { color: colors.accent } as const,
    pressed: { opacity: 0.6 } as const,
    disabled: { opacity: 0.72 } as const,
  }
}
