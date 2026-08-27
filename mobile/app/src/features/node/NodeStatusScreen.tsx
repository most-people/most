import { type ReactNode, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  type ViewStyle,
  View,
} from 'react-native'
import {
  Activity,
  ArchiveRestore,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileDown,
  FileText,
  HardDrive,
  Info,
  ListChecks,
  Loader,
  Radio,
  RotateCcw,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
  RadioTower,
} from 'lucide-react-native'
import type {
  LogLevel,
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
  MostBoxMobileCore,
  NodeRuntimeStatus,
  SeedStatus,
  TransferStatus,
} from '../../mobileCore/types'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'
import {
  getGlassSurfaceStyle,
  getToneColor,
  getToneSoftColor,
} from '../../ui/components'
import {
  getFriendlyCoreError,
  getFriendlyRemoteConnectionError,
  getTransferDisplayMessage,
  partitionTransfers,
  usesAccessibilityLayout,
} from '../../ui/presentation'
import { useI18n, type MessageKey } from '../../i18n'
import { NodeConnectionPanel } from './NodeConnectionPanel'

export type NodeStatusScreenProps = {
  client: MostBoxMobileCore
  section: 'files' | 'transfers' | 'node'
  snapshot: MobileCoreSnapshot
  copiedCid: string | null
  deletingCid: string | null
  exportingCid: string | null
  retryingTransferId: string | null
  actionDisabled: boolean
  knowledgeBackupWorking: boolean
  onPublishFile: () => void | Promise<void>
  onReceiveLink: () => void
  onBackupKnowledge: () => void | Promise<void>
  onRestoreKnowledge: () => void | Promise<void>
  onCopyHoldingLink: (holding: MobileHolding) => void | Promise<void>
  onDeleteHolding: (holding: MobileHolding) => void
  onSaveHolding: (holding: MobileHolding) => void | Promise<void>
  onShareHolding: (holding: MobileHolding) => void | Promise<void>
  onOpenPrivacy: () => void | Promise<void>
  onOpenTerms: () => void | Promise<void>
  onOpenSupport: () => void | Promise<void>
  onRetryTransfer: (transfer: MobileTransfer) => void | Promise<void>
  onShowTransferDetails: (transfer: MobileTransfer) => void
  onRetryStartCore: () => void | Promise<void>
  onOpenP2PPing: () => void
  retryStartDisabled: boolean
}

const NODE_STATUS_LABELS: Record<NodeRuntimeStatus, MessageKey> = {
  idle: 'node.status.idle',
  starting: 'node.status.starting',
  ready: 'node.status.ready',
  stopping: 'node.status.stopping',
  error: 'node.status.error',
}

const SEED_STATUS_LABELS: Record<SeedStatus, MessageKey> = {
  queued: 'node.seed.queued',
  joining: 'node.seed.joining',
  active: 'node.seed.active',
  paused: 'node.seed.paused',
  error: 'node.seed.error',
}

const TRANSFER_STATUS_LABELS: Record<TransferStatus, MessageKey> = {
  queued: 'node.transfer.queued',
  running: 'node.transfer.running',
  completed: 'node.transfer.completed',
  failed: 'node.transfer.failed',
  waitingCore: 'node.transfer.waitingCore',
}

const TRANSFER_KIND_LABELS: Record<MobileTransfer['kind'], MessageKey> = {
  publish: 'node.transfer.publish',
  download: 'node.transfer.download',
}

const LOG_LEVEL_LABELS: Record<LogLevel, MessageKey> = {
  info: 'node.log.info',
  warn: 'node.log.warn',
  error: 'node.log.error',
}

const PROGRESS_WIDTH_VALUES = Array.from({ length: 101 }, (_, value) => value)

type Tone = 'success' | 'danger' | 'pending' | 'muted'
type ProgressWidthStyleName = `progressWidth${number}`
type ProgressWidthStyles = Record<ProgressWidthStyleName, ViewStyle>

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatLogTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function shortCid(cid: string, head = 12, tail = 8) {
  if (cid.length <= head + tail + 1) return cid
  return `${cid.slice(0, head)}...${cid.slice(-tail)}`
}

function getSeedTone(status: SeedStatus): Tone {
  if (status === 'active') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'joining' || status === 'queued') return 'pending'
  return 'muted'
}

