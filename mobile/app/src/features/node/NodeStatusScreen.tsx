import { type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type ViewStyle,
  View,
} from 'react-native'
import {
  Activity,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  HardDrive,
  ListChecks,
  Loader,
  Radio,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react-native'
import type {
  LogLevel,
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
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

export type NodeStatusScreenProps = {
  section: 'files' | 'transfers' | 'settings'
  snapshot: MobileCoreSnapshot
  copiedCid: string | null
  deletingCid: string | null
  exportingCid: string | null
  actionDisabled: boolean
  onPublishFile: () => void | Promise<void>
  onReceiveLink: () => void
  onCopyHoldingLink: (holding: MobileHolding) => void | Promise<void>
  onDeleteHolding: (holding: MobileHolding) => void
  onSaveHolding: (holding: MobileHolding) => void | Promise<void>
  onShareHolding: (holding: MobileHolding) => void | Promise<void>
  onOpenPrivacy: () => void | Promise<void>
  onOpenTerms: () => void | Promise<void>
  onOpenSupport: () => void | Promise<void>
  onRetryStartCore: () => void | Promise<void>
  retryStartDisabled: boolean
}

const NODE_STATUS_LABELS: Record<NodeRuntimeStatus, string> = {
  idle: '未启动',
  starting: '启动中',
  ready: '在线',
  stopping: '停止中',
  error: '异常',
}

const SEED_STATUS_LABELS: Record<SeedStatus, string> = {
  queued: '排队中',
  joining: '加入中',
  active: '做种中',
  paused: '已暂停',
  error: '异常',
}

const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  queued: '排队中',
  running: '传输中',
  completed: '已完成',
  failed: '失败',
  waitingCore: '等待核心',
}

const TRANSFER_KIND_LABELS: Record<MobileTransfer['kind'], string> = {
  publish: '发布',
  download: '下载',
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  info: '信息',
  warn: '提醒',
  error: '错误',
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

  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
      <Text style={[styles.badgeText, textStyle]}>{label}</Text>
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

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  )
}

type EmptyStateProps = {
  title: string
  body: string
}

