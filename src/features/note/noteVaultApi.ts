import { api } from '~server/src/utils/api'

export interface NoteVaultStatus {
  configured: boolean
  vaultPath: string
  fileCount: number
  writable: boolean
  updatedAt?: string
  error?: string
}

export interface NoteVaultFile {
  path: string
  name: string
  directory: string
  size: number
  mtimeMs: number
}

export interface NoteVaultFileContent extends NoteVaultFile {
  content: string
}

export interface NoteVaultSnapshotFile {
  path: string
  content: string
  size: number
  mtimeMs: number
}

export interface NoteVaultSnapshot {
  files: NoteVaultSnapshotFile[]
}

export interface NoteVaultRestoreResult {
  created: number
  updated: number
  deleted: number
  skipped: number
  files: number
}

export type NoteGitChangeStatus = 'added' | 'modified' | 'deleted'

export interface NoteGitAuthor {
  name: string
  email: string
}

export interface NoteGitChange {
  path: string
  status: NoteGitChangeStatus
  staged: boolean
}

export interface NoteGitStatus {
  initialized: boolean
  branch: string
  headOid: string
  changes: NoteGitChange[]
  stagedCount: number
  author: NoteGitAuthor | null
}

export interface NoteGitCommit {
  oid: string
  message: string
  author: NoteGitAuthor
  timestamp: number
  changes: Array<Pick<NoteGitChange, 'path' | 'status'>>
}

export interface NoteGitDiffPart {
  value: string
  count: number
  added: boolean
  removed: boolean
}

export interface NoteGitDiff {
  path: string
  oid: string
  beforeExists: boolean
  afterExists: boolean
  parts: NoteGitDiffPart[]
}

export async function getNoteVaultStatus() {
  return api.get('/api/note-vault/status').json<NoteVaultStatus>()
}

export async function configureNoteVault(path: string) {
  return api
    .post('/api/note-vault/config', { json: { path } })
    .json<NoteVaultStatus & { success: boolean }>()
}

export async function listNoteVaultFiles() {
  const data = await api
    .get('/api/note-vault/files')
    .json<{ files: NoteVaultFile[] }>()
  return Array.isArray(data.files) ? data.files : []
}

export async function readNoteVaultFile(path: string) {
  return api
    .get('/api/note-vault/file', { searchParams: { path } })
    .json<NoteVaultFileContent>()
}

export async function saveNoteVaultFile(path: string, content: string) {
  const data = await api
    .put('/api/note-vault/file', { json: { path, content } })
    .json<{ success: boolean; file: NoteVaultFileContent }>()
  return data.file
}

export async function createNoteVaultFile(path: string, content = '') {
  const data = await api
    .post('/api/note-vault/file', { json: { path, content } })
    .json<{ success: boolean; file: NoteVaultFileContent }>()
  return data.file
}

export async function moveNoteVaultFile(path: string, newPath: string) {
  const data = await api
    .patch('/api/note-vault/file', { json: { path, newPath } })
    .json<{ success: boolean; file: NoteVaultFileContent }>()
  return data.file
}

export async function deleteNoteVaultFile(path: string) {
  return api
    .delete('/api/note-vault/file', { searchParams: { path } })
    .json<{ success: boolean; path: string; deleted: boolean }>()
}

export async function getNoteVaultSnapshot() {
  return api.get('/api/note-vault/snapshot').json<NoteVaultSnapshot>()
}

export async function restoreNoteVaultSnapshot(snapshot: NoteVaultSnapshot) {
  const data = await api
    .post('/api/note-vault/restore', { json: snapshot })
    .json<{ success: boolean; result: NoteVaultRestoreResult }>()
  return data.result
}

export async function getNoteGitStatus() {
  return api.get('/api/note-vault/git/status').json<NoteGitStatus>()
}

export async function initializeNoteGit(author: NoteGitAuthor) {
  const data = await api
    .post('/api/note-vault/git/init', { json: { author } })
    .json<{ success: boolean; status: NoteGitStatus }>()
  return data.status
}

export async function configureNoteGitAuthor(author: NoteGitAuthor) {
  const data = await api
    .put('/api/note-vault/git/author', { json: author })
    .json<{ success: boolean; author: NoteGitAuthor }>()
  return data.author
}

export async function commitNoteGitChanges(message: string) {
  const data = await api
    .post('/api/note-vault/git/commit', { json: { message } })
    .json<{ success: boolean; oid: string; status: NoteGitStatus }>()
  return data
}

export async function listNoteGitHistory(limit = 50) {
  const data = await api
    .get('/api/note-vault/git/history', { searchParams: { limit } })
    .json<{ commits: NoteGitCommit[] }>()
  return Array.isArray(data.commits) ? data.commits : []
}

export async function getNoteGitDiff(path: string, oid = '') {
  return api
    .get('/api/note-vault/git/diff', {
      searchParams: oid ? { path, oid } : { path },
    })
    .json<NoteGitDiff>()
}

export async function restoreNoteGitFile(path: string, oid: string) {
  return api.post('/api/note-vault/git/restore', { json: { path, oid } }).json<{
    success: boolean
    path: string
    oid: string
    exists: boolean
    status: NoteGitStatus
  }>()
}
