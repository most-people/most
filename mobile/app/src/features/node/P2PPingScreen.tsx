import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Clipboard from 'expo-clipboard'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CircleX,
  ClipboardPaste,
  Copy,
  RadioTower,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react-native'
import { useI18n, type MessageKey } from '../../i18n'
import type {
  P2PPing,
  P2PPingDirection,
  P2PPingRole,
} from '../../mobileCore/types'
import { useMostBoxTheme, type MostBoxTheme } from '../../ui/theme'
import { getGlassSurfaceStyle, getToneColor } from '../../ui/components'

type P2PPingScreenProps = {
  ping: P2PPing | null
  ready: boolean
  onBack: () => void
  onStart: (role: P2PPingRole, code?: string) => Promise<P2PPing>
  onCancel: (id?: string) => Promise<P2PPing | null>
}

const ACTIVE_STATUSES = new Set<P2PPing['status']>([
  'preparing',
  'waiting',
  'discovering',
  'connecting',
  'verifying',
])

const STATUS_KEYS: Record<P2PPing['status'], MessageKey> = {
  preparing: 'p2pPing.status.preparing',
  waiting: 'p2pPing.status.waiting',
  discovering: 'p2pPing.status.discovering',
  connecting: 'p2pPing.status.connecting',
  verifying: 'p2pPing.status.verifying',
  success: 'p2pPing.status.success',
  partial: 'p2pPing.status.partial',
  failed: 'p2pPing.status.failed',
  cancelled: 'p2pPing.status.cancelled',
  expired: 'p2pPing.status.expired',
}

function shortKey(value: string | null) {
  if (!value) return '-'
  return value.length > 30
    ? `${value.slice(0, 16)}...${value.slice(-10)}`
    : value
}

