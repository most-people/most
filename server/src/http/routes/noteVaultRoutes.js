import { errorJson } from '../errors.js'
import { PermissionError } from '../../utils/errors.js'
import {
  configureNoteVault,
  createMarkdownFile,
  createNoteVaultSnapshot,
  deleteMarkdownFile,
  getConfiguredNoteVaultPath,
  getNoteVaultStatus,
  listMarkdownFiles,
  moveMarkdownFile,
  readMarkdownFile,
  restoreNoteVaultSnapshot,
  writeMarkdownFile,
} from '../../utils/noteVault.js'

function assertNoteVaultAccess(c, isRemoteRequest) {
  if (process.env.ELECTRON_APP !== 'true') {
    throw new PermissionError('Note vault is only available in Electron')
  }
  if (isRemoteRequest(c)) {
    throw new PermissionError('Note vault is only available locally')
  }
}

function getBodyPath(body) {
  return String(body.path || body.vaultPath || '').trim()
}

export function registerNoteVaultRoutes(app, { configStore, isRemoteRequest }) {
  app.get('/api/note-vault/status', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      return c.json(await getNoteVaultStatus(configStore.configDir))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/note-vault/config', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const body = await c.req.json()
      const status = await configureNoteVault(
        configStore.configDir,
        getBodyPath(body)
      )
      return c.json({ success: true, ...status })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/note-vault/files', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      return c.json({ files: await listMarkdownFiles(vaultPath) })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/note-vault/file', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      const file = await readMarkdownFile(vaultPath, c.req.query('path'))
      return c.json(file)
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/note-vault/file', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const body = await c.req.json()
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      const file = await createMarkdownFile(
        vaultPath,
        String(body.path || ''),
        String(body.content || '')
      )
      return c.json({ success: true, file })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.put('/api/note-vault/file', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const body = await c.req.json()
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      const file = await writeMarkdownFile(
        vaultPath,
        String(body.path || ''),
        String(body.content || '')
      )
      return c.json({ success: true, file })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.patch('/api/note-vault/file', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const body = await c.req.json()
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      const file = await moveMarkdownFile(
        vaultPath,
        String(body.path || body.fromPath || ''),
        String(body.newPath || body.toPath || '')
      )
      return c.json({ success: true, file })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.delete('/api/note-vault/file', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      const result = await deleteMarkdownFile(vaultPath, c.req.query('path'))
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/note-vault/snapshot', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      return c.json(await createNoteVaultSnapshot(vaultPath))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/note-vault/restore', async c => {
    try {
      assertNoteVaultAccess(c, isRemoteRequest)
      const body = await c.req.json()
      const vaultPath = await getConfiguredNoteVaultPath(configStore.configDir)
      const result = await restoreNoteVaultSnapshot(vaultPath, body)
      return c.json({ success: true, result })
    } catch (err) {
      return errorJson(c, err)
    }
  })
}
