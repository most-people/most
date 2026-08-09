import { ValidationError } from '../../utils/errors.js'
import { errorJson } from '../errors.js'

function requirePing(engine, id) {
  const ping = engine.getP2PPing(id)
  if (!ping) {
    const error = new Error('P2P Ping not found')
    error.code = 'NOT_FOUND'
    throw error
  }
  return ping
}

export function registerP2PPingRoutes(app, { engine }) {
  app.post('/api/p2p/ping', async c => {
    try {
      let body
      try {
        body = await c.req.json()
      } catch {
        throw new ValidationError('Request body must be valid JSON')
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Request body must be an object')
      }
      const ping = await engine.startP2PPing({
        role: body.role,
        code: body.code,
      })
      return c.json({ success: true, ping }, 202)
    } catch (error) {
      return errorJson(c, error)
    }
  })

  app.get('/api/p2p/ping/:id', c => {
    try {
      return c.json({
        success: true,
        ping: requirePing(engine, c.req.param('id')),
      })
    } catch (error) {
      return errorJson(c, error)
    }
  })

  app.delete('/api/p2p/ping/:id', c => {
    try {
      requirePing(engine, c.req.param('id'))
      return c.json({
        success: true,
        ping: engine.cancelP2PPing(c.req.param('id')),
      })
    } catch (error) {
      return errorJson(c, error)
    }
  })
}
