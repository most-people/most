import {
  Suspense,
  type ReactNode,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  PencilRuler,
  Eye,
  FolderOpen,
  MoreHorizontal,
  Move,
  Lock,
  NotebookPen,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import OpenSidebarButton from '~/components/OpenSidebarButton'
import { ActionMenu, ConfirmModal, InputModal } from '~/components/ui'
import { useAppStore, type NoteItem } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import type { MilkdownEditorRef } from '~/components/MilkdownEditor'
import { mostDecode, mostEncode } from '~server/src/utils/mostWallet.js'
import {
  getNoteFullPath,
  normalizeNotePath,
} from '~server/src/utils/noteUtils.js'
import { NoteMoveModal, type NoteMoveTarget } from '~/components/NoteMoveModal'
import { NoteSidebar } from '~/components/NoteSidebar'
import { useI18n, type MessageKey } from '~/lib/i18n'
import {
  deleteChatNoteDraft,
  readChatNoteDraft,
  type ChatNoteDraft,
} from '~/lib/chatNoteDraft'
import { useIsDesktopClient } from '~/hooks'
import {
  getApiErrorMessage,
  getBackendUrlExport,
} from '~server/src/utils/api.js'
import {
  configureNoteVault,
  createNoteVaultFile,
  deleteNoteVaultFile,
  getNoteVaultStatus,
  listNoteVaultFiles,
  moveNoteVaultFile,
  readNoteVaultFile,
  saveNoteVaultFile,
  type NoteVaultFile,
  type NoteVaultFileContent,
  type NoteVaultStatus,
} from './noteVaultApi'

const MilkdownEditor = lazy(async () => {
  const mod = await import('~/components/MilkdownEditor')
  return { default: mod.MilkdownEditor }
})

type ExplorerItem = NoteMoveTarget

type NoteTreeNode = {
  id: string
  type: 'directory' | 'file'
  name: string
  path: string
  fullPath: string
  updatedAt: number
  note?: NoteItem
  children: NoteTreeNode[]
}

type NoteTreeProps = {
  nodes: NoteTreeNode[]
  searchQuery: string
  expandedPaths: Set<string>
  activeFileId: string
  activeFolderPath: string
  onToggleDirectory: (node: NoteTreeNode) => void
  onOpenFile: (note: NoteItem) => void
  renderActions?: (item: ExplorerItem) => ReactNode
}

type NoteTreeNodeRowProps = Omit<NoteTreeProps, 'nodes' | 'searchQuery'> & {
  node: NoteTreeNode
  forceExpanded: boolean
}

type NoteSearchParams = {
  cid?: string
  file?: string
  path?: string
  chatDraft?: string
  mode?: 'edit'
}

type ResolvedWikiNoteLink = {
  label: string
  href: string
}

const WIKI_NOTE_LINK_PATTERN = /\[\[([^\]\n]+?)\]\]/g
const MARKDOWN_FENCED_CODE_BLOCK_PATTERN = /(```[\s\S]*?```)/g

function getNoteSearch(searchStr: string): NoteSearchParams {
  const searchParams = new URLSearchParams(searchStr)
  const mode = searchParams.get('mode')

  return {
    cid: searchParams.get('cid') || undefined,
    file: searchParams.get('file') || undefined,
    path: searchParams.get('path') || undefined,
    chatDraft: searchParams.get('chatDraft') || undefined,
    mode: mode === 'edit' ? 'edit' : undefined,
  }
}

function getNoteHref(search: NoteSearchParams = {}) {
  const searchParams = new URLSearchParams()
  if (search.cid) searchParams.set('cid', search.cid)
  if (search.file) searchParams.set('file', search.file)
  if (search.path) searchParams.set('path', search.path)
  if (search.chatDraft) searchParams.set('chatDraft', search.chatDraft)
  if (search.mode) searchParams.set('mode', search.mode)

  const query = searchParams.toString()
  return query ? `/note/?${query}` : '/note/'
}

function getNoteSearchFromHref(href: string): NoteSearchParams {
  const fallbackIndex = href.indexOf('?')
  const fallbackSearch = fallbackIndex >= 0 ? href.slice(fallbackIndex) : ''
  if (typeof window === 'undefined') return getNoteSearch(fallbackSearch)

  try {
    return getNoteSearch(new URL(href, window.location.origin).search)
  } catch {
    return getNoteSearch(fallbackSearch)
  }
}

const noteErrorMessageKeys: Record<string, MessageKey> = {
  'note.error.nameRequired': 'note.error.nameRequired',
  'note.error.nameNoSlash': 'note.error.nameNoSlash',
  'note.error.nameNoBackslash': 'note.error.nameNoBackslash',
  'note.error.nameInvalid': 'note.error.nameInvalid',
  'note.error.nameConflict': 'note.error.nameConflict',
  'note.error.moveIntoSelf': 'note.error.moveIntoSelf',
}

function getErrorMessage(
  error: unknown,
  fallback: string,
  t: (key: MessageKey) => string
) {
  const message = error instanceof Error ? error.message : ''
  const messageKey = noteErrorMessageKeys[message]
  if (messageKey) return t(messageKey)
  return message || fallback
}

function getExplorerItemFullPath(item: ExplorerItem) {
  if (item.type === 'directory') {
    return normalizeNotePath(
      item.path ? `${item.path}/${item.name}` : item.name
    )
  }
  return getNoteFullPath(item)
}

function getDisplayMarkdownName(input = '') {
  return String(input).trim().replace(/\.md$/i, '')
}

function getStorageMarkdownName(input: string) {
  const name = getDisplayMarkdownName(input)
  return name ? `${name}.md` : ''
}

function getUniqueStorageMarkdownName(
  title: string,
  fallbackTitle: string,
  exists: (name: string) => boolean
) {
  const baseName = getDisplayMarkdownName(title) || fallbackTitle

  for (let index = 0; index < 1000; index += 1) {
    const name =
      index === 0
        ? getStorageMarkdownName(baseName)
        : getStorageMarkdownName(`${baseName} ${index + 1}`)
    if (name && !exists(name)) return name
  }

  return getStorageMarkdownName(`${baseName} ${Date.now()}`)
}

function getStorageMarkdownPath(input = '') {
  const path = normalizeNotePath(input)
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return ''

  const lastIndex = parts.length - 1
  parts[lastIndex] = getStorageMarkdownName(parts[lastIndex])
  return parts.join('/')
}

function getDisplayMarkdownPath(input = '') {
  const path = normalizeNotePath(input)
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return ''

  const lastIndex = parts.length - 1
  parts[lastIndex] = getDisplayMarkdownName(parts[lastIndex])
  return parts.join('/')
}

function getNoteDisplayFullPath(note: NoteItem) {
  return getDisplayMarkdownPath(getNoteFullPath(note))
}

