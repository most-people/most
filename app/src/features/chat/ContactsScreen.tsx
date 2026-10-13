import { useMemo, useState } from 'react'
import { ChevronRight, MessageCircle, Search } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import type { MobileCoreSnapshot } from '../../mobileCore/types'
import { MostTextInput } from '../../ui/components'
import { useI18n } from '../../i18n'
import { useMostBoxTheme } from '../../ui/theme'

const FIXTURE_CONTACTS = ['产品讨论', '文件分享', '开发联调']

export type ContactsScreenProps = {
  snapshot: MobileCoreSnapshot
  onOpenChannel: (channel: string) => void
}

export function ContactsScreen({
  snapshot,
  onOpenChannel,
}: ContactsScreenProps) {
  const theme = useMostBoxTheme()
  const styles = contactsStyles(theme)
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const channels = useMemo(() => {
    const names = snapshot.channels
      ?.map(channel => channel.name)
      .filter(Boolean)
    return names?.length ? names : FIXTURE_CONTACTS
  }, [snapshot.channels])
  const filtered = channels.filter(channel =>
    channel.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.searchBox}>
        <Search size={18} color={theme.colors.textMuted} />
        <MostTextInput
          accessibilityLabel={t('contacts.searchA11y')}
          onChangeText={setQuery}
          placeholder={t('contacts.searchPlaceholder')}
          style={styles.searchInput}
          value={query}
        />
      </View>

      <Text style={styles.groupTitle}>{t('contacts.myChannels')}</Text>
      <View style={styles.group}>
        {filtered.map((channel, index) => (
          <ContactRow
            key={channel}
            icon={<MessageCircle size={20} color={theme.colors.accent} />}
            label={`#${channel}`}
            meta={
              index === 0
                ? t('contacts.recentlyActive')
                : t('contacts.channelMembers')
            }
            onPress={() => onOpenChannel(channel)}
            styles={styles}
          />
        ))}
        {!filtered.length ? (
          <Text style={styles.empty}>{t('contacts.empty')}</Text>
        ) : null}
      </View>
    </ScrollView>
  )
}

function ContactRow({
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
  styles: ReturnType<typeof contactsStyles>
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
      <View style={styles.icon}>{icon}</View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <ChevronRight size={18} color={styles.colors.textMuted} />
    </Pressable>
  )
}

function contactsStyles(theme: ReturnType<typeof useMostBoxTheme>) {
  const { colors } = theme
  return {
    colors,
    content: { padding: 14, paddingBottom: 32 } as const,
    searchBox: {
      alignItems: 'center',
      backgroundColor: colors.surfaceSubtle,
      borderRadius: 8,
      marginBottom: 20,
      flexDirection: 'row',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
    } as const,
    searchInput: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      flex: 1,
      minHeight: 40,
      paddingVertical: 4,
    } as const,
    group: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 20,
      overflow: 'hidden',
    } as const,
    groupTitle: {
      color: colors.textMuted,
      fontSize: 12,
      marginBottom: 8,
      marginLeft: 4,
    } as const,
    row: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 68,
      paddingHorizontal: 12,
    } as const,
    icon: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: 9,
      height: 42,
      justifyContent: 'center',
      width: 42,
    } as const,
    rowText: { flex: 1, gap: 3 } as const,
    label: { color: colors.text, fontSize: 15, fontWeight: '600' } as const,
    meta: { color: colors.textSecondary, fontSize: 11 } as const,
    empty: {
      color: colors.textSecondary,
      padding: 20,
      textAlign: 'center',
    } as const,
    pressed: { opacity: 0.6 } as const,
    disabled: { opacity: 0.72 } as const,
  }
}
