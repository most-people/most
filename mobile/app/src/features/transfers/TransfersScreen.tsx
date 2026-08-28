import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { Ban, CircleCheck, Info, Loader, RotateCcw } from 'lucide-react-native'
import type {
  MobileCoreSnapshot,
  MobileHolding,
  MobileTransfer,
  TransferStatus,
} from '../../mobileCore/types'
import { useI18n, type MessageKey } from '../../i18n'
import {
  MostButton,
  StatusBadge,
  getGlassSurfaceStyle,
} from '../../ui/components'
import {
  getTransferDisplayMessage,
  partitionTransfers,
} from '../../ui/presentation'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'
import { getTransferActions } from './transferModel'

type TransferView = 'active' | 'completed' | 'failed'
type ProgressWidthName = `progressWidth${number}`
type ProgressWidthStyles = Record<ProgressWidthName, ViewStyle>

export type TransfersScreenProps = {
  snapshot: MobileCoreSnapshot
  isReady: boolean
  retryingTransferId: string | null
  cancellingCid: string | null
  reselectToken: number
  onRetryTransfer: (transfer: MobileTransfer) => void | Promise<void>
  onShowTransferDetails: (transfer: MobileTransfer) => void
  onCancelDownload: (transfer: MobileTransfer) => void | Promise<void>
  onOpenHolding: (holding: MobileHolding) => void | Promise<void>
}

const TRANSFER_STATUS_KEYS: Record<TransferStatus, MessageKey> = {
  queued: 'node.transfer.queued',
  running: 'node.transfer.running',
  completed: 'node.transfer.completed',
  failed: 'node.transfer.failed',
  waitingCore: 'node.transfer.waitingCore',
}

function getTransferTone(status: TransferStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'running') return 'warning' as const
  return 'muted' as const
}

function getProgressWidthStyle(progress: number) {
  const value = Number.isFinite(progress)
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : 0
  return progressWidthStyles[`progressWidth${value}` as ProgressWidthName]
}

