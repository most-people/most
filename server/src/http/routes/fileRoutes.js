import fs from 'node:fs'
import { parseMostLink, validateCidString } from '../../core/cid.js'
import { sanitizeFilename } from '../../utils/security.js'
import { badRequestOrAppError, errorJson } from '../errors.js'
import { validationErrorPayload } from '../routePolicy.js'
import { parseMultipartBusboy } from '../uploads.js'
import { getMimeType } from '../staticFiles.js'

export function registerFileRoutes(app, { engine, configStore, wsBroadcast }) {
  app.get('/api/files', c => {
    return c.json(
      engine.listPublishedFiles({ ownerAddress: c.get('userAddress') })
    )
  })

  app.post('/api/publish', async c => {
    const req = c.env.incoming
    const result = await parseMultipartBusboy(
      req,
      configStore.getNodeConfig().maxFileSizeBytes
    )

    if (!result || !result.filename) {
      return c.json({ error: 'No file provided' }, 400)
    }

    try {
      const publishResult = await engine.publishFile(
        result.filePath,
        result.filename,
        { ownerAddress: c.get('userAddress') }
      )
      return c.json({ success: true, ...publishResult })
    } finally {
      fs.unlink(result.filePath, () => {})
    }
  })

  app.post('/api/download/check', async c => {
    const body = await c.req.json()
    if (!body.link) {
      return c.json({ error: 'link is required' }, 400)
    }

    const parsed = parseMostLink(body.link)
    if (parsed.errorCode) {
      return c.json(
        validationErrorPayload(parsed.errorCode, parsed.details),
        400
      )
    }

    const localAvailability = await engine.getLocalCidAvailability(body.link, {
      ownerAddress: c.get('userAddress'),
    })
    if (localAvailability) {
      return c.json({
        success: true,
        available: true,
        cid: parsed.cid,
        fileName: localAvailability.fileName,
        size: Number(localAvailability.size) || null,
        alreadyExists: true,
      })
    }

    if (engine.hasDownloadNameConflict(parsed.fileName)) {
      return c.json(
        {
          error: `已有同名文件: ${parsed.fileName}`,
          code: 'CONFLICT',
        },
        409
      )
    }

    try {
      const timeout =
        body.timeout === undefined ? undefined : Number(body.timeout)
      const result = await engine.checkDownloadAvailability(body.link, {
        ownerAddress: c.get('userAddress'),
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/download', async c => {
    const body = await c.req.json()
    if (!body.link) {
      return c.json({ error: 'link is required' }, 400)
    }

    const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const parsed = parseMostLink(body.link)
    if (parsed.errorCode) {
      return c.json(
        validationErrorPayload(parsed.errorCode, parsed.details),
        400
      )
    }

    const localAvailability = await engine.getLocalCidAvailability(body.link, {
      ownerAddress: c.get('userAddress'),
    })
    if (localAvailability) {
      console.log(`[MostBox] CID content already exists locally: ${parsed.cid}`)
      try {
        const result = await engine.downloadFile(body.link, taskId, {
          ownerAddress: c.get('userAddress'),
        })
        return c.json({ success: true, ...result })
      } catch (err) {
        return errorJson(c, err)
      }
    }

    if (engine.hasDownloadNameConflict(parsed.fileName)) {
      return c.json(
        {
          error: `已有同名文件: ${parsed.fileName}`,
          code: 'CONFLICT',
        },
        409
      )
    }

    engine
      .downloadFile(body.link, taskId, { ownerAddress: c.get('userAddress') })
      .catch(err => {
        if (err.message === 'Download cancelled') {
          wsBroadcast('download:cancelled', { taskId })
        } else {
          wsBroadcast('download:error', { taskId, error: err.message })
        }
      })

    return c.json({ success: true, taskId })
  })

  app.post('/api/download/cancel', async c => {
    const body = await c.req.json()
    if (!body.taskId) {
      return c.json({ error: 'taskId is required' }, 400)
    }
    engine.cancelDownload(body.taskId)
    return c.json({ success: true })
  })

  app.delete('/api/files/:cid', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    const result = await engine.deletePublishedFile(cid, {
      ownerAddress: c.get('userAddress'),
    })
    return c.json(result)
  })

  app.post('/api/files/:cid/cache', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    try {
      const body = await c.req.json().catch(() => ({}))
      const timeout =
        body.timeout === undefined ? undefined : Number(body.timeout)
      const result = await engine.cacheFile(cid, {
        ownerAddress: c.get('userAddress'),
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
        taskId: body.taskId,
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.post('/api/move', async c => {
    const body = await c.req.json()
    if (!body.cid || !body.newFileName) {
      return c.json({ error: 'cid and newFileName are required' }, 400)
    }
    const cidValidation = validateCidString(body.cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    const cleanFileName = sanitizeFilename(body.newFileName)
    if (
      !cleanFileName ||
      cleanFileName === 'unnamed' ||
      body.newFileName.length > 255
    ) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    try {
      const result = engine.moveFile(body.cid, cleanFileName, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.get('/api/files/:cid/download', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }

    const rangeHeader = c.req.header('range')

    try {
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10)
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined
          const offset = start
          const limit = end !== undefined ? end - start + 1 : undefined

          const result = await engine.readFileRaw(cid, {
            offset,
            limit,
            public: true,
          })
          const contentType = getMimeType(result.fileName)

          c.header('Content-Type', contentType)
          c.header('Content-Length', String(result.buffer.length))
          c.header(
            'Content-Range',
            `bytes ${offset}-${offset + result.buffer.length - 1}/${result.totalSize}`
          )
          c.header('Accept-Ranges', 'bytes')
          c.status(206)
          return c.body(result.buffer)
        }
      }

      const result = await engine.readFileRaw(cid, {
        public: true,
      })
      const contentType = getMimeType(result.fileName)
      c.header('Content-Type', contentType)
      c.header('Content-Length', String(result.totalSize))
      c.header('Accept-Ranges', 'bytes')
      c.header(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(result.fileName)}"`
      )
      return c.body(result.buffer)
    } catch (err) {
      if (err.message === 'File not found') {
        return c.json({ error: err.message }, 404)
      }
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/trash', c => {
    return c.json(engine.listTrashFiles({ ownerAddress: c.get('userAddress') }))
  })

  app.post('/api/trash/:cid/restore', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    try {
      const result = await engine.restoreTrashFile(cid, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, files: result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.delete('/api/trash/:cid', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    const result = await engine.permanentDeleteTrashFile(cid, {
      ownerAddress: c.get('userAddress'),
    })
    return c.json({ success: true, trashFiles: result })
  })

  app.delete('/api/trash', async c => {
    const result = await engine.emptyTrash({
      ownerAddress: c.get('userAddress'),
    })
    return c.json({ success: true, trashFiles: result })
  })

  app.post('/api/files/:cid/star', async c => {
    const cid = c.req.param('cid')
    const cidValidation = validateCidString(cid)
    if (!cidValidation.valid) {
      return c.json(validationErrorPayload(cidValidation.errorCode), 400)
    }
    try {
      const result = engine.toggleStarred(cid, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.post('/api/folder/rename', async c => {
    const body = await c.req.json()
    if (!body.oldPath || !body.newPath) {
      return c.json({ error: 'oldPath and newPath are required' }, 400)
    }
    if (body.oldPath.length > 500 || body.newPath.length > 500) {
      return c.json({ error: 'Path too long' }, 400)
    }
    if (body.oldPath.includes('..') || body.newPath.includes('..')) {
      return c.json({ error: 'Path traversal not allowed' }, 400)
    }
    try {
      const result = engine.renameFolder(body.oldPath, body.newPath, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })
}
