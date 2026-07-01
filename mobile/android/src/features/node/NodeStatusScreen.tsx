import { type ReactNode } from 'react'
import {
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
  FileCheck,
  HardDrive,
  ListChecks,
  Loader,
  Radio,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
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

export type NodeStatusScreenProps = {
  snapshot: MobileCoreSnapshot
  copiedCid: string | null
  deletingCid: string | null
  exportingCid: string | null
  onCopyHoldingLink: (holding: MobileHolding) => void | Promise<void>
  onDeleteHolding: (holding: MobileHolding) => void
  onSaveHolding: (holding: MobileHolding) => void | Promise<void>
  onShareHolding: (holding: MobileHolding) => void | Promise<void>
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
  disabled?: boolean
  danger?: boolean
}

function SmallAction({
  label,
  icon,
  onPress,
  disabled = false,
  danger = false,
}: SmallActionProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.smallAction,
        danger ? styles.smallActionDanger : null,
        disabled ? styles.smallActionDisabled : null,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.smallActionText,
          danger ? styles.smallActionDangerText : null,
          disabled ? styles.disabledText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

type SectionHeaderProps = {
  icon: ReactNode
  title: string
  meta?: string
}

function SectionHeader({ icon, title, meta }: SectionHeaderProps) {
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
  snapshot,
  copiedCid,
  deletingCid,
  exportingCid,
  onCopyHoldingLink,
  onDeleteHolding,
  onSaveHolding,
  onShareHolding,
  onRetryStartCore,
  retryStartDisabled,
}: NodeStatusScreenProps) {
  const isReady = snapshot.node.status === 'ready'
  const latestTransfers = snapshot.transfers.slice(0, 4)
  const recentLogs = snapshot.logs.slice(0, 6)
  const activeTransfers = snapshot.transfers.filter(
    transfer =>
      transfer.status === 'queued' ||
      transfer.status === 'running' ||
      transfer.status === 'waitingCore'
  )

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <SectionHeader
          icon={<Radio size={18} color="#0f766e" />}
          title="节点状态"
          meta={NODE_STATUS_LABELS[snapshot.node.status]}
        />

        {snapshot.node.error ? (
          <View style={styles.nodeErrorBanner}>
            <Text style={styles.nodeErrorText}>{snapshot.node.error}</Text>
            <Pressable
              disabled={retryStartDisabled}
              onPress={onRetryStartCore}
              style={[
                styles.retryButton,
                retryStartDisabled ? styles.retryButtonDisabled : null,
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
            icon={<Activity size={17} color="#0f766e" />}
            label="在线 Peer"
            value={String(snapshot.node.peerCount)}
          />
          <Metric
            icon={<HardDrive size={17} color="#2563eb" />}
            label="本机做种"
            value={String(snapshot.holdings.length)}
          />
          <Metric
            icon={<ShieldCheck size={17} color="#b45309" />}
            label="附件校验"
            value="开启"
          />
        </View>
      </View>

      <View style={styles.panel}>
        <SectionHeader
          icon={<Wifi size={18} color="#0f766e" />}
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
                      <FileCheck size={20} color="#0f766e" />
                    </View>
                    <View style={styles.holdingMain}>
                      <Text style={styles.fileName} numberOfLines={2}>
                        {holding.fileName}
                      </Text>
                      <Text style={styles.fileMeta}>
                        {formatBytes(holding.size)} ·{' '}
                        {holding.source === 'published'
                          ? '已发布'
                          : '已下载'}
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
                    <Text style={styles.topicText}>{holding.peerCount} peer</Text>
                  </View>

                  <View style={styles.holdingActions}>
                    <SmallAction
                      label={isCopied ? '已复制' : '复制链接'}
                      onPress={() => onCopyHoldingLink(holding)}
                      icon={
                        isCopied ? (
                          <CircleCheck size={15} color="#0f766e" />
                        ) : (
                          <Copy size={15} color="#0f766e" />
                        )
                      }
                    />
                    <SmallAction
                      label={isExporting ? '处理中' : '分享'}
                      disabled={isExporting || isDeleting || !isReady}
                      onPress={() => onShareHolding(holding)}
                      icon={
                        isExporting ? (
                          <Loader size={15} color="#94a3b8" />
                        ) : (
                          <Share2 size={15} color="#0f766e" />
                        )
                      }
                    />
                    <SmallAction
                      label="保存"
                      disabled={isExporting || isDeleting || !isReady}
                      onPress={() => onSaveHolding(holding)}
                      icon={
                        <Save
                          size={15}
                          color={isReady ? '#0f766e' : '#94a3b8'}
                        />
                      }
                    />
                    <SmallAction
                      danger
                      label={isDeleting ? '删除中' : '删除'}
                      disabled={isDeleting || isExporting || !isReady}
                      onPress={() => onDeleteHolding(holding)}
                      icon={
                        isDeleting ? (
                          <Loader size={15} color="#94a3b8" />
                        ) : (
                          <Trash2 size={15} color="#b91c1c" />
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

      <View style={styles.panel}>
        <SectionHeader
          icon={<ListChecks size={18} color="#b45309" />}
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
                      {transfer.fileName || TRANSFER_KIND_LABELS[transfer.kind]}
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
            body="附件发送和下载进度会显示在这里。"
          />
        )}
      </View>

      <View style={styles.panel}>
        <SectionHeader
          icon={<Radio size={18} color="#6d5dfc" />}
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 14,
    paddingBottom: 96,
    gap: 14,
  },
  panel: {
    gap: 13,
    marginHorizontal: 16,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    minHeight: 28,
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
    color: '#13231f',
    fontSize: 17,
    fontWeight: '900',
  },
  sectionMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '800',
  },
  nodeErrorBanner: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  nodeErrorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  retryButton: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#991b1b',
  },
  retryButtonDisabled: {
    backgroundColor: '#f0b4b4',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  retryButtonTextDisabled: {
    color: '#fee2e2',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'center',
    gap: 5,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fbf9',
  },
  metricIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edf6f2',
  },
  metricValue: {
    color: '#12211d',
    fontSize: 23,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#63716c',
    fontSize: 11,
    fontWeight: '800',
  },
  holdingList: {
    gap: 12,
  },
  holdingItem: {
    gap: 11,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe6e1',
    backgroundColor: '#fbfdfc',
  },
  holdingTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  fileIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edfdf7',
  },
  holdingMain: {
    flex: 1,
    gap: 3,
  },
  fileName: {
    color: '#13231f',
    fontSize: 15,
    fontWeight: '900',
  },
  fileMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    minHeight: 27,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#e7ece9',
  },
  badgeText: {
    color: '#5b6b66',
    fontSize: 11,
    fontWeight: '900',
  },
  successBadge: {
    backgroundColor: '#dff8ec',
  },
  dangerBadge: {
    backgroundColor: '#fee2e2',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
  },
  mutedBadge: {
    backgroundColor: '#e7ece9',
  },
  successBadgeText: {
    color: '#116149',
  },
  dangerBadgeText: {
    color: '#991b1b',
  },
  pendingBadgeText: {
    color: '#92400e',
  },
  mutedBadgeText: {
    color: '#5b6b66',
  },
  cidBlock: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#eef4f1',
  },
  cidLabel: {
    color: '#63716c',
    fontSize: 10,
    fontWeight: '900',
  },
  cidText: {
    color: '#13231f',
    fontSize: 12,
    fontWeight: '800',
  },
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  topicText: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '800',
  },
  holdingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallAction: {
    flex: 1,
    minWidth: 128,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d5e3dd',
    backgroundColor: '#f8fbf9',
  },
  smallActionDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  smallActionDisabled: {
    borderColor: '#d9e2de',
    backgroundColor: '#edf2ef',
  },
  smallActionText: {
    color: '#13231f',
    fontSize: 12,
    fontWeight: '900',
  },
  smallActionDangerText: {
    color: '#b91c1c',
  },
  disabledText: {
    color: '#94a3a0',
  },
  transferList: {
    gap: 10,
  },
  transferItem: {
    gap: 10,
    paddingVertical: 2,
  },
  transferTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transferTitleGroup: {
    flex: 1,
    gap: 3,
  },
  transferName: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  transferMeta: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#e6eee9',
  },
  progressFill: {
    minWidth: 3,
    height: '100%',
    backgroundColor: '#2563eb',
  },
  logList: {
    gap: 11,
  },
  logItem: {
    flexDirection: 'row',
    gap: 10,
  },
  logTime: {
    width: 42,
    color: '#63716c',
    fontSize: 11,
    fontWeight: '800',
  },
  logBody: {
    flex: 1,
    gap: 2,
  },
  logLevel: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
  },
  logLevelWarn: {
    color: '#b45309',
  },
  logLevelError: {
    color: '#b91c1c',
  },
  logMessage: {
    color: '#44514d',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    gap: 4,
    paddingVertical: 14,
  },
  emptyTitle: {
    color: '#13231f',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyBody: {
    color: '#63716c',
    fontSize: 12,
    fontWeight: '700',
  },
})

const progressWidthStyles = StyleSheet.create(
  Object.fromEntries(
    PROGRESS_WIDTH_VALUES.map(value => [
      `progressWidth${value}`,
      { width: `${value}%` as ViewStyle['width'] },
    ])
  ) as ProgressWidthStyles
)