function getTransferTone(status: TransferStatus): Tone {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'pending'
  return 'muted'
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

type MetricProps = {
  icon: ReactNode
  label: string
  value: string
}

function Metric({ icon, label, value }: MetricProps) {
  const styles = useNodeStyles()
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)

  return (
    <View
      style={[
        styles.metric,
        accessibilityLayout ? styles.metricAccessibility : null,
      ]}
    >
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

type StatusBadgeProps = {
  label: string
  tone: Tone
}

function StatusBadge({ label, tone }: StatusBadgeProps) {
  const styles = useNodeStyles()
  const badgeStyle = {
    success: styles.successBadge,
    danger: styles.dangerBadge,
    pending: styles.pendingBadge,
    muted: styles.mutedBadge,
  }[tone]
  const textStyle = {
    success: styles.successBadgeText,
    danger: styles.dangerBadgeText,
    pending: styles.pendingBadgeText,
    muted: styles.mutedBadgeText,
  }[tone]

  return (
    <View style={[styles.badge, badgeStyle]}>
      <Text maxFontSizeMultiplier={1.8} style={[styles.badgeText, textStyle]}>
        {label}
      </Text>
    </View>
  )
}

type SmallActionProps = {
  label: string
  icon: ReactNode
  onPress: () => void | Promise<void>
  accessibilityLabel?: string
  testID?: string
  disabled?: boolean
  danger?: boolean
}

function SmallAction({
  label,
  icon,
  onPress,
  accessibilityLabel,
  testID,
  disabled = false,
  danger = false,
}: SmallActionProps) {
  const styles = useNodeStyles()

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallAction,
        danger ? styles.smallActionDanger : null,
        disabled ? styles.smallActionDisabled : null,
        pressed ? styles.pressablePressed : null,
      ]}
    >
      {icon}
    </Pressable>
  )
}

type SectionHeaderProps = {
  icon: ReactNode
  title: string
  meta?: string
}

function SectionHeader({ icon, title, meta }: SectionHeaderProps) {
  const styles = useNodeStyles()
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)

  return (
    <View
      style={[
        styles.sectionHeader,
        accessibilityLayout ? styles.sectionHeaderAccessibility : null,
      ]}
    >
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

type EmptyStateProps = {
  title: string
  body: string
  centered?: boolean
}

function EmptyState({ title, body, centered = false }: EmptyStateProps) {
  const styles = useNodeStyles()

  return (
    <View
      style={[styles.emptyState, centered ? styles.emptyStateCentered : null]}
    >
      <Text
        maxFontSizeMultiplier={2}
        style={[styles.emptyTitle, centered ? styles.emptyTextCentered : null]}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={2}
        style={[styles.emptyBody, centered ? styles.emptyTextCentered : null]}
      >
        {body}
      </Text>
    </View>
  )
}

type ProgressBarProps = {
  progress: number
}

function ProgressBar({ progress }: ProgressBarProps) {
  const styles = useNodeStyles()

  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, getProgressWidthStyle(progress)]} />
    </View>
  )
}

function getProgressWidthStyle(progress: number) {
  const width = Math.round(clampProgress(progress))
  return progressWidthStyles[`progressWidth${width}` as ProgressWidthStyleName]
}

type TransferItemProps = {
  transfer: MobileTransfer
  isReady: boolean
  retrying: boolean
  onRetry: (transfer: MobileTransfer) => void | Promise<void>
  onShowDetails: (transfer: MobileTransfer) => void
}