function getWikiLinkTargetPath(input: string) {
  const target = input.trim().replace(/^\/+/, '')
  const anchorIndex = target.search(/[#^]/)
  const notePath = anchorIndex >= 0 ? target.slice(0, anchorIndex) : target
  return getDisplayMarkdownPath(notePath)
}

function getWikiLinkLabel(targetPath: string, alias?: string) {
  const trimmedAlias = alias?.trim()
  if (trimmedAlias) return trimmedAlias

  const parts = targetPath.split('/').filter(Boolean)
  return parts[parts.length - 1] || targetPath
}

function escapeMarkdownLinkLabel(label: string) {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function formatMarkdownLink(label: string, href: string) {
  return `[${escapeMarkdownLinkLabel(label)}](<${href.replace(/>/g, '%3E')}>)`
}

function resolveWikiLinkNote(
  notes: NoteItem[],
  target: string,
  currentPath = ''
) {
  const targetPath = getWikiLinkTargetPath(target)
  if (!targetPath) return null

  const targetKey = targetPath.toLowerCase()
  const getNoteKey = (note: NoteItem) =>
    getNoteDisplayFullPath(note).toLowerCase()

  if (targetPath.includes('/')) {
    return notes.find(note => getNoteKey(note) === targetKey) || null
  }

  const currentDirectory = normalizeNotePath(currentPath)
  if (currentDirectory) {
    const sameDirectoryKey = normalizeNotePath(
      `${currentDirectory}/${targetPath}`
    ).toLowerCase()
    const sameDirectoryNote = notes.find(
      note => getNoteKey(note) === sameDirectoryKey
    )
    if (sameDirectoryNote) return sameDirectoryNote
  }

  return (
    notes.find(
      note => getDisplayMarkdownName(note.name).toLowerCase() === targetKey
    ) || null
  )
}

function resolveWikiNoteLinkBody(
  body: string,
  notes: NoteItem[],
  getHref: (note: NoteItem) => string,
  currentPath = '',
  getFallbackHref?: (targetPath: string) => string
): ResolvedWikiNoteLink | null {
  const separatorIndex = body.indexOf('|')
  const target = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body
  const alias = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : undefined
  const targetPath = getWikiLinkTargetPath(target)
  if (!targetPath) return null

  const note = resolveWikiLinkNote(notes, target, currentPath)
  const href = note ? getHref(note) : getFallbackHref?.(targetPath)
  if (!href) return null

  return {
    label: getWikiLinkLabel(targetPath, alias),
    href,
  }
}

function renderWikiNoteLinks(
  markdown: string,
  notes: NoteItem[],
  getHref: (note: NoteItem) => string,
  currentPath = '',
  getFallbackHref?: (targetPath: string) => string
) {
  if (!markdown.includes('[[')) return markdown

  return markdown
    .split(MARKDOWN_FENCED_CODE_BLOCK_PATTERN)
    .map(part => {
      if (part.startsWith('```')) return part

      return part.replace(WIKI_NOTE_LINK_PATTERN, (source, body: string) => {
        const link = resolveWikiNoteLinkBody(
          body,
          notes,
          getHref,
          currentPath,
          getFallbackHref
        )
        return link ? formatMarkdownLink(link.label, link.href) : source
      })
    })
    .join('')
}

function getTreeNodeDisplayName(node: NoteTreeNode) {
  return node.type === 'file' ? getDisplayMarkdownName(node.name) : node.name
}

function getTreeNodeDisplayPath(node: NoteTreeNode) {
  return node.type === 'file'
    ? getDisplayMarkdownPath(node.fullPath)
    : node.fullPath
}

function getExplorerItemDisplayName(item: ExplorerItem) {
  return item.type === 'file' ? getDisplayMarkdownName(item.name) : item.name
}

function getDirectoryPathAncestors(path = '') {
  const parts = normalizeNotePath(path).split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

function toggleExpandedPath(paths: Set<string>, path: string) {
  const next = new Set(paths)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  return next
}

function mergeExpandedPaths(paths: Set<string>, nextPaths: string[]) {
  if (nextPaths.length === 0) return paths

  let changed = false
  const next = new Set(paths)
  for (const path of nextPaths) {
    if (!next.has(path)) {
      next.add(path)
      changed = true
    }
  }
  return changed ? next : paths
}

function getDirectoryExplorerItem(node: NoteTreeNode): ExplorerItem {
  return {
    name: node.name,
    cid: `__dir__${node.fullPath}`,
    path: node.path,
    type: 'directory',
    size: 0,
    created_at: node.updatedAt,
    updated_at: node.updatedAt,
  }
}

function buildNoteTree(
  notes: NoteItem[],
  compareStrings: (left: string, right: string) => number
) {
  const rootNodes: NoteTreeNode[] = []
  const directoryMap = new Map<string, NoteTreeNode>()

  function getDirectoryChildren(parentPath: string) {
    if (!parentPath) return rootNodes
    return directoryMap.get(parentPath)?.children || rootNodes
  }

  function getDirectoryNode(
    name: string,
    parentPath: string,
    updatedAt: number
  ) {
    const fullPath = normalizeNotePath(
      parentPath ? `${parentPath}/${name}` : name
    )
    const existingNode = directoryMap.get(fullPath)
    if (existingNode) {
      existingNode.updatedAt = Math.max(existingNode.updatedAt, updatedAt)
      return existingNode
    }

    const node: NoteTreeNode = {
      id: `directory:${fullPath}`,
      type: 'directory',
      name,
      path: parentPath,
      fullPath,
      updatedAt,
      children: [],
    }
    directoryMap.set(fullPath, node)
    getDirectoryChildren(parentPath).push(node)
    return node
  }

  for (const note of notes) {
    const notePath = normalizeNotePath(note.path || '')
    const parts = notePath.split('/').filter(Boolean)
    const updatedAt = note.updated_at || note.created_at || 0
    let parentPath = ''

    for (const part of parts) {
      const directory = getDirectoryNode(part, parentPath, updatedAt)
      parentPath = directory.fullPath
    }

    getDirectoryChildren(parentPath).push({
      id: `file:${note.cid}:${getNoteFullPath(note)}`,
      type: 'file',
      name: note.name,
      path: notePath,
      fullPath: getNoteFullPath(note),
      updatedAt,
      note,
      children: [],
    })
  }

  function sortNodes(nodes: NoteTreeNode[]) {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }

      const byName = compareStrings(
        getTreeNodeDisplayName(left),
        getTreeNodeDisplayName(right)
      )
      if (byName !== 0) return byName
      return compareStrings(
        getTreeNodeDisplayPath(left),
        getTreeNodeDisplayPath(right)
      )
    })

    for (const node of nodes) {
      if (node.type === 'directory') sortNodes(node.children)
    }
  }

  sortNodes(rootNodes)
  return rootNodes
}

function filterNoteTree(nodes: NoteTreeNode[], query: string): NoteTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes

  return nodes.flatMap(node => {
    const displayName = getTreeNodeDisplayName(node).toLowerCase()
    const displayPath = getTreeNodeDisplayPath(node).toLowerCase()
    const ownMatch =
      displayName.includes(normalizedQuery) ||
      displayPath.includes(normalizedQuery)

    if (node.type === 'file') {
      return ownMatch ? [node] : []
    }

    const children = ownMatch
      ? node.children
      : filterNoteTree(node.children, normalizedQuery)

    if (!ownMatch && children.length === 0) return []
    return [{ ...node, children }]
  })
}

function NoteTree({
  nodes,
  searchQuery,
  expandedPaths,
  activeFileId,
  activeFolderPath,
  onToggleDirectory,
  onOpenFile,
  renderActions,
}: NoteTreeProps) {
  const forceExpanded = searchQuery.trim().length > 0

  return (
    <div className="note-tree" role="tree">
      {nodes.map(node => (
        <NoteTreeNodeRow
          key={node.id}
          node={node}
          forceExpanded={forceExpanded}
          expandedPaths={expandedPaths}
          activeFileId={activeFileId}
          activeFolderPath={activeFolderPath}
          onToggleDirectory={onToggleDirectory}
          onOpenFile={onOpenFile}
          renderActions={renderActions}
        />
      ))}
    </div>
  )
}

