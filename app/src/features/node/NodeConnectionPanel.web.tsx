import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
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
import { useFeedback } from '../../ui/feedback'
import { ConnectionStatusBar } from '../../ui/ConnectionStatusBar'
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
  autoOpen?: boolean
  client: MostBoxMobileClient
  snapshot: MobileCoreSnapshot
}

type NodeOperation = 'connect' | 'local' | 'signIn' | 'signOut'

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
  autoOpen = false,
  client,
  snapshot,
}: NodeConnectionPanelProps) {
  const { locale, t } = useI18n()
  const { alert, toast } = useFeedback()
  const theme = useMostBoxTheme()
  const styles = connectionStyles[theme.mode]
  const node = snapshot.node
  const remote = Platform.OS === 'web' || node.mode === 'remote'
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(node.endpoint || '')
  const [invite, setInvite] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [operation, setOperation] = useState<NodeOperation | null>(null)
  const workingRef = useRef(false)
  const working = operation !== null
  const progressMessage = t(
    operation === 'signIn'
      ? 'node.account.signingIn'
      : operation === 'signOut'
        ? 'node.account.signingOut'
        : operation === 'local'
          ? 'node.connection.switchingLocal'
          : 'node.connection.connecting'
  )

  const history = client.getNodeHistory()
  const selectedRemote =
    history.find(item => item.current && !item.local) ||
    history.find(item => item.preferred && !item.local)
  const accountName = node.username || ''
  const accountAddress = node.userAddress || ''

  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  useEffect(() => {
    if (!open) return
    setUrl(selectedRemote?.url || node.endpoint || '')
    setInvite(selectedRemote?.invite || '')
  }, [open, node.endpoint, selectedRemote?.invite, selectedRemote?.url])

  const run = async (
    nextOperation: NodeOperation,
    action: () => Promise<void>
  ) => {
    if (workingRef.current) return
    workingRef.current = true
    setOperation(nextOperation)
    Keyboard.dismiss()
    try {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => setTimeout(resolve, 0))
      )
      await action()
    } catch (nextError) {
      toast(getFriendlyRemoteConnectionError(nextError, locale), 'error')
    } finally {
      workingRef.current = false
      setOperation(null)
    }
  }

  const connect = async (nextUrl = url, nextInvite = invite) => {
    await run('connect', async () => {
      await client.connectRemote({ url: nextUrl, invite: nextInvite })
      setOpen(client.getSnapshot().node.authenticated !== true)
    })
  }

  const switchLocal = async () => {
    await run('local', async () => {
      await client.switchToLocal()
      setOpen(false)
    })
  }

  const signIn = async () => {
    await run('signIn', async () => {
      await client.signIn({ username, password })
      setUsername('')
      setPassword('')
    })
  }

  const signOut = async () => {
    await run('signOut', async () => {
      await client.signOut()
    })
  }

  const confirmSignOut = () => {
    alert(
      t('node.account.signOutConfirmTitle'),
      t('node.account.signOutConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('node.account.signOut'),
          style: 'destructive',
          onPress: () => void signOut(),
        },
      ]
    )
  }

  return (
    <>
      {node.status !== 'ready' ? (
        <View style={styles.connectPrompt}>
          <MostButton
            icon={<Server size={16} color={theme.colors.onAccent} />}
            onPress={() => setOpen(true)}
            variant="primary"
          >
            {t('node.connection.modalTitle')}
          </MostButton>
        </View>
      ) : (
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
      )}

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

                <ConnectionStatusBar
                  node={node}
                  chatConnected
                  hasChannels={false}
                  remote={remote}
                  flush
                />

                {working ? (
                  <View
                    accessibilityLabel={progressMessage}
                    accessibilityLiveRegion="polite"
                    accessibilityRole="progressbar"
                    accessibilityState={{ busy: true }}
                    style={styles.progress}
                  >
                    <ActivityIndicator color={theme.colors.accent} />
                    <View style={styles.progressText}>
                      <Text style={styles.primaryText}>{progressMessage}</Text>
                      <Text style={styles.secondaryText}>
                        {t('node.connection.pleaseWait')}
                      </Text>
                    </View>
                  </View>
                ) : null}

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
                      placeholder="node.example.com"
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
                      icon={
                        operation === 'connect' ? (
                          <ActivityIndicator color={theme.colors.onAccent} />
                        ) : (
                          <Server size={16} color={theme.colors.onAccent} />
                        )
                      }
                      onPress={() => void connect()}
                      variant="primary"
                    >
                      {operation === 'connect'
                        ? t('node.connection.connecting')
                        : t('node.connection.connect')}
                    </MostButton>
                    {Platform.OS !== 'web' ? (
                      <MostButton
                        disabled={working || !remote}
                        icon={
                          operation === 'local' ? (
                            <ActivityIndicator color={theme.colors.accent} />
                          ) : (
                            <Smartphone size={16} color={theme.colors.accent} />
                          )
                        }
                        onPress={() => void switchLocal()}
                      >
                        {t(
                          operation === 'local'
                            ? 'node.connection.switchingLocal'
                            : 'node.connection.switchLocal'
                        )}
                      </MostButton>
                    ) : null}
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
                        icon={
                          operation === 'signOut' ? (
                            <ActivityIndicator color={theme.colors.danger} />
                          ) : (
                            <LogOut size={16} color={theme.colors.danger} />
                          )
                        }
                        onPress={confirmSignOut}
                        variant="ghost"
                      >
                        {t(
                          operation === 'signOut'
                            ? 'node.account.signingOut'
                            : 'node.account.signOut'
                        )}
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
                        icon={
                          operation === 'signIn' ? (
                            <ActivityIndicator color={theme.colors.onAccent} />
                          ) : (
                            <LogIn size={16} color={theme.colors.onAccent} />
                          )
                        }
                        onPress={() => void signIn()}
                        variant="primary"
                      >
                        {operation === 'signIn'
                          ? t('node.account.signingIn')
                          : t('node.account.signIn')}
                      </MostButton>
                    </View>
                  )}
                </View>
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
    connectPrompt: { marginHorizontal: 20, marginTop: 20 },
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
    sheet: {
      gap: 18,
      width: '100%',
      maxWidth: '100%',
      maxHeight: '92%',
      padding: 20,
    },
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
    progress: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.small,
      flexDirection: 'row',
      gap: 12,
      padding: 12,
    },
    progressText: { flex: 1, gap: 4 },
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
  })
}

const connectionStyles = {
  light: createConnectionStyles(lightTheme),
  dark: createConnectionStyles(darkTheme),
}
