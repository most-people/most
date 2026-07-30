import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { MostBoxMcpApiClient } from './apiClient.js'
import { createMostBoxMcpServer } from './server.js'

export async function runMcpStdio(options = {}) {
  const token = String(
    options.token || process.env.MOSTBOX_MCP_TOKEN || ''
  ).trim()
  const baseUrl = String(
    options.baseUrl || process.env.MOSTBOX_URL || 'http://127.0.0.1:1976'
  ).replace(/\/+$/, '')
  if (!token) {
    throw new Error('MOSTBOX_MCP_TOKEN is required')
  }

  const client = new MostBoxMcpApiClient({ baseUrl, token })
  const principal = await client.getPrincipal()
  return serveStdio(() => createMostBoxMcpServer({ client, principal }), {
    onerror: err => console.error('[MostBox MCP]', err.message),
  })
}
