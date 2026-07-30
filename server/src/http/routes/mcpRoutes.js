import path from 'node:path'
import { sanitizeFilename } from '../../utils/security.js'
import { badRequestOrAppError, errorJson } from '../errors.js'

const DEFAULT_MCP_SCOPES = [
  'node:read',
  'files:read',
  'files:download',
  'downloads:cancel',
]

export function registerMcpRoutes(
  app,
  { engine, appPort, configStore, mcpClientStore, appendNodeLog }
) {
  function requireMcpAdmin(c, { claim = false } = {}) {
    const userAddress = c.get('userAddress')
    const adminAddress = configStore.getNodeConfig().adminAddress
    if (adminAddress && adminAddress !== userAddress) {
      return c.json(
        {
          error: 'Node administration is owned by another identity',
          code: 'ADMIN_FORBIDDEN',
        },
        403
      )
    }
    if (!adminAddress && claim) {
      const result = configStore.claimAdminAddress(userAddress)
      if (!result.success) {
        return c.json(
          {
            error: 'Failed to claim node administration',
            code: result.reason,
          },
          500
        )
      }
    }
    return null
  }

  app.get('/api/admin/mcp/clients', c => {
    const denied = requireMcpAdmin(c)
    if (denied) return denied
    return c.json({ clients: mcpClientStore.listClients() })
  })

  app.post('/api/admin/mcp/clients', async c => {
    const denied = requireMcpAdmin(c, { claim: true })
    if (denied) return denied
    try {
      const body = await c.req.json()
      const result = mcpClientStore.createClient({
        name: body.name,
        ownerAddress: c.get('userAddress'),
        scopes: body.scopes || DEFAULT_MCP_SCOPES,
        allowedRoots: body.allowedRoots,
        expiresInDays: body.expiresInDays,
      })
      appendNodeLog({
        event: 'mcp:client:created',
        message: 'MCP client created',
        data: {
          clientId: result.client.id,
          ownerAddress: result.client.ownerAddress,
          scopes: result.client.scopes,
        },
      })
      return c.json(
        {
          success: true,
          ...result,
          endpoint: `http://127.0.0.1:${appPort}/mcp`,
        },
        201
      )
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.delete('/api/admin/mcp/clients/:id', c => {
    const denied = requireMcpAdmin(c)
    if (denied) return denied
    const client = mcpClientStore.revokeClient(c.req.param('id'))
    if (!client) {
      return c.json(
        { error: 'MCP client not found', code: 'MCP_CLIENT_NOT_FOUND' },
        404
      )
    }
    appendNodeLog({
      event: 'mcp:client:revoked',
      message: 'MCP client revoked',
      data: { clientId: client.id, ownerAddress: client.ownerAddress },
    })
    return c.json({ success: true, client })
  })

  app.get('/api/mcp/me', c => {
    const principal = c.get('mcpPrincipal')
    if (!principal) {
      return c.json(
        { error: 'MCP token required', code: 'MCP_UNAUTHORIZED' },
        401
      )
    }
    return c.json({ client: principal })
  })

  app.post('/api/mcp/publish-local', async c => {
    const principal = c.get('mcpPrincipal')
    if (!principal) {
      return c.json(
        { error: 'MCP token required', code: 'MCP_UNAUTHORIZED' },
        401
      )
    }

    try {
      const body = await c.req.json()
      const filePath = mcpClientStore.resolvePublishPath(
        principal.id,
        body.path
      )
      const requestedName = String(body.fileName || path.basename(filePath))
      const fileName = sanitizeFilename(requestedName)
      const result = await engine.publishFile(filePath, fileName, {
        ownerAddress: principal.ownerAddress,
      })
      appendNodeLog({
        event: 'mcp:publish:success',
        message: 'MCP file published and seeding',
        data: { clientId: principal.id, cid: result.cid },
      })
      return c.json({ success: true, ...result })
    } catch (err) {
      return errorJson(c, err)
    }
  })
}
