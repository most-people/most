import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { X } from 'lucide-react-native'
import type { MostBoxMobileClient } from '../../mobileCore/types'
import {
  normalizeKnowledgeGitDiff,
  normalizeKnowledgeGitHistory,
  normalizeKnowledgeGitStatus,
  summarizeKnowledgeGitDiff,
  type KnowledgeGitDiff,
  type KnowledgeGitStatus,
} from './knowledgeGitModel'
import { useI18n, type MessageKey } from '../../i18n'
import { useMostBoxTheme, type MostBoxTheme } from '../../ui/theme'

type KnowledgeGitPanelProps = {
  client: MostBoxMobileClient
  visible: boolean
  onClose: () => void
}

export function KnowledgeGitPanel({
  client,
  visible,
  onClose,
}: KnowledgeGitPanelProps) {
  const { formatDateTime, t } = useI18n()
  const theme = useMostBoxTheme()
  const [status, setStatus] = useState<KnowledgeGitStatus | null>(null)
  const [history, setHistory] = useState<
    ReturnType<typeof normalizeKnowledgeGitHistory>
  >([])
  const [diff, setDiff] = useState<KnowledgeGitDiff | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [view, setView] = useState<'changes' | 'history'>('changes')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) return
    let active = true
    setLoading(true)
    setError('')
    setDiff(null)
    void client
      .requestKnowledgeGit('GET', '/api/note-vault/git/status')
      .then(value => {
        if (!active) return
        const next = normalizeKnowledgeGitStatus(value)
        setStatus(next)
        const first = next.changes[0]?.path || ''
        setSelectedPath(first)
        if (first) return loadDiff(first)
      })
      .catch(nextError => {
        if (active)
          setError(
            nextError instanceof Error
              ? nextError.message
              : t('knowledge.git.loadFailed')
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [client, t, visible])

  useEffect(() => {
    if (!visible || view !== 'history') return
    let active = true
    void client
      .requestKnowledgeGit('GET', '/api/note-vault/git/history?limit=50')
      .then(value => {
        if (active)
          setHistory(
            normalizeKnowledgeGitHistory(
              (value as { commits?: unknown })?.commits
            )
          )
      })
      .catch(nextError => {
        if (active)
          setError(
            nextError instanceof Error
              ? nextError.message
              : t('knowledge.git.loadFailed')
          )
      })
    return () => {
      active = false
    }
  }, [client, t, view, visible])

  async function loadDiff(path: string, oid = '') {
    setSelectedPath(path)
    try {
      const query = oid
        ? `?path=${encodeURIComponent(path)}&oid=${encodeURIComponent(oid)}`
        : `?path=${encodeURIComponent(path)}`
      const value = await client.requestKnowledgeGit(
        'GET',
        `/api/note-vault/git/diff${query}`
      )
      setDiff(normalizeKnowledgeGitDiff(value))
    } catch (nextError) {
      setDiff(null)
      setError(
        nextError instanceof Error
          ? nextError.message
          : t('knowledge.git.diffFailed')
      )
    }
  }

  const colors = theme.colors
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('knowledge.git.title')}
            </Text>
            {status?.initialized ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {status.branch}
                {status.headOid ? ` · ${status.headOid.slice(0, 8)}` : ''}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            style={styles.closeButton}
          >
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {(['changes', 'history'] as const).map(item => (
            <Pressable
              key={item}
              onPress={() => setView(item)}
              style={[
                styles.tab,
                view === item && { borderBottomColor: colors.accent },
              ]}
            >
              <Text
                style={{
                  color: view === item ? colors.accent : colors.textSecondary,
                }}
              >
                {t(`knowledge.git.${item}` as MessageKey)}
              </Text>
            </Pressable>
          ))}
        </View>
        {!status?.initialized ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            {t('knowledge.git.uninitialized')}
          </Text>
        ) : view === 'changes' ? (
          <View style={styles.content}>
            <ScrollView style={styles.list}>
              {status.changes.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  {t('knowledge.git.clean')}
                </Text>
              ) : null}
              {status.changes.map(change => (
                <Pressable
                  key={change.path}
                  onPress={() => void loadDiff(change.path)}
                  style={[
                    styles.row,
                    selectedPath === change.path && {
                      backgroundColor: colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[styles.path, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {change.path}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    {t(`knowledge.git.${change.status}` as MessageKey)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <DiffView diff={diff} colors={colors} t={t} />
          </View>
        ) : (
          <ScrollView style={styles.history}>
            {history.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {t('knowledge.git.noHistory')}
              </Text>
            ) : null}
            {history.map(commit => (
              <View
                key={commit.oid}
                style={[styles.commit, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.path, { color: colors.text }]}>
                  {commit.message}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {commit.author.name} · {formatDateTime(commit.timestamp)}
                </Text>
                {commit.changes.map(change => (
                  <Pressable
                    key={change.path}
                    onPress={() => void loadDiff(change.path, commit.oid)}
                  >
                    <Text style={{ color: colors.accent }}>{change.path}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

function DiffView({
  diff,
  colors,
  t,
}: {
  diff: KnowledgeGitDiff | null
  colors: MostBoxTheme['colors']
  t: (key: MessageKey) => string
}) {
  if (!diff)
    return (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>
        {t('knowledge.git.selectFile')}
      </Text>
    )
  const summary = summarizeKnowledgeGitDiff(diff)
  return (
    <ScrollView style={[styles.diff, { borderColor: colors.border }]}>
      <Text
        style={{ color: colors.textSecondary }}
      >{`+${summary.added} −${summary.removed}`}</Text>
      {diff.parts.map((part, index) => (
        <Text
          key={index}
          style={{
            color: part.added
              ? colors.success
              : part.removed
                ? colors.danger
                : colors.textSecondary,
          }}
        >
          {part.value}
        </Text>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { marginTop: 4, fontSize: 12 },
  closeButton: { padding: 6 },
  loading: { margin: 12 },
  error: { paddingHorizontal: 18, paddingVertical: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { padding: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  content: { flex: 1 },
  list: { maxHeight: 220 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    gap: 12,
  },
  path: { flex: 1, fontWeight: '600' },
  diff: {
    margin: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  empty: { padding: 20, textAlign: 'center' },
  history: { padding: 14 },
  commit: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
})
