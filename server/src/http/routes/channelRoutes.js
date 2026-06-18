import { normalizeAddress } from '../../utils/auth.js'
import { badRequestOrAppError } from '../errors.js'

export function registerChannelRoutes(app, { engine }) {
  app.post('/api/channels', async c => {
    const body = await c.req.json()
    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'name is required' }, 400)
    }
    try {
      const channelOptions = {
        ownerAddress: c.get('userAddress'),
        displayName: body.displayName,
        discover: true,
      }
      if (Object.prototype.hasOwnProperty.call(body, 'avatar')) {
        channelOptions.avatar = body.avatar
      }
      const result = await engine.createChannel(
        body.name.trim(),
        body.type || 'personal',
        channelOptions
      )
      return c.json({ success: true, ...result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.get('/api/channels', c => {
    return c.json(
      engine.listChannels({
        ownerAddress: c.get('userAddress'),
        type: c.req.query('type'),
      })
    )
  })

  const leaveChannelForRequest = async (c, channelIdentifier) => {
    const name = String(channelIdentifier || '').trim()
    if (!name) {
      return c.json({ error: '频道标识不能为空' }, 400)
    }
    try {
      const result = await engine.leaveChannel(name, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, channels: result })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  }

  app.delete('/api/channels', async c => {
    const body = await c.req.json().catch(() => ({}))
    return leaveChannelForRequest(c, body.channelKey || body.name)
  })

  app.get('/api/channels/:name/messages', async c => {
    const name = c.req.param('name')
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    try {
      const messages = await engine.getChannelMessages(name, {
        limit,
        offset,
        ownerAddress: c.get('userAddress'),
      })
      return c.json(messages)
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.post('/api/channels/:name/messages', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    if (!body.content || !body.content.trim()) {
      return c.json({ error: 'content is required' }, 400)
    }
    if (!body.author || !body.authorName) {
      return c.json({ error: 'author and authorName are required' }, 400)
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.author)) {
      return c.json({ error: 'Invalid author format' }, 400)
    }
    if (normalizeAddress(body.author) !== c.get('userAddress')) {
      return c.json({ error: 'message author must match logged-in user' }, 403)
    }
    if (body.authorName.length > 50) {
      return c.json({ error: 'authorName too long' }, 400)
    }
    try {
      const messageOptions = {
        ownerAddress: c.get('userAddress'),
        attachment: body.attachment,
      }
      if (Object.prototype.hasOwnProperty.call(body, 'avatar')) {
        messageOptions.avatar = body.avatar
      }
      const message = await engine.sendMessage(
        name,
        body.content,
        body.author,
        body.authorName,
        messageOptions
      )
      return c.json({ success: true, message })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.get('/api/channels/:name/peers', c => {
    try {
      return c.json(
        engine.getChannelPeers(c.req.param('name'), {
          ownerAddress: c.get('userAddress'),
        })
      )
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.put('/api/channels/:name/remark', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    try {
      const remark = engine.setChannelRemark(name, body.remark, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, remark })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })

  app.put('/api/channels/:name/pin', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    try {
      const pinned = engine.setChannelPinned(name, Boolean(body.pinned), {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, pinned })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })
}
