export interface FolderShareFile {
  fileName?: string
  kind?: string
  localAvailable?: boolean
  seedStatus?: string
}

export interface FolderShareState {
  canShare: boolean
  reason: '' | 'empty' | 'missingLocalFiles'
  fileCount: number
  missingCount: number
}

function normalizeDisplayPath(path: string) {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

export function getFolderShareState(
  files: FolderShareFile[],
  folderPath: string
): FolderShareState {
  const normalizedFolderPath = normalizeDisplayPath(folderPath)
  if (!normalizedFolderPath) {
    return {
      canShare: false,
      reason: 'empty',
      fileCount: 0,
      missingCount: 0,
    }
  }

  const prefix = `${normalizedFolderPath}/`
  const folderFiles = files.filter(file => {
    if ((file.kind || 'file') === 'collection') return false
    const fileName = normalizeDisplayPath(file.fileName || '')
    return (
      fileName.startsWith(prefix) && fileName.slice(prefix.length).length > 0
    )
  })

  if (folderFiles.length === 0) {
    return {
      canShare: false,
      reason: 'empty',
      fileCount: 0,
      missingCount: 0,
    }
  }

  const missingCount = folderFiles.filter(
    file => file.localAvailable === false || file.seedStatus === 'error'
  ).length
  if (missingCount > 0) {
    return {
      canShare: false,
      reason: 'missingLocalFiles',
      fileCount: folderFiles.length,
      missingCount,
    }
  }

  return {
    canShare: true,
    reason: '',
    fileCount: folderFiles.length,
    missingCount: 0,
  }
}