export function P2PPingScreen({
  ping,
  ready,
  onBack,
  onStart,
  onCancel,
}: P2PPingScreenProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const [role, setRole] = useState<P2PPingRole>('host')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState('')
  const [now, setNow] = useState(Date.now())
  const active = Boolean(ping && ACTIVE_STATUSES.has(ping.status))
  const visiblePing = ping?.role === role ? ping : null

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (ping) setRole(ping.role)
  }, [ping])

  useEffect(() => {
    if (!copiedCode) return
    const timer = setTimeout(() => setCopiedCode(''), 1600)
    return () => clearTimeout(timer)
  }, [copiedCode])

  const remainingSeconds = ping
    ? Math.max(0, Math.ceil((new Date(ping.expiresAt).getTime() - now) / 1000))
    : 0
  const validCode = /^\d{6}$/.test(code)

  const start = async (nextRole: P2PPingRole) => {
    setBusy(true)
    setError('')
    try {
      await onStart(nextRole, nextRole === 'join' ? code : undefined)
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : t('p2pPing.error.start')
      )
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    setBusy(true)
    setError('')
    try {
      if (ping && active) await onCancel(ping.id)
      await onStart('host')
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : t('p2pPing.error.start')
      )
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    setError('')
    try {
      await onCancel(ping?.id)
      setCode('')
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : t('p2pPing.error.start')
      )
    } finally {
      setBusy(false)
    }
  }

  const paste = async () => {
    const value = (await Clipboard.getStringAsync()).trim()
    setCode(value.replace(/\D/g, '').slice(0, 6))
  }

  const share = async () => {
    if (!visiblePing) return
    await Share.share({
      message: t('p2pPing.shareMessage', { code: visiblePing.code }),
    })
  }

  const copy = async () => {
    if (!visiblePing) return
    await Clipboard.setStringAsync(visiblePing.code)
    setCopiedCode(visiblePing.code)
  }

  const primaryDisabled = !ready || busy

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('p2pPing.back')}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <ArrowLeft size={22} color={theme.colors.text} />
        </Pressable>
        <Text maxFontSizeMultiplier={1.6} style={styles.title}>
          {t('p2pPing.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View accessibilityRole="tablist" style={styles.segmented}>
        {(['host', 'join'] as const).map(item => {
          const selected = role === item
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{
                disabled: active || busy,
                selected,
              }}
              disabled={active || busy}
              key={item}
              onPress={() => {
                setRole(item)
                setError('')
              }}
              style={({ pressed }) => [
                styles.segment,
                selected ? styles.segmentActive : null,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                style={[
                  styles.segmentText,
                  selected ? styles.segmentTextActive : null,
                ]}
              >
                {t(item === 'host' ? 'p2pPing.host' : 'p2pPing.join')}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.primarySection}>
        {role === 'host' ? (
          visiblePing ? (
            <>
              <Text style={styles.fieldLabel}>{t('p2pPing.code')}</Text>
              <Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.4}
                minimumFontScale={0.75}
                numberOfLines={1}
                selectable
                style={styles.code}
              >
                {visiblePing.code}
              </Text>
              <View style={styles.actions}>
                <IconAction
                  disabled={busy}
                  icon={
                    copiedCode === visiblePing.code ? (
                      <Check size={18} color={theme.colors.success} />
                    ) : (
                      <Copy size={18} color={theme.colors.accent} />
                    )
                  }
                  label={
                    copiedCode === visiblePing.code
                      ? t('p2pPing.copied')
                      : t('common.copy')
                  }
                  onPress={copy}
                  styles={styles}
                  success={copiedCode === visiblePing.code}
                />
                <IconAction
                  disabled={busy}
                  icon={<Share2 size={18} color={theme.colors.accent} />}
                  label={t('common.share')}
                  onPress={share}
                  styles={styles}
                />
                <IconAction
                  disabled={busy}
                  icon={<RefreshCw size={18} color={theme.colors.accent} />}
                  label={t('p2pPing.regenerate')}
                  onPress={regenerate}
                  styles={styles}
                />
              </View>
            </>
          ) : (
            <PrimaryButton
              busy={busy}
              disabled={primaryDisabled}
              label={t('p2pPing.create')}
              onPress={() => start('host')}
              styles={styles}
              theme={theme}
            />
          )
        ) : (
          <>
            <Text style={styles.fieldLabel}>{t('p2pPing.code')}</Text>
            <View style={styles.codeInputRow}>
              <TextInput
                accessibilityLabel={t('p2pPing.code')}
                editable={!active && !busy}
                keyboardType="number-pad"
                maxFontSizeMultiplier={1.4}
                maxLength={6}
                onChangeText={value =>
                  setCode(value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000000"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                style={styles.codeInput}
                value={visiblePing?.code || code}
              />
              <Pressable
                accessibilityLabel={t('p2pPing.paste')}
                accessibilityRole="button"
                accessibilityState={{ disabled: active || busy }}
                disabled={active || busy}
                onPress={paste}
                style={({ pressed }) => [
                  styles.pasteButton,
                  active || busy ? styles.disabled : null,
                  pressed ? styles.buttonPressed : null,
                ]}
              >
                <ClipboardPaste size={20} color={theme.colors.accent} />
              </Pressable>
            </View>
            {!visiblePing ? (
              <PrimaryButton
                busy={busy}
                disabled={primaryDisabled || !validCode}
                label={t('p2pPing.start')}
                onPress={() => start('join')}
                styles={styles}
                theme={theme}
              />
            ) : null}
          </>
        )}
      </View>

      {visiblePing ? (
        <View accessibilityLiveRegion="polite" style={styles.result}>
          <View
            style={[
              styles.statusBanner,
              getStatusBackgroundStyle(styles, visiblePing.status),
            ]}
          >
            <StatusIcon
              active={active}
              status={visiblePing.status}
              theme={theme}
            />
            <Text style={styles.statusText}>
              {t(STATUS_KEYS[visiblePing.status])}
            </Text>
            <Text style={styles.statusMeta}>
              {active
                ? `${remainingSeconds}s`
                : visiblePing.elapsedMs === null
                  ? '-'
                  : `${visiblePing.elapsedMs} ms`}
            </Text>
          </View>

          <View style={styles.directionList}>
            <DirectionResult
              label={t('p2pPing.direction.hostToJoin')}
              result={visiblePing.directions.hostToJoin}
              statusLabel={t(
                STATUS_KEYS[visiblePing.directions.hostToJoin.status]
              )}
              styles={styles}
              theme={theme}
            />
            <View style={styles.directionDivider} />
            <DirectionResult
              label={t('p2pPing.direction.joinToHost')}
              result={visiblePing.directions.joinToHost}
              statusLabel={t(
                STATUS_KEYS[visiblePing.directions.joinToHost.status]
              )}
              styles={styles}
              theme={theme}
            />
          </View>

          <View style={styles.details}>
            <Detail
              label={t('p2pPing.candidates')}
              styles={styles}
              value={String(visiblePing.discoveredPeers)}
            />
            <Detail
              label={t('p2pPing.peerKey')}
              styles={styles}
              value={shortKey(visiblePing.remotePeerKey)}
            />
            {visiblePing.errorCode ? (
              <Detail
                danger
                label={t('p2pPing.failure')}
                styles={styles}
                value={`${visiblePing.phase} / ${visiblePing.errorCode}${visiblePing.errorMessage ? `: ${visiblePing.errorMessage}` : ''}`}
              />
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={cancel}
            style={({ pressed }) => [
              styles.cancelButton,
              active ? styles.cancelButtonActive : styles.resetButton,
              busy ? styles.disabled : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            {active ? (
              <X size={18} color={theme.colors.danger} />
            ) : (
              <RefreshCw size={18} color={theme.colors.accent} />
            )}
            <Text
              style={[styles.cancelText, !active ? styles.resetText : null]}
            >
              {t(active ? 'p2pPing.cancel' : 'p2pPing.reset')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
          <CircleAlert size={17} color={theme.colors.danger} />
          <Text selectable style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

type P2PPingStyles = ReturnType<typeof createStyles>

function PrimaryButton({
  busy,
  disabled,
  label,
  onPress,
  styles,
  theme,
}: {
  busy: boolean
  disabled: boolean
  label: string
  onPress: () => void
  styles: P2PPingStyles
  theme: MostBoxTheme
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled ? styles.disabled : null,
        pressed ? styles.primaryButtonPressed : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.onAccent} size="small" />
      ) : (
        <RadioTower size={19} color={theme.colors.onAccent} />
      )}
      <Text maxFontSizeMultiplier={1.8} style={styles.primaryButtonText}>
        {label}
      </Text>
    </Pressable>
  )
}

function IconAction({
  disabled,
  icon,
  label,
  onPress,
  styles,
  success = false,
}: {
  disabled: boolean
  icon: ReactNode
  label: string
  onPress: () => void | Promise<void>
  styles: P2PPingStyles
  success?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        disabled ? styles.disabled : null,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      {icon}
      <Text
        maxFontSizeMultiplier={1.6}
        numberOfLines={1}
        style={[
          styles.iconActionText,
          success ? styles.iconActionTextSuccess : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function StatusIcon({
  active,
  status,
  theme,
}: {
  active: boolean
  status: P2PPing['status']
  theme: MostBoxTheme
}) {
  if (active)
    return <ActivityIndicator color={theme.colors.accent} size="small" />
  if (status === 'success') {
    return <CircleCheck size={21} color={theme.colors.success} />
  }
  if (status === 'partial') {
    return <CircleAlert size={21} color={theme.colors.warning} />
  }
  if (status === 'failed' || status === 'expired') {
    return <CircleX size={21} color={theme.colors.danger} />
  }
  return <CircleMinus size={21} color={theme.colors.textMuted} />
}

function DirectionResult({
  label,
  result,
  statusLabel,
  styles,
  theme,
}: {
  label: string
  result: P2PPingDirection
  statusLabel: string
  styles: P2PPingStyles
  theme: MostBoxTheme
}) {
  const { t } = useI18n()
  const directionActive = ACTIVE_STATUSES.has(result.status)
  return (
    <View style={styles.direction}>
      <View style={styles.directionIcon}>
        <StatusIcon
          active={directionActive}
          status={result.status}
          theme={theme}
        />
      </View>
      <View style={styles.directionContent}>
        <View style={styles.directionHeading}>
          <Text maxFontSizeMultiplier={1.7} style={styles.directionLabel}>
            {label}
          </Text>
          <Text maxFontSizeMultiplier={1.7} style={styles.directionStatus}>
            {statusLabel}
          </Text>
        </View>
        <View style={styles.directionMeta}>
          <Text style={styles.directionMetaText}>
            {t('p2pPing.candidates')} {result.discoveredPeers}
          </Text>
          <Text style={styles.directionMetaText}>
            {t('p2pPing.elapsed')}{' '}
            {result.elapsedMs === null ? '-' : `${result.elapsedMs} ms`}
          </Text>
        </View>
        {result.errorCode ? (
          <Text selectable style={styles.directionError}>
            {result.phase} / {result.errorCode}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function Detail({
  danger = false,
  label,
  styles,
  value,
}: {
  danger?: boolean
  label: string
  styles: P2PPingStyles
  value: string
}) {
  return (
    <View style={styles.detail}>
      <Text maxFontSizeMultiplier={1.7} style={styles.detailLabel}>
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.7}
        selectable
        style={[styles.detailValue, danger ? styles.detailDanger : null]}
      >
        {value}
      </Text>
    </View>
  )
}

function getStatusBackgroundStyle(
  styles: P2PPingStyles,
  status: P2PPing['status']
) {
  if (status === 'success') return styles.statusSuccess
  if (status === 'partial') return styles.statusWarning
  if (status === 'failed' || status === 'expired') return styles.statusDanger
  if (status === 'cancelled') return styles.statusNeutral
  return styles.statusActive
}

function createStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme
  return StyleSheet.create({
    content: {
      gap: 18,
      paddingBottom: 40,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 44,
    },
    backButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    headerSpacer: { width: 44 },
    title: {
      color: colors.text,
      flex: 1,
      fontSize: 19,
      fontWeight: '700',
      textAlign: 'center',
    },
    segmented: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.glassSubtle,
      borderRadius: 12,
      flexDirection: 'row',
      padding: 3,
    },
    segment: {
      alignItems: 'center',
      borderRadius: 6,
      flex: 1,
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: 8,
    },
    segmentActive: {
      backgroundColor: colors.accentSoft,
      shadowColor: theme.shadow.color,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: theme.shadow.opacity,
      shadowRadius: 8,
      elevation: 2,
    },
    segmentText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    segmentTextActive: { color: colors.text },
    primarySection: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      gap: 14,
      padding: 16,
    },
    fieldLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    code: {
      color: colors.text,
      fontSize: 46,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      letterSpacing: 0,
      lineHeight: 54,
      textAlign: 'center',
    },
    actions: { flexDirection: 'row', gap: 8 },
    iconAction: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 8,
      backgroundColor: colors.glassSubtle,
    },
    iconActionText: {
      color: colors.accent,
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '600',
    },
    iconActionTextSuccess: { color: colors.success },
    codeInputRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    codeInput: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      color: colors.text,
      flex: 1,
      fontSize: 32,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      height: 58,
      letterSpacing: 0,
      paddingHorizontal: 12,
      textAlign: 'center',
    },
    pasteButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      height: 48,
      justifyContent: 'center',
      width: 48,
      backgroundColor: colors.glassSubtle,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primaryButtonPressed: { backgroundColor: colors.accentPressed },
    primaryButtonText: {
      color: colors.onAccent,
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
    },
    buttonPressed: { opacity: 0.7 },
    disabled: { opacity: 0.4 },
    result: { gap: 12 },
    statusBanner: {
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      flexDirection: 'row',
      gap: 10,
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    statusActive: {
      backgroundColor: colors.accentSoft,
      borderColor: getToneColor(theme, 'accent'),
    },
    statusSuccess: {
      backgroundColor: colors.successSoft,
      borderColor: getToneColor(theme, 'success'),
    },
    statusWarning: {
      backgroundColor: colors.warningSoft,
      borderColor: getToneColor(theme, 'warning'),
    },
    statusDanger: {
      backgroundColor: colors.dangerSoft,
      borderColor: getToneColor(theme, 'danger'),
    },
    statusNeutral: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
    },
    statusText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    statusMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    directionList: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      paddingHorizontal: 14,
    },
    direction: {
      flexDirection: 'row',
      gap: 10,
      minHeight: 82,
      paddingVertical: 12,
    },
    directionIcon: {
      alignItems: 'center',
      paddingTop: 1,
      width: 22,
    },
    directionContent: { flex: 1, gap: 7 },
    directionHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    directionLabel: {
      color: colors.text,
      flexGrow: 1,
      fontSize: 13,
      fontWeight: '700',
    },
    directionStatus: { color: colors.textSecondary, fontSize: 12 },
    directionMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    directionMetaText: { color: colors.textMuted, fontSize: 11 },
    directionError: {
      color: colors.danger,
      fontFamily: Platform.select({ android: 'monospace', default: undefined }),
      fontSize: 11,
    },
    directionDivider: { backgroundColor: colors.border, height: 1 },
    details: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.glassSubtle,
    },
    detail: {
      flexDirection: 'row',
      gap: 14,
      justifyContent: 'space-between',
      paddingVertical: 7,
    },
    detailLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    detailValue: {
      color: colors.textSecondary,
      flex: 1,
      fontFamily: Platform.select({ android: 'monospace', default: undefined }),
      fontSize: 12,
      textAlign: 'right',
    },
    detailDanger: { color: colors.danger },
    cancelButton: {
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 12,
    },
    cancelButtonActive: { backgroundColor: colors.dangerSoft },
    resetButton: { backgroundColor: colors.accentSoft },
    cancelText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
    resetText: { color: colors.accent },
    errorBanner: {
      alignItems: 'flex-start',
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: getToneColor(theme, 'danger'),
      borderRadius: radii.medium,
      flexDirection: 'row',
      gap: 8,
      padding: 12,
    },
    errorText: { color: colors.danger, flex: 1, fontSize: 12 },
  })
}
