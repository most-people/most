import { createMcpHandler } from '@modelcontextprotocol/server'
import { isLoopbackRemoteAddress } from '../http/access.js'
import { MostBoxMcpApiClient } from './apiClient.js'
import { createMostBoxMcpServer } from './server.js'

function getHostname(value) {
  try {
    return new URL(
      String(value || '').includes('://')
        ? String(value)
        : `http://${String(value || '')}`
    ).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isLoopbackHostname(value) {
  const hostname = getHostname(value)
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('127.')
  )
}

function getInternalBaseUrl(appPort) {
  return `http://127.0.0.1:${appPort}`
}

function errorResponse(status, error, code, headers = {}) {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function createMostBoxMcpHttpHandler({
  appPort,
  mcpClientStore,
  rateLimitGuard,
  appendNodeLog,
  fetchImpl,
}) {
  const baseUrl = getInternalBaseUrl(appPort)
  const handler = createMcpHandler(
    context => {
      const principal = context.authInfo?.extra?.principal
      const token = context.authInfo?.token
      return createMostBoxMcpServer({
        principal,
        client: new MostBoxMcpApiClient({ baseUrl, token, fetchImpl }),
      })
    },
    {
      legacy: 'stateless',
      onerror: err => {
        appendNodeLog({
          level: 'error',
          event: 'mcp:protocol:error',
          message: err.message,
        })
      },
    }
  )

  async function handle(c) {
    const remoteAddress = c.env?.incoming?.socket?.remoteAddress || ''
    if (!isLoopbackRemoteAddress(remoteAddress)) {
      return errorResponse(
        403,
        'MCP HTTP transport is limited to loopback requests',
        'MCP_LOOPBACK_REQUIRED'
      )
    }
    if (!isLoopbackHostname(c.req.header('host'))) {
      return errorResponse(
        403,
        'MCP HTTP transport requires a loopback Host header',
        'MCP_HOST_FORBIDDEN'
      )
    }
    const origin = c.req.header('origin')
    if (origin && !isLoopbackHostname(origin)) {
      return errorResponse(
        403,
        'MCP HTTP transport requires a loopback Origin',
        'MCP_ORIGIN_FORBIDDEN'
      )
    }

    const blocked = rateLimitGuard.rejectIfBlocked(c, ['authFailure'])
    if (blocked) return blocked
    const tokenMatch = String(c.req.header('authorization') || '').match(
      /^Bearer\s+(.+)$/i
    )
    const token = tokenMatch?.[1]?.trim() || ''
    const principal = token ? mcpClientStore.authenticate(token) : null
    if (!principal) {
      const limited = rateLimitGuard.enforce(c, ['authFailure'])
      if (limited) return limited
      return errorResponse(
        401,
        'Valid MCP Bearer token required',
        'MCP_UNAUTHORIZED',
        { 'WWW-Authenticate': 'Bearer realm="MostBox MCP"' }
      )
    }

    return handler.fetch(c.req.raw, {
      authInfo: {
        token,
        clientId: principal.id,
        scopes: principal.scopes,
        expiresAt: principal.expiresAt
          ? Math.floor(new Date(principal.expiresAt).getTime() / 1000)
          : undefined,
        extra: { principal },
      },
    })
  }

  return { handle, close: handler.close }
}