function EmptyState({ title, body }: EmptyStateProps) {
  const styles = useNodeStyles()

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
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

export function NodeStatusScreen({
  section,
  snapshot,
  copiedCid,
  deletingCid,
  exportingCid,
  actionDisabled,
  onPublishFile,
  onReceiveLink,
  onCopyHoldingLink,
  onDeleteHolding,
  onSaveHolding,
  onShareHolding,
  onOpenPrivacy,
  onOpenTerms,
  onOpenSupport,
  onRetryStartCore,
  retryStartDisabled,
}: NodeStatusScreenProps) {
  const theme = useMostBoxTheme()
  const styles = nodeStyles[theme.mode]
  const isReady = snapshot.node.status === 'ready'
  const latestTransfers = snapshot.transfers
  const recentLogs = snapshot.logs.slice(0, 6)
  const activeTransfers = snapshot.transfers.filter(
    transfer =>
      transfer.status === 'queued' ||
      transfer.status === 'running' ||
      transfer.status === 'waitingCore'
  )

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {section === 'files' ? (
        <View style={styles.actionPanel}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: actionDisabled }}
            disabled={actionDisabled}
            onPress={onPublishFile}
            style={({ pressed }) => [
              styles.actionCard,
              actionDisabled ? styles.actionCardDisabled : null,
              pressed ? styles.actionCardPressed : null,
            ]}
          >
            <Upload size={21} color={theme.colors.accent} />
            <Text style={styles.actionLabel}>发布文件</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onReceiveLink}
            style={({ pressed }) => [
              styles.actionCard,
              pressed ? styles.actionCardPressed : null,
            ]}
          >
            <Download size={21} color={theme.colors.info} />
            <Text style={[styles.actionLabel, styles.actionLabelInfo]}>
              接收文件
            </Text>
          </Pressable>
        </View>
      ) : null}

      {section === 'settings' ? (
        <View style={[styles.section, styles.topSection]}>
          <SectionHeader
            icon={<Radio size={18} color={theme.colors.accent} />}
            title="节点状态"
            meta={NODE_STATUS_LABELS[snapshot.node.status]}
          />

          {snapshot.node.error ? (
            <View style={styles.nodeErrorBanner}>
              <Text style={styles.nodeErrorText}>{snapshot.node.error}</Text>
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
                  style={[
                    styles.retryButtonText,
                    retryStartDisabled ? styles.retryButtonTextDisabled : null,
                  ]}
                >
                  重试
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.metricsRow}>
            <Metric
              icon={<Activity size={17} color={theme.colors.accent} />}
              label="在线 Peer"
              value={String(snapshot.node.peerCount)}
            />
            <Metric
              icon={<HardDrive size={17} color={theme.colors.info} />}
              label="本机做种"
              value={String(snapshot.holdings.length)}
            />
            <Metric
              icon={<ShieldCheck size={17} color={theme.colors.warning} />}
              label="附件校验"
              value="开启"
            />
          </View>
        </View>
      ) : null}

      {section === 'files' ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<Wifi size={18} color={theme.colors.accent} />}
            title="正在做种"
            meta={`${snapshot.holdings.length} 个文件`}
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
                    <View style={styles.holdingTopRow}>
                      <View style={styles.fileIcon}>
                        <FileCheck size={20} color={theme.colors.accent} />
                      </View>
                      <View style={styles.holdingMain}>
                        <Text style={styles.fileName} numberOfLines={2}>
                          {holding.fileName}
                        </Text>
                        <Text style={styles.fileMeta}>
                          {formatBytes(holding.size)} ·{' '}
                          {holding.source === 'published' ? '已发布' : '已下载'}
                        </Text>
                      </View>
                      <StatusBadge
                        label={SEED_STATUS_LABELS[holding.status]}
                        tone={seedTone}
                      />
                    </View>

                    <View style={styles.cidBlock}>
                      <Text style={styles.cidLabel}>CID</Text>
                      <Text style={styles.cidText}>
                        {shortCid(holding.cid, 16, 10)}
                      </Text>
                    </View>

                    <View style={styles.topicRow}>
                      <Text style={styles.topicText}>
                        {holding.topicJoined
                          ? 'Topic 已加入'
                          : '等待加入 topic'}
                      </Text>
                      <Text style={styles.topicText}>
                        {holding.peerCount} peer
                      </Text>
                    </View>

                    <View style={styles.holdingActions}>
                      <SmallAction
                        label={isCopied ? '已复制' : '复制链接'}
                        accessibilityLabel="复制链接"
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
                        label={isExporting ? '处理中' : '分享'}
                        accessibilityLabel="分享"
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
                        label={Platform.OS === 'ios' ? '存到文件' : '保存'}
                        accessibilityLabel={
                          Platform.OS === 'ios' ? '存到文件' : '保存'
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
                        label={isDeleting ? '删除中' : '删除'}
                        accessibilityLabel="删除"
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
              title="还没有本机附件"
              body="发送或下载附件完成后，文件会自动加入做种列表。"
            />
          )}
        </View>
      ) : null}

      {section === 'transfers' ? (
        <View style={[styles.section, styles.topSection]}>
          <SectionHeader
            icon={<ListChecks size={18} color={theme.colors.warning} />}
            title="传输活动"
            meta={
              activeTransfers.length
                ? `${activeTransfers.length} 个进行中`
                : '空闲'
            }
          />

          {latestTransfers.length ? (
            <View style={styles.transferList}>
              {latestTransfers.map(transfer => (
                <View key={transfer.id} style={styles.transferItem}>
                  <View style={styles.transferTopRow}>
                    <View style={styles.transferTitleGroup}>
                      <Text style={styles.transferName} numberOfLines={1}>
                        {transfer.fileName ||
                          TRANSFER_KIND_LABELS[transfer.kind]}
                      </Text>
                      <Text style={styles.transferMeta}>
                        {TRANSFER_KIND_LABELS[transfer.kind]} ·{' '}
                        {transfer.message}
                      </Text>
                    </View>
                    <StatusBadge
                      label={TRANSFER_STATUS_LABELS[transfer.status]}
                      tone={getTransferTone(transfer.status)}
                    />
                  </View>
                  <ProgressBar progress={transfer.progress} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="暂无传输"
              body="文件发布和下载进度会显示在这里。"
            />
          )}
        </View>
      ) : null}

      {section === 'settings' ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<Radio size={18} color={theme.colors.accent} />}
            title="节点日志"
            meta={recentLogs.length ? `最近 ${recentLogs.length} 条` : '暂无'}
          />

          {recentLogs.length ? (
            <View style={styles.logList}>
              {recentLogs.map(log => (
                <View key={log.id} style={styles.logItem}>
                  <Text style={styles.logTime}>{formatLogTime(log.time)}</Text>
                  <View style={styles.logBody}>
                    <Text
                      style={[
                        styles.logLevel,
                        log.level === 'error' ? styles.logLevelError : null,
                        log.level === 'warn' ? styles.logLevelWarn : null,
                      ]}
                    >
                      {LOG_LEVEL_LABELS[log.level]}
                    </Text>
                    <Text style={styles.logMessage}>{log.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="日志为空"
              body="核心状态变化和传输事件会记录在这里。"
            />
          )}
        </View>
      ) : null}

      {section === 'settings' ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<FileText size={18} color={theme.colors.info} />}
            title="关于与政策"
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
              <Text style={styles.linkText}>隐私政策</Text>
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
              <Text style={styles.linkText}>使用条款</Text>
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
              <Text style={styles.linkText}>问题反馈</Text>
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
      paddingBottom: 32,
      gap: 32,
    },
    section: {
      gap: 10,
      marginHorizontal: 20,
    },
    topSection: {
      marginTop: 20,
    },
    actionPanel: {
      flexDirection: 'row',
      gap: 1,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.border,
    },
    actionCard: {
      flex: 1,
      minHeight: 88,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
    },
    actionCardDisabled: {
      opacity: 0.42,
    },
    actionCardPressed: {
      backgroundColor: colors.accentSoft,
    },
    actionLabel: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '500',
    },
    actionLabelInfo: {
      color: colors.info,
    },
    sectionHeader: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
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
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
      backgroundColor: colors.dangerSoft,
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
      gap: 1,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.border,
    },
    metric: {
      flex: 1,
      minWidth: 0,
      minHeight: 108,
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 14,
      backgroundColor: colors.background,
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
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    holdingItem: {
      gap: 14,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    holdingTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    fileIcon: {
      width: 28,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    holdingMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
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
      minHeight: 22,
      justifyContent: 'center',
      paddingHorizontal: 0,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    successBadge: {
      backgroundColor: 'transparent',
    },
    dangerBadge: {
      backgroundColor: 'transparent',
    },
    pendingBadge: {
      backgroundColor: 'transparent',
    },
    mutedBadge: {
      backgroundColor: 'transparent',
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
      paddingVertical: 8,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
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
      borderRadius: radii.small,
      backgroundColor: 'transparent',
    },
    smallActionDanger: {
      backgroundColor: 'transparent',
    },
    smallActionDisabled: {
      backgroundColor: colors.surfaceMuted,
      opacity: 0.45,
    },
    pressablePressed: {
      opacity: 0.62,
    },
    linkList: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    linkRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 0,
    },
    linkRowPressed: {
      backgroundColor: colors.accentSoft,
    },
    linkDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    linkText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
    transferList: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    transferItem: {
      gap: 12,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    transferTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
      height: 3,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    progressFill: {
      minWidth: 3,
      height: '100%',
      backgroundColor: colors.accent,
    },
    logList: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    logItem: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    logTime: {
      width: 42,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '500',
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
      paddingVertical: 28,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
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
