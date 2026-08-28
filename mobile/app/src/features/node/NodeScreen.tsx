import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileText,
  HardDrive,
  Radio,
  RadioTower,
  ShieldCheck,
} from 'lucide-react-native'
import { useI18n, type MessageKey } from '../../i18n'
import type {
  LogLevel,
  MobileCoreSnapshot,
  MostBoxMobileCore,
  NodeRuntimeStatus,
} from '../../mobileCore/types'
import { getGlassSurfaceStyle } from '../../ui/components'
import {
  getFriendlyCoreError,
  getFriendlyRemoteConnectionError,
  usesAccessibilityLayout,
} from '../../ui/presentation'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'
import { NodeConnectionPanel } from './NodeConnectionPanel'

export type NodeScreenProps = {
  client: MostBoxMobileCore
  reselectToken: number
  retryStartDisabled: boolean
  snapshot: MobileCoreSnapshot
  onOpenP2PPing: () => void
  onOpenPrivacy: () => void | Promise<void>
  onOpenSupport: () => void | Promise<void>
  onOpenTerms: () => void | Promise<void>
  onRetryStartCore: () => void | Promise<void>
}

const NODE_STATUS_LABELS: Record<NodeRuntimeStatus, MessageKey> = {
  idle: 'node.status.idle',
  starting: 'node.status.starting',
  ready: 'node.status.ready',
  stopping: 'node.status.stopping',
  error: 'node.status.error',
}

const LOG_LEVEL_LABELS: Record<LogLevel, MessageKey> = {
  info: 'node.log.info',
  warn: 'node.log.warn',
  error: 'node.log.error',
}

function formatLogTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function SectionTitle({
  icon,
  title,
  meta,
}: {
  icon: ReactNode
  title: string
  meta?: string
}) {
  const theme = useMostBoxTheme()
  const styles = nodeScreenStyles[theme.mode]
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        {icon}
        <Text maxFontSizeMultiplier={2} style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {meta ? (
        <Text maxFontSizeMultiplier={2} style={styles.sectionMeta}>
          {meta}
        </Text>
      ) : null}
    </View>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  const theme = useMostBoxTheme()
  const styles = nodeScreenStyles[theme.mode]
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text maxFontSizeMultiplier={2} style={styles.metricValue}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={2} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  )
}

