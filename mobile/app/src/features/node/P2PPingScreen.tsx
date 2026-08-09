import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Clipboard from 'expo-clipboard'
import {
  Pressable,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  ClipboardPaste,
  Copy,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react-native'
import { useI18n, type MessageKey } from '../../i18n'
import type { P2PPing, P2PPingRole } from '../../mobileCore/types'
import { useMostBoxTheme, type MostBoxTheme } from '../../ui/theme'

type P2PPingScreenProps = {
  ping: P2PPing | null
  ready: boolean
  onBack: () => void
  onStart: (role: P2PPingRole, code?: string) => Promise<P2PPing>
  onCancel: (id?: string) => Promise<P2PPing | null>
}

const ACTIVE_STATUSES = new Set([
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
  const [now, setNow] = useState(Date.now())
  const active = Boolean(ping && ACTIVE_STATUSES.has(ping.status))

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (ping) setRole(ping.role)
  }, [ping])

  const remainingSeconds = ping
    ? Math.max(0, Math.ceil((new Date(ping.expiresAt).getTime() - now) / 1000))
    : 0
  const visiblePing = ping?.role === role ? ping : null

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
    try {
      await onCancel(ping?.id)
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
    if (visiblePing) await Clipboard.setStringAsync(visiblePing.code)
  }

  const dhtComplete = Boolean(
    visiblePing &&
    visiblePing.status !== 'preparing' &&
    visiblePing.status !== 'failed'
  )
  const connectionComplete = Boolean(
    visiblePing && ['verifying', 'success'].includes(visiblePing.status)
  )
  const proofComplete = visiblePing?.status === 'success'

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.iconButton}
        >
          <ArrowLeft size={20} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text maxFontSizeMultiplier={1.6} style={styles.title}>
            {t('p2pPing.title')}
          </Text>
        </View>
      </View>

      <View style={styles.segmented}>
        {(['host', 'join'] as const).map(item => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: role === item }}
            disabled={active}
            key={item}
            onPress={() => setRole(item)}
            style={[
              styles.segment,
              role === item ? styles.segmentActive : null,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                role === item ? styles.segmentTextActive : null,
              ]}
            >
              {t(item === 'host' ? 'p2pPing.host' : 'p2pPing.join')}
            </Text>
          </Pressable>
        ))}
      </View>

      {role === 'host' ? (
        <View style={styles.panel}>
          {visiblePing ? (
            <>
              <Text style={styles.code}>{visiblePing.code}</Text>
              <View style={styles.actions}>
                <IconAction
                  icon={<Copy size={18} color={theme.colors.accent} />}
                  label={t('common.copy')}
                  onPress={copy}
                />
                <IconAction
                  icon={<Share2 size={18} color={theme.colors.accent} />}
                  label={t('common.share')}
                  onPress={share}
                />
                <IconAction
                  icon={<RefreshCw size={18} color={theme.colors.accent} />}
                  label={t('p2pPing.regenerate')}
                  onPress={regenerate}
                />
              </View>
            </>
          ) : (
            <Pressable
              disabled={!ready || busy}
              onPress={() => start('host')}
              style={[
                styles.primaryButton,
                !ready || busy ? styles.disabled : null,
              ]}
            >
              <RadioTower size={19} color={theme.colors.onAccent} />
              <Text style={styles.primaryButtonText}>
                {t('p2pPing.create')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.panel}>
          <View style={styles.codeInputRow}>
            <TextInput
              accessibilityLabel={t('p2pPing.code')}
              editable={!active && !busy}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={value =>
                setCode(value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.codeInput}
              value={visiblePing?.code || code}
            />
            <Pressable
              accessibilityLabel={t('p2pPing.paste')}
              disabled={active}
              onPress={paste}
              style={styles.iconButton}
            >
              <ClipboardPaste size={20} color={theme.colors.accent} />
            </Pressable>
          </View>
          {!visiblePing ? (
            <Pressable
              disabled={!ready || busy || !/^\d{6}$/.test(code)}
              onPress={() => start('join')}
              style={[
                styles.primaryButton,
                !ready || busy || !/^\d{6}$/.test(code)
                  ? styles.disabled
                  : null,
              ]}
            >
              <RadioTower size={19} color={theme.colors.onAccent} />
              <Text style={styles.primaryButtonText}>{t('p2pPing.start')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {visiblePing ? (
        <View style={styles.result}>
          <View style={styles.statusRow}>
            {visiblePing.status === 'success' ? (
              <CircleCheck size={21} color={theme.colors.success} />
            ) : visiblePing.status === 'failed' ||
              visiblePing.status === 'expired' ? (
              <CircleX size={21} color={theme.colors.danger} />
            ) : (
              <LoaderCircle size={21} color={theme.colors.accent} />
            )}
            <Text style={styles.statusText}>
              {t(STATUS_KEYS[visiblePing.status])}
            </Text>
            {active ? (
              <Text style={styles.countdown}>{remainingSeconds}s</Text>
            ) : null}
          </View>

          <ResultStep
            done={dhtComplete}
            label={t(
              visiblePing.role === 'host'
                ? 'p2pPing.step.announce'
                : 'p2pPing.step.discovery'
            )}
          />
          <ResultStep
            done={connectionComplete}
            label={t('p2pPing.step.connection')}
          />
          <ResultStep done={proofComplete} label={t('p2pPing.step.proof')} />

          <View style={styles.details}>
            <Detail
              label={t('p2pPing.candidates')}
              value={String(visiblePing.discoveredPeers)}
            />
            <Detail
              label={t('p2pPing.elapsed')}
              value={
                visiblePing.elapsedMs === null
                  ? '-'
                  : `${visiblePing.elapsedMs} ms`
              }
            />
            <Detail
              label={t('p2pPing.peerKey')}
              value={shortKey(visiblePing.remotePeerKey)}
            />
            {visiblePing.errorCode ? (
              <Detail
                label={t('p2pPing.failure')}
                value={`${visiblePing.phase} / ${visiblePing.errorCode}: ${visiblePing.errorMessage || ''}`}
                danger
              />
            ) : null}
          </View>

          {active ? (
            <Pressable
              disabled={busy}
              onPress={cancel}
              style={styles.cancelButton}
            >
              <X size={18} color={theme.colors.danger} />
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  )
}

function IconAction({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode
  label: string
  onPress: () => void | Promise<void>
}) {
  const theme = useMostBoxTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <Pressable onPress={onPress} style={styles.iconAction}>
      {icon}
      <Text style={styles.iconActionText}>{label}</Text>
    </Pressable>
  )
}

function ResultStep({ done, label }: { done: boolean; label: string }) {
  const theme = useMostBoxTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <View style={styles.step}>
      {done ? (
        <CircleCheck size={17} color={theme.colors.success} />
      ) : (
        <LoaderCircle size={17} color={theme.colors.textMuted} />
      )}
      <Text style={styles.stepText}>{label}</Text>
    </View>
  )
}

function Detail({
  label,
  value,
  danger = false,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  const theme = useMostBoxTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        selectable
        style={[styles.detailValue, danger ? styles.error : null]}
      >
        {value}
      </Text>
    </View>
  )
}

function createStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme
  return StyleSheet.create({
    content: { gap: 20, padding: 20, paddingBottom: 40 },
    header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    headerText: { flex: 1, gap: 3 },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    iconButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    segmented: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.medium,
      flexDirection: 'row',
      padding: 3,
    },
    segment: {
      alignItems: 'center',
      borderRadius: 6,
      flex: 1,
      minHeight: 40,
      justifyContent: 'center',
    },
    segmentActive: { backgroundColor: colors.surface },
    segmentText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    segmentTextActive: { color: colors.text },
    panel: { gap: 16 },
    code: {
      color: colors.text,
      fontSize: 48,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      letterSpacing: 0,
      textAlign: 'center',
    },
    actions: { flexDirection: 'row', gap: 8 },
    iconAction: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flex: 1,
      gap: 5,
      justifyContent: 'center',
      minHeight: 58,
      paddingHorizontal: 6,
    },
    iconActionText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    codeInputRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    codeInput: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radii.medium,
      borderWidth: 1,
      color: colors.text,
      flex: 1,
      fontSize: 32,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      height: 58,
      letterSpacing: 0,
      paddingHorizontal: 14,
      textAlign: 'center',
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: radii.medium,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
    disabled: { opacity: 0.4 },
    result: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      gap: 12,
      paddingTop: 18,
    },
    statusRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    statusText: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
    },
    countdown: {
      color: colors.textSecondary,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    step: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 28 },
    stepText: { color: colors.textSecondary, fontSize: 13 },
    details: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      gap: 10,
      paddingTop: 12,
    },
    detail: { gap: 3 },
    detailLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
    detailValue: {
      color: colors.textSecondary,
      fontFamily: Platform.select({ android: 'monospace', default: undefined }),
      fontSize: 12,
    },
    cancelButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 6,
    },
    cancelText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
    error: { color: colors.danger, fontSize: 12 },
  })
}
