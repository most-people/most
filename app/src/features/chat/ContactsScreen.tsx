import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { MessageCircle, MoreHorizontal, Search, X } from 'lucide-react-native'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type {
  MobileCoreSnapshot,
  MostBoxMobileClient,
} from '../../mobileCore/types'
import {
  ChatApiClient,
  ChatRequestTimeoutError,
  normalizeChatChannel,
} from '../../chat/chatProtocol'
import {
  BottomSheetCard,
  IconButton,
  MostButton,
  MostTextInput,
} from '../../ui/components'
import { useFeedback } from '../../ui/feedback'
import { getFriendlyRemoteConnectionError } from '../../ui/presentation'
import { useI18n } from '../../i18n'
import { useMostBoxTheme } from '../../ui/theme'
import { getJoinedChannels, type JoinedChannel } from './conversationModel'
import * as Clipboard from 'expo-clipboard'

export type ContactsScreenProps = {
  channels: JoinedChannel[]
  client: MostBoxMobileClient
  snapshot: MobileCoreSnapshot
  onChannelsChange: Dispatch<SetStateAction<JoinedChannel[]>>
  onOpenChannel: (channel: string) => void
}

export function ContactsScreen({
  channels,
  client,
  snapshot,
  onChannelsChange,
  onOpenChannel,
}: ContactsScreenProps) {
  const theme = useMostBoxTheme()
  const styles = contactsStyles(theme)
  const { locale, t } = useI18n()
  const { alert, toast } = useFeedback()
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<JoinedChannel | null>(null)
  const [remark, setRemark] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const local = snapshot.node.mode !== 'remote'
  const endpoint = snapshot.node.endpoint || ''
  const identity = client.getIdentity?.() || null
  const invite =
    client.getNodeHistory().find(node => node.current)?.invite || ''
  const api = useMemo(
    () => new ChatApiClient({ baseUrl: endpoint, identity, invite }),
    [endpoint, identity, invite]
  )
  const filtered = getJoinedChannels(channels).filter(channel =>
    `${channel.name} ${channel.remark}`
      .toLocaleLowerCase()
      .includes(normalizeChatChannel(query))
  )

  const run = async (action: () => Promise<void>) => {
    setWorking(true)
    setError('')
    try {
      await action()
    } catch (nextError) {
      const message =
        nextError instanceof ChatRequestTimeoutError
          ? t('chat.requestTimedOut')
          : getFriendlyRemoteConnectionError(nextError, locale)
      setError(message)
      if (!renaming) toast(message, 'error')
    } finally {
      setWorking(false)
    }
  }

  const leave = (channel: JoinedChannel) =>
    run(async () => {
      if (local) {
        if (!client.leaveChannel)
          throw new Error(t('contacts.actionUnavailable'))
        await client.leaveChannel({ channelName: channel.name })
      } else await api.leaveChannel(channel.name)
      onChannelsChange(current =>
        current.filter(item => item.name !== channel.name)
      )
    })

  const pin = (channel: JoinedChannel) =>
    run(async () => {
      const pinned = !channel.pinned
      if (local) {
        if (!client.setChannelPinned)
          throw new Error(t('contacts.actionUnavailable'))
        await client.setChannelPinned({ channelName: channel.name, pinned })
      } else await api.setChannelPinned(channel.name, pinned)
      onChannelsChange(current =>
        getJoinedChannels(
          current.map(item =>
            item.name === channel.name ? { ...item, pinned } : item
          )
        )
      )
    })

  const rename = () => {
    if (!renaming) return
    const channel = renaming
    const nextRemark = remark.trim()
    void run(async () => {
      if (local) {
        if (!client.setChannelRemark)
          throw new Error(t('contacts.actionUnavailable'))
        await client.setChannelRemark({
          channelName: channel.name,
          remark: nextRemark,
        })
      } else await api.setChannelRemark(channel.name, nextRemark)
      onChannelsChange(current =>
        current.map(item =>
          item.name === channel.name ? { ...item, remark: nextRemark } : item
        )
      )
      setRenaming(null)
    })
  }

  const showMenu = (channel: JoinedChannel) => {
    alert(channel.remark || `#${channel.name}`, undefined, [
      {
        text: t('chat.copyChannelName'),
        onPress: () => {
          void Clipboard.setStringAsync(`#${channel.name}`)
            .then(() => toast(t('chat.copied'), 'success'))
            .catch(() => toast(t('app.clipboard.failed'), 'error'))
        },
      },
      ...(Platform.OS !== 'web'
        ? [
            {
              text: t('chat.shareChannel'),
              onPress: () => {
                void Share.share({
                  message: `#${channel.name}`,
                  title: `MostBox · #${channel.name}`,
                }).catch(() => toast(t('chat.channelShareFailed'), 'error'))
              },
            },
          ]
        : []),
      {
        text: t('contacts.rename'),
        onPress: () => {
          setError('')
          setRemark(channel.remark)
          setRenaming(channel)
        },
      },
      {
        text: t(channel.pinned ? 'contacts.unpin' : 'contacts.pin'),
        onPress: () => void pin(channel),
      },
      {
        text: t('contacts.leave'),
        style: 'destructive',
        onPress: () => {
          alert(
            t('contacts.leave'),
            t('contacts.leaveConfirm', {
              channel: channel.remark || channel.name,
            }),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('contacts.leave'),
                style: 'destructive',
                onPress: () => void leave(channel),
              },
            ]
          )
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  return (
    <>
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
          {query ? (
            <IconButton
              accessibilityLabel={t('chat.clearSearch')}
              onPress={() => setQuery('')}
              variant="ghost"
            >
              <X size={18} color={theme.colors.textMuted} />
            </IconButton>
          ) : null}
        </View>
        <Text style={styles.groupTitle}>{t('contacts.myChannels')}</Text>
        <View style={styles.group}>
          {filtered.map(channel => (
            <View key={channel.name} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenChannel(channel.name)}
                style={styles.rowOpen}
              >
                <View style={styles.icon}>
                  <MessageCircle size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={styles.label}>
                    {channel.remark || `#${channel.name}`}
                  </Text>
                  {channel.pinned ? (
                    <Text style={styles.meta}>{t('contacts.pinned')}</Text>
                  ) : null}
                </View>
              </Pressable>
              <IconButton
                accessibilityLabel={t('chat.conversationOptions', {
                  channel: channel.remark || channel.name,
                })}
                disabled={working}
                onPress={() => showMenu(channel)}
                variant="ghost"
              >
                <MoreHorizontal size={20} color={theme.colors.textSecondary} />
              </IconButton>
            </View>
          ))}
          {!filtered.length ? (
            <Text style={styles.empty}>{t('contacts.empty')}</Text>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        transparent
        animationType="slide"
        visible={Boolean(renaming)}
        onRequestClose={() => !working && setRenaming(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.renameOverlay}
        >
          <BottomSheetCard style={styles.renameCard}>
            <Text style={styles.label}>{t('contacts.rename')}</Text>
            <Text style={styles.meta}>#{renaming?.name}</Text>
            <MostTextInput
              accessibilityLabel={t('contacts.rename')}
              autoFocus
              editable={!working}
              maxLength={50}
              value={remark}
              onChangeText={setRemark}
              onSubmitEditing={() => !working && rename()}
              placeholder={t('contacts.renamePlaceholder')}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <MostButton disabled={working} onPress={rename} variant="primary">
              {t('common.save')}
            </MostButton>
            <MostButton
              disabled={working}
              onPress={() => setRenaming(null)}
              variant="ghost"
            >
              {t('common.cancel')}
            </MostButton>
          </BottomSheetCard>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
    rowOpen: {
      flex: 1,
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: 68,
    } as const,
    renameOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.overlay,
    } as const,
    renameCard: { width: '100%', maxWidth: '100%' } as const,
    error: { color: colors.danger } as const,
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
