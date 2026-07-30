export class MostBoxMcpApiError extends Error {
  constructor(message, status, data = {}) {
    super(message)
    this.name = 'MostBoxMcpApiError'
    this.status = status
    this.code = data.code || 'MCP_DAEMON_ERROR'
    this.errorCode = data.errorCode
    this.details = data.details
  }
}

export class MostBoxMcpApiClient {
  constructor({ baseUrl = 'http://127.0.0.1:1976', token, fetchImpl = fetch }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '')
    this.token = String(token || '')
    this.fetchImpl = fetchImpl
  }

  async request(method, requestPath, body) {
    const response = await this.fetchImpl(`${this.baseUrl}${requestPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response
      .json()
      .catch(() => ({ error: response.statusText }))
    if (!response.ok) {
      throw new MostBoxMcpApiError(
        data.error || `MostBox daemon returned ${response.status}`,
        response.status,
        data
      )
    }
    return data
  }

  getPrincipal() {
    return this.request('GET', '/api/mcp/me').then(result => result.client)
  }

  async getNodeStatus() {
    const status = await this.request('GET', '/api/node/status')
    const { holdings = [], ...summary } = status
    return {
      ...summary,
      holdingsSummary: {
        total: holdings.length,
        joined: holdings.filter(item => item.joined).length,
      },
    }
  }

  listFiles() {
    return this.request('GET', '/api/files')
  }

  listHoldings() {
    return this.request('GET', '/api/node/holdings')
  }

  listDownloads() {
    return this.request('GET', '/api/download/tasks')
  }

  checkDownload(input) {
    return this.request('POST', '/api/download/check', input)
  }

  publishLocalFile(input) {
    return this.request('POST', '/api/mcp/publish-local', input)
  }

  startDownload(input) {
    return this.request('POST', '/api/download', {
      ...input,
      background: true,
    })
  }

  cancelDownload(taskId) {
    return this.request('POST', '/api/download/cancel', { taskId })
  }
}
