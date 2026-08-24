import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  CheckCircle2,
  History,
  LogIn,
  LogOut,
  Server,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react-native'
import type {
  MobileCoreSnapshot,
  MostBoxMobileClient,
  NodeHistoryItem,
} from '../../mobileCore/types'
import { useI18n } from '../../i18n'
import { getFriendlyRemoteConnectionError } from '../../ui/presentation'
import {
  BottomSheetCard,
  IconButton,
  MostButton,
  MostTextInput,
  getGlassSurfaceStyle,
} from '../../ui/components'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'

export type NodeConnectionPanelProps = {
  client: MostBoxMobileClient
  snapshot: MobileCoreSnapshot
}

function shortAddress(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 10)}...${value.slice(-6)}`
}

function displayNodeName(node: NodeHistoryItem) {
  if (node.local) return ''
  try {
    return new URL(node.url).host
  } catch {
    return node.url
  }
}

export function NodeConnectionPanel({
  client,
  snapshot,
}: NodeConnectionPanelProps) {
  const { locale, t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = connectionStyles[theme.mode]
  const node = snapshot.node
  const remote = node.mode === 'remote'
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(node.endpoint || '')
  const [invite, setInvite] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const history = client.getNodeHistory()
  const selectedRemote =
    history.find(item => item.current && !item.local) ||
    history.find(item => item.preferred && !item.local)
  const accountName = node.username || ''
  const accountAddress = node.userAddress || ''

  useEffect(() => {
    if (!open) return
    setError('')
    setUrl(selectedRemote?.url || node.endpoint || '')
    setInvite(selectedRemote?.invite || '')
  }, [open, node.endpoint, selectedRemote?.invite, selectedRemote?.url])

  const run = async (action: () => Promise<void>) => {
    setWorking(true)
    setError('')
    try {
      await action()
    } catch (nextError) {
      setError(getFriendlyRemoteConnectionError(nextError, locale))
    } finally {
      setWorking(false)
    }
  }

  const connect = async (nextUrl = url, nextInvite = invite) => {
    await run(async () => {
      await client.connectRemote({ url: nextUrl, invite: nextInvite })
      setOpen(false)
    })
  }

  const switchLocal = async () => {
    await run(async () => {
      await client.switchToLocal()
      setOpen(false)
    })
  }

  const signIn = async () => {
    await run(async () => {
      await client.signIn({ username, password })
      setUsername('')
      setPassword('')
    })
  }

  const signOut = async () => {
    await run(async () => {
      await client.signOut()
    })
  }

  return (
    <>
      <View style={styles.panel}>
        <View style={styles.heading}>
          <View style={styles.headingIcon}>
            {remote ? (
              <Server size={18} color={theme.colors.accent} />
            ) : (
              <Smartphone size={18} color={theme.colors.accent} />
            )}
          </View>
          <View style={styles.headingText}>
            <Text maxFontSizeMultiplier={2} style={styles.title}>
              {t('node.connection.title')}
            </Text>
            <Text
              maxFontSizeMultiplier={1.8}
              numberOfLines={2}
              style={styles.meta}
            >
              {remote
                ? node.endpoint || t('node.connection.remote')
                : t('node.connection.local')}
            </Text>
          </View>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>
              {t(remote ? 'node.connection.remote' : 'node.connection.local')}
            </Text>
          </View>
        </View>

        {node.fallbackFrom ? (
          <Text style={styles.warning}>{t('node.connection.fallback')}</Text>
        ) : null}
        {remote && !node.authenticated ? (
          <Text style={styles.warning}>{t('node.account.required')}</Text>
        ) : null}

        <View style={styles.accountRow}>
          <UserRound size={16} color={theme.colors.textSecondary} />
          <Text numberOfLines={1} style={styles.accountText}>
            {accountName
              ? `${accountName} · ${shortAddress(accountAddress)}`
              : t('node.account.signedOut')}
          </Text>
          <MostButton
            onPress={() => setOpen(true)}
            style={styles.manageButton}
            variant="ghost"
          >
            {t('node.connection.manage')}
          </MostButton>
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => !working && setOpen(false)}
        transparent
        visible={open}
      >
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboard}
          >
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <BottomSheetCard style={styles.sheet}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleRow}>
                    <Server size={20} color={theme.colors.accent} />
                    <Text style={styles.modalTitle}>
                      {t('node.connection.modalTitle')}
                    </Text>
                  </View>
                  <IconButton
                    accessibilityLabel={t('common.close')}
                    disabled={working}
                    onPress={() => setOpen(false)}
                    variant="ghost"
                  >
                    <X size={20} color={theme.colors.textSecondary} />
                  </IconButton>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formTitle}>
                    {t('node.account.title')}
                  </Text>
                  {accountName ? (
                    <View style={styles.signedInRow}>
                      <View style={styles.signedInText}>
                        <Text style={styles.primaryText}>{accountName}</Text>
                        <Text style={styles.secondaryText}>
                          {shortAddress(accountAddress)}
                        </Text>
                      </View>
                      <MostButton
                        disabled={working}
                        icon={<LogOut size={16} color={theme.colors.danger} />}
                        onPress={() => void signOut()}
                        variant="ghost"
                      >
                        {t('node.account.signOut')}
                      </MostButton>
                    </View>
                  ) : (
                    <View style={styles.formFields}>
                      <MostTextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!working}
                        onChangeText={setUsername}
                        placeholder={t('node.account.username')}
                        value={username}
                      />
                      <MostTextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!working}
                        onChangeText={setPassword}
                        placeholder={t('node.account.password')}
                        secureTextEntry
                        value={password}
                      />
                      <MostButton
                        disabled={working || !username.trim() || !password}
                        icon={<LogIn size={16} color={theme.colors.onAccent} />}
                        onPress={() => void signIn()}
                        variant="primary"
                      >
                        {working
                          ? t('node.account.signingIn')
                          : t('node.account.signIn')}
                      </MostButton>
                    </View>
                  )}
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formTitle}>
                    {t('node.connection.remote')}
                  </Text>
                  <View style={styles.formFields}>
                    <MostTextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!working}
                      keyboardType="url"
                      onChangeText={setUrl}
                      placeholder="https://node.example.com"
                      value={url}
                    />
                    <MostTextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!working}
                      onChangeText={setInvite}
                      placeholder={t('node.connection.invite')}
                      secureTextEntry
                      value={invite}
                    />
                    <MostButton
                      disabled={working || !url.trim()}
                      icon={<Server size={16} color={theme.colors.onAccent} />}
                      onPress={() => void connect()}
                      variant="primary"
                    >
                      {working
                        ? t('node.connection.connecting')
                        : t('node.connection.connect')}
                    </MostButton>
                    <MostButton
                      disabled={working || !remote}
                      icon={
                        <Smartphone size={16} color={theme.colors.accent} />
                      }
                      onPress={() => void switchLocal()}
                    >
                      {t('node.connection.switchLocal')}
                    </MostButton>
                  </View>
                </View>

                {history.some(item => !item.local) ? (
                  <View style={styles.formSection}>
                    <View style={styles.historyTitleRow}>
                      <History size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.formTitle}>
                        {t('node.connection.history')}
                      </Text>
                    </View>
                    <View style={styles.historyList}>
                      {history
                        .filter(item => !item.local)
                        .map(item => (
                          <Pressable
                            accessibilityRole="button"
                            disabled={working}
                            key={item.url}
                            onPress={() => {
                              setUrl(item.url)
                              setInvite(item.invite)
                              void connect(item.url, item.invite)
                            }}
                            style={({ pressed }) => [
                              styles.historyRow,
                              pressed ? styles.pressed : null,
                            ]}
                          >
                            <Server size={16} color={theme.colors.accent} />
                            <Text numberOfLines={1} style={styles.historyHost}>
                              {displayNodeName(item)}
                            </Text>
                            {item.current ? (
                              <View style={styles.currentBadge}>
                                <CheckCircle2
                                  size={13}
                                  color={theme.colors.success}
                                />
                                <Text style={styles.currentText}>
                                  {t('node.connection.current')}
                                </Text>
                              </View>
                            ) : null}
                          </Pressable>
                        ))}
                    </View>
                  </View>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}
              </BottomSheetCard>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  )
}

function createConnectionStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme
  return StyleSheet.create({
    panel: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      gap: 12,
      marginHorizontal: 20,
      marginTop: 20,
      padding: 14,
    },
    heading: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    headingIcon: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.medium,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    headingText: { flex: 1, gap: 2, minWidth: 0 },
    title: { color: colors.text, fontSize: 15, fontWeight: '700' },
    meta: { color: colors.textSecondary, fontSize: 12 },
    modeBadge: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderRadius: radii.full,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    modeBadgeText: { color: colors.accent, fontSize: 11, fontWeight: '600' },
    warning: {
      backgroundColor: colors.warningSoft,
      borderRadius: radii.small,
      color: colors.warning,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    accountRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    accountText: { color: colors.textSecondary, flex: 1, fontSize: 12 },
    manageButton: { minHeight: 38, paddingHorizontal: 11 },
    overlay: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    keyboard: { flex: 1, justifyContent: 'flex-end' },
    modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
    sheet: { gap: 18, maxHeight: '92%', padding: 20 },
    modalHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    modalTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    formSection: { gap: 10 },
    formTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
    formFields: { gap: 9 },
    signedInRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    signedInText: { flex: 1, gap: 2, minWidth: 0 },
    primaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    secondaryText: { color: colors.textSecondary, fontSize: 12 },
    historyTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
    historyList: { gap: 7 },
    historyRow: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 9,
      minHeight: 48,
      paddingHorizontal: 11,
    },
    historyHost: { color: colors.text, flex: 1, fontSize: 13 },
    currentBadge: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    currentText: { color: colors.success, fontSize: 11, fontWeight: '600' },
    pressed: { opacity: 0.65 },
    error: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radii.small,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 17,
      padding: 10,
    },
  })
}

const connectionStyles = {
  light: createConnectionStyles(lightTheme),
  dark: createConnectionStyles(darkTheme),
}