function NoteTreeNodeRow({
  node,
  forceExpanded,
  expandedPaths,
  activeFileId,
  activeFolderPath,
  onToggleDirectory,
  onOpenFile,
  renderActions,
}: NoteTreeNodeRowProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded =
    isDirectory && (forceExpanded || expandedPaths.has(node.fullPath))
  const isActiveFile = node.type === 'file' && node.note?.cid === activeFileId
  const isActiveFolder =
    isDirectory && normalizeNotePath(activeFolderPath) === node.fullPath
  const item = isDirectory ? getDirectoryExplorerItem(node) : node.note || null
  const actions = item && renderActions ? renderActions(item) : null

  return (
    <div className="note-tree-node" role="none">
      <div
        className={`note-tree-row ${isDirectory ? 'is-directory' : 'is-file'} ${
          isActiveFile ? 'is-active' : ''
        } ${isActiveFolder ? 'is-folder-active' : ''} ${
          actions ? 'has-actions' : ''
        }`}
      >
        <button
          type="button"
          className="note-tree-item"
          role="treeitem"
          aria-expanded={isDirectory ? isExpanded : undefined}
          onClick={() => {
            if (isDirectory) {
              onToggleDirectory(node)
              return
            }
            if (node.note) onOpenFile(node.note)
          }}
        >
          <span className="note-tree-toggle" aria-hidden="true">
            {isDirectory ? (
              isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )
            ) : (
              <span className="note-tree-toggle-placeholder" />
            )}
          </span>
          <span className="note-tree-label" translate="no">
            {getTreeNodeDisplayName(node)}
          </span>
          {node.note?.isSecret && (
            <Lock className="note-tree-lock" size={14} aria-hidden="true" />
          )}
        </button>
        {actions}
      </div>
      {isDirectory && isExpanded && node.children.length > 0 && (
        <div className="note-tree-children" role="group">
          {node.children.map(child => (
            <NoteTreeNodeRow
              key={child.id}
              node={child}
              forceExpanded={forceExpanded}
              expandedPaths={expandedPaths}
              activeFileId={activeFileId}
              activeFolderPath={activeFolderPath}
              onToggleDirectory={onToggleDirectory}
              onOpenFile={onOpenFile}
              renderActions={renderActions}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteTreeActionsMenu({
  item,
  onMove,
  onDelete,
}: {
  item: ExplorerItem
  onMove: (item: ExplorerItem) => void
  onDelete: (item: ExplorerItem) => void
}) {
  const { t } = useI18n()

  return (
    <ActionMenu
      ariaLabel={t('common.moreActions')}
      className="note-list-actions-anchor"
      placement="bottom-end"
      items={[
        {
          key: 'move',
          label: t('note.action.move'),
          icon: <Move size={16} />,
          onSelect: () => onMove(item),
        },
        {
          key: 'delete',
          label: t('note.action.delete'),
          icon: <Trash2 size={16} />,
          danger: true,
          onSelect: () => onDelete(item),
        },
      ]}
      renderTrigger={triggerProps => (
        <button
          {...triggerProps}
          className="note-list-actions-trigger"
          title={t('common.moreActions')}
          aria-label={t('common.moreActions')}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    />
  )
}

function getDirectoryOptions(
  notes: NoteItem[],
  compareStrings: (left: string, right: string) => number
) {
  const directories = new Set<string>()

  for (const note of notes) {
    const parts = normalizeNotePath(note.path).split('/').filter(Boolean)
    for (let index = 0; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index + 1).join('/'))
    }
  }

  return Array.from(directories)
    .sort(compareStrings)
    .map(path => {
      const parts = path.split('/')
      return {
        path,
        name: parts[parts.length - 1] || path,
        parentPath: parts.slice(0, -1).join('/'),
        depth: Math.max(parts.length - 1, 0),
      }
    })
}

function getVaultNoteItems(files: NoteVaultFile[]): NoteItem[] {
  return files.map(file => ({
    name: file.name,
    cid: file.path,
    path: normalizeNotePath(file.directory),
    content: '',
    size: file.size,
    type: 'file',
    created_at: Number(file.mtimeMs) || Date.now(),
    updated_at: Number(file.mtimeMs) || Date.now(),
    isSecret: false,
  }))
}

function getVaultFilePath(directory: string, name: string) {
  const fileName = getStorageMarkdownName(name)
  return normalizeNotePath(directory ? `${directory}/${fileName}` : fileName)
}

function isLocalNoteVaultBackend(url: string) {
  const value =
    url || (typeof window !== 'undefined' ? window.location.origin || '' : '')
  if (!value) return false

  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('127.')
    )
  } catch {
    return false
  }
}

function useConfiguredNoteVaultBackend(enabled: boolean, walletAddress = '') {
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (!enabled || !walletAddress) {
      setConfigured(false)
      return () => {
        cancelled = true
      }
    }

    getNoteVaultStatus()
      .then(status => {
        if (!cancelled) setConfigured(status.configured === true)
      })
      .catch(() => {
        if (!cancelled) setConfigured(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, walletAddress])

  return configured
}

function canSelectNoteVaultDirectory() {
  return (
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.selectNoteVaultDirectory === 'function'
  )
}

function NotePageContent() {
  const { t, formatDate, compareStrings } = useI18n()
  const navigate = useNavigate()
  const searchStr = useLocation({ select: location => location.searchStr })
  const params = useMemo(() => getNoteSearch(searchStr), [searchStr])
  const editorRef = useRef<MilkdownEditorRef>(null)

  const addToast = useAppStore(s => s.addToast)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const notes = useAppStore(s => s.notes)
  const notesPath = useAppStore(s => s.notesPath)
  const setNotesPath = useAppStore(s => s.setNotesPath)
  const saveNote = useAppStore(s => s.saveNote)
  const deleteNote = useAppStore(s => s.deleteNote)
  const renameNote = useAppStore(s => s.renameNote)
  const localDataReady = useAppStore(s => s.localDataReady)

  const cid = params.cid || ''
  const selectedNote = notes.find(note => note.cid === cid)
  const showPreview = !!cid
  const isEditing = showPreview && params.mode === 'edit'

  const [searchQuery, setSearchQuery] = useState('')
  const [inputModal, setInputModal] = useState<null | {
    title: string
    placeholder?: string
    defaultValue?: string
    confirmText: string
    onConfirm: (value: string) => Promise<void> | void
  }>(null)
  const [confirmModal, setConfirmModal] = useState<null | {
    title: string
    message: string
    confirmText: string
    onConfirm: () => void | Promise<void>
  }>(null)
  const [moveTarget, setMoveTarget] = useState<ExplorerItem | null>(null)
  const importedChatDraftRef = useRef('')
  const blockedChatDraftRef = useRef('')
  const [previewContent, setPreviewContent] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [noteName, setNoteName] = useState('')
  const [notePath, setNotePath] = useState('')
  const [plainContent, setPlainContent] = useState('')
  const [editIsSecret, setEditIsSecret] = useState(false)
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(
    () => new Set(getDirectoryPathAncestors(notesPath))
  )

  useEffect(() => {
    if (!cid) {
      setPreviewContent('')
      setPreviewError('')
      return
    }

    if (!selectedNote) {
      setPreviewContent('')
      setPreviewError(localDataReady ? t('note.error.notFound') : '')
      return
    }

    if (selectedNote.content.startsWith('mp://1')) {
      if (!wallet) {
        setPreviewContent('')
        setPreviewError(t('note.error.loginToDecrypt'))
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPreviewContent('')
        setPreviewError(t('note.error.decryptFailed'))
        return
      }

      setPreviewContent(decrypted)
      setPreviewError('')
      return
    }

    setPreviewContent(selectedNote.content || '')
    setPreviewError('')
  }, [cid, localDataReady, selectedNote, t, wallet])

  useEffect(() => {
    if (!isEditing) {
      setSaving(false)
      return
    }

    if (!cid || !selectedNote) {
      setNoteName('')
      setNotePath('')
      setPlainContent('')
      setEditIsSecret(false)
      setEditError(localDataReady ? t('note.error.notFound') : '')
      return
    }

    setNoteName(getDisplayMarkdownName(selectedNote.name))
    setNotePath(selectedNote.path || '')
    setEditIsSecret(
      selectedNote.isSecret === true ||
        selectedNote.content.startsWith('mp://1')
    )

    if (selectedNote.content.startsWith('mp://1')) {
      if (!wallet) {
        setPlainContent('')
        setEditError(t('note.error.loginToDecrypt'))
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPlainContent('')
        setEditError(t('note.error.decryptFailed'))
        return
      }

      setPlainContent(decrypted)
      setEditError('')
      return
    }

    setPlainContent(selectedNote.content || '')
    setEditError('')
  }, [cid, isEditing, localDataReady, selectedNote, t, wallet])

  const noteTree = useMemo(
    () => buildNoteTree(notes, compareStrings),
    [compareStrings, notes]
  )
  const visibleNoteTree = useMemo(
    () => filterNoteTree(noteTree, searchQuery),
    [noteTree, searchQuery]
  )
  const selectedNoteIsSecret =
    selectedNote?.isSecret === true ||
    selectedNote?.content.startsWith('mp://1') === true
  const selectedNotePrivacyLabel = isEditing
    ? editIsSecret
      ? t('note.privacy.secret')
      : t('note.privacy.public')
    : selectedNoteIsSecret
      ? t('note.privacy.secret')
      : t('note.privacy.public')

  const directoryOptions = useMemo(
    () => getDirectoryOptions(notes, compareStrings),
    [compareStrings, notes]
  )
  const wikiLinkedPreviewContent = useMemo(
    () =>
      renderWikiNoteLinks(
        previewContent,
        notes,
        note => getNoteHref({ cid: note.cid }),
        selectedNote?.path || '',
        targetPath => getNoteHref({ path: getStorageMarkdownPath(targetPath) })
      ),
    [notes, previewContent, selectedNote?.path]
  )
  const resolvePreviewWikiLink = useCallback(
    (body: string) =>
      resolveWikiNoteLinkBody(
        body,
        notes,
        note => getNoteHref({ cid: note.cid }),
        selectedNote?.path || '',
        targetPath => getNoteHref({ path: getStorageMarkdownPath(targetPath) })
      ),
    [notes, selectedNote?.path]
  )

  useEffect(() => {
    if (!selectedNote?.path) return
    setExpandedTreePaths(paths =>
      mergeExpandedPaths(paths, getDirectoryPathAncestors(selectedNote.path))
    )
  }, [selectedNote?.path])

  useEffect(() => {
    if (!params.path || cid || notes.length === 0) return
    const note = resolveWikiLinkNote(notes, params.path)
    if (!note) return

    setNotesPath(normalizeNotePath(note.path || ''))
    navigate({ href: getNoteHref({ cid: note.cid }), replace: true })
  }, [cid, navigate, notes, params.path, setNotesPath])

  useEffect(() => {
    const draftId = params.chatDraft || ''
    if (!draftId || importedChatDraftRef.current === draftId) return
    if (!localDataReady) return

    if (!wallet) {
      const marker = `${draftId}:auth`
      if (blockedChatDraftRef.current !== marker) {
        blockedChatDraftRef.current = marker
        openLoginModal()
      }
      return
    }

    const draft = readChatNoteDraft(draftId)
    if (!draft) {
      importedChatDraftRef.current = draftId
      addToast(t('note.chatDraft.missing'), 'warning')
      navigateToNote({}, true)
      return
    }

    importedChatDraftRef.current = draftId
    void importChatDraftToNote(draft)
  }, [addToast, localDataReady, params.chatDraft, t, wallet])

  function navigateToNote(search: NoteSearchParams = {}, replace = false) {
    navigate({ href: getNoteHref(search), replace })
  }

  function openInternalNoteLink(href: string) {
    navigateToNote(getNoteSearchFromHref(href))
  }

  function openPreview(note: NoteItem) {
    setNotesPath(normalizeNotePath(note.path || ''))
    navigateToNote({ cid: note.cid })
  }

  function toggleTreeDirectory(node: NoteTreeNode) {
    setNotesPath(node.fullPath)
    setExpandedTreePaths(paths => toggleExpandedPath(paths, node.fullPath))
  }

  function openEditor(note: NoteItem) {
    navigateToNote({ cid: note.cid, mode: 'edit' })
  }

  function requireWallet() {
    if (wallet) return true
    openLoginModal()
    return false
  }

  async function importChatDraftToNote(draft: ChatNoteDraft) {
    if (!wallet) return

    try {
      const name = getUniqueStorageMarkdownName(
        draft.title,
        t('note.chatDraft.defaultTitle'),
        candidate =>
          notes.some(
            note =>
              normalizeNotePath(note.path || '') ===
                normalizeNotePath(notesPath) && note.name === candidate
          )
      )
      const newCid = await saveNote({
        name,
        path: notesPath,
        content: draft.content,
        isSecret: false,
      })
      deleteChatNoteDraft(draft.id)
      addToast(t('note.chatDraft.created'), 'success')
      navigateToNote({ cid: newCid, mode: 'edit' }, true)
    } catch (err: unknown) {
      importedChatDraftRef.current = ''
      addToast(getErrorMessage(err, t('note.toast.createFailed'), t), 'error')
    }
  }

  function closeEditor() {
    navigateToNote(selectedNote ? { cid: selectedNote.cid } : {})
  }

  async function handleSaveEditor() {
    if (!requireWallet()) return
    if (!selectedNote) {
      addToast(t('note.toast.notFound'), 'error')
      return
    }
    const nextName = getStorageMarkdownName(noteName)
    if (!nextName) {
      addToast(t('note.toast.nameRequired'), 'warning')
      return
    }

    setSaving(true)
    try {
      const markdown = editorRef.current?.getMarkdown() ?? plainContent
      const storedContent = editIsSecret
        ? mostEncode(markdown, wallet.danger)
        : markdown
      const nextCid = await saveNote({
        cid: selectedNote.cid,
        name: nextName,
        path: notePath,
        content: storedContent,
        isSecret: editIsSecret,
      })
      setPlainContent(markdown)
      navigateToNote({ cid: nextCid }, true)
      addToast(t('note.toast.saved'), 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, t('note.toast.saveFailed'), t), 'error')
    } finally {
      setSaving(false)
    }
  }

  function openCreateNoteModal() {
    if (!requireWallet()) return
    setInputModal({
      title: t('note.create.title'),
      placeholder: t('note.namePlaceholder'),
      confirmText: t('note.create.action'),
      onConfirm: async value => {
        if (!requireWallet()) return
        try {
          const newCid = await saveNote({
            name: getStorageMarkdownName(value),
            path: notesPath,
            content: '',
            isSecret: false,
          })
          setInputModal(null)
          addToast(t('note.toast.created'), 'success')
          navigateToNote({ cid: newCid, mode: 'edit' })
        } catch (err: unknown) {
          addToast(
            getErrorMessage(err, t('note.toast.createFailed'), t),
            'error'
          )
        }
      },
    })
  }

  function openMoveModal(item: ExplorerItem) {
    if (!requireWallet()) return
    setMoveTarget(item)
  }

  async function handleMove(targetPath: string) {
    if (!moveTarget) return
    try {
      renameNote(
        getExplorerItemFullPath(moveTarget),
        targetPath,
        moveTarget.name
      )
      setMoveTarget(null)
      addToast(t('note.toast.moved'), 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, t('note.toast.moveFailed'), t), 'error')
    }
  }

  function openDeleteConfirm(item: ExplorerItem) {
    if (!requireWallet()) return
    const isDirectory = item.type === 'directory'
    setConfirmModal({
      title: isDirectory
        ? t('note.delete.folderTitle')
        : t('note.delete.noteTitle'),
      message: t('note.delete.message', {
        name: getExplorerItemDisplayName(item),
      }),
      confirmText: t('note.action.delete'),
      onConfirm: async () => {
        deleteNote(isDirectory ? undefined : item.cid, item.path, item.name)
        setConfirmModal(null)
        addToast(t('note.toast.deleted'), 'success')
        if (item.type === 'file' && item.cid === cid) {
          navigateToNote()
        }
      },
    })
  }

  const headerTitle = (
    <div className="note-header-title">
      <h2 className="header-title">{t('note.title')}</h2>
      <span>{t('note.count', { count: notes.length })}</span>
    </div>
  )

  const headerRight = <div className="note-theme-wrap" />

  const noteExplorer = (
    <section
      className="note-list-panel note-sidebar-list"
      aria-label={t('note.listLabel')}
    >
      <div className="note-search">
        <Search size={16} />
        <input
          className="input input-flex"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('note.search.placeholder')}
        />
      </div>

      {visibleNoteTree.length === 0 ? (
        <div className="ui-empty-state note-empty-state">
          <NotebookPen size={32} />
          <p>
            {searchQuery ? t('note.empty.noMatches') : t('note.empty.noNotes')}
          </p>
        </div>
      ) : (
        <NoteTree
          nodes={visibleNoteTree}
          searchQuery={searchQuery}
          expandedPaths={expandedTreePaths}
          activeFileId={cid}
          activeFolderPath={cid ? '' : notesPath}
          onToggleDirectory={toggleTreeDirectory}
          onOpenFile={openPreview}
          renderActions={item => (
            <NoteTreeActionsMenu
              item={item}
              onMove={openMoveModal}
              onDelete={openDeleteConfirm}
            />
          )}
        />
      )}

      <div className="note-create-btn">
        <button className="btn" onClick={openCreateNoteModal}>
          <Plus size={16} />
          {t('note.newNote')}
        </button>
      </div>
    </section>
  )

  return (
    <AppShell
      sidebar={() => <NoteSidebar>{noteExplorer}</NoteSidebar>}
      headerTitle={headerTitle}
      headerRight={headerRight}
    >
      <main
        className={`note-page note-browser-page ${showPreview ? 'has-editor' : ''}`}
      >
        <section className="note-workspace ui-glass-surface ui-glass-surface-elevated">
          <section
            className="note-editor-panel"
            aria-label={
              isEditing
                ? t('note.editorLabel.edit')
                : t('note.editorLabel.read')
            }
          >
            {showPreview ? (
              <>
                <div className="note-editor-panel-header">
                  <div className="note-editor-title-area">
                    {isEditing ? (
                      <input
                        className="note-title-input"
                        value={noteName}
                        onChange={event => setNoteName(event.target.value)}
                        placeholder={t('note.namePlaceholder')}
                        translate="no"
                        disabled={!selectedNote}
                      />
                    ) : selectedNote ? (
                      <h3 translate="no">
                        {getDisplayMarkdownName(selectedNote.name)}
                      </h3>
                    ) : (
                      <h3>{t('note.untitled')}</h3>
                    )}
                    {selectedNote && (
                      <div className="note-editor-info">
                        <span>
                          {isEditing
                            ? t('note.mode.edit')
                            : t('note.mode.read')}
                        </span>
                        <span>{selectedNotePrivacyLabel}</span>
                        <span>{formatDate(selectedNote.updated_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="note-editor-actions">
                    {isEditing && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={closeEditor}
                      >
                        <X size={16} />
                        {t('common.cancel')}
                      </button>
                    )}
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            editIsSecret ? 'btn-warning' : 'btn-secondary'
                          }`}
                          onClick={() => setEditIsSecret(!editIsSecret)}
                          disabled={!selectedNote}
                          title={
                            editIsSecret
                              ? t('note.privacy.secret')
                              : t('note.privacy.public')
                          }
                          aria-label={
                            editIsSecret
                              ? t('note.privacy.secret')
                              : t('note.privacy.public')
                          }
                        >
                          {editIsSecret ? (
                            <Lock size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                          {editIsSecret
                            ? t('note.privacy.secret')
                            : t('note.privacy.public')}
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleSaveEditor}
                          disabled={saving || !!editError || !selectedNote}
                        >
                          <Save size={16} />
                          {saving
                            ? t('note.action.saving')
                            : t('note.action.save')}
                        </button>
                      </>
                    ) : (
                      selectedNote && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => openEditor(selectedNote)}
                          disabled={!!previewError}
                          title={t('note.action.edit')}
                          aria-label={t('note.action.edit')}
                        >
                          <PencilRuler size={16} />
                          {t('note.action.edit')}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {isEditing ? (
                  editError ? (
                    <div className="note-empty-state editor-error">
                      <Lock size={36} />
                      <p>{editError}</p>
                    </div>
                  ) : selectedNote ? (
                    <div className="note-editor-frame editing">
                      <MilkdownEditor
                        ref={editorRef}
                        content={plainContent}
                        onChange={setPlainContent}
                        className="milkdown-editor"
                      />
                    </div>
                  ) : (
                    <div className="note-empty-state editor-error">
                      <NotebookPen size={36} />
                      <p>
                        {localDataReady
                          ? t('note.error.notFound')
                          : t('note.loading')}
                      </p>
                    </div>
                  )
                ) : previewError ? (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <Lock size={36} />
                    <p>{previewError}</p>
                  </div>
                ) : selectedNote ? (
                  <div className="note-editor-frame reading">
                    <MilkdownEditor
                      content={wikiLinkedPreviewContent}
                      readOnly
                      onInternalNoteLinkOpen={openInternalNoteLink}
                      resolveWikiNoteLink={resolvePreviewWikiLink}
                      className="milkdown-editor"
                    />
                  </div>
                ) : (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>
                      {localDataReady
                        ? t('note.error.notFound')
                        : t('note.loading')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="ui-empty-state note-editor-empty">
                <div className="ui-empty-icon note-editor-empty-icon">
                  <NotebookPen size={32} />
                </div>
                <h3 className="ui-empty-title">{t('note.noOpen.title')}</h3>
                <p className="ui-empty-desc">
                  {notes.length > 0
                    ? t('note.noOpen.select')
                    : t('note.noOpen.createFirst')}
                </p>
                <OpenSidebarButton
                  label={t('note.openList')}
                  variant="default"
                />
              </div>
            )}
          </section>
        </section>
      </main>

      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          defaultValue={inputModal.defaultValue}
          confirmText={inputModal.confirmText}
          onConfirm={inputModal.onConfirm}
          onClose={() => setInputModal(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {moveTarget && (
        <NoteMoveModal
          target={moveTarget}
          targetLabel={getExplorerItemDisplayName(moveTarget)}
          directories={directoryOptions}
          onMove={handleMove}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </AppShell>
  )
}

function VaultNotePageContent() {
  const { t, formatDate, compareStrings } = useI18n()
  const navigate = useNavigate()
  const searchStr = useLocation({ select: location => location.searchStr })
  const params = useMemo(() => getNoteSearch(searchStr), [searchStr])
  const editorRef = useRef<MilkdownEditorRef>(null)

  const addToast = useAppStore(s => s.addToast)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)

  const currentFilePath = params.file || ''
  const showPreview = !!currentFilePath
  const isEditing = showPreview && params.mode === 'edit'

  const [vaultStatus, setVaultStatus] = useState<NoteVaultStatus | null>(null)
  const [vaultFiles, setVaultFiles] = useState<NoteVaultFile[]>([])
  const [vaultFolderPath, setVaultFolderPath] = useState('')
  const [vaultLoading, setVaultLoading] = useState(true)
  const [vaultError, setVaultError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [openingVault, setOpeningVault] = useState(false)
  const [canOpenVaultDirectory, setCanOpenVaultDirectory] = useState(false)
  const [selectedFile, setSelectedFile] = useState<NoteVaultFileContent | null>(
    null
  )
  const [previewName, setPreviewName] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [plainContent, setPlainContent] = useState('')
  const [editIsSecret, setEditIsSecret] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(
    () => new Set(getDirectoryPathAncestors(vaultFolderPath))
  )
  const [inputModal, setInputModal] = useState<null | {
    title: string
    placeholder?: string
    defaultValue?: string
    confirmText: string
    onConfirm: (value: string) => Promise<void> | void
  }>(null)
  const [confirmModal, setConfirmModal] = useState<null | {
    title: string
    message: string
    confirmText: string
    onConfirm: () => void | Promise<void>
  }>(null)
  const [moveTarget, setMoveTarget] = useState<ExplorerItem | null>(null)
  const importedChatDraftRef = useRef('')
  const blockedChatDraftRef = useRef('')

  const vaultNotes = useMemo(() => getVaultNoteItems(vaultFiles), [vaultFiles])
  const selectedNote = vaultNotes.find(note => note.cid === currentFilePath)
  const directoryOptions = useMemo(
    () => getDirectoryOptions(vaultNotes, compareStrings),
    [compareStrings, vaultNotes]
  )
  const noteTree = useMemo(
    () => buildNoteTree(vaultNotes, compareStrings),
    [compareStrings, vaultNotes]
  )
  const visibleNoteTree = useMemo(
    () => filterNoteTree(noteTree, searchQuery),
    [noteTree, searchQuery]
  )
  const wikiLinkedSelectedFileContent = useMemo(
    () =>
      renderWikiNoteLinks(
        previewContent,
        vaultNotes,
        note => getNoteHref({ file: note.cid }),
        selectedNote?.path || selectedFile?.directory || '',
        targetPath => getNoteHref({ path: getStorageMarkdownPath(targetPath) })
      ),
    [previewContent, selectedFile?.directory, selectedNote?.path, vaultNotes]
  )
  const resolveSelectedFileWikiLink = useCallback(
    (body: string) =>
      resolveWikiNoteLinkBody(
        body,
        vaultNotes,
        note => getNoteHref({ file: note.cid }),
        selectedNote?.path || selectedFile?.directory || '',
        targetPath => getNoteHref({ path: getStorageMarkdownPath(targetPath) })
      ),
    [selectedFile?.directory, selectedNote?.path, vaultNotes]
  )

  useEffect(() => {
    setCanOpenVaultDirectory(canSelectNoteVaultDirectory())
  }, [])

  useEffect(() => {
    if (!selectedNote?.path) return
    setExpandedTreePaths(paths =>
      mergeExpandedPaths(paths, getDirectoryPathAncestors(selectedNote.path))
    )
  }, [selectedNote?.path])

  useEffect(() => {
    if (!params.path || currentFilePath || vaultNotes.length === 0) return
    const note = resolveWikiLinkNote(vaultNotes, params.path)
    if (!note) return

    setVaultFolderPath(normalizeNotePath(note.path || ''))
    navigate({ href: getNoteHref({ file: note.cid }), replace: true })
  }, [currentFilePath, navigate, params.path, vaultNotes])

  useEffect(() => {
    const draftId = params.chatDraft || ''
    if (!draftId || importedChatDraftRef.current === draftId) return
    if (vaultLoading) return

    if (!wallet) {
      const marker = `${draftId}:auth`
      if (blockedChatDraftRef.current !== marker) {
        blockedChatDraftRef.current = marker
        openLoginModal()
      }
      return
    }

    if (vaultStatus?.configured !== true) {
      const marker = `${draftId}:vault`
      if (blockedChatDraftRef.current !== marker) {
        blockedChatDraftRef.current = marker
        addToast(t('note.chatDraft.openVaultFirst'), 'warning')
      }
      return
    }

    const draft = readChatNoteDraft(draftId)
    if (!draft) {
      importedChatDraftRef.current = draftId
      addToast(t('note.chatDraft.missing'), 'warning')
      navigateToVault({}, true)
      return
    }

    importedChatDraftRef.current = draftId
    void importChatDraftToVault(draft)
  }, [
    addToast,
    params.chatDraft,
    t,
    vaultLoading,
    vaultStatus?.configured,
    wallet,
  ])

  const refreshVault = useCallback(async () => {
    if (!wallet) {
      setVaultStatus(null)
      setVaultFiles([])
      setVaultError(t('note.vault.loginRequired'))
      setVaultLoading(false)
      return
    }

    setVaultLoading(true)
    setVaultError('')
    try {
      const status = await getNoteVaultStatus()
      setVaultStatus(status)
      if (status.configured) {
        setVaultFiles(await listNoteVaultFiles())
      } else {
        setVaultFiles([])
      }
    } catch (err: unknown) {
      setVaultStatus(null)
      setVaultFiles([])
      setVaultError(await getApiErrorMessage(err, t('note.vault.loadFailed')))
    } finally {
      setVaultLoading(false)
    }
  }, [t, wallet])

  useEffect(() => {
    void refreshVault()
  }, [refreshVault])

  useEffect(() => {
    setPreviewName(
      getDisplayMarkdownName(selectedFile?.name || selectedNote?.name || '')
    )
  }, [selectedFile?.name, selectedNote?.name])

  useEffect(() => {
    let cancelled = false

    async function loadFile() {
      if (!currentFilePath) {
        setSelectedFile(null)
        setPreviewContent('')
        setPlainContent('')
        setEditIsSecret(false)
        setFileError('')
        setFileLoading(false)
        return
      }
      if (!wallet) {
        setSelectedFile(null)
        setPreviewContent('')
        setPlainContent('')
        setEditIsSecret(false)
        setFileError(t('note.vault.loginRequired'))
        setFileLoading(false)
        return
      }
      if (vaultStatus?.configured !== true) {
        setSelectedFile(null)
        setPreviewContent('')
        setPlainContent('')
        setEditIsSecret(false)
        setFileError('')
        setFileLoading(false)
        return
      }

      setFileLoading(true)
      setFileError('')
      try {
        const file = await readNoteVaultFile(currentFilePath)
        if (cancelled) return
        const fileIsSecret = file.content.startsWith('mp://1')
        const decryptedContent = fileIsSecret
          ? mostDecode(file.content, wallet.danger)
          : file.content
        const nextError =
          fileIsSecret && !decryptedContent ? t('note.error.decryptFailed') : ''

        setSelectedFile(file)
        setPreviewContent(decryptedContent || '')
        setPlainContent(decryptedContent || '')
        setEditIsSecret(fileIsSecret)
        setFileError(nextError)
      } catch (err: unknown) {
        if (cancelled) return
        setSelectedFile(null)
        setPreviewContent('')
        setPlainContent('')
        setEditIsSecret(false)
        setFileError(await getApiErrorMessage(err, t('note.error.notFound')))
      } finally {
        if (!cancelled) setFileLoading(false)
      }
    }

    void loadFile()
    return () => {
      cancelled = true
    }
  }, [currentFilePath, t, vaultStatus?.configured, wallet])

  function navigateToVault(search: NoteSearchParams = {}, replace = false) {
    navigate({ href: getNoteHref(search), replace })
  }

  function openInternalNoteLink(href: string) {
    navigateToVault(getNoteSearchFromHref(href))
  }

  function openPreview(note: NoteItem) {
    setVaultFolderPath(normalizeNotePath(note.path || ''))
    navigateToVault({ file: note.cid })
  }

  function toggleTreeDirectory(node: NoteTreeNode) {
    setVaultFolderPath(node.fullPath)
    setExpandedTreePaths(paths => toggleExpandedPath(paths, node.fullPath))
  }

  function openEditor() {
    if (!currentFilePath) return
    navigateToVault({ file: currentFilePath, mode: 'edit' })
  }

  function closeEditor() {
    setPreviewName(
      getDisplayMarkdownName(selectedFile?.name || selectedNote?.name || '')
    )
    setPlainContent(previewContent)
    setEditIsSecret(selectedFile?.content.startsWith('mp://1') === true)
    navigateToVault(currentFilePath ? { file: currentFilePath } : {})
  }

  async function handleOpenVault() {
    if (!wallet) {
      openLoginModal()
      return
    }

    if (!canOpenVaultDirectory) {
      addToast(t('note.vault.selectFailed'), 'error')
      return
    }

    const picker = window.electronAPI?.selectNoteVaultDirectory
    if (!picker) {
      addToast(t('note.vault.selectFailed'), 'error')
      return
    }

    setOpeningVault(true)
    try {
      const directory = await picker()
      if (!directory) return

      await configureNoteVault(directory)
      await refreshVault()
      navigateToVault({}, true)
      addToast(t('note.vault.opened'), 'success')
    } catch (err: unknown) {
      addToast(
        await getApiErrorMessage(err, t('note.vault.selectFailed')),
        'error'
      )
    } finally {
      setOpeningVault(false)
    }
  }

  function ensureVaultReady() {
    if (!wallet) {
      openLoginModal()
      return false
    }
    if (vaultStatus?.configured !== true) {
      addToast(t('note.vault.emptyPrompt'), 'warning')
      return false
    }
    return true
  }

  async function importChatDraftToVault(draft: ChatNoteDraft) {
    if (!ensureVaultReady()) return

    try {
      const name = getUniqueStorageMarkdownName(
        draft.title,
        t('note.chatDraft.defaultTitle'),
        candidate =>
          vaultFiles.some(
            file =>
              normalizeNotePath(file.directory) ===
                normalizeNotePath(vaultFolderPath) && file.name === candidate
          )
      )
      const targetPath = normalizeNotePath(
        vaultFolderPath ? `${vaultFolderPath}/${name}` : name
      )
      const file = await createNoteVaultFile(targetPath, draft.content)
      deleteChatNoteDraft(draft.id)
      await refreshVault()
      addToast(t('note.chatDraft.created'), 'success')
      navigateToVault({ file: file.path, mode: 'edit' }, true)
    } catch (err: unknown) {
      importedChatDraftRef.current = ''
      addToast(
        await getApiErrorMessage(err, t('note.toast.createFailed')),
        'error'
      )
    }
  }

  function openCreateNoteModal() {
    if (!ensureVaultReady()) return
    setInputModal({
      title: t('note.create.title'),
      placeholder: t('note.namePlaceholder'),
      confirmText: t('note.create.action'),
      onConfirm: async value => {
        if (!ensureVaultReady()) return
        const targetPath = getVaultFilePath(vaultFolderPath, value)
        if (!targetPath) {
          addToast(t('note.toast.nameRequired'), 'warning')
          return
        }

        try {
          const file = await createNoteVaultFile(targetPath, '')
          setInputModal(null)
          await refreshVault()
          navigateToVault({ file: file.path, mode: 'edit' })
          addToast(t('note.toast.created'), 'success')
        } catch (err: unknown) {
          addToast(
            await getApiErrorMessage(err, t('note.toast.createFailed')),
            'error'
          )
        }
      },
    })
  }

  function openMoveModal(item: ExplorerItem) {
    if (!ensureVaultReady()) return
    setMoveTarget(item)
  }

  async function handleMove(targetPath: string) {
    if (!moveTarget || !ensureVaultReady()) return

    try {
      let nextCurrentPath = currentFilePath

      if (moveTarget.type === 'directory') {
        const sourceFolder = getExplorerItemFullPath(moveTarget)
        const targetFolder = normalizeNotePath(
          targetPath ? `${targetPath}/${moveTarget.name}` : moveTarget.name
        )
        const filesToMove = vaultFiles.filter(file =>
          file.path.startsWith(`${sourceFolder}/`)
        )

        for (const file of filesToMove) {
          const suffix = file.path.slice(sourceFolder.length + 1)
          const nextPath = normalizeNotePath(`${targetFolder}/${suffix}`)
          await moveNoteVaultFile(file.path, nextPath)
          if (currentFilePath === file.path) {
            nextCurrentPath = nextPath
          }
        }
      } else {
        const nextPath = normalizeNotePath(
          targetPath ? `${targetPath}/${moveTarget.name}` : moveTarget.name
        )
        const file = await moveNoteVaultFile(moveTarget.cid, nextPath)
        if (currentFilePath === moveTarget.cid) {
          nextCurrentPath = file.path
        }
      }

      setMoveTarget(null)
      await refreshVault()
      navigateToVault(nextCurrentPath ? { file: nextCurrentPath } : {}, true)
      addToast(t('note.toast.moved'), 'success')
    } catch (err: unknown) {
      addToast(
        await getApiErrorMessage(err, t('note.toast.moveFailed')),
        'error'
      )
    }
  }

  function openDeleteConfirm(item: ExplorerItem) {
    if (!ensureVaultReady()) return
    const isDirectory = item.type === 'directory'
    setConfirmModal({
      title: isDirectory
        ? t('note.delete.folderTitle')
        : t('note.delete.noteTitle'),
      message: t('note.delete.message', {
        name: getExplorerItemDisplayName(item),
      }),
      confirmText: t('note.action.delete'),
      onConfirm: async () => {
        try {
          if (item.type === 'directory') {
            const folderPath = getExplorerItemFullPath(item)
            const filesToDelete = vaultFiles.filter(file =>
              file.path.startsWith(`${folderPath}/`)
            )
            for (const file of filesToDelete) {
              await deleteNoteVaultFile(file.path)
            }
            if (currentFilePath.startsWith(`${folderPath}/`)) {
              navigateToVault({}, true)
            }
          } else {
            await deleteNoteVaultFile(item.cid)
            if (currentFilePath === item.cid) {
              navigateToVault({}, true)
            }
          }

          setConfirmModal(null)
          await refreshVault()
          addToast(t('note.toast.deleted'), 'success')
        } catch (err: unknown) {
          addToast(
            await getApiErrorMessage(err, t('note.toast.deleteFailed')),
            'error'
          )
        }
      },
    })
  }

  async function handleSaveEditor() {
    if (!wallet) {
      openLoginModal()
      return
    }
    if (!currentFilePath || !selectedFile) {
      addToast(t('note.toast.notFound'), 'error')
      return
    }
    const nextName = getStorageMarkdownName(previewName)
    if (!nextName) {
      addToast(t('note.toast.nameRequired'), 'warning')
      return
    }

    setSaving(true)
    try {
      const markdown = editorRef.current?.getMarkdown() ?? plainContent
      const storedContent = editIsSecret
        ? mostEncode(markdown, wallet.danger)
        : markdown
      let targetPath = selectedFile.path
      if (nextName !== selectedFile.name) {
        targetPath = normalizeNotePath(
          selectedFile.directory
            ? `${selectedFile.directory}/${nextName}`
            : nextName
        )
        const movedFile = await moveNoteVaultFile(selectedFile.path, targetPath)
        setSelectedFile(movedFile)
        setPreviewName(getDisplayMarkdownName(movedFile.name))
        targetPath = movedFile.path
      }

      const file = await saveNoteVaultFile(targetPath, storedContent)
      setSelectedFile(file)
      setPreviewName(getDisplayMarkdownName(file.name))
      setPreviewContent(markdown)
      setPlainContent(markdown)
      await refreshVault()
      navigateToVault({ file: file.path }, true)
      addToast(t('note.toast.saved'), 'success')
    } catch (err: unknown) {
      addToast(
        await getApiErrorMessage(err, t('note.toast.saveFailed')),
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  const headerTitle = (
    <div className="note-header-title">
      <h2 className="header-title">{t('note.title')}</h2>
      <span>{t('note.count', { count: vaultFiles.length })}</span>
    </div>
  )

  const headerRight = (
    <div className="note-theme-wrap">
      {canOpenVaultDirectory && (
        <button
          className="btn btn-sm"
          onClick={handleOpenVault}
          disabled={openingVault}
          title={t('note.vault.open')}
          aria-label={t('note.vault.open')}
        >
          <FolderOpen size={16} />
          {openingVault ? t('note.vault.opening') : t('note.vault.open')}
        </button>
      )}
    </div>
  )

  const noteExplorer = (
    <section
      className="note-list-panel note-sidebar-list"
      aria-label={t('note.listLabel')}
    >
      <div className="note-search">
        <Search size={16} />
        <input
          className="input input-flex"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('note.search.placeholder')}
        />
      </div>

      {vaultLoading ? (
        <div className="ui-empty-state note-empty-state">
          <NotebookPen size={32} />
          <p>{t('note.loading')}</p>
        </div>
      ) : vaultError ? (
        <div className="ui-empty-state note-empty-state">
          <Lock size={32} />
          <p>{vaultError}</p>
        </div>
      ) : vaultStatus?.configured !== true ? (
        <div className="ui-empty-state note-empty-state">
          <FolderOpen size={32} />
          {canOpenVaultDirectory && (
            <button
              className="btn btn-primary"
              onClick={handleOpenVault}
              disabled={openingVault}
            >
              <FolderOpen size={16} />
              {openingVault ? t('note.vault.opening') : t('note.vault.open')}
            </button>
          )}
        </div>
      ) : visibleNoteTree.length === 0 ? (
        <div className="ui-empty-state note-empty-state">
          <NotebookPen size={32} />
          <p>
            {searchQuery ? t('note.empty.noMatches') : t('note.vault.noFiles')}
          </p>
        </div>
      ) : (
        <NoteTree
          nodes={visibleNoteTree}
          searchQuery={searchQuery}
          expandedPaths={expandedTreePaths}
          activeFileId={currentFilePath}
          activeFolderPath={currentFilePath ? '' : vaultFolderPath}
          onToggleDirectory={toggleTreeDirectory}
          onOpenFile={openPreview}
          renderActions={item => (
            <NoteTreeActionsMenu
              item={item}
              onMove={openMoveModal}
              onDelete={openDeleteConfirm}
            />
          )}
        />
      )}

      {vaultStatus?.configured === true && (
        <div className="note-create-btn">
          <button className="btn" onClick={openCreateNoteModal}>
            <Plus size={16} />
            {t('note.newNote')}
          </button>
        </div>
      )}
    </section>
  )

  const editorMetaTime =
    selectedFile?.mtimeMs || selectedNote?.updated_at || Date.now()
  const selectedTitle =
    getDisplayMarkdownName(selectedFile?.name || selectedNote?.name || '') ||
    t('note.untitled')
  const canEditCurrentVaultFile = isEditing && !!selectedFile
  const selectedVaultFileIsSecret =
    selectedFile?.content.startsWith('mp://1') === true
  const selectedVaultPrivacyLabel = isEditing
    ? editIsSecret
      ? t('note.privacy.secret')
      : t('note.privacy.public')
    : selectedVaultFileIsSecret
      ? t('note.privacy.secret')
      : t('note.privacy.public')

  return (
    <AppShell
      sidebar={() => <NoteSidebar>{noteExplorer}</NoteSidebar>}
      headerTitle={headerTitle}
      headerRight={headerRight}
    >
      <main
        className={`note-page note-browser-page ${showPreview ? 'has-editor' : ''}`}
      >
        <section className="note-workspace ui-glass-surface ui-glass-surface-elevated">
          <section
            className="note-editor-panel"
            aria-label={
              isEditing
                ? t('note.editorLabel.edit')
                : t('note.editorLabel.read')
            }
          >
            {showPreview ? (
              <>
                <div className="note-editor-panel-header">
                  <div className="note-editor-title-area">
                    {isEditing && selectedFile ? (
                      <input
                        className="note-title-input"
                        value={previewName}
                        onChange={event => setPreviewName(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                            return
                          }
                          if (event.key === 'Escape') {
                            setPreviewName(
                              getDisplayMarkdownName(selectedFile.name)
                            )
                            event.currentTarget.blur()
                          }
                        }}
                        placeholder={t('note.namePlaceholder')}
                        translate="no"
                      />
                    ) : (
                      <h3 translate="no">{selectedTitle}</h3>
                    )}
                    <div className="note-editor-info">
                      <span>
                        {isEditing ? t('note.mode.edit') : t('note.mode.read')}
                      </span>
                      <span>{selectedVaultPrivacyLabel}</span>
                      <span translate="no">
                        {getDisplayMarkdownPath(currentFilePath)}
                      </span>
                      <span>{formatDate(editorMetaTime)}</span>
                    </div>
                  </div>

                  <div className="note-editor-actions">
                    {isEditing && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={closeEditor}
                      >
                        <X size={16} />
                        {t('common.cancel')}
                      </button>
                    )}
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            editIsSecret ? 'btn-warning' : 'btn-secondary'
                          }`}
                          onClick={() => setEditIsSecret(!editIsSecret)}
                          disabled={!!fileError || !selectedFile}
                          title={
                            editIsSecret
                              ? t('note.privacy.secret')
                              : t('note.privacy.public')
                          }
                          aria-label={
                            editIsSecret
                              ? t('note.privacy.secret')
                              : t('note.privacy.public')
                          }
                        >
                          {editIsSecret ? (
                            <Lock size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                          {editIsSecret
                            ? t('note.privacy.secret')
                            : t('note.privacy.public')}
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleSaveEditor}
                          disabled={saving || !!fileError || !selectedFile}
                        >
                          <Save size={16} />
                          {saving
                            ? t('note.action.saving')
                            : t('note.action.save')}
                        </button>
                      </>
                    ) : (
                      selectedNote && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={openEditor}
                          disabled={!!fileError || !selectedFile}
                          title={t('note.action.edit')}
                          aria-label={t('note.action.edit')}
                        >
                          <PencilRuler size={16} />
                          {t('note.action.edit')}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {fileLoading ? (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>{t('note.loading')}</p>
                  </div>
                ) : fileError ? (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <Lock size={36} />
                    <p>{fileError}</p>
                  </div>
                ) : selectedFile ? (
                  <div
                    className={`note-editor-frame ${
                      canEditCurrentVaultFile ? 'editing' : 'reading'
                    }`}
                  >
                    <MilkdownEditor
                      ref={canEditCurrentVaultFile ? editorRef : undefined}
                      content={
                        canEditCurrentVaultFile
                          ? plainContent
                          : wikiLinkedSelectedFileContent
                      }
                      onChange={
                        canEditCurrentVaultFile ? setPlainContent : undefined
                      }
                      readOnly={!canEditCurrentVaultFile}
                      onInternalNoteLinkOpen={
                        canEditCurrentVaultFile
                          ? undefined
                          : openInternalNoteLink
                      }
                      resolveWikiNoteLink={
                        canEditCurrentVaultFile
                          ? undefined
                          : resolveSelectedFileWikiLink
                      }
                      className="milkdown-editor"
                    />
                  </div>
                ) : (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>{t('note.error.notFound')}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="ui-empty-state note-editor-empty">
                <div className="ui-empty-icon note-editor-empty-icon">
                  <NotebookPen size={32} />
                </div>
                <h3 className="ui-empty-title">
                  {vaultStatus?.configured
                    ? t('note.noOpen.title')
                    : t('note.vault.open')}
                </h3>
                <p className="ui-empty-desc">
                  {vaultStatus?.configured
                    ? t('note.noOpen.select')
                    : t('note.vault.emptyPrompt')}
                </p>
                {vaultStatus?.configured ? (
                  <OpenSidebarButton
                    label={t('note.openList')}
                    variant="default"
                  />
                ) : canOpenVaultDirectory ? (
                  <button
                    className="btn btn-primary"
                    onClick={handleOpenVault}
                    disabled={openingVault}
                  >
                    <FolderOpen size={16} />
                    {openingVault
                      ? t('note.vault.opening')
                      : t('note.vault.open')}
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </section>
      </main>

      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          defaultValue={inputModal.defaultValue}
          confirmText={inputModal.confirmText}
          onConfirm={inputModal.onConfirm}
          onClose={() => setInputModal(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {moveTarget && (
        <NoteMoveModal
          target={moveTarget}
          targetLabel={getExplorerItemDisplayName(moveTarget)}
          directories={directoryOptions}
          onMove={handleMove}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </AppShell>
  )
}

export default function NotePage() {
  const { t } = useI18n()
  const hasBackend = useAppStore(s => s.hasBackend)
  const wallet = useUserStore(s => s.wallet)
  const isDesktopClient = useIsDesktopClient()
  const isLocalBackend =
    hasBackend === true && isLocalNoteVaultBackend(getBackendUrlExport())
  const hasConfiguredVaultBackend = useConfiguredNoteVaultBackend(
    isLocalBackend,
    wallet?.address || ''
  )
  const useVaultMode =
    isLocalBackend && (isDesktopClient || hasConfiguredVaultBackend)

  return (
    <Suspense
      fallback={<div className="note-editor-loading">{t('note.loading')}</div>}
    >
      {useVaultMode ? <VaultNotePageContent /> : <NotePageContent />}
    </Suspense>
  )
}
