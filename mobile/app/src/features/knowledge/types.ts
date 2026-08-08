export type MobileKnowledgeFile = {
  path: string
  name: string
  directory: string
  content: string
  size: number
  mtimeMs: number
}

export type MobileKnowledgeNote = MobileKnowledgeFile

export type MobileKnowledgeSnapshotFile = {
  path: string
  content: string
  size: number
  mtimeMs: number
}

export type MobileKnowledgeSnapshot = {
  format: 'mostbox-knowledge'
  version: 1
  exportedAt: string
  files: MobileKnowledgeSnapshotFile[]
}

export type KnowledgeFileInfo = {
  exists: boolean
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export type KnowledgeStorageAdapter = {
  getInfo: (path: string) => Promise<KnowledgeFileInfo>
  list: (path: string) => Promise<string[]>
  read: (path: string) => Promise<string>
  write: (path: string, content: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  move: (from: string, to: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

export type KnowledgeRepository = {
  list: () => Promise<MobileKnowledgeNote[]>
  read: (path: string) => Promise<MobileKnowledgeNote>
  create: (path: string, content?: string) => Promise<MobileKnowledgeNote>
  write: (path: string, content: string) => Promise<MobileKnowledgeNote>
  move: (path: string, newPath: string) => Promise<MobileKnowledgeNote>
  moveDirectory: (path: string, newPath: string) => Promise<void>
  delete: (path: string) => Promise<void>
  deleteDirectory: (path: string) => Promise<void>
  exportSnapshot: () => Promise<MobileKnowledgeSnapshot>
  restoreSnapshot: (input: unknown) => Promise<MobileKnowledgeSnapshot>
}

export type MarkdownSelection = {
  start: number
  end: number
}

export type MarkdownEditResult = {
  content: string
  selection: MarkdownSelection
}
