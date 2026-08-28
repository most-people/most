import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
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
  Bold,
  BookOpen,
  ChevronRight,
  Code,
  FileDown,
  FilePlus2,
  FileText,
  FileUp,
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
  Trash2,
  Upload,
  X,
} from 'lucide-react-native'
import { createExpoKnowledgeRepository } from './expoKnowledgeRepository'
import {
  applyMarkdownTool,
  createAttachmentMarkdown,
  createUniqueKnowledgeFilePath,
  getKnowledgeImportPathFromTextFile,
  getKnowledgeNoteBackupFileName,
  insertMarkdownAtSelection,
  joinKnowledgePath,
  normalizeKnowledgeDirectory,
  normalizeKnowledgeFilePath,
  prepareMarkdownPreview,
  searchKnowledgeNotes,
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
import { getGlassSurfaceStyle } from '../../ui/components'
import { useFeedback } from '../../ui/feedback'
import { usesAccessibilityLayout } from '../../ui/presentation'
import { useI18n, type Locale } from '../../i18n'

type PublishedKnowledgeAttachment = {
  fileName: string
  link: string
  mimeType?: string
}

export type KnowledgeBaseScreenProps = {
  backRequestToken: number
  backupWorking: boolean
  isCoreReady: boolean
  reselectToken: number
  onBackup: () => void | Promise<void>
  onPublishAttachment: () => Promise<PublishedKnowledgeAttachment | null>
  onOpenMostLink: (link: string) => void | Promise<void>
  onDirtyChange: (dirty: boolean) => void
  onPresentationChange: (mode: ScreenMode) => void
  onRestore: () => void | Promise<void>
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

function getSafeExportName(input: string, fallback: string) {
  const value = input
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
  return value || fallback
}

function downloadWebTextFile(content: string, fileName: string) {
  if (typeof document === 'undefined') {
    throw new Error('Browser file actions are unavailable')
  }
  const fileUri = URL.createObjectURL(
    new Blob([content], { type: 'text/plain;charset=utf-8' })
  )
  const link = document.createElement('a')
  link.href = fileUri
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(fileUri), 1_000)
}

function getCurrentItems(
  notes: MobileKnowledgeNote[],
  directory: string,
  compareStrings: (left: string, right: string) => number
) {
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
    directories: [...directories].sort(compareStrings),
    files: files.sort((left, right) => right.mtimeMs - left.mtimeMs),
  }
}

