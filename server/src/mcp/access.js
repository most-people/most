const MCP_API_RULES = [
  { method: 'GET', pattern: /^\/api\/mcp\/me$/, scope: '' },
  {
    method: 'POST',
    pattern: /^\/api\/mcp\/publish-local$/,
    scope: 'files:publish',
  },
  { method: 'GET', pattern: /^\/api\/node\/status$/, scope: 'node:read' },
  { method: 'GET', pattern: /^\/api\/node\/holdings$/, scope: 'node:read' },
  { method: 'GET', pattern: /^\/api\/files$/, scope: 'files:read' },
  {
    method: 'POST',
    pattern: /^\/api\/download\/check$/,
    scope: 'files:read',
  },
  {
    method: 'GET',
    pattern: /^\/api\/download\/tasks$/,
    scope: 'files:read',
  },
  {
    method: 'POST',
    pattern: /^\/api\/download$/,
    scope: 'files:download',
  },
  {
    method: 'POST',
    pattern: /^\/api\/download\/cancel$/,
    scope: 'downloads:cancel',
  },
]

export function getRequiredMcpScope(method, requestPath) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const rule = MCP_API_RULES.find(
    item => item.method === normalizedMethod && item.pattern.test(requestPath)
  )
  return rule ? rule.scope : null
}

export function authorizeMcpApiRequest(principal, method, requestPath) {
  const requiredScope = getRequiredMcpScope(method, requestPath)
  if (requiredScope === null) {
    return { allowed: false, reason: 'MCP_API_FORBIDDEN' }
  }
  if (requiredScope && !principal?.scopes?.includes(requiredScope)) {
    return { allowed: false, reason: 'MCP_SCOPE_FORBIDDEN', requiredScope }
  }
  return { allowed: true, requiredScope }
}
