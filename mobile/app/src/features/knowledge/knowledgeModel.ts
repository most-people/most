import type {
  MarkdownEditResult,
  MarkdownSelection,
  MobileKnowledgeNote,
  MobileKnowledgeSnapshot,
} from './types'

const INVALID_PATH_CHARACTER = /[\u0000-\u001f:*?"<>|]/
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:/
const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules'])

export function compareKnowledgePaths(left: string, right: string) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function assertPathSegment(segment: string, directory: boolean) {
  if (!segment || segment === '.' || segment === '..') {
    throw new Error('知识库路径无效')
  }
  if (INVALID_PATH_CHARACTER.test(segment)) {
    throw new Error('知识库路径包含不支持的字符')
  }
  if (segment.startsWith('.')) {
    throw new Error('知识库不允许隐藏文件或目录')
  }
  if (directory && EXCLUDED_DIRECTORY_NAMES.has(segment.toLowerCase())) {
    throw new Error('知识库目录名称不可用')
  }
}

function normalizePathParts(input: string, allowEmpty: boolean) {
  const value = String(input || '').trim()
  if (!value) {
    if (allowEmpty) return []
    throw new Error('知识库路径不能为空')
  }
  if (
    value.includes('\\') ||
    value.startsWith('/') ||
    WINDOWS_ABSOLUTE_PATH.test(value)
  ) {
    throw new Error('知识库只接受相对路径')
  }

  const parts = value.split('/')
  if (parts.some(part => !part.trim())) {
    throw new Error('知识库路径无效')
  }
  return parts.map(part => part.trim())
}

export function normalizeKnowledgeDirectory(input = '') {
  const parts = normalizePathParts(input, true)
  for (const part of parts) assertPathSegment(part, true)
  return parts.join('/')
}

export function normalizeKnowledgeFilePath(input: string) {
  const parts = normalizePathParts(input, false)
  parts.forEach((part, index) => {
    assertPathSegment(part, index < parts.length - 1)
  })
  const fileName = parts.at(-1) || ''
  if (!fileName.toLowerCase().endsWith('.md')) {
    throw new Error('知识库只接受 Markdown 文件')
  }
  if (fileName.toLowerCase() === '.md') {
    throw new Error('笔记名称不能为空')
  }
  return parts.join('/')
}

export function normalizeKnowledgeNoteName(input: string) {
  const value = String(input || '')
    .trim()
    .replace(/\.md$/i, '')
  assertPathSegment(value, false)
  if (value.includes('/')) throw new Error('笔记名称不能包含 /')
  return `${value}.md`
}

export function joinKnowledgePath(directory: string, name: string) {
  const normalizedDirectory = normalizeKnowledgeDirectory(directory)
  const normalizedName = normalizeKnowledgeNoteName(name)
  return normalizeKnowledgeFilePath(
    normalizedDirectory
      ? `${normalizedDirectory}/${normalizedName}`
      : normalizedName
  )
}

export function getKnowledgeDirectory(path: string) {
  const normalizedPath = normalizeKnowledgeFilePath(path)
  const index = normalizedPath.lastIndexOf('/')
  return index === -1 ? '' : normalizedPath.slice(0, index)
}

export function getKnowledgeDisplayName(path: string) {
  const normalizedPath = normalizeKnowledgeFilePath(path)
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1)
  return fileName.replace(/\.md$/i, '')
}

export function getKnowledgeDirectories(notes: MobileKnowledgeNote[]) {
  const directories = new Set<string>()
  for (const note of notes) {
    const parts = note.directory.split('/').filter(Boolean)
    for (let index = 1; index <= parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'))
    }
  }
  return [...directories].sort((left, right) => left.localeCompare(right))
}

