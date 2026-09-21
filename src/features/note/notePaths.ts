/**
 * Note path, markdown-name, wiki-link, and tree helpers.
 *
 * Extracted from `NotePage.tsx`, which carried these and whose two sibling
 * components (`NotePageContent` and `VaultNotePageContent`) both consumed them.
 * `getDisplayMarkdownName` and `getTreeNodeDisplayName` were additionally
 * duplicated verbatim in `NoteTree.tsx`.
 *
 * Everything here is pure. The only import from a sibling note module is a
 * type-only import, so there is no runtime cycle with `NoteTree.tsx`.
 */
import {
  getNoteFullPath,
  normalizeNotePath,
} from '~server/src/utils/noteUtils.js'
import type { NoteItem } from '~/stores/useAppStore'
import type { MessageKey } from '~/lib/i18n'
import type { ExplorerItem, NoteTreeNode } from './NoteTree'

/**
 * Maps a raw note API error message to a localized key.
 *
 * Kept private: callers go through `getNoteErrorMessage`, which applies the
 * translation and the fallback.
 */
const NOTE_ERROR_MESSAGE_KEYS: Record<string, MessageKey> = {
  'note.error.nameRequired': 'note.error.nameRequired',
  'note.error.nameNoSlash': 'note.error.nameNoSlash',
  'note.error.nameNoBackslash': 'note.error.nameNoBackslash',
  'note.error.nameInvalid': 'note.error.nameInvalid',
  'note.error.nameConflict': 'note.error.nameConflict',
  'note.error.moveIntoSelf': 'note.error.moveIntoSelf',
}

/** Localizes a note API error, falling back to the raw message then `fallback`. */
export function getNoteErrorMessage(
  error: unknown,
  fallback: string,
  t: (key: MessageKey) => string
) {
  const message = error instanceof Error ? error.message : ''
  const messageKey = NOTE_ERROR_MESSAGE_KEYS[message]
  if (messageKey) return t(messageKey)
  return message || fallback
}

/** Full display path of an explorer item, directory or file. */
export function getExplorerItemFullPath(item: ExplorerItem) {
  if (item.type === 'directory') {
    return normalizeNotePath(
      item.path ? `${item.path}/${item.name}` : item.name
    )
  }
  return getNoteFullPath(item)
}

/** Strips the `.md` suffix and surrounding whitespace from a note name. */
export function getDisplayMarkdownName(input = '') {
  return String(input).trim().replace(/\.md$/i, '')
}

/** Re-applies the `.md` suffix; empty input stays empty. */
export function getStorageMarkdownName(input: string) {
  const name = getDisplayMarkdownName(input)
  return name ? `${name}.md` : ''
}

/** Same as `getStorageMarkdownPath` but for display, without the `.md` suffix. */
export function getDisplayMarkdownPath(input = '') {
  const path = normalizeNotePath(input)
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return ''

  const lastIndex = parts.length - 1
  parts[lastIndex] = getDisplayMarkdownName(parts[lastIndex])
  return parts.join('/')
}

/** Converts a note's full path into its display path. */
export function getNoteDisplayFullPath(note: NoteItem) {
  return getDisplayMarkdownPath(getNoteFullPath(note))
}

/** Normalizes a note path, adding the `.md` suffix to the last segment only. */
export function getStorageMarkdownPath(input = '') {
  const path = normalizeNotePath(input)
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return ''

  const lastIndex = parts.length - 1
  parts[lastIndex] = getStorageMarkdownName(parts[lastIndex])
  return parts.join('/')
}

/**
 * Picks a storage name that does not collide with an existing note.
 *
 * Tries the bare title first, then `title 2`, `title 3`, … and finally falls
 * back to a timestamped name so the caller always gets something usable.
 */
export function getUniqueStorageMarkdownName(
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

/** Strips a leading `/` and any `#`/`^` anchor from a wiki link target. */
export function getWikiLinkTargetPath(input: string) {
  const target = input.trim().replace(/^\/+/, '')
  const anchorIndex = target.search(/[#^]/)
  const notePath = anchorIndex >= 0 ? target.slice(0, anchorIndex) : target
  return getDisplayMarkdownPath(notePath)
}

/** Uses the alias when present, otherwise the last path segment. */
export function getWikiLinkLabel(targetPath: string, alias?: string) {
  const trimmedAlias = alias?.trim()
  if (trimmedAlias) return trimmedAlias

  const parts = targetPath.split('/').filter(Boolean)
  return parts[parts.length - 1] || targetPath
}

/** Escapes the characters that would break a markdown link label. */
export function escapeMarkdownLinkLabel(label: string) {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

/** Renders a markdown link with an angle-bracketed, `>`-escaped href. */
export function formatMarkdownLink(label: string, href: string) {
  return `[${escapeMarkdownLinkLabel(label)}](<${href.replace(/>/g, '%3E')}>)`
}

/** Tree label: files lose the `.md` suffix, directories keep their name. */
export function getTreeNodeDisplayName(node: NoteTreeNode) {
  return node.type === 'file' ? getDisplayMarkdownName(node.name) : node.name
}

/** Tree path: files use the display path, directories keep their full path. */
export function getTreeNodeDisplayPath(node: NoteTreeNode) {
  return node.type === 'file'
    ? getDisplayMarkdownPath(node.fullPath)
    : node.fullPath
}

/** Explorer label: files lose the `.md` suffix, directories keep their name. */
export function getExplorerItemDisplayName(item: ExplorerItem) {
  return item.type === 'file' ? getDisplayMarkdownName(item.name) : item.name
}

/** Cumulative ancestor paths for a directory path, root-first. */
export function getDirectoryPathAncestors(path = '') {
  const parts = normalizeNotePath(path).split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

/** Returns a new set with `path` toggled. */
export function toggleExpandedPath(paths: Set<string>, path: string) {
  const next = new Set(paths)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  return next
}

/**
 * Adds every path in `nextPaths`.
 *
 * Returns the original set instance when nothing changed, so callers can rely
 * on reference identity to skip re-renders.
 */
export function mergeExpandedPaths(paths: Set<string>, nextPaths: string[]) {
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
