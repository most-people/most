import { errorJson } from '../errors.js'
import { PermissionError } from '../../utils/errors.js'
import { resolveUserNoteVaultPath } from '../../utils/noteVault.js'
import {
  commitNoteGitChanges,
  configureNoteGitAuthor,
  getNoteGitDiff,
  getNoteGitStatus,
  initializeNoteGit,
  listNoteGitHistory,
  restoreNoteGitFile,
} from '../../utils/noteGit.js'

function assertNoteGitAccess(c, isRemoteRequest) {
  if (process.env.ELECTRON_APP !== 'true') {
    throw new PermissionError(
      'Knowledge base Git is only available in Electron'
    )
  }
  if (isRemoteRequest(c)) {
    throw new PermissionError('Knowledge base Git is only available locally')
  }
}

async function getVaultPath(c, noteVaultRoot, isRemoteRequest) {
  assertNoteGitAccess(c, isRemoteRequest)
  return resolveUserNoteVaultPath(noteVaultRoot, c.get('userAddress'))
}

export function registerNoteGitRoutes(app, { noteVaultRoot, isRemoteRequest }) {
  app.get('/api/note-vault/git/status', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      return c.json(await getNoteGitStatus(vaultPath))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/note-vault/git/init', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      const body = await c.req.json()
      return c.json({
        success: true,
        status: await initializeNoteGit(vaultPath, body.author),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.put('/api/note-vault/git/author', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      const body = await c.req.json()
      return c.json({
        success: true,
        author: await configureNoteGitAuthor(vaultPath, body),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/note-vault/git/commit', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      const body = await c.req.json()
      return c.json({
        success: true,
        ...(await commitNoteGitChanges(vaultPath, body.message)),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/note-vault/git/history', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      return c.json({
        commits: await listNoteGitHistory(vaultPath, c.req.query('limit')),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/note-vault/git/diff', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      return c.json(
        await getNoteGitDiff(vaultPath, c.req.query('path'), c.req.query('oid'))
      )
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/note-vault/git/restore', async c => {
    try {
      const vaultPath = await getVaultPath(c, noteVaultRoot, isRemoteRequest)
      const body = await c.req.json()
      return c.json({
        success: true,
        ...(await restoreNoteGitFile(vaultPath, body.path, body.oid)),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })
}
