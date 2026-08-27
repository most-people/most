import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  Filter,
  HardDriveDownload,
  MoreHorizontal,
  Save,
  Search,
  Share2,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react-native'
import type {
  MobileCoreSnapshot,
  MobileHolding,
  SeedStatus,
} from '../../mobileCore/types'
import { getCidTopicDigest } from '../../mobileCore/protocol'
import { useI18n, type MessageKey } from '../../i18n'
import {
  BottomSheetCard,
  IconButton,
  MostButton,
  StatusBadge,
  getGlassSurfaceStyle,
} from '../../ui/components'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'
import { filterHoldings, type FileFilter } from './filesModel'

export type FilesScreenProps = {
  detailRequest: { cid: string; token: number } | null
  snapshot: MobileCoreSnapshot
  copiedCid: string | null
  deletingCid: string | null
  exportingCid: string | null
  actionDisabled: boolean
  reselectToken: number
  onPublishFile: () => void | Promise<void>
  onReceiveLink: () => void
  onOpenHolding: (holding: MobileHolding) => void | Promise<void>
  onCopyHoldingLink: (holding: MobileHolding) => void | Promise<void>
  onDeleteHolding: (holding: MobileHolding) => void
  onSaveHolding: (holding: MobileHolding) => void | Promise<void>
  onShareHolding: (holding: MobileHolding) => void | Promise<void>
}

const SEED_LABELS: Record<SeedStatus, MessageKey> = {
  queued: 'node.seed.queued',
  joining: 'node.seed.joining',
  active: 'node.seed.active',
  paused: 'node.seed.paused',
  error: 'node.seed.error',
}

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

function getSeedTone(status: SeedStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'error') return 'danger' as const
  if (status === 'queued' || status === 'joining') return 'warning' as const
  return 'muted' as const
}

