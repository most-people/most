import { findOpenApiOperation } from '~server/src/http/openapi.js'

export function createOpenApiFetch({
  spec,
  confirmRequest,
  fetchImpl = fetch,
  getRequestHeaders,
}) {
  return async function openApiFetch(input, init) {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const matched = findOpenApiOperation(spec, request.method, url.pathname)

    if (matched?.operation?.['x-mostbox-confirmation'] === true) {
      const confirmed = await confirmRequest({
        method: request.method.toUpperCase(),
        path: url.pathname,
        operationId: matched.operation.operationId,
        summary: matched.operation.summary,
      })
      if (!confirmed) {
        throw new DOMException('Request cancelled by user', 'AbortError')
      }
    }

    const headers = new Headers(request.headers)
    const explicitAuthorization = headers.get('authorization')?.trim()
    const generatedHeaders = await getRequestHeaders(
      request.method,
      url.pathname
    )

    for (const [name, value] of Object.entries(generatedHeaders)) {
      if (name.toLowerCase() === 'authorization' && explicitAuthorization) {
        continue
      }
      headers.set(name, value)
    }

    return fetchImpl(new Request(request, { headers }))
  }
}
