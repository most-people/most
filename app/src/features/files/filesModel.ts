import type { MobileHolding } from '../../mobileCore/types'

export type FileFilter = 'all' | 'active' | 'attention'
export type FileFolder = {
  name: string
  path: string
}

export type FolderShareState = {
  canShare: boolean
  fileCount: number
  missingCount: number
  reason: '' | 'empty' | 'missingLocalFiles'
}

export function normalizeFileDisplayPath(value: string) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

export function parseFileDisplayPath(value: string) {
  const path = normalizeFileDisplayPath(value)
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash === -1) return { folder: '', name: path }
  return {
    folder: path.slice(0, lastSlash),
    name: path.slice(lastSlash + 1),
  }
}

export function getFileFolders(holdings: MobileHolding[]) {
  const folders = new Set<string>()
  for (const holding of holdings) {
    const { folder } = parseFileDisplayPath(holding.fileName)
    const parts = folder.split('/').filter(Boolean)
    let path = ''
    for (const part of parts) {
      path = path ? `${path}/${part}` : part
      folders.add(path)
    }
  }
  return [...folders].sort((left, right) => left.localeCompare(right))
}

export function getChildFolders(
  allFolders: string[],
  currentPath: string
): FileFolder[] {
  const normalizedPath = normalizeFileDisplayPath(currentPath)
  const prefix = normalizedPath ? `${normalizedPath}/` : ''
  return allFolders
    .filter(path => {
      if (!path.startsWith(prefix)) return false
      return !path.slice(prefix.length).includes('/')
    })
    .map(path => ({ name: path.slice(prefix.length), path }))
}

export function getHoldingsForPath(
  holdings: MobileHolding[],
  currentPath: string
) {
  const normalizedPath = normalizeFileDisplayPath(currentPath)
  return holdings.filter(
    holding => parseFileDisplayPath(holding.fileName).folder === normalizedPath
  )
}

export function getFileBreadcrumbs(currentPath: string, rootName: string) {
  const normalizedPath = normalizeFileDisplayPath(currentPath)
  if (!normalizedPath) return []
  const parts = normalizedPath.split('/').filter(Boolean)
  return [
    { name: rootName, path: '' },
    ...parts.map((name, index) => ({
      name,
      path: parts.slice(0, index + 1).join('/'),
    })),
  ]
}

export function getFolderShareState(
  holdings: MobileHolding[],
  folderPath: string
): FolderShareState {
  const normalizedPath = normalizeFileDisplayPath(folderPath)
  if (!normalizedPath) {
    return {
      canShare: false,
      fileCount: 0,
      missingCount: 0,
      reason: 'empty',
    }
  }
  const prefix = `${normalizedPath}/`
  const files = holdings.filter(holding => {
    if (holding.kind === 'collection') return false
    const fileName = normalizeFileDisplayPath(holding.fileName)
    return fileName.startsWith(prefix) && fileName.length > prefix.length
  })
  if (!files.length) {
    return {
      canShare: false,
      fileCount: 0,
      missingCount: 0,
      reason: 'empty',
    }
  }
  const missingCount = files.filter(
    holding => holding.localAvailable !== true || holding.status === 'error'
  ).length
  return {
    canShare: missingCount === 0,
    fileCount: files.length,
    missingCount,
    reason: missingCount ? 'missingLocalFiles' : '',
  }
}

export function filterHoldings(
  holdings: MobileHolding[],
  query: string,
  filter: FileFilter
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return holdings.filter(holding => {
    const matchesQuery =
      !normalizedQuery ||
      parseFileDisplayPath(holding.fileName)
        .name.toLocaleLowerCase()
        .includes(normalizedQuery) ||
      holding.cid.toLocaleLowerCase().includes(normalizedQuery)
    if (!matchesQuery) return false
    if (filter === 'active') return holding.status === 'active'
    if (filter === 'attention') {
      return holding.status === 'error' || !holding.topicJoined
    }
    return true
  })
}
