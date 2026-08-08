import {
  compareKnowledgePaths,
  getKnowledgeDirectory,
  getKnowledgeDisplayName,
  normalizeKnowledgeDirectory,
  normalizeKnowledgeFilePath,
  validateKnowledgeSnapshot,
} from './knowledgeModel'
import type {
  KnowledgeRepository,
  KnowledgeStorageAdapter,
  MobileKnowledgeNote,
  MobileKnowledgeSnapshot,
} from './types'

const DEFAULT_ROOT = 'mostbox-knowledge'

function storagePath(root: string, relativePath = '') {
  return relativePath ? `${root}/${relativePath}` : root
}

function parentDirectories(path: string) {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_part, index) => parts.slice(0, index + 1).join('/'))
}

export function createKnowledgeRepository(
  storage: KnowledgeStorageAdapter,
  root = DEFAULT_ROOT
): KnowledgeRepository {
  const normalizedRoot = normalizeKnowledgeDirectory(root)

  async function ensureRoot(rootPath = normalizedRoot) {
    const info = await storage.getInfo(rootPath)
    if (!info.exists) await storage.mkdir(rootPath)
    else if (!info.isDirectory) throw new Error('知识库路径不是目录')
  }

  async function ensureParents(path: string, rootPath = normalizedRoot) {
    await ensureRoot(rootPath)
    for (const directory of parentDirectories(path)) {
      const target = storagePath(rootPath, directory)
      const info = await storage.getInfo(target)
      if (!info.exists) await storage.mkdir(target)
      else if (!info.isDirectory)
        throw new Error(`知识库目录冲突：${directory}`)
    }
  }

  async function pruneEmptyDirectories(relativeDirectory: string) {
    let directory = relativeDirectory
    while (directory) {
      const target = storagePath(normalizedRoot, directory)
      const info = await storage.getInfo(target)
      if (!info.exists) {
        directory = directory.includes('/')
          ? directory.slice(0, directory.lastIndexOf('/'))
          : ''
        continue
      }
      if (!info.isDirectory || (await storage.list(target)).length > 0) return
      await storage.remove(target)
      directory = directory.includes('/')
        ? directory.slice(0, directory.lastIndexOf('/'))
        : ''
    }
  }

  async function readNote(path: string, rootPath = normalizedRoot) {
    const normalizedPath = normalizeKnowledgeFilePath(path)
    const target = storagePath(rootPath, normalizedPath)
    const info = await storage.getInfo(target)
    if (!info.exists || info.isDirectory) throw new Error('笔记不存在')
    const content = await storage.read(target)
    return {
      path: normalizedPath,
      name: getKnowledgeDisplayName(normalizedPath),
      directory: getKnowledgeDirectory(normalizedPath),
      content,
      size: new TextEncoder().encode(content).byteLength,
      mtimeMs: info.mtimeMs || Date.now(),
    } satisfies MobileKnowledgeNote
  }

  async function listNotes(rootPath = normalizedRoot) {
    await ensureRoot(rootPath)
    const notes: MobileKnowledgeNote[] = []

    async function scan(relativeDirectory = '') {
      const targetDirectory = storagePath(rootPath, relativeDirectory)
      const names = await storage.list(targetDirectory)
      for (const name of names.sort((left, right) =>
        left.localeCompare(right)
      )) {
        if (name.startsWith('.') || name.toLowerCase() === 'node_modules')
          continue
        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${name}`
          : name
        const target = storagePath(rootPath, relativePath)
        const info = await storage.getInfo(target)
        if (info.isDirectory) {
          await scan(relativePath)
        } else if (name.toLowerCase().endsWith('.md')) {
          notes.push(await readNote(relativePath, rootPath))
        }
      }
    }

    await scan()
    return notes.sort((left, right) => right.mtimeMs - left.mtimeMs)
  }

  async function writeNew(path: string, content: string, overwrite: boolean) {
    const normalizedPath = normalizeKnowledgeFilePath(path)
    const existingPath = (await listNotes()).find(
      note => note.path.toLowerCase() === normalizedPath.toLowerCase()
    )?.path
    if (existingPath) {
      if (!overwrite) throw new Error('同名笔记已存在')
      await storage.write(
        storagePath(normalizedRoot, existingPath),
        String(content ?? '')
      )
      return readNote(existingPath)
    }
    const target = storagePath(normalizedRoot, normalizedPath)
    const info = await storage.getInfo(target)
    if (info.exists && info.isDirectory) throw new Error('笔记路径与目录冲突')
    await ensureParents(normalizedPath)
    await storage.write(target, String(content ?? ''))
    return readNote(normalizedPath)
  }

  async function moveFile(path: string, newPath: string) {
    const sourcePath = normalizeKnowledgeFilePath(path)
    const targetPath = normalizeKnowledgeFilePath(newPath)
    if (sourcePath === targetPath) return readNote(sourcePath)
    const source = storagePath(normalizedRoot, sourcePath)
    const target = storagePath(normalizedRoot, targetPath)
    const sourceInfo = await storage.getInfo(source)
    if (!sourceInfo.exists || sourceInfo.isDirectory)
      throw new Error('笔记不存在')
    const caseOnlyMove = sourcePath.toLowerCase() === targetPath.toLowerCase()
    const conflictingPath = (await listNotes()).find(
      note =>
        note.path !== sourcePath &&
        note.path.toLowerCase() === targetPath.toLowerCase()
    )?.path
    if (
      conflictingPath ||
      (!caseOnlyMove && (await storage.getInfo(target)).exists)
    )
      throw new Error('目标笔记已存在')
    await ensureParents(targetPath)
    if (caseOnlyMove) {
      const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const temporary = `${source}.mostbox-move-${nonce}`
      await storage.move(source, temporary)
      try {
        await storage.move(temporary, target)
      } catch (error) {
        await storage.move(temporary, source).catch(() => {})
        throw error
      }
    } else {
      await storage.move(source, target)
    }
    await pruneEmptyDirectories(getKnowledgeDirectory(sourcePath))
    return readNote(targetPath)
  }

  async function moveDirectory(path: string, newPath: string) {
    const source = normalizeKnowledgeDirectory(path)
    const target = normalizeKnowledgeDirectory(newPath)
    if (!source || !target) throw new Error('目录路径不能为空')
    if (target === source || target.startsWith(`${source}/`)) {
      throw new Error('不能把目录移动到自身内部')
    }
    const notes = await listNotes()
    const matches = notes.filter(note => note.path.startsWith(`${source}/`))
    if (!matches.length) throw new Error('目录不存在')
    for (const note of matches) {
      const suffix = note.path.slice(source.length + 1)
      const nextPath = `${target}/${suffix}`
      if (
        (await storage.getInfo(storagePath(normalizedRoot, nextPath))).exists
      ) {
        throw new Error(`目标笔记已存在：${nextPath}`)
      }
    }
    const moved: Array<{ from: string; to: string }> = []
    try {
      for (const note of matches) {
        const suffix = note.path.slice(source.length + 1)
        const nextPath = `${target}/${suffix}`
        await moveFile(note.path, nextPath)
        moved.push({ from: note.path, to: nextPath })
      }
    } catch (error) {
      for (const item of moved.reverse()) {
        await moveFile(item.to, item.from).catch(() => {})
      }
      throw error
    }
  }

  async function deleteDirectory(path: string) {
    const directory = normalizeKnowledgeDirectory(path)
    if (!directory) throw new Error('不能删除知识库根目录')
    const notes = await listNotes()
    const matches = notes.filter(note => note.path.startsWith(`${directory}/`))
    if (!matches.length) throw new Error('目录不存在')
    for (const note of matches) {
      await storage.remove(storagePath(normalizedRoot, note.path))
      await pruneEmptyDirectories(note.directory)
    }
  }

  async function exportSnapshot() {
    const notes = await listNotes()
    return {
      format: 'mostbox-knowledge',
      version: 1,
      exportedAt: new Date().toISOString(),
      files: notes
        .map(note => ({
          path: note.path,
          content: note.content,
          size: note.size,
          mtimeMs: note.mtimeMs,
        }))
        .sort((left, right) => compareKnowledgePaths(left.path, right.path)),
    } satisfies MobileKnowledgeSnapshot
  }

  async function restoreSnapshot(input: unknown) {
    const snapshot = validateKnowledgeSnapshot(input)
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const stageRoot = `${normalizedRoot}.import-${nonce}`
    const backupRoot = `${normalizedRoot}.backup-${nonce}`
    let activeMoved = false
    let stageActivated = false

    try {
      await storage.mkdir(stageRoot)
      for (const file of snapshot.files) {
        await ensureParents(file.path, stageRoot)
        await storage.write(storagePath(stageRoot, file.path), file.content)
      }

      if ((await storage.getInfo(normalizedRoot)).exists) {
        await storage.move(normalizedRoot, backupRoot)
        activeMoved = true
      }
      await storage.move(stageRoot, normalizedRoot)
      stageActivated = true
      const restored = await exportSnapshot()
      if (activeMoved) await storage.remove(backupRoot).catch(() => {})
      return restored
    } catch (error) {
      const activeInfo = await storage.getInfo(normalizedRoot)
      const backupInfo = await storage.getInfo(backupRoot)
      if (backupInfo.exists) {
        if (activeInfo.exists) {
          await storage.remove(normalizedRoot).catch(() => {})
        }
        await storage.move(backupRoot, normalizedRoot).catch(() => {})
      } else if (stageActivated && activeInfo.exists) {
        await storage.remove(normalizedRoot).catch(() => {})
      }
      await storage.remove(stageRoot).catch(() => {})
      throw error
    }
  }

  return {
    list: () => listNotes(),
    read: path => readNote(path),
    create: (path, content = '') => writeNew(path, content, false),
    write: (path, content) => writeNew(path, content, true),
    move: moveFile,
    moveDirectory,
    delete: async path => {
      const normalizedPath = normalizeKnowledgeFilePath(path)
      const target = storagePath(normalizedRoot, normalizedPath)
      const info = await storage.getInfo(target)
      if (!info.exists || info.isDirectory) throw new Error('笔记不存在')
      await storage.remove(target)
      await pruneEmptyDirectories(getKnowledgeDirectory(normalizedPath))
    },
    deleteDirectory,
    exportSnapshot,
    restoreSnapshot,
  }
}
