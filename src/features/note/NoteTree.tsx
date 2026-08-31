import type { ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Move,
  Trash2,
} from 'lucide-react'

import type { NoteMoveTarget } from '~/components/NoteMoveModal'
import { ActionMenu } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import type { NoteItem } from '~/stores/useAppStore'
import { normalizeNotePath } from '~server/src/utils/noteUtils.js'

export type ExplorerItem = NoteMoveTarget

export type NoteTreeNode = {
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
  activeFilePath?: string
  activeFolderPath: string
  onToggleDirectory: (node: NoteTreeNode) => void
  onOpenFile: (note: NoteItem) => void
  renderActions?: (item: ExplorerItem) => ReactNode
}

type NoteTreeNodeRowProps = Omit<NoteTreeProps, 'nodes' | 'searchQuery'> & {
  node: NoteTreeNode
  forceExpanded: boolean
}

function getDisplayMarkdownName(input = '') {
  return String(input).trim().replace(/\.md$/i, '')
}

function getTreeNodeDisplayName(node: NoteTreeNode) {
  return node.type === 'file' ? getDisplayMarkdownName(node.name) : node.name
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

export function NoteTree({
  nodes,
  searchQuery,
  expandedPaths,
  activeFileId,
  activeFilePath,
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
          activeFilePath={activeFilePath}
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
  activeFilePath,
  activeFolderPath,
  onToggleDirectory,
  onOpenFile,
  renderActions,
}: NoteTreeNodeRowProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded =
    isDirectory && (forceExpanded || expandedPaths.has(node.fullPath))
  const isActiveFile =
    node.type === 'file' &&
    node.note?.cid === activeFileId &&
    (!activeFilePath || node.fullPath === activeFilePath)
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
              activeFilePath={activeFilePath}
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

export function NoteTreeActionsMenu({
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