export function TransfersScreen({
  snapshot,
  isReady,
  retryingTransferId,
  cancellingCid,
  reselectToken,
  onRetryTransfer,
  onShowTransferDetails,
  onCancelDownload,
  onOpenHolding,
}: TransfersScreenProps) {
  const { locale, t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = transferStyles[theme.mode]
  const scrollRef = useRef<ScrollView | null>(null)
  const [view, setView] = useState<TransferView>('active')
  const { active, completed, failed } = useMemo(
    () => partitionTransfers(snapshot.transfers),
    [snapshot.transfers]
  )

  useEffect(() => {
    if (reselectToken > 0) {
      scrollRef.current?.scrollTo({ animated: true, y: 0 })
    }
  }, [reselectToken])

  useEffect(() => {
    if (active.length) setView('active')
  }, [active.length])

  const transfers =
    view === 'active' ? active : view === 'failed' ? failed : completed
  const counts: Record<TransferView, number> = {
    active: active.length,
    completed: completed.length,
    failed: failed.length,
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <View accessibilityRole="tablist" style={styles.segmented}>
          {(['active', 'completed', 'failed'] as const).map(item => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: view === item }}
              key={item}
              onPress={() => setView(item)}
              style={({ pressed }) => [
                styles.segment,
                view === item ? styles.segmentActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.segmentText,
                  view === item ? styles.segmentTextActive : null,
                ]}
              >
                {t(`transfers.view.${item}` as MessageKey)}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  view === item ? styles.countBadgeActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    view === item ? styles.countTextActive : null,
                  ]}
                >
                  {counts[item]}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {transfers.length ? (
          <View style={styles.transferList}>
            {transfers.map(transfer => {
              const retrying = retryingTransferId === transfer.id
              const cancelling =
                Boolean(transfer.cid) && cancellingCid === transfer.cid
              const holding = transfer.cid
                ? snapshot.holdings.find(item => item.cid === transfer.cid)
                : undefined
              const { canCancel, canOpen, canRetry } = getTransferActions(
                transfer,
                Boolean(holding)
              )

              return (
                <Pressable
                  accessibilityRole={canOpen ? 'button' : undefined}
                  disabled={!canOpen}
                  key={transfer.id}
                  onPress={() => {
                    if (holding) void onOpenHolding(holding)
                  }}
                  style={({ pressed }) => [
                    styles.transferItem,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.transferTopRow}>
                    <View style={styles.transferMain}>
                      <Text numberOfLines={2} style={styles.transferName}>
                        {transfer.fileName ||
                          t(
                            transfer.kind === 'download'
                              ? 'node.transfer.download'
                              : 'node.transfer.publish'
                          )}
                      </Text>
                      <Text numberOfLines={2} style={styles.transferMessage}>
                        {getTransferDisplayMessage(
                          transfer.message,
                          transfer.status,
                          locale
                        )}
                      </Text>
                    </View>
                    <StatusBadge
                      label={t(TRANSFER_STATUS_KEYS[transfer.status])}
                      tone={getTransferTone(transfer.status)}
                    />
                  </View>

                  {transfer.status === 'queued' ||
                  transfer.status === 'running' ||
                  transfer.status === 'waitingCore' ? (
                    <View style={styles.progressGroup}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            getProgressWidthStyle(transfer.progress),
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {Math.max(
                          0,
                          Math.min(100, Math.round(transfer.progress))
                        )}
                        %
                      </Text>
                    </View>
                  ) : null}

                  {canCancel ? (
                    <MostButton
                      disabled={cancelling}
                      icon={
                        cancelling ? (
                          <Loader size={16} color={theme.colors.textMuted} />
                        ) : (
                          <Ban size={16} color={theme.colors.danger} />
                        )
                      }
                      onPress={() => onCancelDownload(transfer)}
                      style={styles.cancelButton}
                      variant="ghost"
                    >
                      {cancelling
                        ? t('transfers.cancelling')
                        : t('transfers.cancel')}
                    </MostButton>
                  ) : null}

                  {canRetry ? (
                    <View style={styles.failureActions}>
                      <MostButton
                        icon={
                          <Info size={16} color={theme.colors.textSecondary} />
                        }
                        onPress={() => onShowTransferDetails(transfer)}
                        style={styles.failureAction}
                        variant="ghost"
                      >
                        {t('node.transfer.errorDetails')}
                      </MostButton>
                      <MostButton
                        disabled={retrying || !isReady}
                        icon={
                          retrying ? (
                            <Loader size={16} color={theme.colors.textMuted} />
                          ) : (
                            <RotateCcw
                              size={16}
                              color={
                                isReady
                                  ? theme.colors.accent
                                  : theme.colors.textMuted
                              }
                            />
                          )
                        }
                        onPress={() => onRetryTransfer(transfer)}
                        style={styles.failureAction}
                      >
                        {retrying
                          ? t('node.transfer.retrying')
                          : transfer.kind === 'download'
                            ? t('node.transfer.redownload')
                            : t('node.transfer.reselect')}
                      </MostButton>
                    </View>
                  ) : null}

                  {canOpen ? (
                    <View style={styles.openHint}>
                      <CircleCheck size={15} color={theme.colors.success} />
                      <Text style={styles.openHintText}>
                        {t('transfers.openFile')}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {t(`transfers.empty.${view}Title` as MessageKey)}
            </Text>
            <Text style={styles.emptyBody}>
              {t(`transfers.empty.${view}Body` as MessageKey)}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
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
      marginTop: 20,
      padding: 14,
    },
    segmented: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      padding: 3,
    },
    segment: {
      alignItems: 'center',
      borderRadius: radii.small,
      flex: 1,
      flexDirection: 'row',
      gap: 5,
      justifyContent: 'center',
      minHeight: 42,
      paddingHorizontal: 5,
    },
    segmentActive: {
      backgroundColor: colors.accentSoft,
    },
    segmentText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    segmentTextActive: {
      color: colors.accent,
    },
    countBadge: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 19,
      minWidth: 19,
      paddingHorizontal: 5,
    },
    countBadgeActive: {
      backgroundColor: colors.accent,
    },
    countText: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '700',
    },
    countTextActive: {
      color: colors.onAccent,
    },
    transferList: {
      gap: 10,
    },
    transferItem: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      gap: 12,
      padding: 12,
    },
    transferTopRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    transferMain: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    transferName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    transferMessage: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    progressGroup: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    progressTrack: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      flex: 1,
      height: 6,
      overflow: 'hidden',
    },
    progressFill: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      height: '100%',
    },
    progressText: {
      color: colors.textSecondary,
      fontSize: 11,
      minWidth: 34,
      textAlign: 'right',
    },
    cancelButton: {
      alignSelf: 'flex-end',
      borderColor: colors.danger,
      borderWidth: 1,
      minHeight: 40,
    },
    failureActions: {
      flexDirection: 'row',
      gap: 10,
    },
    failureAction: {
      flex: 1,
      minHeight: 40,
    },
    openHint: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'flex-end',
    },
    openHintText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'flex-start',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      gap: 5,
      padding: 16,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'left',
    },
    emptyBody: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 280,
      textAlign: 'left',
    },
    pressed: {
      opacity: 0.72,
    },
  })
}

const transferStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
}

const progressWidthStyles = StyleSheet.create(
  Object.fromEntries(
    Array.from({ length: 101 }, (_, value) => [
      `progressWidth${value}`,
      { width: `${value}%` },
    ])
  ) as ProgressWidthStyles
)
