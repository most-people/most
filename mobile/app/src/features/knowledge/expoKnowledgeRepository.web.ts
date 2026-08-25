import { createKnowledgeRepository } from './knowledgeRepository'
import type { KnowledgeStorageAdapter } from './types'

const STORAGE_KEY = 'mostbox.web.knowledge.v1'

type BrowserKnowledgeFile = {
  content: string
  mtimeMs: number
}

type BrowserKnowledgeState = {
  directories: string[]
  files: Record<string, BrowserKnowledgeFile>
}

let memoryState: BrowserKnowledgeState = { directories: [], files: {} }

function normalizePath(path: string) {
  return String(path || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

function loadState(): BrowserKnowledgeState {
  if (typeof localStorage === 'undefined') return memoryState
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as {
      directories?: unknown
      files?: unknown
    }
    const directories = Array.isArray(parsed.directories)
      ? parsed.directories
          .map(value => normalizePath(String(value)))
          .filter(Boolean)
      : []
    const files =
      parsed.files && typeof parsed.files === 'object'
        ? (parsed.files as Record<string, BrowserKnowledgeFile>)
        : {}
    return { directories, files }
  } catch {
    return { directories: [], files: {} }
  }
}

function saveState(state: BrowserKnowledgeState) {
  memoryState = state
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function directoryExists(state: BrowserKnowledgeState, path: string) {
  const prefix = path ? `${path}/` : ''
  return (
    state.directories.includes(path) ||
    Object.keys(state.files).some(filePath => filePath.startsWith(prefix)) ||
    state.directories.some(directory => directory.startsWith(prefix))
  )
}

function createBrowserKnowledgeStorage(): KnowledgeStorageAdapter {
  return {
    async getInfo(path) {
      const normalized = normalizePath(path)
      const state = loadState()
      const file = state.files[normalized]
      if (file) {
        return {
          exists: true,
          isDirectory: false,
          size: new TextEncoder().encode(file.content).byteLength,
          mtimeMs: file.mtimeMs,
        }
      }
      return {
        exists: directoryExists(state, normalized),
        isDirectory: directoryExists(state, normalized),
        size: 0,
        mtimeMs: 0,
      }
    },
    async list(path) {
      const normalized = normalizePath(path)
      const prefix = normalized ? `${normalized}/` : ''
      const state = loadState()
      const names = new Set<string>()
      for (const value of [...state.directories, ...Object.keys(state.files)]) {
        if (!value.startsWith(prefix) || value === normalized) continue
        const name = value.slice(prefix.length).split('/')[0]
        if (name) names.add(name)
      }
      return [...names]
    },
    async read(path) {
      const file = loadState().files[normalizePath(path)]
      if (!file) throw new Error('笔记不存在')
      return file.content
    },
    async write(path, content) {
      const normalized = normalizePath(path)
      const state = loadState()
      state.files[normalized] = { content, mtimeMs: Date.now() }
      saveState(state)
    },
    async mkdir(path) {
      const normalized = normalizePath(path)
      if (!normalized) return
      const state = loadState()
      if (!state.directories.includes(normalized)) {
        state.directories.push(normalized)
        saveState(state)
      }
    },
    async move(from, to) {
      const source = normalizePath(from)
      const target = normalizePath(to)
      const state = loadState()
      const file = state.files[source]
      if (file) {
        state.files[target] = file
        delete state.files[source]
        saveState(state)
        return
      }

      const prefix = `${source}/`
      const movedFiles = Object.entries(state.files).filter(([path]) =>
        path.startsWith(prefix)
      )
      const movedDirectories = state.directories.filter(
        path => path === source || path.startsWith(prefix)
      )
      if (!movedFiles.length && !movedDirectories.length) {
        throw new Error('知识库目录不存在')
      }
      for (const [path, value] of movedFiles) {
        state.files[`${target}${path.slice(source.length)}`] = value
        delete state.files[path]
      }
      state.directories = state.directories
        .filter(path => path !== source && !path.startsWith(prefix))
        .concat(
          movedDirectories.map(path => `${target}${path.slice(source.length)}`)
        )
      saveState(state)
    },
    async remove(path) {
      const normalized = normalizePath(path)
      const prefix = `${normalized}/`
      const state = loadState()
      delete state.files[normalized]
      for (const filePath of Object.keys(state.files)) {
        if (filePath.startsWith(prefix)) delete state.files[filePath]
      }
      state.directories = state.directories.filter(
        directory => directory !== normalized && !directory.startsWith(prefix)
      )
      saveState(state)
    },
  }
}

export function createExpoKnowledgeRepository() {
  return createKnowledgeRepository(createBrowserKnowledgeStorage())
}