export function NodeScreen({
  client,
  reselectToken,
  retryStartDisabled,
  snapshot,
  onOpenP2PPing,
  onOpenPrivacy,
  onOpenSupport,
  onOpenTerms,
  onRetryStartCore,
}: NodeScreenProps) {
  const { locale, t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = nodeScreenStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const scrollRef = useRef<ScrollView>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const recentLogs = snapshot.logs.slice(0, 6)
  const isRemote = snapshot.node.mode === 'remote'

  useEffect(() => {
    if (reselectToken > 0) {
      scrollRef.current?.scrollTo({ animated: true, y: 0 })
    }
  }, [reselectToken])

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <NodeConnectionPanel client={client} snapshot={snapshot} />

      <View style={styles.section}>
        <SectionTitle
          icon={<Radio size={18} color={theme.colors.accent} />}
          meta={t(NODE_STATUS_LABELS[snapshot.node.status])}
          title={t('node.section.status')}
        />
        {snapshot.node.error ? (
          <View
            style={[
              styles.errorBanner,
              accessibilityLayout ? styles.errorBannerAccessibility : null,
            ]}
          >
            <Text maxFontSizeMultiplier={2} style={styles.errorText}>
              {isRemote
                ? getFriendlyRemoteConnectionError(snapshot.node.error, locale)
                : getFriendlyCoreError(snapshot.node.error, locale)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: retryStartDisabled }}
              disabled={retryStartDisabled}
              onPress={onRetryStartCore}
              style={({ pressed }) => [
                styles.retryButton,
                retryStartDisabled ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        <View
          style={[
            styles.metrics,
            accessibilityLayout ? styles.metricsAccessibility : null,
          ]}
        >
          <Metric
            icon={<Activity size={17} color={theme.colors.accent} />}
            label={t('node.metric.onlinePeers')}
            value={String(snapshot.node.peerCount)}
          />
          <Metric
            icon={<HardDrive size={17} color={theme.colors.info} />}
            label={t(
              isRemote ? 'node.metric.remoteSeeds' : 'node.metric.localSeeds'
            )}
            value={String(snapshot.holdings.length)}
          />
          <Metric
            icon={<ShieldCheck size={17} color={theme.colors.warning} />}
            label={t('node.metric.attachmentVerification')}
            value={t('node.metric.enabled')}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenP2PPing}
          style={({ pressed }) => [
            styles.commandRow,
            pressed ? styles.pressed : null,
          ]}
        >
          <RadioTower size={18} color={theme.colors.accent} />
          <Text maxFontSizeMultiplier={2} style={styles.commandText}>
            {t('p2pPing.title')}
          </Text>
          <ChevronRight size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: diagnosticsOpen }}
          onPress={() => setDiagnosticsOpen(value => !value)}
          style={({ pressed }) => [
            styles.diagnosticsToggle,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.sectionTitleGroup}>
            <Radio size={18} color={theme.colors.accent} />
            <View style={styles.diagnosticsText}>
              <Text maxFontSizeMultiplier={2} style={styles.sectionTitle}>
                {t('node.diagnostics.title')}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.sectionMeta}>
                {recentLogs.length
                  ? t('node.diagnostics.recentLogs', {
                      count: recentLogs.length,
                    })
                  : t('node.diagnostics.noLogs')}
              </Text>
            </View>
          </View>
          {diagnosticsOpen ? (
            <ChevronUp size={18} color={theme.colors.textSecondary} />
          ) : (
            <ChevronDown size={18} color={theme.colors.textSecondary} />
          )}
        </Pressable>
        {diagnosticsOpen ? (
          recentLogs.length ? (
            <View style={styles.logList}>
              {recentLogs.map(log => (
                <View
                  key={log.id}
                  style={[
                    styles.logRow,
                    accessibilityLayout ? styles.logRowAccessibility : null,
                  ]}
                >
                  <Text style={styles.logTime}>{formatLogTime(log.time)}</Text>
                  <View style={styles.logBody}>
                    <Text
                      style={[
                        styles.logLevel,
                        log.level === 'error' ? styles.logLevelError : null,
                        log.level === 'warn' ? styles.logLevelWarn : null,
                      ]}
                    >
                      {t(LOG_LEVEL_LABELS[log.level])}
                    </Text>
                    <Text maxFontSizeMultiplier={2} style={styles.logMessage}>
                      {log.message}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {t('node.diagnostics.emptyBody')}
            </Text>
          )
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionTitle
          icon={<FileText size={18} color={theme.colors.info} />}
          title={t('node.about.title')}
        />
        <View style={styles.linkList}>
          <LinkRow
            external
            label={t('node.about.privacy')}
            onPress={onOpenPrivacy}
          />
          <LinkRow
            external
            label={t('node.about.terms')}
            onPress={onOpenTerms}
          />
          <LinkRow
            external
            label={t('node.about.support')}
            onPress={onOpenSupport}
          />
        </View>
      </View>
    </ScrollView>
  )
}

function LinkRow({
  external = false,
  icon,
  label,
  onPress,
}: {
  external?: boolean
  icon?: ReactNode
  label: string
  onPress: () => void | Promise<void>
}) {
  const theme = useMostBoxTheme()
  const styles = nodeScreenStyles[theme.mode]
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.linkLabel}>
        {icon}
        <Text maxFontSizeMultiplier={2} style={styles.linkText}>
          {label}
        </Text>
      </View>
      {external ? (
        <ExternalLink size={16} color={theme.colors.textSecondary} />
      ) : (
        <ChevronRight size={16} color={theme.colors.textSecondary} />
      )}
    </Pressable>
  )
}

function createStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      gap: 16,
      paddingBottom: 32,
    },
    section: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      gap: 12,
      marginHorizontal: 20,
      padding: 14,
    },
    sectionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 32,
    },
    sectionTitleGroup: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: 0,
    },
    sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    sectionMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    metrics: { flexDirection: 'row', gap: 8 },
    metricsAccessibility: { flexDirection: 'column' },
    metric: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      justifyContent: 'center',
      minHeight: 108,
      minWidth: 0,
      paddingHorizontal: 10,
      paddingVertical: 14,
    },
    metricIcon: { height: 24, justifyContent: 'center', width: 24 },
    metricValue: { color: colors.text, fontSize: 24, fontWeight: '700' },
    metricLabel: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '500',
    },
    commandRow: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 56,
      paddingHorizontal: 12,
    },
    commandText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    errorBanner: {
      alignItems: 'center',
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    errorBannerAccessibility: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    errorText: {
      color: colors.danger,
      flex: 1,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 17,
    },
    retryButton: {
      alignItems: 'center',
      backgroundColor: colors.danger,
      borderRadius: radii.medium,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 14,
    },
    retryText: { color: colors.onAccent, fontSize: 12, fontWeight: '600' },
    diagnosticsToggle: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 64,
      padding: 12,
    },
    diagnosticsText: { flex: 1, gap: 2, minWidth: 0 },
    logList: { gap: 8 },
    logRow: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.small,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 10,
    },
    logRowAccessibility: { flexDirection: 'column' },
    logTime: { color: colors.textMuted, fontSize: 11 },
    logBody: { flex: 1, gap: 3, minWidth: 0 },
    logLevel: { color: colors.info, fontSize: 11, fontWeight: '700' },
    logLevelError: { color: colors.danger },
    logLevelWarn: { color: colors.warning },
    logMessage: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    emptyText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    linkList: { gap: 8 },
    linkRow: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingHorizontal: 12,
    },
    linkLabel: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 9,
      minWidth: 0,
    },
    linkText: { color: colors.text, fontSize: 14, fontWeight: '500' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.68 },
  })
}

const nodeScreenStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
}
