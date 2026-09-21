/**
 * File-library tree helpers.
 *
 * These were duplicated: `parseAppFileName` lived in both `AppFileCards.tsx` and
 * `AppPage.tsx`, and `generateBreadcrumbs` in both `AppPage.tsx` and
 * `MoveModal.tsx`. They are pure functions over the display-path model, so they
 * live here once and are covered by `src/tests/fileTree.test.ts`.
 */

export interface FileTreeRecord {
  cid: string
  fileName: string
  kind?: 'file' | 'collection'
  size?: number
  fileCount?: number
  downloadedCount?: number
  starred?: boolean
  [key: string]: unknown
}

export interface FileTreeFolder {
  name: string
  path: string
}

export interface Breadcrumb {
  path: string
  name: string
}

/**
 * Splits a display path into its folder and base name.
 *
 * A name without a slash belongs to the root folder (`folder: ''`).
 */
export function parseAppFileName(fullPath: string): {
  folder: string
  name: string
} {
  const lastSlash = fullPath.lastIndexOf('/')
  if (lastSlash === -1) return { folder: '', name: fullPath }
  return {
    folder: fullPath.substring(0, lastSlash),
    name: fullPath.substring(lastSlash + 1),
  }
}

/**
 * Collects every folder path implied by the given files, including intermediate
 * ancestors, sorted for stable rendering.
 */
export function getUniqueFolders(
  files: Pick<FileTreeRecord, 'fileName'>[]
): string[] {
  const folders = new Set<string>()
  files.forEach(f => {
    const { folder } = parseAppFileName(f.fileName)
    const parts = folder.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc += (acc ? '/' : '') + part
      folders.add(acc)
    }
  })
  return [...folders].sort()
}

/** Lists the folders directly inside `currentPath`. */
export function getCurrentFolders(
  allFolders: string[],
  currentPath: string
): FileTreeFolder[] {
  const prefix = currentPath ? currentPath + '/' : ''
  return allFolders
    .filter(f => {
      const isUnder = f.toLowerCase().startsWith(prefix.toLowerCase())
      const remainder = f.substring(prefix.length)
      return isUnder && !remainder.includes('/')
    })
    .map(f => ({ name: f.substring(prefix.length), path: f }))
}

/** Splits the library into the folders and files that `currentPath` contains. */
export function getItemsForPath<T extends Pick<FileTreeRecord, 'fileName'>>(
  files: T[],
  allFolders: string[],
  currentPath: string
): { folders: FileTreeFolder[]; files: T[] } {
  return {
    folders: getCurrentFolders(allFolders, currentPath),
    files: files.filter(
      f => parseAppFileName(f.fileName).folder === currentPath
    ),
  }
}

/** Builds the breadcrumb trail for a folder path, prefixed with the root. */
export function generateBreadcrumbs(
  currentPath: string,
  rootName: string
): Breadcrumb[] {
  if (!currentPath) return []
  return [
    { path: '', name: rootName },
    ...currentPath
      .split('/')
      .filter(Boolean)
      .map((part, i, arr) => ({
        path: arr.slice(0, i + 1).join('/'),
        name: part,
      })),
  ]
}
