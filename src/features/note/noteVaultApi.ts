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
