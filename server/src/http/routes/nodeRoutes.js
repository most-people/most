import { normalizeAddress } from '../../core/shared.js'
import { evaluateStorageLimits } from '../../node/config.js'
import { PersistenceError } from '../../utils/errors.js'
import {
  isLoopbackRemoteAddress,
  isPublicListenHost,
  remoteInviteConfigured,
} from '../access.js'
import { errorJson } from '../errors.js'
import { resolveDataPathForSave } from '../dataPath.js'
import { listFilteredNodeLogs } from '../nodeLogs.js'
import {
  buildNodeStatus,
  buildOpenApiSpec,
  getNetworkAddresses,
  getPackageVersion,
} from '../nodeStatus.js'

function configPersistenceError(result) {
  return new PersistenceError('Failed to persist node configuration', {
    reason: result.reason || 'CONFIG_SAVE_FAILED',
  })
}

export function registerNodeRoutes(
  app,
  {
    engine,
    appPort,
    appHost,
    configStore,
    nodeLogger,
    getDataPath,
    getRemoteInviteSet,
    isRemoteRequest,
    appendNodeLog,
    broadcastNodeStatus,
    wsBroadcast,
    serverInstanceRef,
  }
) {
  app.get('/api/admin/access', c => {
    const mode = c.get('requestAccessMode') || 'remote'
    const userAddress = c.get('userAddress') || ''
    const adminAddress = configStore.getNodeConfig().adminAddress
    const authorized =
      mode === 'loopback' ||
      (mode === 'lan' && Boolean(adminAddress) && userAddress === adminAddress)

    return c.json({
      mode,
      claimed: Boolean(adminAddress),
      authorized,
      adminAddress: authorized ? adminAddress : '',
    })
  })

  app.post('/api/admin/access', c => {
    const userAddress = c.get('userAddress')
    const current = configStore.getNodeConfig().adminAddress
    if (current && current !== userAddress) {
      return c.json(
        {
          error: 'Node administration is already owned by another identity',
          code: 'ADMIN_ALREADY_CLAIMED',
        },
        409
      )
    }

    const result = current
      ? { success: true, claimed: false, adminAddress: current }
      : configStore.claimAdminAddress(userAddress)
    if (!result.success) {
      return c.json(
        { error: 'Failed to persist node administrator', code: result.reason },
        500
      )
    }

    if (result.claimed) {
      appendNodeLog({
        event: 'node:admin:claimed',
        message: 'Node administrator claimed',
        data: { adminAddress: result.adminAddress },
      })
    }
    return c.json({
      success: true,
      mode: c.get('requestAccessMode') || 'remote',
      claimed: true,
      authorized: true,
      adminAddress: result.adminAddress,
    })
  })

  app.get('/api/node-id', c => {
    return c.json({ id: engine.getNodeId() })
  })

  app.get('/api/remote/capabilities', c => {
    const remoteInviteSet = getRemoteInviteSet()
    return c.json({
      remoteAccess:
        isPublicListenHost(appHost) && remoteInviteConfigured(remoteInviteSet),
      inviteRequired: true,
      inviteConfigured: remoteInviteConfigured(remoteInviteSet),
      authenticated: Boolean(c.get('userAddress')),
      userAddress: c.get('userAddress') || null,
      adminAvailable: !isRemoteRequest(c),
      listenHost: appHost,
    })
  })

  app.get('/api/config', c => {
    const config = configStore.loadRawConfig()
    return c.json({ dataPath: config.dataPath || '' })
  })

  app.post('/api/config', async c => {
    const body = await c.req.json()
    const patch = {}

    if (body.resetStorage) {
      patch.dataPath = ''
    } else if (body.dataPath !== undefined) {
      const resolved = resolveDataPathForSave(body.dataPath)
      if (resolved.error) return c.json({ error: resolved.error }, 400)
      patch.dataPath = resolved.dataPath
    }

    const result = configStore.saveNodeConfigPatch(patch)
    if (!result.success) return errorJson(c, configPersistenceError(result))
    appendNodeLog({
      event: 'node:config:updated',
      message: 'Node config updated',
      data: { dataPath: getDataPath(configStore) },
    })
    await broadcastNodeStatus()
    return c.json({ success: true, dataPath: getDataPath(configStore) })
  })

  app.get('/api/config/data-path', c => {
    const config = configStore.getNodeConfig()
    const isDefault = !config.dataPath
    const dataPath = getDataPath(configStore)
    return c.json({ dataPath, isDefault })
  })

  app.get('/api/node/status', async c => {
    try {
      return c.json(
        await buildNodeStatus(engine, configStore, appPort, appHost)
      )
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/node/config', c => {
    const config = configStore.getNodeConfig()
    return c.json({
      ...config,
      dataPath: getDataPath(configStore),
      configuredDataPath: config.dataPath,
      isDefaultDataPath: !config.dataPath,
      currentHost: appHost,
      currentPort: appPort,
      remoteInvites: config.remoteInvites,
    })
  })

  app.post('/api/node/config', async c => {
    const body = await c.req.json()
    const patch = { ...body }

    if (body.resetStorage) {
      patch.dataPath = ''
    } else if (body.dataPath !== undefined) {
      const resolved = resolveDataPathForSave(body.dataPath)
      if (resolved.error) return c.json({ error: resolved.error }, 400)
      patch.dataPath = resolved.dataPath
    }

    const result = configStore.saveNodeConfigPatch(patch)
    if (!result.success) return errorJson(c, configPersistenceError(result))
    const { config } = result
    engine.setMaxFileSize(config.maxFileSizeBytes)
    appendNodeLog({
      event: 'node:config:updated',
      message: 'Node daemon config updated',
      data: {
        dataPath: getDataPath(configStore),
        port: config.port,
        capacityBytes: config.capacityBytes,
        remoteInviteCount: config.remoteInvites.length,
      },
    })
    await broadcastNodeStatus()
    return c.json({
      success: true,
      ...config,
      dataPath: getDataPath(configStore),
    })
  })

  app.get('/api/node/policy', c => {
    const config = configStore.getNodeConfig()
    return c.json({
      maxFileSizeBytes: config.maxFileSizeBytes,
    })
  })

  app.post('/api/node/policy', async c => {
    const body = await c.req.json()
    const result = configStore.saveNodeConfigPatch({
      maxFileSizeBytes: body.maxFileSizeBytes,
    })
    if (!result.success) return errorJson(c, configPersistenceError(result))
    const { config } = result
    engine.setMaxFileSize(config.maxFileSizeBytes)
    const policy = {
      maxFileSizeBytes: config.maxFileSizeBytes,
    }
    appendNodeLog({
      event: 'node:policy:updated',
      message: 'Node storage limits updated',
      data: policy,
    })
    await broadcastNodeStatus()
    return c.json({ success: true, ...policy })
  })

  app.post('/api/node/policy/evaluate', async c => {
    const body = await c.req.json()
    const decision = evaluateStorageLimits(configStore.getNodeConfig(), body)
    return c.json(decision)
  })

  app.get('/api/node/logs', c => {
    const limit = Number(c.req.query('limit') || 100)
    const filter = c.req.query('filter') || 'all'
    const query = c.req.query('q') || ''
    const result = listFilteredNodeLogs(nodeLogger, { limit, filter, query })
    return c.json({
      logFile: nodeLogger.logFile,
      filter: result.filter,
      query: result.query,
      logs: result.logs,
    })
  })

  app.delete('/api/node/logs', c => {
    const success = nodeLogger.clear()
    const clearedAt = new Date().toISOString()
    wsBroadcast('node:logs:cleared', { clearedAt })
    return c.json({ success, clearedAt })
  })

  app.get('/api/node/diagnostics', async c => {
    try {
      const status = await buildNodeStatus(
        engine,
        configStore,
        appPort,
        appHost
      )
      return c.json({
        generatedAt: new Date().toISOString(),
        packageVersion: getPackageVersion(),
        platform: process.platform,
        nodeVersion: process.version,
        status,
        logFile: nodeLogger.logFile,
        logs: nodeLogger.list(200),
      })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/admin/users', c => {
    return c.json({ users: engine.listUsers() })
  })

  app.get('/api/user/profile', c => {
    try {
      return c.json(engine.getUserProfile(c.get('userAddress')))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.put('/api/user/profile', async c => {
    try {
      const body = await c.req.json()
      const profile = engine.saveUserProfile(c.get('userAddress'), body)
      return c.json({ success: true, profile })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/user/export', c => {
    try {
      return c.json(engine.exportUserData(c.get('userAddress')))
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/user/import', async c => {
    try {
      const body = await c.req.json()
      const result = await engine.importUserData(c.get('userAddress'), body, {
        overwriteProfile: true,
      })
      appendNodeLog({
        event: 'node:user-data:imported',
        message: 'User account backup imported',
        data: {
          ownerAddress: c.get('userAddress'),
          result,
        },
      })
      return c.json({ success: true, result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.delete('/api/admin/users/:address/data', async c => {
    const address = normalizeAddress(c.req.param('address'))
    if (!address) {
      return c.json({ error: 'valid address is required' }, 400)
    }
    try {
      const result = await engine.clearUserData(address)
      appendNodeLog({
        event: 'node:user-data:cleared',
        message: 'User data cleared',
        data: result,
      })
      await broadcastNodeStatus()
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.get('/api/openapi.json', c => {
    return c.json(buildOpenApiSpec(appPort))
  })

  app.get('/api/network-status', c => {
    return c.json(engine.getNetworkStatus())
  })

  app.get('/api/network', c => {
    return c.json(getNetworkAddresses(appPort))
  })

  app.get('/api/display-name', c => {
    return c.json({ displayName: engine.getDisplayName() })
  })

  app.post('/api/display-name', async c => {
    const body = await c.req.json()
    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'name is required' }, 400)
    }
    const trimmed = body.name.trim()
    if (trimmed.length > 100) {
      return c.json({ error: 'Name too long (max 100 chars)' }, 400)
    }
    if (/[<>]/.test(trimmed)) {
      return c.json({ error: 'Name contains invalid characters' }, 400)
    }
    const success = engine.setDisplayName(trimmed)
    return c.json({ success, displayName: engine.getDisplayName() })
  })

  app.post('/api/shutdown', c => {
    const clientIp = c.env.incoming?.socket?.remoteAddress || 'unknown'
    if (!isLoopbackRemoteAddress(clientIp)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    c.json({ success: true })
    console.log('[MostBox] Shutdown requested via API...')
    setTimeout(async () => {
      await engine.stop()
      if (serverInstanceRef.current) serverInstanceRef.current.close()
      console.log('[MostBox] Server stopped.')
      process.exit(0)
    }, 100)
    return c.body(null)
  })
}