function getErrorMessage(error: unknown, locale: Locale, fallback: string) {
  return locale === 'zh-CN' && error instanceof Error ? error.message : fallback
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
  backRequestToken,
  backupWorking,
  isCoreReady,
  reselectToken,
  onBackup,
  onPublishAttachment,
  onOpenMostLink,
  onDirtyChange,
  onPresentationChange,
  onRestore,
}: KnowledgeBaseScreenProps) {
  const { compareStrings, formatDateTime, locale, t } = useI18n()
  const { alert } = useFeedback()
  const theme = useMostBoxTheme()
  const styles = knowledgeStyles[theme.mode]
  const { fontScale } = useWindowDimensions()
  const accessibilityLayout = usesAccessibilityLayout(fontScale)
  const repositoryRef = useRef<KnowledgeRepository | null>(null)
  const browserScrollRef = useRef<ScrollView>(null)
  const handledBackRequestTokenRef = useRef(0)
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
  const editorNameError = useMemo(() => {
    if (!editorName.trim()) return t('knowledge.editor.nameRequired')
    try {
      joinKnowledgePath('', editorName)
      return ''
    } catch {
      return t('knowledge.editor.nameInvalid')
    }
  }, [editorName, t])

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => onPresentationChange(mode), [mode, onPresentationChange])
  useEffect(() => () => onPresentationChange('browse'), [onPresentationChange])
  useEffect(() => {
    if (mode === 'browse' && reselectToken > 0) {
      browserScrollRef.current?.scrollTo({ y: 0, animated: true })
    }
  }, [mode, reselectToken])
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setNotes(await repository.list())
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, locale, t('knowledge.error.load')))
    } finally {
      setLoading(false)
    }
  }, [locale, repository, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      if (!dirty) {
        onConfirm()
        return
      }
      alert(t('knowledge.discard.title'), t('knowledge.discard.body'), [
        { text: t('knowledge.discard.continue'), style: 'cancel' },
        {
          text: t('knowledge.discard.confirm'),
          style: 'destructive',
          onPress: onConfirm,
        },
      ])
    },
    [dirty, t]
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
    () => getCurrentItems(notes, currentDirectory, compareStrings),
    [compareStrings, currentDirectory, notes]
  )
  const breadcrumb = useMemo(() => {
    const parts = currentDirectory.split('/').filter(Boolean)
    return [
      { label: t('knowledge.root'), path: '' },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
    ]
  }, [currentDirectory, t])

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

  const leaveEditor = useCallback(() => {
    confirmDiscard(() => {
      setMode(editorOriginalPath ? 'preview' : 'browse')
    })
  }, [confirmDiscard, editorOriginalPath])

  useEffect(() => {
    if (backRequestToken <= 0) return
    if (handledBackRequestTokenRef.current === backRequestToken) return
    handledBackRequestTokenRef.current = backRequestToken
    if (mode === 'edit') {
      leaveEditor()
      return
    }
    if (mode === 'preview') setMode('browse')
  }, [backRequestToken, leaveEditor, mode])

  function openKnowledgeActions() {
    alert(t('knowledge.actions.title'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('knowledge.actions.backup'),
        onPress: () => void onBackup(),
      },
      {
        text: t('knowledge.actions.restore'),
        onPress: () => void onRestore(),
      },
    ])
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
              throw new Error(t('knowledge.error.rollback'))
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
      setError(getErrorMessage(saveError, locale, t('knowledge.error.save')))
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
      alert(
        t('knowledge.attachment.coreTitle'),
        t('knowledge.attachment.coreBody')
      )
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
      alert(
        t('knowledge.attachment.publishFailed'),
        getErrorMessage(
          attachError,
          locale,
          t('knowledge.attachment.publishFailedBody')
        )
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
      alert(t('knowledge.link.unsupported'), url)
      return
    }
    if (!(await Linking.canOpenURL(url))) {
      throw new Error(t('knowledge.link.openUnavailable'))
    }
    await Linking.openURL(url)
  }

  async function shareFile(fileUri: string, mimeType: string, title: string) {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error(t('knowledge.share.unavailable'))
    }
    await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: title })
  }

  async function exportNote(note: MobileKnowledgeNote) {
    setWorking(true)
    try {
      const fileName = getSafeExportName(
        getKnowledgeNoteBackupFileName(note.name),
        'note.txt'
      )
      if (Platform.OS === 'web') {
        downloadWebTextFile(note.content, fileName)
        return
      }
      if (!FileSystem.cacheDirectory) {
        throw new Error(t('knowledge.temp.unavailable'))
      }
      const target = `${FileSystem.cacheDirectory}${encodeURIComponent(fileName)}`
      await FileSystem.writeAsStringAsync(target, note.content, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      await shareFile(
        target,
        'text/plain',
        t('knowledge.export.dialog', { fileName })
      )
    } catch (exportError) {
      alert(
        t('knowledge.export.failed'),
        getErrorMessage(exportError, locale, t('knowledge.export.failedBody'))
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
      alert(
        t('knowledge.import.failed'),
        getErrorMessage(importError, locale, t('knowledge.import.failedBody'))
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
        type: 'text/plain',
      })
      if (result.canceled) return
      const file = result.assets[0]
      if (!file) return
      const targetPath = getKnowledgeImportPathFromTextFile(
        currentDirectory,
        file.name
      )
      const content =
        Platform.OS === 'web' && file.file
          ? await file.file.text()
          : await FileSystem.readAsStringAsync(file.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            })
      const conflict = notes.some(
        note => note.path.toLowerCase() === targetPath.toLowerCase()
      )
      if (!conflict) {
        await finishImport(targetPath, content, false)
        return
      }
      alert(t('knowledge.import.conflict'), targetPath, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('knowledge.import.keepBoth'),
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
          text: t('knowledge.import.overwrite'),
          style: 'destructive',
          onPress: () => {
            void finishImport(targetPath, content, true)
          },
        },
      ])
    } catch (importError) {
      alert(
        t('knowledge.import.failed'),
        getErrorMessage(importError, locale, t('knowledge.import.chooseTxt'))
      )
    }
  }

  function confirmDeleteNote(note: MobileKnowledgeNote) {
    alert(t('knowledge.delete.noteTitle'), note.path, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
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
              alert(
                t('knowledge.delete.noteFailed'),
                getErrorMessage(
                  deleteError,
                  locale,
                  t('knowledge.delete.noteFailedBody')
                )
              )
            })
            .finally(() => setWorking(false))
        },
      },
    ])
  }

  function openDirectoryActions(directory: string) {
    alert(directory.slice(directory.lastIndexOf('/') + 1), directory, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('knowledge.move.directoryAction'),
        onPress: () => {
          const promptState: PromptState = {
            title: t('knowledge.move.directoryTitle'),
            placeholder: t('knowledge.move.directoryPlaceholder'),
            value: directory,
            confirmText: t('knowledge.move.directoryAction'),
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
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          alert(
            t('knowledge.delete.directoryTitle'),
            t('knowledge.delete.directoryBody'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.delete'),
                style: 'destructive',
                onPress: () => {
                  setWorking(true)
                  void repository
                    .deleteDirectory(directory)
                    .then(refresh)
                    .catch(deleteError => {
                      alert(
                        t('knowledge.delete.noteFailed'),
                        getErrorMessage(
                          deleteError,
                          locale,
                          t('knowledge.delete.directoryFailedBody')
                        )
                      )
                    })
                    .finally(() => setWorking(false))
                },
              },
            ]
          )
        },
      },
    ])
  }

  function openNoteActions(note: MobileKnowledgeNote) {
    alert(note.name, note.path, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
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
      alert(
        t('knowledge.action.failed'),
        getErrorMessage(promptError, locale, t('knowledge.action.failedBody'))
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
          <View style={styles.detailTitleGroup}>
            <Text maxFontSizeMultiplier={1.8} style={styles.detailTitle}>
              {editorOriginalPath
                ? t('knowledge.editor.editTitle')
                : t('knowledge.editor.newTitle')}
            </Text>
            {dirty ? (
              <Text maxFontSizeMultiplier={1.6} style={styles.unsavedLabel}>
                {t('knowledge.editor.unsaved')}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t('knowledge.editor.saveA11y')}
            accessibilityRole="button"
            accessibilityState={{ disabled: working || !!editorNameError }}
            disabled={working || !!editorNameError}
            onPress={() => void saveEditor()}
            style={({ pressed }) => [
              styles.saveButton,
              working || editorNameError ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {working ? (
              <Loader size={17} color={theme.colors.onAccent} />
            ) : (
              <Save size={17} color={theme.colors.onAccent} />
            )}
            <Text maxFontSizeMultiplier={1.6} style={styles.saveButtonText}>
              {t('common.save')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.editorFields}>
          <TextInput
            accessibilityLabel={t('knowledge.editor.name')}
            maxFontSizeMultiplier={1.8}
            onChangeText={setEditorName}
            placeholder={t('knowledge.editor.name')}
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.titleInput,
              editorNameError ? styles.inputError : null,
            ]}
            underlineColorAndroid="transparent"
            value={editorName}
          />
          {editorNameError ? (
            <Text accessibilityRole="alert" style={styles.fieldErrorText}>
              {editorNameError}
            </Text>
          ) : null}
          <TextInput
            accessibilityLabel={t('knowledge.editor.directory')}
            autoCapitalize="none"
            maxFontSizeMultiplier={1.8}
            onChangeText={setEditorDirectory}
            placeholder={t('knowledge.editor.directoryPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.pathInput}
            underlineColorAndroid="transparent"
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
                {t('common.edit')}
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
                {t('common.preview')}
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
                ['heading', t('knowledge.tool.heading'), Heading2],
                ['bold', t('knowledge.tool.bold'), Bold],
                ['italic', t('knowledge.tool.italic'), Italic],
                ['list', t('knowledge.tool.list'), List],
                ['code', t('knowledge.tool.code'), Code],
                ['link', t('knowledge.tool.link'), Link2],
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
                accessibilityLabel={t('knowledge.attachment.insert')}
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
              accessibilityLabel={t('knowledge.editor.bodyA11y')}
              autoCapitalize="sentences"
              multiline
              onChangeText={setEditorContent}
              onSelectionChange={event =>
                setEditorSelection(event.nativeEvent.selection)
              }
              placeholder={t('knowledge.editor.bodyPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              selection={editorSelection}
              style={styles.editorInput}
              textAlignVertical="top"
              underlineColorAndroid="transparent"
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
                  list: {
                    bulletPoint: t('knowledge.markdown.bullet'),
                    orderedItem: t('knowledge.markdown.ordered'),
                  },
                  blockquote: { quote: t('knowledge.markdown.quote') },
                  table: { row: t('knowledge.markdown.row') },
                }}
                flavor="github"
                markdown={prepareMarkdownPreview(editorContent)}
                markdownStyle={markdownStyle}
                maxFontSizeMultiplier={2}
                md4cFlags={{ latexMath: false }}
                onLinkPress={({ url }) => {
                  void handlePreviewLink(url).catch(linkError => {
                    alert(
                      t('knowledge.link.openFailed'),
                      getErrorMessage(
                        linkError,
                        locale,
                        t('knowledge.link.openFailedBody')
                      )
                    )
                  })
                }}
                selectable
                selectionMenuConfig={{
                  copy: { label: t('knowledge.markdown.copy') },
                  copyAsMarkdown: {
                    enabled: true,
                    label: t('knowledge.markdown.copyMarkdown'),
                  },
                }}
              />
            ) : (
              <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
                {t('knowledge.empty.content')}
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
            accessibilityLabel={t('knowledge.preview.edit')}
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
            {formatDateTime(selectedNote.mtimeMs)}
          </Text>
          <View style={styles.inlineActions}>
            <Pressable
              accessibilityLabel={t('knowledge.preview.exportA11y')}
              accessibilityRole="button"
              onPress={() => void exportNote(selectedNote)}
              style={({ pressed }) => [
                styles.previewExportButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <FileDown size={16} color={theme.colors.textSecondary} />
              <Text
                maxFontSizeMultiplier={1.5}
                style={styles.previewExportButtonText}
              >
                {t('knowledge.preview.export')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('knowledge.preview.delete')}
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
                list: {
                  bulletPoint: t('knowledge.markdown.bullet'),
                  orderedItem: t('knowledge.markdown.ordered'),
                },
                blockquote: { quote: t('knowledge.markdown.quote') },
                table: { row: t('knowledge.markdown.row') },
              }}
              flavor="github"
              markdown={prepareMarkdownPreview(selectedNote.content)}
              markdownStyle={markdownStyle}
              maxFontSizeMultiplier={2}
              md4cFlags={{ latexMath: false }}
              onLinkPress={({ url }) => {
                void handlePreviewLink(url).catch(linkError => {
                  alert(
                    t('knowledge.link.openFailed'),
                    getErrorMessage(
                      linkError,
                      locale,
                      t('knowledge.link.openFailedBody')
                    )
                  )
                })
              }}
              selectable
              selectionMenuConfig={{
                copy: { label: t('knowledge.markdown.copy') },
                copyAsMarkdown: {
                  enabled: true,
                  label: t('knowledge.markdown.copyMarkdown'),
                },
              }}
            />
          ) : (
            <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
              {t('knowledge.empty.content')}
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
        ref={browserScrollRef}
        contentContainerStyle={styles.browserContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.actionSection}>
          <View
            style={[
              styles.noteActions,
              accessibilityLayout ? styles.noteActionsAccessibility : null,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => openEditor()}
              style={({ pressed }) => [
                styles.noteAction,
                styles.noteActionPrimary,
                accessibilityLayout ? styles.noteActionAccessibility : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <FilePlus2 size={19} color={theme.colors.onAccent} />
              <Text
                maxFontSizeMultiplier={1.8}
                numberOfLines={1}
                style={[styles.noteActionText, styles.noteActionTextPrimary]}
              >
                {t('knowledge.action.new')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('knowledge.action.import')}
              accessibilityRole="button"
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => void importNote()}
              style={({ pressed }) => [
                styles.noteAction,
                styles.noteActionSecondary,
                accessibilityLayout ? styles.noteActionAccessibility : null,
                working ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <FileUp size={19} color={theme.colors.accent} />
              <Text
                maxFontSizeMultiplier={1.8}
                numberOfLines={1}
                style={styles.noteActionText}
              >
                {t('knowledge.action.import')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('knowledge.actions.title')}
              accessibilityRole="button"
              accessibilityState={{ disabled: backupWorking }}
              disabled={backupWorking}
              onPress={openKnowledgeActions}
              style={({ pressed }) => [
                styles.noteActionIcon,
                backupWorking ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {backupWorking ? (
                <Loader size={19} color={theme.colors.accent} />
              ) : (
                <MoreHorizontal size={20} color={theme.colors.accent} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color={theme.colors.textMuted} />
          <TextInput
            accessibilityLabel={t('knowledge.search.a11y')}
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={1.8}
            onChangeText={setSearchQuery}
            placeholder={t('knowledge.search.placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            underlineColorAndroid={theme.colors.surfaceSolid}
            value={searchQuery}
          />
          {searchQuery ? (
            <Pressable
              accessibilityLabel={t('knowledge.search.clear')}
              accessibilityRole="button"
              onPress={() => {
                setSearchQuery('')
                Keyboard.dismiss()
              }}
              style={styles.searchClear}
            >
              <X size={17} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {!searchQuery && currentDirectory ? (
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
              {t('knowledge.loading')}
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
                {t('common.retry')}
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
                      <View style={[styles.itemIcon, styles.folderItemIcon]}>
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
                          {(() => {
                            const count = notes.filter(note =>
                              note.path.startsWith(`${directory}/`)
                            ).length
                            return t(
                              count === 1
                                ? 'knowledge.noteCount.one'
                                : 'knowledge.noteCount',
                              { count }
                            )
                          })()}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={t('knowledge.directory.actions')}
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
                  <View style={[styles.itemIcon, styles.noteItemIcon]}>
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
                      {searchQuery ? note.path : formatDateTime(note.mtimeMs)} ·{' '}
                      {formatBytes(note.size)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={t('knowledge.note.actions')}
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
                  {searchQuery
                    ? t('knowledge.empty.searchTitle')
                    : t('knowledge.empty.listTitle')}
                </Text>
                <Text maxFontSizeMultiplier={2} style={styles.emptyBody}>
                  {searchQuery
                    ? t('knowledge.empty.searchBody')
                    : t('knowledge.empty.listBody')}
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
                  accessibilityLabel={t('common.close')}
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
                underlineColorAndroid="transparent"
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
                    {t('common.cancel')}
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
    browserContent: {
      paddingBottom: 28,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    actionSection: {
      gap: 8,
      marginBottom: 14,
    },
    noteActions: {
      flexDirection: 'row',
      gap: 10,
    },
    noteActionsAccessibility: { flexDirection: 'column' },
    noteActionIcon: {
      alignItems: 'center',
      backgroundColor: theme.colors.glassSubtle,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      height: 52,
      justifyContent: 'center',
      width: 52,
    },
    noteAction: {
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 52,
      paddingHorizontal: 12,
    },
    noteActionAccessibility: {
      flex: 0,
      minHeight: 64,
      width: '100%',
    },
    noteActionPrimary: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    noteActionSecondary: {
      backgroundColor: theme.colors.glassSubtle,
    },
    noteActionText: {
      color: theme.colors.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    noteActionTextPrimary: { color: theme.colors.onAccent },
    searchBox: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceSolid,
      flexDirection: 'row',
      gap: 8,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    searchInput: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      color: theme.colors.text,
      flex: 1,
      fontSize: 15,
      includeFontPadding: false,
      minHeight: 30,
      minWidth: 0,
      padding: 0,
      paddingVertical: 0,
      width: '100%',
    },
    searchClear: {
      alignItems: 'center',
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    breadcrumb: { marginBottom: 2, marginTop: 10 },
    breadcrumbContent: { alignItems: 'center', minHeight: 32 },
    breadcrumbItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    breadcrumbText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      padding: 6,
    },
    breadcrumbTextActive: { color: theme.colors.text, fontWeight: '700' },
    itemList: {
      gap: 10,
      marginTop: 12,
    },
    itemRow: {
      alignItems: 'center',
      borderColor: theme.colors.border,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      flexDirection: 'row',
      minHeight: 66,
      paddingHorizontal: 10,
      backgroundColor: theme.colors.glassSubtle,
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
      borderRadius: theme.radii.medium,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    folderItemIcon: { backgroundColor: theme.colors.warningSoft },
    noteItemIcon: { backgroundColor: theme.colors.accentSoft },
    itemTextGroup: { flex: 1, gap: 4, minWidth: 0 },
    itemTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
    itemMeta: { color: theme.colors.textMuted, fontSize: 12 },
    rowAction: {
      alignItems: 'center',
      borderRadius: theme.radii.medium,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    loadingState: { alignItems: 'center', gap: 12, paddingVertical: 54 },
    emptyState: {
      ...getGlassSurfaceStyle(theme, 'subtle'),
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
      minHeight: 260,
      paddingHorizontal: 20,
      paddingVertical: 36,
    },
    emptyTitle: {
      alignSelf: 'stretch',
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyBody: {
      alignSelf: 'stretch',
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
      ...getGlassSurfaceStyle(theme, 'subtle'),
      alignItems: 'center',
      borderRadius: 0,
      borderWidth: 0,
      borderBottomColor: theme.colors.borderStrong,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 54,
      paddingBottom: 8,
      paddingHorizontal: 8,
    },
    detailTitleGroup: { flex: 1, minWidth: 0 },
    detailTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '700' },
    detailPath: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
    iconButton: {
      alignItems: 'center',
      borderRadius: theme.radii.medium,
      height: 42,
      justifyContent: 'center',
      width: 42,
      backgroundColor: theme.colors.glassSubtle,
    },
    iconButtonSmall: {
      alignItems: 'center',
      borderRadius: theme.radii.medium,
      height: 36,
      justifyContent: 'center',
      width: 36,
      backgroundColor: theme.colors.glassSubtle,
    },
    previewExportButton: {
      alignItems: 'center',
      borderRadius: theme.radii.medium,
      flexDirection: 'row',
      gap: 5,
      minHeight: 36,
      paddingHorizontal: 10,
      backgroundColor: theme.colors.glassSubtle,
    },
    previewExportButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    inlineActions: { flexDirection: 'row', gap: 2 },
    previewMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 44,
      paddingHorizontal: 16,
    },
    metaText: { color: theme.colors.textMuted, fontSize: 12 },
    previewScroll: { flex: 1 },
    previewContent: {
      flexGrow: 1,
      paddingBottom: 32,
      paddingHorizontal: 16,
      paddingTop: 14,
    },
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
    editorFields: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    titleInput: {
      backgroundColor: theme.colors.glassSubtle,
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
    inputError: {
      borderColor: theme.colors.danger,
    },
    fieldErrorText: {
      color: theme.colors.danger,
      fontSize: 12,
      lineHeight: 17,
      marginTop: -4,
    },
    pathInput: {
      backgroundColor: theme.colors.glassSubtle,
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
      paddingHorizontal: 16,
    },
    segmentedControl: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.glassSubtle,
      borderRadius: 12,
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
    segmentActive: {
      backgroundColor: theme.colors.accentSoft,
    },
    segmentText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    segmentTextActive: { color: theme.colors.text },
    toolbar: {
      backgroundColor: theme.colors.glassSubtle,
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
      paddingHorizontal: 12,
    },
    toolButton: {
      alignItems: 'center',
      borderRadius: theme.radii.medium,
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
      paddingHorizontal: 16,
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
      backgroundColor: theme.colors.glassSubtle,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    primarySmallButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
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
      ...getGlassSurfaceStyle(theme, 'elevated'),
      backgroundColor: theme.colors.glassHeavy,
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
      backgroundColor: theme.colors.glassSubtle,
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