export function searchKnowledgeNotes(
  notes: MobileKnowledgeNote[],
  query: string
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return notes
  return notes.filter(note =>
    `${note.path}\n${note.content}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  )
}

export function createUniqueKnowledgeFilePath(
  existingPaths: string[],
  targetPath: string
) {
  const normalizedTarget = normalizeKnowledgeFilePath(targetPath)
  const paths = new Set(
    existingPaths.map(path => normalizeKnowledgeFilePath(path).toLowerCase())
  )
  if (!paths.has(normalizedTarget.toLowerCase())) return normalizedTarget

  const directory = getKnowledgeDirectory(normalizedTarget)
  const fileName = normalizedTarget.slice(normalizedTarget.lastIndexOf('/') + 1)
  const base = fileName.replace(/\.md$/i, '')
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = joinKnowledgePath(directory, `${base} (${index})`)
    if (!paths.has(candidate.toLowerCase())) return candidate
  }
  throw new Error('无法生成可用的笔记名称')
}

export function validateKnowledgeSnapshot(
  input: unknown
): MobileKnowledgeSnapshot {
  if (!input || typeof input !== 'object') {
    throw new Error('知识库快照格式无效')
  }
  const value = input as Partial<MobileKnowledgeSnapshot>
  if (value.format !== 'mostbox-knowledge' || value.version !== 1) {
    throw new Error('不支持此知识库快照版本')
  }
  if (!Array.isArray(value.files)) {
    throw new Error('知识库快照缺少文件列表')
  }
  if (
    typeof value.exportedAt !== 'string' ||
    !value.exportedAt ||
    Number.isNaN(Date.parse(value.exportedAt))
  ) {
    throw new Error('知识库快照导出时间无效')
  }

  const seen = new Set<string>()
  const encoder = new TextEncoder()
  const files = value.files.map(file => {
    if (!file || typeof file !== 'object') {
      throw new Error('知识库快照包含无效文件')
    }
    const path = normalizeKnowledgeFilePath(file.path)
    const pathKey = path.toLowerCase()
    if (seen.has(pathKey)) throw new Error(`知识库快照包含重复路径：${path}`)
    if (typeof file.content !== 'string') {
      throw new Error(`知识库快照文件内容无效：${path}`)
    }
    const size = encoder.encode(file.content).byteLength
    if (!Number.isInteger(file.size) || file.size < 0 || file.size !== size) {
      throw new Error(`知识库快照文件大小无效：${path}`)
    }
    if (!Number.isFinite(file.mtimeMs) || file.mtimeMs < 0) {
      throw new Error(`知识库快照修改时间无效：${path}`)
    }
    seen.add(pathKey)
    return {
      path,
      content: file.content,
      size,
      mtimeMs: file.mtimeMs,
    }
  })

  return {
    format: 'mostbox-knowledge',
    version: 1,
    exportedAt: value.exportedAt,
    files: files.sort((left, right) =>
      compareKnowledgePaths(left.path, right.path)
    ),
  }
}

function normalizeSelection(content: string, selection: MarkdownSelection) {
  const start = Math.max(0, Math.min(content.length, selection.start))
  const end = Math.max(start, Math.min(content.length, selection.end))
  return { start, end }
}

function wrapSelection(
  content: string,
  selection: MarkdownSelection,
  before: string,
  after = before,
  fallback = ''
): MarkdownEditResult {
  const range = normalizeSelection(content, selection)
  const selected = content.slice(range.start, range.end) || fallback
  const replacement = `${before}${selected}${after}`
  return {
    content:
      content.slice(0, range.start) + replacement + content.slice(range.end),
    selection: {
      start: range.start + before.length,
      end: range.start + before.length + selected.length,
    },
  }
}

export function applyMarkdownTool(
  content: string,
  selection: MarkdownSelection,
  tool: 'heading' | 'bold' | 'italic' | 'list' | 'code' | 'link'
): MarkdownEditResult {
  const range = normalizeSelection(content, selection)
  if (tool === 'bold') return wrapSelection(content, range, '**', '**', '粗体')
  if (tool === 'italic') return wrapSelection(content, range, '*', '*', '斜体')
  if (tool === 'link') {
    const result = wrapSelection(content, range, '[', '](https://)', '链接文字')
    const urlStart = result.selection.end + 2
    return {
      content: result.content,
      selection: { start: urlStart, end: urlStart + 'https://'.length },
    }
  }
  if (tool === 'code') {
    const selected = content.slice(range.start, range.end)
    return selected.includes('\n')
      ? wrapSelection(content, range, '```\n', '\n```', '代码')
      : wrapSelection(content, range, '`', '`', '代码')
  }

  const lineStart = content.lastIndexOf('\n', Math.max(0, range.start - 1)) + 1
  const lineEndIndex = content.indexOf('\n', range.end)
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex
  const block = content.slice(lineStart, lineEnd)
  const replacement =
    tool === 'heading'
      ? `## ${block.replace(/^#{1,6}\s+/, '')}`
      : block
          .split('\n')
          .map(line => `- ${line.replace(/^[-*+]\s+/, '')}`)
          .join('\n')
  return {
    content: content.slice(0, lineStart) + replacement + content.slice(lineEnd),
    selection: { start: lineStart, end: lineStart + replacement.length },
  }
}

function escapeMarkdownLabel(input: string) {
  return input.replace(/([\\\[\]])/g, '\\$1')
}

export function createAttachmentMarkdown(
  fileName: string,
  link: string,
  mimeType = ''
) {
  const label = escapeMarkdownLabel(fileName.trim() || '附件')
  return mimeType.toLowerCase().startsWith('image/')
    ? `![${label}](${link})`
    : `[${label}](${link})`
}

export function insertMarkdownAtSelection(
  content: string,
  selection: MarkdownSelection,
  markdown: string
): MarkdownEditResult {
  const range = normalizeSelection(content, selection)
  const prefix =
    range.start > 0 && content[range.start - 1] !== '\n' ? '\n\n' : ''
  const suffix =
    range.end < content.length && content[range.end] !== '\n' ? '\n\n' : ''
  const replacement = `${prefix}${markdown}${suffix}`
  const cursor = range.start + replacement.length
  return {
    content:
      content.slice(0, range.start) + replacement + content.slice(range.end),
    selection: { start: cursor, end: cursor },
  }
}

export function prepareMarkdownPreview(markdown: string) {
  return markdown.replace(
    /!\[((?:\\.|[^\]])*)\]\((most:\/\/[^\s)]+)\)/gi,
    (_match, label: string, link: string) => `[图片：${label}](${link})`
  )
}
