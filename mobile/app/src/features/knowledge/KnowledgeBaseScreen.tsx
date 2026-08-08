import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { EnrichedMarkdownText } from 'react-native-enriched-markdown'
import {
  ArchiveRestore,
  Bold,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Code,
  Download,
  FileDown,
  FilePlus2,
  FileText,
  Folder,
  Heading2,
  Italic,
  Link2,
  List,
  Loader,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Save,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native'
import { createExpoKnowledgeRepository } from './expoKnowledgeRepository'
import {
  applyMarkdownTool,
  createAttachmentMarkdown,
  createUniqueKnowledgeFilePath,
  insertMarkdownAtSelection,
  joinKnowledgePath,
  normalizeKnowledgeDirectory,
  normalizeKnowledgeFilePath,
  normalizeKnowledgeNoteName,
  prepareMarkdownPreview,
  searchKnowledgeNotes,
  validateKnowledgeSnapshot,
} from './knowledgeModel'
import type {
  KnowledgeRepository,
  MarkdownSelection,
  MobileKnowledgeNote,
} from './types'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../../ui/theme'
import { usesAccessibilityLayout } from '../../ui/presentation'

type PublishedKnowledgeAttachment = {
  fileName: string
  link: string
  mimeType?: string
}

export type KnowledgeBaseScreenProps = {
  isCoreReady: boolean
  onPublishAttachment: () => Promise<PublishedKnowledgeAttachment | null>
  onOpenMostLink: (link: string) => void | Promise<void>
  onDirtyChange: (dirty: boolean) => void
}

type ScreenMode = 'browse' | 'preview' | 'edit'
type EditorView = 'edit' | 'preview'
type PromptState = {
  title: string
  placeholder: string
  value: string
  confirmText: string
  onConfirm: (value: string) => Promise<void>
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function getSafeExportName(input: string, fallback: string) {
  const value = input
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
  return value || fallback
}

function getCurrentItems(notes: MobileKnowledgeNote[], directory: string) {
  const directories = new Set<string>()
  const files: MobileKnowledgeNote[] = []

  for (const note of notes) {
    if (note.directory === directory) {
      files.push(note)
      continue
    }
    const prefix = directory ? `${directory}/` : ''
    if (!note.directory.startsWith(prefix)) continue
    const relative = note.directory.slice(prefix.length)
    const name = relative.split('/')[0]
    if (name) directories.add(prefix ? `${directory}/${name}` : name)
  }

  return {
    directories: [...directories].sort((left, right) =>
      left.localeCompare(right)
    ),
    files: files.sort((left, right) => right.mtimeMs - left.mtimeMs),
  }
}

function appendImportedNote(
  repository: KnowledgeRepository,
  path: string,
  content: string,
  overwrite: boolean
) {
  return overwrite
    ? repository.write(path, content)
    : repository.create(path, content)
}

export function KnowledgeBaseScreen({
  isCoreReady,
  onPublishAttachment,
  onOpenMostLink,
  onDirtyChange,
}: KnowledgeBaseScreenProps) {
  const theme = useMostBoxTheme()
  const styles = knowledgeStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const repositoryRef = useRef<KnowledgeRepository | null>(null)
  const [notes, setNotes] = useState<MobileKnowledgeNote[]>([])
  const [mode, setMode] = useState<ScreenMode>('browse')
  const [editorView, setEditorView] = useState<EditorView>('edit')
  const [currentDirectory, setCurrentDirectory] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [promptWorking, setPromptWorking] = useState(false)
  const [editorOriginalPath, setEditorOriginalPath] = useState('')
  const [editorOriginalName, setEditorOriginalName] = useState('')
  const [editorOriginalDirectory, setEditorOriginalDirectory] = useState('')
  const [editorOriginalContent, setEditorOriginalContent] = useState('')
  const [editorName, setEditorName] = useState('')
  const [editorDirectory, setEditorDirectory] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editorSelection, setEditorSelection] = useState<MarkdownSelection>({
    start: 0,
    end: 0,
  })
  const [attaching, setAttaching] = useState(false)

  if (!repositoryRef.current) {
    repositoryRef.current = createExpoKnowledgeRepository()
  }
  const repository = repositoryRef.current

  const selectedNote = useMemo(
    () => notes.find(note => note.path === selectedPath) || null,
    [notes, selectedPath]
  )
  const dirty =
    mode === 'edit' &&
    (editorName !== editorOriginalName ||
      editorDirectory !== editorOriginalDirectory ||
      editorContent !== editorOriginalContent)

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setNotes(await repository.list())
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : '无法读取本地知识库'
      )
    } finally {
      setLoading(false)
    }
  }, [repository])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      if (!dirty) {
        onConfirm()
        return
      }
      Alert.alert('放弃未保存修改？', '当前编辑内容尚未保存。', [
        { text: '继续编辑', style: 'cancel' },
        { text: '放弃修改', style: 'destructive', onPress: onConfirm },
      ])
    },
    [dirty]
  )

  useEffect(() => {
    if (mode !== 'edit') return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        confirmDiscard(() => {
          setMode(editorOriginalPath ? 'preview' : 'browse')
        })
        return true
      }
    )
    return () => subscription.remove()
  }, [confirmDiscard, editorOriginalPath, mode])

  const searchResults = useMemo(
    () => searchKnowledgeNotes(notes, searchQuery),
    [notes, searchQuery]
  )
  const currentItems = useMemo(
    () => getCurrentItems(notes, currentDirectory),
    [currentDirectory, notes]
  )
  const breadcrumb = useMemo(() => {
    const parts = currentDirectory.split('/').filter(Boolean)
    return [
      { label: '知识库', path: '' },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
    ]
  }, [currentDirectory])

  function openNote(note: MobileKnowledgeNote) {
    setSelectedPath(note.path)
    setMode('preview')
  }

  function openEditor(note?: MobileKnowledgeNote) {
    const name = note?.name || ''
    const directory = note?.directory || currentDirectory
    const content = note?.content || ''
    setSelectedPath(note?.path || '')
    setEditorOriginalPath(note?.path || '')
    setEditorOriginalName(name)
    setEditorOriginalDirectory(directory)
    setEditorOriginalContent(content)
    setEditorName(name)
    setEditorDirectory(directory)
    setEditorContent(content)
    setEditorSelection({ start: content.length, end: content.length })
    setEditorView('edit')
    setError('')
    setMode('edit')
  }

  function leaveEditor() {
    confirmDiscard(() => {
      setMode(editorOriginalPath ? 'preview' : 'browse')
    })
  }

  async function saveEditor() {
    setWorking(true)
    setError('')
    try {
      const targetPath = joinKnowledgePath(editorDirectory, editorName)
      let saved: MobileKnowledgeNote
      if (!editorOriginalPath) {
        saved = await repository.create(targetPath, editorContent)
      } else {
        const normalizedOriginal =
          normalizeKnowledgeFilePath(editorOriginalPath)
        if (targetPath !== normalizedOriginal) {
          await repository.move(normalizedOriginal, targetPath)
          try {
            saved = await repository.write(targetPath, editorContent)
          } catch (writeError) {
            try {
              await repository.move(targetPath, normalizedOriginal)
            } catch {
              throw new Error(
                '保存失败且无法撤销文件移动，请返回列表刷新后检查文件位置'
              )
            }
            throw writeError
          }
        } else {
          saved = await repository.write(targetPath, editorContent)
        }
      }
      await refresh()
      setSelectedPath(saved.path)
      setEditorOriginalPath(saved.path)
      setEditorOriginalName(saved.name)
      setEditorOriginalDirectory(saved.directory)
      setEditorOriginalContent(saved.content)
      setEditorName(saved.name)
      setEditorDirectory(saved.directory)
      setEditorContent(saved.content)
      setMode('preview')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存笔记失败')
    } finally {
      setWorking(false)
    }
  }

  function applyTool(
    tool: 'heading' | 'bold' | 'italic' | 'list' | 'code' | 'link'
  ) {
    const result = applyMarkdownTool(editorContent, editorSelection, tool)
    setEditorContent(result.content)
    setEditorSelection(result.selection)
  }

  async function attachFile() {
    if (!isCoreReady) {
      Alert.alert('P2P 核心未就绪', '节点在线后才能发布知识库附件。')
      return
    }
    setAttaching(true)
    try {
      const attachment = await onPublishAttachment()
      if (!attachment) return
      const markdown = createAttachmentMarkdown(
        attachment.fileName,
        attachment.link,
        attachment.mimeType
      )
      const result = insertMarkdownAtSelection(
        editorContent,
        editorSelection,
        markdown
      )
      setEditorContent(result.content)
      setEditorSelection(result.selection)
    } catch (attachError) {
      Alert.alert(
        '附件发布失败',
        attachError instanceof Error ? attachError.message : '无法发布附件'
      )
    } finally {
      setAttaching(false)
    }
  }

  async function handlePreviewLink(url: string) {
    if (url.toLowerCase().startsWith('most://')) {
      await onOpenMostLink(url)
      return
    }
    if (!/^(https?:|mailto:)/i.test(url)) {
      Alert.alert('不支持的链接', url)
      return
    }
    if (!(await Linking.canOpenURL(url))) {
      throw new Error('当前设备无法打开此链接')
    }
    await Linking.openURL(url)
  }

  async function shareFile(fileUri: string, mimeType: string, title: string) {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('当前设备不支持系统分享')
    }
    await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: title })
  }

  async function exportNote(note: MobileKnowledgeNote) {
    if (!FileSystem.cacheDirectory) throw new Error('临时目录不可用')
    setWorking(true)
    try {
      const fileName = getSafeExportName(`${note.name}.md`, 'note.md')
      const target = `${FileSystem.cacheDirectory}${encodeURIComponent(fileName)}`
      await FileSystem.writeAsStringAsync(target, note.content, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      await shareFile(target, 'text/markdown', `导出 ${fileName}`)
    } catch (exportError) {
      Alert.alert(
        '导出失败',
        exportError instanceof Error ? exportError.message : '无法导出笔记'
      )
    } finally {
      setWorking(false)
    }
  }

  async function exportVault() {
    if (!FileSystem.cacheDirectory) throw new Error('临时目录不可用')
    setWorking(true)
    try {
      const snapshot = await repository.exportSnapshot()
      const stamp = snapshot.exportedAt.replace(/[:.]/g, '-').replace('T', '_')
      const fileName = `mostbox-knowledge-${stamp}.json`
      const target = `${FileSystem.cacheDirectory}${fileName}`
      await FileSystem.writeAsStringAsync(
        target,
        JSON.stringify(snapshot, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      )
      await shareFile(target, 'application/json', '导出知识库快照')
    } catch (exportError) {
      Alert.alert(
        '导出失败',
        exportError instanceof Error ? exportError.message : '无法导出知识库'
      )
    } finally {
      setWorking(false)
    }
  }

  async function finishImport(
    path: string,
    content: string,
    overwrite: boolean
  ) {
    setWorking(true)
    try {
      const imported = await appendImportedNote(
        repository,
        path,
        content,
        overwrite
      )
      await refresh()
      setCurrentDirectory(imported.directory)
      openNote(imported)
    } catch (importError) {
      Alert.alert(
        '导入失败',
        importError instanceof Error ? importError.message : '无法导入笔记'
      )
    } finally {
      setWorking(false)
    }
  }

  async function importNote() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      })
      if (result.canceled) return
      const file = result.assets[0]
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.md')) {
        throw new Error('请选择 .md Markdown 文件')
      }
      const fileName = normalizeKnowledgeNoteName(file.name)
      const targetPath = joinKnowledgePath(currentDirectory, fileName)
      const content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      const conflict = notes.some(
        note => note.path.toLowerCase() === targetPath.toLowerCase()
      )
      if (!conflict) {
        await finishImport(targetPath, content, false)
        return
      }
      Alert.alert('同名笔记已存在', targetPath, [
        { text: '取消', style: 'cancel' },
        {
          text: '保留两份',
          onPress: () => {
            void finishImport(
              createUniqueKnowledgeFilePath(
                notes.map(note => note.path),
                targetPath
              ),
              content,
              false
            )
          },
        },
        {
          text: '覆盖',
          style: 'destructive',
          onPress: () => {
            void finishImport(targetPath, content, true)
          },
        },
      ])
    } catch (importError) {
      Alert.alert(
        '导入失败',
        importError instanceof Error
          ? importError.message
          : '请选择 Markdown 文件'
      )
    }
  }

  async function restoreVault() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'application/json',
      })
      if (result.canceled) return
      const file = result.assets[0]
      if (!file) return
      const raw = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      const parsed = JSON.parse(raw) as unknown
      const snapshot = validateKnowledgeSnapshot(parsed)
      Alert.alert(
        '恢复整个知识库？',
        `快照包含 ${snapshot.files.length} 篇笔记，将完全替换当前知识库。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '恢复',
            style: 'destructive',
            onPress: () => {
              setWorking(true)
              void repository
                .restoreSnapshot(snapshot)
                .then(async () => {
                  setMode('browse')
                  setSelectedPath('')
                  setCurrentDirectory('')
                  await refresh()
                  Alert.alert('恢复完成', '本地知识库已替换为所选快照。')
                })
                .catch(restoreError => {
                  Alert.alert(
                    '恢复失败',
                    restoreError instanceof Error
                      ? restoreError.message
                      : '原知识库已保留'
                  )
                })
                .finally(() => setWorking(false))
            },
          },
        ]
      )
    } catch (restoreError) {
      Alert.alert(
        '快照无效',
        restoreError instanceof Error
          ? restoreError.message
          : '无法读取知识库快照'
      )
    }
  }

  function confirmDeleteNote(note: MobileKnowledgeNote) {
    Alert.alert('删除笔记？', note.path, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setWorking(true)
          void repository
            .delete(note.path)
            .then(async () => {
              setMode('browse')
              setSelectedPath('')
              await refresh()
            })
            .catch(deleteError => {
              Alert.alert(
                '删除失败',
                deleteError instanceof Error
                  ? deleteError.message
                  : '无法删除笔记'
              )
            })
            .finally(() => setWorking(false))
        },
      },
    ])
  }

  function openDirectoryActions(directory: string) {
    Alert.alert(directory.slice(directory.lastIndexOf('/') + 1), directory, [
      { text: '取消', style: 'cancel' },
      {
        text: '移动',
        onPress: () => {
          const promptState: PromptState = {
            title: '移动目录',
            placeholder: '新目录路径',
            value: directory,
            confirmText: '移动',
            onConfirm: async value => {
              const target = normalizeKnowledgeDirectory(value)
              await repository.moveDirectory(directory, target)
              setCurrentDirectory('')
              await refresh()
            },
          }
          setPrompt(promptState)
          setPromptValue(promptState.value)
        },
      },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          Alert.alert('删除目录？', '目录中的全部笔记都会被删除。', [
            { text: '取消', style: 'cancel' },
            {
              text: '删除',
              style: 'destructive',
              onPress: () => {
                setWorking(true)
                void repository
                  .deleteDirectory(directory)
                  .then(refresh)
                  .catch(deleteError => {
                    Alert.alert(
                      '删除失败',
                      deleteError instanceof Error
                        ? deleteError.message
                        : '无法删除目录'
                    )
                  })
                  .finally(() => setWorking(false))
              },
            },
          ])
        },
      },
    ])
  }

  function openNoteActions(note: MobileKnowledgeNote) {
    Alert.alert(note.name, note.path, [
      { text: '取消', style: 'cancel' },
      { text: '导出', onPress: () => void exportNote(note) },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => confirmDeleteNote(note),
      },
    ])
  }

  async function submitPrompt() {
    if (!prompt || promptWorking) return
    setPromptWorking(true)
    try {
      await prompt.onConfirm(promptValue)
      setPrompt(null)
    } catch (promptError) {
      Alert.alert(
        '操作失败',
        promptError instanceof Error ? promptError.message : '无法完成操作'
      )
    } finally {
      setPromptWorking(false)
    }
  }

  const markdownStyle = useMemo(
    () => ({
      paragraph: {
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 25,
        marginBottom: 12,
      },
      h1: { color: theme.colors.text, fontSize: 27, marginBottom: 14 },
      h2: { color: theme.colors.text, fontSize: 23, marginBottom: 12 },
      h3: { color: theme.colors.text, fontSize: 20, marginBottom: 10 },
      h4: { color: theme.colors.text, fontSize: 18, marginBottom: 8 },
      h5: { color: theme.colors.text, fontSize: 17, marginBottom: 8 },
      h6: { color: theme.colors.textSecondary, fontSize: 16, marginBottom: 8 },
      blockquote: {
        color: theme.colors.textSecondary,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surfaceSubtle,
      },
      list: { color: theme.colors.text, bulletColor: theme.colors.accent },
      code: {
        color: theme.colors.text,
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
      },
      codeBlock: {
        color: theme.colors.text,
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.small,
      },
      link: { color: theme.colors.accent, underline: true },
      linkVariants: {
        '^most://': {
          color: theme.colors.info,
          backgroundColor: theme.colors.infoSoft,
          underline: false,
        },
      },
      table: {
        color: theme.colors.text,
        borderColor: theme.colors.border,
        headerBackgroundColor: theme.colors.surfaceMuted,
      },
    }),
    [theme]
  )

  if (mode === 'edit') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.screen}
      >
        <View style={styles.detailHeader}>
          <Pressable
            accessibilityLabel="返回"
            accessibilityRole="button"
            onPress={leaveEditor}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <ChevronLeft size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.detailTitleGroup}>
            <Text maxFontSizeMultiplier={1.8} style={styles.detailTitle}>
              {editorOriginalPath ? '编辑笔记' : '新建笔记'}
            </Text>
            {dirty ? (
              <Text maxFontSizeMultiplier={1.6} style={styles.unsavedLabel}>
                未保存
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="保存笔记"
            accessibilityRole="button"
            accessibilityState={{ disabled: working }}
            disabled={working}
            onPress={() => void saveEditor()}
            style={({ pressed }) => [
              styles.saveButton,
              working ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {working ? (
              <Loader size={17} color={theme.colors.onAccent} />
            ) : (
              <Save size={17} color={theme.colors.onAccent} />
            )}
            <Text maxFontSizeMultiplier={1.6} style={styles.saveButtonText}>
              保存
            </Text>
          </Pressable>
        </View>

        <View style={styles.editorFields}>
          <TextInput
            accessibilityLabel="笔记名称"
            maxFontSizeMultiplier={1.8}
            onChangeText={setEditorName}
            placeholder="笔记名称"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.titleInput}
            value={editorName}
          />
          <TextInput
            accessibilityLabel="目录路径"
            autoCapitalize="none"
            maxFontSizeMultiplier={1.8}
            onChangeText={setEditorDirectory}
            placeholder="目录路径（可留空）"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.pathInput}
            value={editorDirectory}
          />
        </View>

        <View style={styles.editorControlRow}>
          <View style={styles.segmentedControl}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: editorView === 'edit' }}
              onPress={() => setEditorView('edit')}
              style={[
                styles.segment,
                editorView === 'edit' ? styles.segmentActive : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                style={[
                  styles.segmentText,
                  editorView === 'edit' ? styles.segmentTextActive : null,
                ]}
              >
                编辑
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: editorView === 'preview' }}
              onPress={() => {
                Keyboard.dismiss()
                setEditorView('preview')
              }}
              style={[
                styles.segment,
                editorView === 'preview' ? styles.segmentActive : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                style={[
                  styles.segmentText,
                  editorView === 'preview' ? styles.segmentTextActive : null,
                ]}
              >
                预览
              </Text>
            </Pressable>
          </View>
        </View>

        {editorView === 'edit' ? (
          <>
            <ScrollView
              horizontal
              contentContainerStyle={styles.toolbarContent}
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              style={styles.toolbar}
            >
              {[
                ['heading', '标题', Heading2],
                ['bold', '粗体', Bold],
                ['italic', '斜体', Italic],
                ['list', '列表', List],
                ['code', '代码', Code],
                ['link', '链接', Link2],
              ].map(([tool, label, Icon]) => (
                <Pressable
                  key={String(tool)}
                  accessibilityLabel={String(label)}
                  accessibilityRole="button"
                  onPress={() =>
                    applyTool(
                      tool as
                        'heading' | 'bold' | 'italic' | 'list' | 'code' | 'link'
                    )
                  }
                  style={({ pressed }) => [
                    styles.toolButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Icon size={19} color={theme.colors.textSecondary} />
                </Pressable>
              ))}
              <Pressable
                accessibilityLabel="发布并插入附件"
                accessibilityRole="button"
                accessibilityState={{ disabled: attaching || !isCoreReady }}
                disabled={attaching || !isCoreReady}
                onPress={() => void attachFile()}
                style={({ pressed }) => [
                  styles.toolButton,
                  attaching || !isCoreReady ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {attaching ? (
                  <Loader size={19} color={theme.colors.textMuted} />
                ) : (
                  <Paperclip size={19} color={theme.colors.textSecondary} />
                )}
              </Pressable>
            </ScrollView>
            <TextInput
              accessibilityLabel="Markdown 正文"
              autoCapitalize="sentences"
              multiline
              onChangeText={setEditorContent}
              onSelectionChange={event =>
                setEditorSelection(event.nativeEvent.selection)
              }
              placeholder="开始记录..."
              placeholderTextColor={theme.colors.textMuted}
              selection={editorSelection}
              style={styles.editorInput}
              textAlignVertical="top"
              value={editorContent}
            />
          </>
        ) : (
          <ScrollView
            contentContainerStyle={styles.previewContent}
            showsVerticalScrollIndicator={false}
            style={styles.previewScroll}
          >
            {editorContent ? (
              <EnrichedMarkdownText
                accessibilityLabels={{
                  list: { bulletPoint: '项目符号', orderedItem: '列表项 {n}' },
                  blockquote: { quote: '引用' },
                  table: { row: '第 {n} 行：{content}' },
                }}
                flavor="github"
                markdown={prepareMarkdownPreview(editorContent)}
                markdownStyle={markdownStyle}
                maxFontSizeMultiplier={2}
                md4cFlags={{ latexMath: false }}
                onLinkPress={({ url }) => {
                  void handlePreviewLink(url).catch(linkError => {
                    Alert.alert(
                      '打开失败',
                      linkError instanceof Error
                        ? linkError.message
                        : '无法打开链接'
                    )
                  })
                }}
                selectable
                selectionMenuConfig={{
                  copy: { label: '复制' },
                  copyAsMarkdown: { enabled: true, label: '复制 Markdown' },
                }}
              />
            ) : (
              <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
                暂无内容
              </Text>
            )}
          </ScrollView>
        )}
        {error ? (
          <Text maxFontSizeMultiplier={2} style={styles.errorText}>
            {error}
          </Text>
        ) : null}
      </KeyboardAvoidingView>
    )
  }

  if (mode === 'preview' && selectedNote) {
    return (
      <View style={styles.screen}>
        <View style={styles.detailHeader}>
          <Pressable
            accessibilityLabel="返回知识库"
            accessibilityRole="button"
            onPress={() => setMode('browse')}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <ChevronLeft size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.detailTitleGroup}>
            <Text
              maxFontSizeMultiplier={1.8}
              numberOfLines={1}
              style={styles.detailTitle}
            >
              {selectedNote.name}
            </Text>
            <Text
              maxFontSizeMultiplier={1.8}
              numberOfLines={1}
              style={styles.detailPath}
            >
              {selectedNote.path}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="编辑笔记"
            accessibilityRole="button"
            onPress={() => openEditor(selectedNote)}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Pencil size={20} color={theme.colors.accent} />
          </Pressable>
        </View>
        <View style={styles.previewMetaRow}>
          <Text maxFontSizeMultiplier={1.8} style={styles.metaText}>
            {formatBytes(selectedNote.size)} ·{' '}
            {formatDate(selectedNote.mtimeMs)}
          </Text>
          <View style={styles.inlineActions}>
            <Pressable
              accessibilityLabel="导出笔记"
              accessibilityRole="button"
              onPress={() => void exportNote(selectedNote)}
              style={({ pressed }) => [
                styles.iconButtonSmall,
                pressed ? styles.pressed : null,
              ]}
            >
              <Share2 size={17} color={theme.colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityLabel="删除笔记"
              accessibilityRole="button"
              onPress={() => confirmDeleteNote(selectedNote)}
              style={({ pressed }) => [
                styles.iconButtonSmall,
                pressed ? styles.pressed : null,
              ]}
            >
              <Trash2 size={17} color={theme.colors.danger} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.previewContent}
          showsVerticalScrollIndicator={false}
          style={styles.previewScroll}
        >
          {selectedNote.content ? (
            <EnrichedMarkdownText
              accessibilityLabels={{
                list: { bulletPoint: '项目符号', orderedItem: '列表项 {n}' },
                blockquote: { quote: '引用' },
                table: { row: '第 {n} 行：{content}' },
              }}
              flavor="github"
              markdown={prepareMarkdownPreview(selectedNote.content)}
              markdownStyle={markdownStyle}
              maxFontSizeMultiplier={2}
              md4cFlags={{ latexMath: false }}
              onLinkPress={({ url }) => {
                void handlePreviewLink(url).catch(linkError => {
                  Alert.alert(
                    '打开失败',
                    linkError instanceof Error
                      ? linkError.message
                      : '无法打开链接'
                  )
                })
              }}
              selectable
              selectionMenuConfig={{
                copy: { label: '复制' },
                copyAsMarkdown: { enabled: true, label: '复制 Markdown' },
              }}
            />
          ) : (
            <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
              暂无内容
            </Text>
          )}
        </ScrollView>
      </View>
    )
  }

  const displayNotes = searchQuery ? searchResults : currentItems.files
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.browserContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.actionRow,
            accessibilityLayout ? styles.actionRowAccessibility : null,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => openEditor()}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed ? styles.pressed : null,
            ]}
          >
            <FilePlus2 size={19} color={theme.colors.onAccent} />
            <Text maxFontSizeMultiplier={1.8} style={styles.primaryActionText}>
              新建笔记
            </Text>
          </Pressable>
          <View style={styles.utilityActions}>
            <Pressable
              accessibilityLabel="导入 Markdown"
              accessibilityRole="button"
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => void importNote()}
              style={({ pressed }) => [
                styles.utilityAction,
                working ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Download size={19} color={theme.colors.textSecondary} />
              <Text
                maxFontSizeMultiplier={1.6}
                style={styles.utilityActionText}
              >
                导入
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="导出知识库快照"
              accessibilityRole="button"
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => void exportVault()}
              style={({ pressed }) => [
                styles.utilityAction,
                working ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <FileDown size={19} color={theme.colors.textSecondary} />
              <Text
                maxFontSizeMultiplier={1.6}
                style={styles.utilityActionText}
              >
                备份
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="恢复知识库快照"
              accessibilityRole="button"
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => void restoreVault()}
              style={({ pressed }) => [
                styles.utilityAction,
                working ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <ArchiveRestore size={19} color={theme.colors.textSecondary} />
              <Text
                maxFontSizeMultiplier={1.6}
                style={styles.utilityActionText}
              >
                恢复
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color={theme.colors.textMuted} />
          <TextInput
            accessibilityLabel="搜索知识库"
            autoCapitalize="none"
            maxFontSizeMultiplier={1.8}
            onChangeText={setSearchQuery}
            placeholder="搜索标题、路径或正文"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery ? (
            <Pressable
              accessibilityLabel="清除搜索"
              accessibilityRole="button"
              onPress={() => setSearchQuery('')}
              style={styles.searchClear}
            >
              <X size={17} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {!searchQuery ? (
          <ScrollView
            horizontal
            contentContainerStyle={styles.breadcrumbContent}
            showsHorizontalScrollIndicator={false}
            style={styles.breadcrumb}
          >
            {breadcrumb.map((item, index) => (
              <View key={item.path || 'root'} style={styles.breadcrumbItem}>
                {index > 0 ? (
                  <ChevronRight size={14} color={theme.colors.textMuted} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCurrentDirectory(item.path)}
                >
                  <Text
                    maxFontSizeMultiplier={1.8}
                    style={[
                      styles.breadcrumbText,
                      item.path === currentDirectory
                        ? styles.breadcrumbTextActive
                        : null,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <Loader size={24} color={theme.colors.accent} />
            <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
              正在读取知识库...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Text maxFontSizeMultiplier={2} style={styles.errorText}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.8}
                style={styles.secondaryButtonText}
              >
                重试
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.itemList}>
            {!searchQuery
              ? currentItems.directories.map(directory => (
                  <View key={directory} style={styles.itemRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCurrentDirectory(directory)}
                      style={({ pressed }) => [
                        styles.itemMain,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <View style={styles.itemIcon}>
                        <Folder size={20} color={theme.colors.warning} />
                      </View>
                      <View style={styles.itemTextGroup}>
                        <Text
                          maxFontSizeMultiplier={2}
                          numberOfLines={1}
                          style={styles.itemTitle}
                        >
                          {directory.slice(directory.lastIndexOf('/') + 1)}
                        </Text>
                        <Text
                          maxFontSizeMultiplier={1.8}
                          numberOfLines={1}
                          style={styles.itemMeta}
                        >
                          {
                            notes.filter(note =>
                              note.path.startsWith(`${directory}/`)
                            ).length
                          }{' '}
                          篇笔记
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="目录操作"
                      accessibilityRole="button"
                      onPress={() => openDirectoryActions(directory)}
                      style={({ pressed }) => [
                        styles.rowAction,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <MoreHorizontal
                        size={20}
                        color={theme.colors.textMuted}
                      />
                    </Pressable>
                  </View>
                ))
              : null}
            {displayNotes.map(note => (
              <View key={note.path} style={styles.itemRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openNote(note)}
                  style={({ pressed }) => [
                    styles.itemMain,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.itemIcon}>
                    <FileText size={20} color={theme.colors.accent} />
                  </View>
                  <View style={styles.itemTextGroup}>
                    <Text
                      maxFontSizeMultiplier={2}
                      numberOfLines={1}
                      style={styles.itemTitle}
                    >
                      {note.name}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1.8}
                      numberOfLines={1}
                      style={styles.itemMeta}
                    >
                      {searchQuery ? note.path : formatDate(note.mtimeMs)} ·{' '}
                      {formatBytes(note.size)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel="笔记操作"
                  accessibilityRole="button"
                  onPress={() => openNoteActions(note)}
                  style={({ pressed }) => [
                    styles.rowAction,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <MoreHorizontal size={20} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            ))}
            {currentItems.directories.length === 0 &&
            displayNotes.length === 0 ? (
              <View style={styles.emptyState}>
                <BookOpen size={34} color={theme.colors.textMuted} />
                <Text maxFontSizeMultiplier={2} style={styles.emptyTitle}>
                  {searchQuery ? '没有匹配结果' : '这里还没有笔记'}
                </Text>
                <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
                  {searchQuery
                    ? '换一个关键词继续搜索'
                    : '新建或导入一篇 Markdown 笔记'}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => !promptWorking && setPrompt(null)}
        transparent
        visible={!!prompt}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}
          >
            <View style={styles.promptCard}>
              <View style={styles.promptHeader}>
                <Text maxFontSizeMultiplier={2} style={styles.promptTitle}>
                  {prompt?.title}
                </Text>
                <Pressable
                  accessibilityLabel="关闭"
                  accessibilityRole="button"
                  disabled={promptWorking}
                  onPress={() => setPrompt(null)}
                  style={styles.iconButton}
                >
                  <X size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
              <TextInput
                autoCapitalize="none"
                autoFocus
                maxFontSizeMultiplier={1.8}
                onChangeText={setPromptValue}
                placeholder={prompt?.placeholder}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.promptInput}
                value={promptValue}
              />
              <View style={styles.promptActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={promptWorking}
                  onPress={() => setPrompt(null)}
                  style={styles.secondaryButton}
                >
                  <Text
                    maxFontSizeMultiplier={1.8}
                    style={styles.secondaryButtonText}
                  >
                    取消
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={promptWorking}
                  onPress={() => void submitPrompt()}
                  style={[
                    styles.primarySmallButton,
                    promptWorking ? styles.disabled : null,
                  ]}
                >
                  {promptWorking ? (
                    <Loader size={17} color={theme.colors.onAccent} />
                  ) : (
                    <Upload size={17} color={theme.colors.onAccent} />
                  )}
                  <Text
                    maxFontSizeMultiplier={1.8}
                    style={styles.primarySmallButtonText}
                  >
                    {prompt?.confirmText}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  )
}

function createKnowledgeStyles(theme: MostBoxTheme) {
  return StyleSheet.create({
    screen: { flex: 1, minHeight: 0 },
    browserContent: { paddingBottom: 28 },
    actionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    actionRowAccessibility: { alignItems: 'stretch', flexDirection: 'column' },
    primaryAction: {
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.medium,
      flexDirection: 'row',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 16,
    },
    primaryActionText: {
      color: theme.colors.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
    utilityActions: { flexDirection: 'row', gap: 6 },
    utilityAction: {
      alignItems: 'center',
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      gap: 3,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 54,
      paddingHorizontal: 8,
    },
    utilityActionText: { color: theme.colors.textSecondary, fontSize: 11 },
    searchBox: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    searchInput: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 15,
      paddingVertical: 9,
    },
    searchClear: {
      alignItems: 'center',
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    breadcrumb: { marginVertical: 12 },
    breadcrumbContent: { alignItems: 'center', minHeight: 32 },
    breadcrumbItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    breadcrumbText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      padding: 6,
    },
    breadcrumbTextActive: { color: theme.colors.text, fontWeight: '700' },
    itemList: { borderTopColor: theme.colors.border, borderTopWidth: 1 },
    itemRow: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      minHeight: 66,
    },
    itemMain: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 11,
      minWidth: 0,
      paddingVertical: 10,
    },
    itemIcon: {
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceSubtle,
      borderRadius: theme.radii.small,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    itemTextGroup: { flex: 1, gap: 4, minWidth: 0 },
    itemTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
    itemMeta: { color: theme.colors.textMuted, fontSize: 12 },
    rowAction: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    loadingState: { alignItems: 'center', gap: 12, paddingVertical: 54 },
    emptyState: {
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 48,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyBody: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 19,
      padding: 10,
      textAlign: 'center',
    },
    detailHeader: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 54,
      paddingBottom: 8,
    },
    detailTitleGroup: { flex: 1, minWidth: 0 },
    detailTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '700' },
    detailPath: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
    iconButton: {
      alignItems: 'center',
      borderRadius: theme.radii.small,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    iconButtonSmall: {
      alignItems: 'center',
      borderRadius: theme.radii.small,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    inlineActions: { flexDirection: 'row', gap: 2 },
    previewMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    metaText: { color: theme.colors.textMuted, fontSize: 12 },
    previewScroll: { flex: 1 },
    previewContent: { flexGrow: 1, paddingBottom: 32, paddingTop: 14 },
    saveButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.medium,
      flexDirection: 'row',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 13,
    },
    saveButtonText: {
      color: theme.colors.onAccent,
      fontSize: 14,
      fontWeight: '700',
    },
    unsavedLabel: { color: theme.colors.warning, fontSize: 11, marginTop: 2 },
    editorFields: { gap: 8, paddingVertical: 10 },
    titleInput: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    pathInput: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      color: theme.colors.textSecondary,
      fontSize: 14,
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    editorControlRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: 8,
    },
    segmentedControl: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radii.medium,
      flexDirection: 'row',
      padding: 3,
    },
    segment: {
      alignItems: 'center',
      borderRadius: theme.radii.small,
      minWidth: 72,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    segmentActive: { backgroundColor: theme.colors.surface },
    segmentText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    segmentTextActive: { color: theme.colors.text },
    toolbar: {
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      flexGrow: 0,
    },
    toolbarContent: {
      alignItems: 'center',
      gap: 4,
      minHeight: 48,
      paddingHorizontal: 2,
    },
    toolButton: {
      alignItems: 'center',
      borderRadius: theme.radii.small,
      height: 38,
      justifyContent: 'center',
      width: 40,
    },
    editorInput: {
      color: theme.colors.text,
      flex: 1,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
      fontSize: 15,
      lineHeight: 23,
      minHeight: 180,
      paddingHorizontal: 4,
      paddingVertical: 14,
    },
    secondaryButton: {
      alignItems: 'center',
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 42,
      paddingHorizontal: 16,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    primarySmallButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.medium,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      minHeight: 42,
      paddingHorizontal: 16,
    },
    primarySmallButtonText: {
      color: theme.colors.onAccent,
      fontSize: 14,
      fontWeight: '700',
    },
    modalOverlay: {
      backgroundColor: theme.colors.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
    modalKeyboard: { width: '100%' },
    promptCard: {
      backgroundColor: theme.colors.surfaceSolid,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      gap: 14,
      padding: 18,
    },
    promptHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    promptTitle: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
    },
    promptInput: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      color: theme.colors.text,
      fontSize: 15,
      minHeight: 46,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    promptActions: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'flex-end',
    },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.45 },
  })
}

const knowledgeStyles = {
  light: createKnowledgeStyles(lightTheme),
  dark: createKnowledgeStyles(darkTheme),
}