function TransferItem({
  transfer,
  isReady,
  retrying,
  onRetry,
  onShowDetails,
}: TransferItemProps) {
  const { locale, t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = nodeStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const failed = transfer.status === 'failed'

  return (
    <View style={styles.transferItem}>
      <View
        style={[
          styles.transferTopRow,
          accessibilityLayout ? styles.transferTopRowAccessibility : null,
        ]}
      >
        <View style={styles.transferTitleGroup}>
          <Text
            maxFontSizeMultiplier={2}
            numberOfLines={accessibilityLayout ? undefined : 1}
            style={styles.transferName}
          >
            {transfer.fileName || t(TRANSFER_KIND_LABELS[transfer.kind])}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.transferMeta}>
            {t(TRANSFER_KIND_LABELS[transfer.kind])} ·{' '}
            {getTransferDisplayMessage(
              transfer.message,
              transfer.status,
              locale
            )}
          </Text>
        </View>
        <StatusBadge
          label={t(TRANSFER_STATUS_LABELS[transfer.status])}
          tone={getTransferTone(transfer.status)}
        />
      </View>
      <ProgressBar progress={transfer.progress} />
      {failed ? (
        <View style={styles.transferActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onShowDetails(transfer)}
            style={({ pressed }) => [
              styles.transferDetailButton,
              pressed ? styles.pressablePressed : null,
            ]}
          >
            <Info size={16} color={theme.colors.textSecondary} />
            <Text maxFontSizeMultiplier={1.8} style={styles.transferDetailText}>
              {t('node.transfer.errorDetails')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: retrying || !isReady }}
            disabled={retrying || !isReady}
            onPress={() => onRetry(transfer)}
            style={({ pressed }) => [
              styles.transferRetryButton,
              retrying || !isReady ? styles.transferRetryButtonDisabled : null,
              pressed ? styles.pressablePressed : null,
            ]}
          >
            {retrying ? (
              <Loader size={16} color={theme.colors.textMuted} />
            ) : (
              <RotateCcw size={16} color={theme.colors.accent} />
            )}
            <Text maxFontSizeMultiplier={1.8} style={styles.transferRetryText}>
              {retrying
                ? t('node.transfer.retrying')
                : transfer.kind === 'download'
                  ? t('node.transfer.redownload')
                  : t('node.transfer.reselect')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export function NodeStatusScreen({
  client,
  section,
  snapshot,
  copiedCid,
  deletingCid,
  exportingCid,
  retryingTransferId,
  actionDisabled,
  knowledgeBackupWorking,
  onPublishFile,
  onReceiveLink,
  onBackupKnowledge,
  onRestoreKnowledge,
  onCopyHoldingLink,
  onDeleteHolding,
  onSaveHolding,
  onShareHolding,
  onOpenPrivacy,
  onOpenTerms,
  onOpenSupport,
  onRetryTransfer,
  onShowTransferDetails,
  onRetryStartCore,
  onOpenP2PPing,
  retryStartDisabled,
}: NodeStatusScreenProps) {
  const { locale, t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = nodeStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const isReady = snapshot.node.status === 'ready'
  const isRemote = snapshot.node.mode === 'remote'
  const recentLogs = snapshot.logs.slice(0, 6)
  const {
    active: activeTransfers,
    failed: failedTransfers,
    completed: completedTransfers,
  } = partitionTransfers(snapshot.transfers)

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        section === 'files' && snapshot.holdings.length === 0
          ? styles.contentWithEmptyFiles
          : null,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {section === 'files' ? (
        <View
          style={[
            styles.actionPanel,
            accessibilityLayout ? styles.actionPanelAccessibility : null,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: actionDisabled }}
            disabled={actionDisabled}
            onPress={onPublishFile}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionButtonPrimary,
              accessibilityLayout ? styles.actionButtonAccessibility : null,
              actionDisabled ? styles.actionCardDisabled : null,
              pressed ? styles.actionCardPressed : null,
            ]}
          >
            <Upload size={19} color={theme.colors.onAccent} />
            <Text
              maxFontSizeMultiplier={2}
              numberOfLines={1}
              style={[styles.actionLabel, styles.actionLabelPrimary]}
            >
              {t('node.action.publish')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: actionDisabled }}
            disabled={actionDisabled}
            onPress={onReceiveLink}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionButtonSecondary,
              accessibilityLayout ? styles.actionButtonAccessibility : null,
              actionDisabled ? styles.actionCardDisabled : null,
              pressed ? styles.actionCardPressed : null,
            ]}
          >
            <Download size={19} color={theme.colors.accent} />
            <Text
              maxFontSizeMultiplier={2}
              numberOfLines={1}
              style={styles.actionLabel}
            >
              {t('node.action.receive')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {section === 'node' ? (
        <NodeConnectionPanel client={client} snapshot={snapshot} />
      ) : null}

      {section === 'node' ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<Radio size={18} color={theme.colors.accent} />}
            title={t('node.section.status')}
            meta={t(NODE_STATUS_LABELS[snapshot.node.status])}
          />

          {snapshot.node.error ? (
            <View
              style={[
                styles.nodeErrorBanner,
                accessibilityLayout
                  ? styles.nodeErrorBannerAccessibility
                  : null,
              ]}
            >
              <Text maxFontSizeMultiplier={2} style={styles.nodeErrorText}>
                {snapshot.node.mode === 'remote'
                  ? getFriendlyRemoteConnectionError(
                      snapshot.node.error,
                      locale
                    )
                  : getFriendlyCoreError(snapshot.node.error, locale)}
              </Text>
              <Pressable
                disabled={retryStartDisabled}
                onPress={onRetryStartCore}
                style={({ pressed }) => [
                  styles.retryButton,
                  retryStartDisabled ? styles.retryButtonDisabled : null,
                  pressed ? styles.pressablePressed : null,
                ]}
              >
                <Text
                  maxFontSizeMultiplier={1.8}
                  style={[
                    styles.retryButtonText,
                    retryStartDisabled ? styles.retryButtonTextDisabled : null,
                  ]}
                >
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={[
              styles.metricsRow,
              accessibilityLayout ? styles.metricsRowAccessibility : null,
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
              styles.p2pPingRow,
              pressed ? styles.linkRowPressed : null,
            ]}
          >
            <RadioTower size={18} color={theme.colors.accent} />
            <View style={styles.p2pPingText}>
              <Text style={styles.p2pPingTitle}>{t('p2pPing.title')}</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {section === 'node' ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<BookOpen size={18} color={theme.colors.accent} />}
            title={t('node.section.knowledge')}
          />
          <View
            style={[
              styles.knowledgeActions,
              accessibilityLayout ? styles.knowledgeActionsAccessibility : null,
            ]}
          >
            <Pressable
              accessibilityLabel={t('node.knowledge.backupA11y')}
              accessibilityRole="button"
              accessibilityState={{ disabled: knowledgeBackupWorking }}
              disabled={knowledgeBackupWorking}
              onPress={onBackupKnowledge}
              style={({ pressed }) => [
                styles.knowledgeAction,
                accessibilityLayout
                  ? styles.knowledgeActionAccessibility
                  : null,
                knowledgeBackupWorking ? styles.actionCardDisabled : null,
                pressed ? styles.actionCardPressed : null,
              ]}
            >
              <FileDown size={18} color={theme.colors.accent} />
              <Text
                maxFontSizeMultiplier={1.8}
                numberOfLines={1}
                style={styles.knowledgeActionText}
              >
                {t('node.knowledge.backup')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('node.knowledge.restoreA11y')}
              accessibilityRole="button"
              accessibilityState={{ disabled: knowledgeBackupWorking }}
              disabled={knowledgeBackupWorking}
              onPress={onRestoreKnowledge}
              style={({ pressed }) => [
                styles.knowledgeAction,
                accessibilityLayout
                  ? styles.knowledgeActionAccessibility
                  : null,
                knowledgeBackupWorking ? styles.actionCardDisabled : null,
                pressed ? styles.actionCardPressed : null,
              ]}
            >
              <ArchiveRestore size={18} color={theme.colors.accent} />
              <Text
                maxFontSizeMultiplier={1.8}
                numberOfLines={1}
                style={styles.knowledgeActionText}
              >
                {t('node.knowledge.restore')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {section === 'files' ? (
        <View
          style={[
            styles.section,
            snapshot.holdings.length === 0 ? styles.emptyFilesSection : null,
          ]}
        >
          <SectionHeader
            icon={<Wifi size={18} color={theme.colors.accent} />}
            title={t(
              isRemote ? 'node.section.remoteSeeding' : 'node.section.seeding'
            )}
            meta={t(
              snapshot.holdings.length === 1
                ? 'node.fileCount.one'
                : 'node.fileCount',
              { count: snapshot.holdings.length }
            )}
          />

          {snapshot.holdings.length ? (
            <View style={styles.holdingList}>
              {snapshot.holdings.map(holding => {
                const isExporting = exportingCid === holding.cid
                const isDeleting = deletingCid === holding.cid
                const isCopied = copiedCid === holding.cid
                const seedTone = getSeedTone(holding.status)

                return (
                  <View key={holding.cid} style={styles.holdingItem}>
                    <View
                      style={[
                        styles.holdingTopRow,
                        accessibilityLayout
                          ? styles.holdingTopRowAccessibility
                          : null,
                      ]}
                    >
                      <View style={styles.fileIcon}>
                        <FileCheck size={20} color={theme.colors.accent} />
                      </View>
                      <View
                        style={[
                          styles.holdingMain,
                          accessibilityLayout
                            ? styles.holdingMainAccessibility
                            : null,
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={2}
                          numberOfLines={accessibilityLayout ? undefined : 2}
                          style={styles.fileName}
                        >
                          {holding.fileName}
                        </Text>
                        <Text maxFontSizeMultiplier={2} style={styles.fileMeta}>
                          {formatBytes(holding.size)} ·{' '}
                          {holding.source === 'published'
                            ? t('node.holding.published')
                            : t('node.holding.downloaded')}
                        </Text>
                      </View>
                      <StatusBadge
                        label={t(SEED_STATUS_LABELS[holding.status])}
                        tone={seedTone}
                      />
                    </View>

                    <View style={styles.cidBlock}>
                      <Text maxFontSizeMultiplier={1.6} style={styles.cidLabel}>
                        CID
                      </Text>
                      <Text maxFontSizeMultiplier={1.6} style={styles.cidText}>
                        {shortCid(holding.cid, 16, 10)}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.topicRow,
                        accessibilityLayout
                          ? styles.topicRowAccessibility
                          : null,
                      ]}
                    >
                      <Text maxFontSizeMultiplier={2} style={styles.topicText}>
                        {holding.topicJoined
                          ? t('node.holding.topicJoined')
                          : t('node.holding.topicWaiting')}
                      </Text>
                      <Text maxFontSizeMultiplier={2} style={styles.topicText}>
                        {holding.peerCount} peer
                      </Text>
                    </View>

                    <View style={styles.holdingActions}>
                      <SmallAction
                        label={
                          isCopied
                            ? t('node.action.copied')
                            : t('node.action.copyLink')
                        }
                        accessibilityLabel={t('node.action.copyLink')}
                        testID={`holding-${holding.cid}-copy-link`}
                        onPress={() => onCopyHoldingLink(holding)}
                        icon={
                          isCopied ? (
                            <CircleCheck
                              size={18}
                              color={theme.colors.success}
                            />
                          ) : (
                            <Copy size={18} color={theme.colors.accent} />
                          )
                        }
                      />
                      <SmallAction
                        label={
                          isExporting
                            ? t('node.action.processing')
                            : t('common.share')
                        }
                        accessibilityLabel={t('common.share')}
                        testID={`holding-${holding.cid}-share`}
                        disabled={isExporting || isDeleting || !isReady}
                        onPress={() => onShareHolding(holding)}
                        icon={
                          isExporting ? (
                            <Loader size={18} color={theme.colors.textMuted} />
                          ) : (
                            <Share2 size={18} color={theme.colors.accent} />
                          )
                        }
                      />
                      <SmallAction
                        label={
                          Platform.OS === 'ios'
                            ? t('node.action.saveToFiles')
                            : t('common.save')
                        }
                        accessibilityLabel={
                          Platform.OS === 'ios'
                            ? t('node.action.saveToFiles')
                            : t('common.save')
                        }
                        testID={`holding-${holding.cid}-save`}
                        disabled={isExporting || isDeleting || !isReady}
                        onPress={() => onSaveHolding(holding)}
                        icon={
                          <Save
                            size={18}
                            color={
                              isReady
                                ? theme.colors.accent
                                : theme.colors.textMuted
                            }
                          />
                        }
                      />
                      <SmallAction
                        danger
                        label={
                          isDeleting
                            ? t('node.action.deleting')
                            : t('common.delete')
                        }
                        accessibilityLabel={t('common.delete')}
                        testID={`holding-${holding.cid}-delete`}
                        disabled={isDeleting || isExporting || !isReady}
                        onPress={() => onDeleteHolding(holding)}
                        icon={
                          isDeleting ? (
                            <Loader size={18} color={theme.colors.textMuted} />
                          ) : (
                            <Trash2 size={18} color={theme.colors.danger} />
                          )
                        }
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          ) : (
            <EmptyState
              centered
              title={t('node.empty.filesTitle')}
              body={t('node.empty.filesBody')}
            />
          )}
        </View>
      ) : null}

      {section === 'transfers' ? (
        <View style={styles.transferPage}>
          <View style={[styles.section, styles.topSection]}>
            <SectionHeader
              icon={<ListChecks size={18} color={theme.colors.accent} />}
              title={t('node.section.activeTransfers')}
              meta={t(
                activeTransfers.length === 1
                  ? 'node.taskCount.one'
                  : 'node.taskCount',
                { count: activeTransfers.length }
              )}
            />
            {activeTransfers.length ? (
              <View style={styles.transferList}>
                {activeTransfers.map(transfer => (
                  <TransferItem
                    key={transfer.id}
                    isReady={isReady}
                    retrying={retryingTransferId === transfer.id}
                    transfer={transfer}
                    onRetry={onRetryTransfer}
                    onShowDetails={onShowTransferDetails}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title={t('node.empty.transfersTitle')}
                body={t('node.empty.transfersBody')}
              />
            )}
          </View>

          {failedTransfers.length ? (
            <View style={styles.section}>
              <SectionHeader
                icon={<Info size={18} color={theme.colors.danger} />}
                title={t('node.section.failedTransfers')}
                meta={t(
                  failedTransfers.length === 1
                    ? 'node.failedTaskCount.one'
                    : 'node.failedTaskCount',
                  { count: failedTransfers.length }
                )}
              />
              <View style={styles.transferList}>
                {failedTransfers.map(transfer => (
                  <TransferItem
                    key={transfer.id}
                    isReady={isReady}
                    retrying={retryingTransferId === transfer.id}
                    transfer={transfer}
                    onRetry={onRetryTransfer}
                    onShowDetails={onShowTransferDetails}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {completedTransfers.length ? (
            <View style={styles.section}>
              <SectionHeader
                icon={<CircleCheck size={18} color={theme.colors.success} />}
                title={t('node.section.completedTransfers')}
                meta={t(
                  completedTransfers.length === 1
                    ? 'node.recordCount.one'
                    : 'node.recordCount',
                  { count: completedTransfers.length }
                )}
              />
              <View style={styles.transferList}>
                {completedTransfers.map(transfer => (
                  <TransferItem
                    key={transfer.id}
                    isReady={isReady}
                    retrying={retryingTransferId === transfer.id}
                    transfer={transfer}
                    onRetry={onRetryTransfer}
                    onShowDetails={onShowTransferDetails}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {section === 'node' ? (
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: diagnosticsOpen }}
            onPress={() => setDiagnosticsOpen(value => !value)}
            style={({ pressed }) => [
              styles.diagnosticsToggle,
              pressed ? styles.linkRowPressed : null,
            ]}
          >
            <View style={styles.diagnosticsTitleGroup}>
              <Radio size={18} color={theme.colors.accent} />
              <View style={styles.diagnosticsTextGroup}>
                <Text maxFontSizeMultiplier={2} style={styles.sectionTitle}>
                  {t('node.diagnostics.title')}
                </Text>
                <Text maxFontSizeMultiplier={2} style={styles.diagnosticsMeta}>
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
                      styles.logItem,
                      accessibilityLayout ? styles.logItemAccessibility : null,
                    ]}
                  >
                    <Text
                      maxFontSizeMultiplier={1.8}
                      style={[
                        styles.logTime,
                        accessibilityLayout
                          ? styles.logTimeAccessibility
                          : null,
                      ]}
                    >
                      {formatLogTime(log.time)}
                    </Text>
                    <View style={styles.logBody}>
                      <Text
                        maxFontSizeMultiplier={1.8}
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
              <EmptyState
                title={t('node.diagnostics.emptyTitle')}
                body={t('node.diagnostics.emptyBody')}
              />
            )
          ) : null}
        </View>
      ) : null}

      {section === 'node' ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<FileText size={18} color={theme.colors.info} />}
            title={t('node.about.title')}
          />
          <View style={styles.linkList}>
            <Pressable
              accessibilityRole="link"
              onPress={onOpenPrivacy}
              style={({ pressed }) => [
                styles.linkRow,
                pressed ? styles.linkRowPressed : null,
              ]}
            >
              <Text maxFontSizeMultiplier={2} style={styles.linkText}>
                {t('node.about.privacy')}
              </Text>
              <ExternalLink size={16} color={theme.colors.textSecondary} />
            </Pressable>
            <View style={styles.linkDivider} />
            <Pressable
              accessibilityRole="link"
              onPress={onOpenTerms}
              style={({ pressed }) => [
                styles.linkRow,
                pressed ? styles.linkRowPressed : null,
              ]}
            >
              <Text maxFontSizeMultiplier={2} style={styles.linkText}>
                {t('node.about.terms')}
              </Text>
              <ExternalLink size={16} color={theme.colors.textSecondary} />
            </Pressable>
            <View style={styles.linkDivider} />
            <Pressable
              accessibilityRole="link"
              onPress={onOpenSupport}
              style={({ pressed }) => [
                styles.linkRow,
                pressed ? styles.linkRowPressed : null,
              ]}
            >
              <Text maxFontSizeMultiplier={2} style={styles.linkText}>
                {t('node.about.support')}
              </Text>
              <ExternalLink size={16} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  )
}

function createNodeStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme

  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingBottom: 32,
      gap: 16,
    },
    contentWithEmptyFiles: {
      minHeight: '100%',
    },
    section: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      gap: 12,
      marginHorizontal: 20,
      padding: 14,
    },
    topSection: {
      marginTop: 20,
    },
    actionPanel: {
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: 20,
      marginTop: 16,
    },
    actionPanelAccessibility: {
      flexDirection: 'column',
    },
    actionButton: {
      borderWidth: 1,
      flex: 1,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: radii.medium,
    },
    actionButtonPrimary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    actionButtonSecondary: {
      borderColor: colors.border,
      backgroundColor: colors.glassSubtle,
    },
    actionButtonAccessibility: {
      flex: 0,
      width: '100%',
      minHeight: 64,
    },
    actionCardDisabled: {
      opacity: 0.42,
    },
    actionCardPressed: {
      opacity: 0.7,
    },
    actionLabel: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    actionLabelPrimary: {
      color: colors.onAccent,
    },
    knowledgeActions: {
      flexDirection: 'row',
      gap: 10,
    },
    knowledgeActionsAccessibility: {
      flexDirection: 'column',
    },
    knowledgeAction: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 12,
    },
    knowledgeActionAccessibility: {
      flex: 0,
      minHeight: 64,
      width: '100%',
    },
    knowledgeActionText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    sectionHeader: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionHeaderAccessibility: {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: 4,
    },
    sectionTitleGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    sectionMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    nodeErrorBanner: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: getToneColor(theme, 'danger'),
      borderRadius: radii.medium,
      backgroundColor: colors.dangerSoft,
    },
    nodeErrorBannerAccessibility: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    nodeErrorText: {
      flex: 1,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
    },
    retryButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radii.medium,
      backgroundColor: colors.danger,
    },
    retryButtonDisabled: {
      backgroundColor: colors.surfaceMuted,
    },
    retryButtonText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: '600',
    },
    retryButtonTextDisabled: {
      color: colors.textMuted,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: 'transparent',
    },
    p2pPingRow: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 56,
      paddingHorizontal: 12,
      backgroundColor: colors.glassSubtle,
    },
    p2pPingText: { flex: 1, gap: 2 },
    p2pPingTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
    metricsRowAccessibility: {
      flexDirection: 'column',
    },
    metric: {
      flex: 1,
      minWidth: 0,
      minHeight: 108,
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    metricAccessibility: {
      flex: 0,
    },
    metricIcon: {
      width: 24,
      height: 24,
      justifyContent: 'center',
    },
    metricValue: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
    },
    metricLabel: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '500',
    },
    holdingList: {
      gap: 10,
    },
    holdingItem: {
      gap: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    holdingTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    holdingTopRowAccessibility: {
      flexDirection: 'column',
    },
    fileIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.medium,
      backgroundColor: colors.accentSoft,
    },
    holdingMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    holdingMainAccessibility: {
      flex: 0,
      width: '100%',
    },
    fileName: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
    },
    fileMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '400',
    },
    badge: {
      minHeight: 24,
      justifyContent: 'center',
      paddingHorizontal: 9,
      borderRadius: radii.full,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    successBadge: {
      backgroundColor: getToneSoftColor(theme, 'success'),
      borderColor: getToneColor(theme, 'success'),
    },
    dangerBadge: {
      backgroundColor: getToneSoftColor(theme, 'danger'),
      borderColor: getToneColor(theme, 'danger'),
    },
    pendingBadge: {
      backgroundColor: getToneSoftColor(theme, 'warning'),
      borderColor: getToneColor(theme, 'warning'),
    },
    mutedBadge: {
      backgroundColor: getToneSoftColor(theme, 'muted'),
      borderColor: colors.border,
    },
    successBadgeText: {
      color: colors.success,
    },
    dangerBadgeText: {
      color: colors.danger,
    },
    pendingBadgeText: {
      color: colors.warning,
    },
    mutedBadgeText: {
      color: colors.textSecondary,
    },
    cidBlock: {
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.small,
      backgroundColor: colors.glassSubtle,
    },
    cidLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    cidText: {
      color: colors.textSecondary,
      fontFamily: Platform.select({
        ios: 'Menlo',
        android: 'monospace',
      }),
      fontSize: 12,
      fontWeight: '500',
    },
    topicRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    topicRowAccessibility: {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: 4,
    },
    topicText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    holdingActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    smallAction: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.glassSubtle,
    },
    smallActionDanger: {
      backgroundColor: colors.dangerSoft,
      borderColor: getToneColor(theme, 'danger'),
    },
    smallActionDisabled: {
      backgroundColor: colors.surfaceMuted,
      opacity: 0.45,
    },
    pressablePressed: {
      opacity: 0.62,
    },
    linkList: {
      gap: 8,
    },
    linkRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    linkRowPressed: {
      backgroundColor: colors.accentSoft,
    },
    linkDivider: {
      height: 0,
      backgroundColor: 'transparent',
    },
    linkText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
    transferPage: {
      gap: 32,
    },
    transferList: {
      gap: 10,
    },
    transferItem: {
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    transferTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    transferTopRowAccessibility: {
      alignItems: 'flex-start',
      flexDirection: 'column',
    },
    transferTitleGroup: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    transferName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    transferMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '400',
    },
    progressTrack: {
      height: 6,
      overflow: 'hidden',
      borderRadius: radii.full,
      backgroundColor: colors.surfaceMuted,
    },
    progressFill: {
      minWidth: 3,
      height: '100%',
      backgroundColor: colors.accent,
    },
    transferActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    transferDetailButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 6,
    },
    transferDetailText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    transferRetryButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.accentSoft,
    },
    transferRetryButtonDisabled: {
      backgroundColor: colors.surfaceMuted,
      opacity: 0.55,
    },
    transferRetryText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '600',
    },
    diagnosticsToggle: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    diagnosticsTitleGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    diagnosticsTextGroup: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    diagnosticsMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '400',
    },
    logList: {
      gap: 8,
    },
    logItem: {
      flexDirection: 'row',
      gap: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.small,
      backgroundColor: colors.glassSubtle,
    },
    logItemAccessibility: {
      flexDirection: 'column',
      gap: 4,
    },
    logTime: {
      width: 42,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '500',
    },
    logTimeAccessibility: {
      width: 'auto',
    },
    logBody: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    logLevel: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: '600',
    },
    logLevelWarn: {
      color: colors.warning,
    },
    logLevelError: {
      color: colors.danger,
    },
    logMessage: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '400',
    },
    emptyState: {
      alignItems: 'flex-start',
      gap: 5,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    emptyFilesSection: {
      flex: 1,
    },
    emptyStateCentered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 20,
    },
    emptyTextCentered: {
      textAlign: 'center',
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'left',
    },
    emptyBody: {
      maxWidth: 280,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400',
      textAlign: 'left',
    },
  })
}

const nodeStyles = {
  light: createNodeStyles(lightTheme),
  dark: createNodeStyles(darkTheme),
} as const

function useNodeStyles() {
  const theme = useMostBoxTheme()
  return nodeStyles[theme.mode]
}

const progressWidthStyles = StyleSheet.create(
  Object.fromEntries(
    PROGRESS_WIDTH_VALUES.map(value => [
      `progressWidth${value}`,
      { width: `${value}%` as ViewStyle['width'] },
    ])
  ) as ProgressWidthStyles
)