export function FilesScreen({
  detailRequest,
  snapshot,
  copiedCid,
  deletingCid,
  exportingCid,
  actionDisabled,
  reselectToken,
  onPublishFile,
  onReceiveLink,
  onOpenHolding,
  onCopyHoldingLink,
  onDeleteHolding,
  onSaveHolding,
  onShareHolding,
}: FilesScreenProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = fileStyles[theme.mode]
  const scrollRef = useRef<ScrollView | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FileFilter>('all')
  const [selectedCid, setSelectedCid] = useState('')
  const isRemote = snapshot.node.mode === 'remote'

  useEffect(() => {
    if (reselectToken > 0) {
      scrollRef.current?.scrollTo({ animated: true, y: 0 })
    }
  }, [reselectToken])

  useEffect(() => {
    if (
      detailRequest &&
      snapshot.holdings.some(item => item.cid === detailRequest.cid)
    ) {
      setSelectedCid(detailRequest.cid)
    }
  }, [detailRequest, snapshot.holdings])

  const selectedHolding = useMemo(
    () => snapshot.holdings.find(item => item.cid === selectedCid) || null,
    [selectedCid, snapshot.holdings]
  )
  const visibleHoldings = useMemo(
    () => filterHoldings(snapshot.holdings, query, filter),
    [filter, query, snapshot.holdings]
  )

  const closeDetails = () => setSelectedCid('')

  return (
    <>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.primaryActions}>
          <MostButton
            disabled={actionDisabled}
            icon={<Upload size={19} color={theme.colors.onAccent} />}
            onPress={onPublishFile}
            style={styles.primaryAction}
            variant="primary"
          >
            {t('node.action.publish')}
          </MostButton>
          <MostButton
            disabled={actionDisabled}
            icon={<Download size={19} color={theme.colors.accent} />}
            onPress={onReceiveLink}
            style={styles.primaryAction}
          >
            {t('node.action.receive')}
          </MostButton>
        </View>

        <View
          style={[
            styles.section,
            snapshot.holdings.length === 0 ? styles.emptyFilesSection : null,
          ]}
        >
          {snapshot.holdings.length ? (
            <View style={styles.finder}>
              <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                  <Search size={18} color={theme.colors.textMuted} />
                  <TextInput
                    accessibilityLabel={t('files.search.a11y')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setQuery}
                    placeholder={t('files.search.placeholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.searchInput}
                    value={query}
                  />
                  {query ? (
                    <IconButton
                      accessibilityLabel={t('files.search.clear')}
                      onPress={() => setQuery('')}
                      style={styles.clearButton}
                      variant="ghost"
                    >
                      <X size={17} color={theme.colors.textMuted} />
                    </IconButton>
                  ) : null}
                </View>
                <View style={styles.filterIcon}>
                  <Filter size={18} color={theme.colors.accent} />
                </View>
              </View>

              <View accessibilityRole="tablist" style={styles.filters}>
                {(['all', 'active', 'attention'] as const).map(item => (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: filter === item }}
                    key={item}
                    onPress={() => setFilter(item)}
                    style={({ pressed }) => [
                      styles.filter,
                      filter === item ? styles.filterActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.filterText,
                        filter === item ? styles.filterTextActive : null,
                      ]}
                    >
                      {t(`files.filter.${item}` as MessageKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleGroup}>
              <Wifi size={18} color={theme.colors.accent} />
              <Text style={styles.sectionTitle}>
                {t(
                  isRemote
                    ? 'node.section.remoteSeeding'
                    : 'node.section.seeding'
                )}
              </Text>
            </View>
            <Text style={styles.sectionMeta}>
              {t(
                visibleHoldings.length === 1
                  ? 'node.fileCount.one'
                  : 'node.fileCount',
                { count: visibleHoldings.length }
              )}
            </Text>
          </View>

          {visibleHoldings.length ? (
            <View style={styles.fileList}>
              {visibleHoldings.map(holding => (
                <Pressable
                  accessibilityHint={t('files.details.hint')}
                  accessibilityRole="button"
                  key={holding.cid}
                  onPress={() => setSelectedCid(holding.cid)}
                  style={({ pressed }) => [
                    styles.fileRow,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.fileIcon}>
                    <FileCheck size={20} color={theme.colors.accent} />
                  </View>
                  <View style={styles.fileMain}>
                    <Text numberOfLines={2} style={styles.fileName}>
                      {holding.fileName}
                    </Text>
                    <Text numberOfLines={1} style={styles.fileMeta}>
                      {formatBytes(holding.size)} ·{' '}
                      {t(
                        holding.source === 'published'
                          ? 'node.holding.published'
                          : 'node.holding.downloaded'
                      )}
                    </Text>
                  </View>
                  <View style={styles.fileTrailing}>
                    <StatusBadge
                      label={t(SEED_LABELS[holding.status])}
                      tone={getSeedTone(holding.status)}
                    />
                    <MoreHorizontal size={18} color={theme.colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              {snapshot.holdings.length ? (
                <Search size={28} color={theme.colors.textMuted} />
              ) : (
                <HardDriveDownload size={28} color={theme.colors.textMuted} />
              )}
              <Text style={styles.emptyTitle}>
                {t(
                  snapshot.holdings.length
                    ? 'files.empty.searchTitle'
                    : 'node.empty.filesTitle'
                )}
              </Text>
              <Text style={styles.emptyBody}>
                {t(
                  snapshot.holdings.length
                    ? 'files.empty.searchBody'
                    : 'node.empty.filesBody'
                )}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={closeDetails}
        transparent
        visible={Boolean(selectedHolding)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            onPress={closeDetails}
            style={StyleSheet.absoluteFill}
          />
          <BottomSheetCard style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsTitleGroup}>
                <FileCheck size={20} color={theme.colors.accent} />
                <Text numberOfLines={2} style={styles.detailsTitle}>
                  {selectedHolding?.fileName}
                </Text>
              </View>
              <IconButton
                accessibilityLabel={t('common.close')}
                onPress={closeDetails}
                variant="ghost"
              >
                <X size={20} color={theme.colors.textSecondary} />
              </IconButton>
            </View>

            {selectedHolding ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailsBody}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryText}>
                      {formatBytes(selectedHolding.size)} ·{' '}
                      {t(
                        selectedHolding.source === 'published'
                          ? 'node.holding.published'
                          : 'node.holding.downloaded'
                      )}
                    </Text>
                    <StatusBadge
                      label={t(SEED_LABELS[selectedHolding.status])}
                      tone={getSeedTone(selectedHolding.status)}
                    />
                  </View>

                  <View style={styles.cidBlock}>
                    <Text style={styles.fieldLabel}>CID</Text>
                    <Text selectable style={styles.cidText}>
                      {selectedHolding.cid}
                    </Text>
                  </View>
                  <View style={styles.cidBlock}>
                    <Text style={styles.fieldLabel}>Topic</Text>
                    <Text selectable style={styles.topicText}>
                      {Array.from(
                        getCidTopicDigest(selectedHolding.cid),
                        byte => byte.toString(16).padStart(2, '0')
                      ).join('')}
                    </Text>
                  </View>

                  <View style={styles.networkGrid}>
                    <View style={styles.networkItem}>
                      {selectedHolding.topicJoined ? (
                        <CircleCheck size={18} color={theme.colors.success} />
                      ) : (
                        <CircleAlert size={18} color={theme.colors.warning} />
                      )}
                      <Text style={styles.networkLabel}>
                        {t(
                          selectedHolding.topicJoined
                            ? 'node.holding.topicJoined'
                            : 'node.holding.topicWaiting'
                        )}
                      </Text>
                    </View>
                    <View style={styles.networkItem}>
                      <Wifi size={18} color={theme.colors.info} />
                      <Text style={styles.networkLabel}>
                        {t('files.details.peers', {
                          count: selectedHolding.peerCount,
                        })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionGrid}>
                    <MostButton
                      disabled={exportingCid === selectedHolding.cid}
                      icon={
                        <ExternalLink size={17} color={theme.colors.accent} />
                      }
                      onPress={() => onOpenHolding(selectedHolding)}
                    >
                      {t('files.action.open')}
                    </MostButton>
                    <MostButton
                      icon={
                        copiedCid === selectedHolding.cid ? (
                          <CircleCheck size={17} color={theme.colors.success} />
                        ) : (
                          <Copy size={17} color={theme.colors.accent} />
                        )
                      }
                      onPress={() => onCopyHoldingLink(selectedHolding)}
                    >
                      {t(
                        copiedCid === selectedHolding.cid
                          ? 'node.action.copied'
                          : 'node.action.copyLink'
                      )}
                    </MostButton>
                    <MostButton
                      disabled={exportingCid === selectedHolding.cid}
                      icon={<Share2 size={17} color={theme.colors.accent} />}
                      onPress={() => onShareHolding(selectedHolding)}
                    >
                      {t('common.share')}
                    </MostButton>
                    <MostButton
                      disabled={exportingCid === selectedHolding.cid}
                      icon={<Save size={17} color={theme.colors.accent} />}
                      onPress={() => onSaveHolding(selectedHolding)}
                    >
                      {Platform.OS === 'ios'
                        ? t('node.action.saveToFiles')
                        : t('common.save')}
                    </MostButton>
                  </View>

                  <MostButton
                    disabled={
                      deletingCid === selectedHolding.cid ||
                      exportingCid === selectedHolding.cid
                    }
                    icon={<Trash2 size={17} color={theme.colors.danger} />}
                    onPress={() => onDeleteHolding(selectedHolding)}
                    style={styles.deleteButton}
                    variant="ghost"
                  >
                    {deletingCid === selectedHolding.cid
                      ? t('node.action.deleting')
                      : t('common.delete')}
                  </MostButton>
                </View>
              </ScrollView>
            ) : null}
          </BottomSheetCard>
        </View>
      </Modal>
    </>
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
    primaryActions: {
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: 20,
      marginTop: 16,
    },
    primaryAction: {
      flex: 1,
      minHeight: 52,
      minWidth: 0,
    },
    section: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      gap: 12,
      marginHorizontal: 20,
      padding: 14,
    },
    emptyFilesSection: { flex: 1 },
    finder: { gap: 8 },
    searchRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    searchBox: {
      alignItems: 'center',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      minHeight: 48,
      paddingLeft: 12,
    },
    searchInput: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 15,
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    clearButton: {
      borderWidth: 0,
      height: 42,
      width: 42,
    },
    filterIcon: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    filters: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      padding: 3,
    },
    filter: {
      alignItems: 'center',
      borderRadius: radii.small,
      flex: 1,
      justifyContent: 'center',
      minHeight: 38,
      paddingHorizontal: 8,
    },
    filterActive: {
      backgroundColor: colors.accentSoft,
    },
    filterText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    filterTextActive: {
      color: colors.accent,
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
      gap: 9,
    },
    sectionTitle: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
    },
    sectionMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    fileList: {
      gap: 10,
    },
    fileRow: {
      alignItems: 'flex-start',
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
      borderRadius: radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 72,
      padding: 12,
    },
    fileIcon: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.medium,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    fileMain: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    fileName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 21,
    },
    fileMeta: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    fileTrailing: {
      alignItems: 'flex-end',
      gap: 6,
    },
    emptyState: {
      alignItems: 'center',
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      minHeight: 180,
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    emptyBody: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 280,
      textAlign: 'center',
    },
    overlay: {
      backgroundColor: theme.colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
    },
    detailsCard: {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderRadius: theme.radii.small,
      maxHeight: '88%',
      padding: 18,
    },
    detailsHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    detailsTitleGroup: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 10,
    },
    detailsTitle: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    detailsBody: {
      gap: 16,
      paddingBottom: 10,
    },
    summaryRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    summaryText: {
      color: theme.colors.textSecondary,
      flex: 1,
      fontSize: 14,
    },
    cidBlock: {
      backgroundColor: theme.colors.surfaceSubtle,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.small,
      borderWidth: 1,
      gap: 7,
      padding: 12,
    },
    fieldLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    cidText: {
      color: theme.colors.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      lineHeight: 18,
    },
    topicText: {
      color: theme.colors.textSecondary,
      fontFamily: Platform.select({
        android: 'monospace',
        default: 'Courier',
      }),
      fontSize: 11,
      lineHeight: 17,
    },
    networkGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    networkItem: {
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceSubtle,
      borderRadius: theme.radii.small,
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 52,
      padding: 10,
    },
    networkLabel: {
      color: theme.colors.textSecondary,
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
    },
    actionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    deleteButton: {
      borderColor: theme.colors.danger,
      borderWidth: 1,
    },
    pressed: {
      opacity: 0.7,
    },
  })
}

const fileStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
}
