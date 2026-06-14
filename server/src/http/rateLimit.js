const DEFAULT_RATE_LIMIT_WINDOW = 60 * 1000
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120

export function createRateLimitMiddleware({
  windowMs = DEFAULT_RATE_LIMIT_WINDOW,
  maxRequests = DEFAULT_RATE_LIMIT_MAX_REQUESTS,
} = {}) {
  const rateLimitMap = new Map()

  function checkRateLimit(clientIp) {
    const now = Date.now()
    if (!rateLimitMap.has(clientIp)) {
      rateLimitMap.set(clientIp, [])
    }
    const requests = rateLimitMap.get(clientIp)
    while (requests.length > 0 && requests[0] < now - windowMs) {
      requests.shift()
    }
    if (requests.length === 0) {
      rateLimitMap.delete(clientIp)
    }
    if (requests.length >= maxRequests) {
      return false
    }
    requests.push(now)
    return true
  }

  return async (c, next) => {
    const clientIp =
      c.req.header('x-forwarded-for') ||
      c.env?.incoming?.socket?.remoteAddress ||
      'unknown'
    if (!checkRateLimit(clientIp)) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    await next()
  }
}
