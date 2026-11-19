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
      }
      if (Object.prototype.hasOwnProperty.call(body, 'avatar')) {
        channelOptions.avatar = body.avatar
      }
      if (Object.prototype.hasOwnProperty.call(body, 'tag')) {
        channelOptions.tag = body.tag
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

  app.get('/api/channels/:name/history', async c => {
    try {
      const page = await engine.getChannelHistory(c.req.param('name'), {
        limit: c.req.query('limit'),
        before: c.req.query('before'),
        ownerAddress: c.get('userAddress'),
      })
      return c.json(page)
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.post('/api/channels/:name/messages', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    const signed = body?.signed
    if (!signed || typeof signed !== 'object' || Array.isArray(signed)) {
      return c.json({ error: 'signed message is required' }, 400)
    }
    if (signed.body?.author !== c.get('userAddress')) {
      return c.json({ error: 'message author must match logged-in user' }, 403)
    }
    try {
      const message = await engine.sendMessage(name, signed, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, message })
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.get('/api/channels/:name/member-profiles', c => {
    try {
      return c.json(
        engine.getChannelMemberProfiles(c.req.param('name'), {
          ownerAddress: c.get('userAddress'),
        })
      )
    } catch (err) {
      return badRequestOrAppError(c, err)
    }
  })

  app.post('/api/channels/:name/member-profile', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    const signed = body?.signed
    if (!signed || typeof signed !== 'object' || Array.isArray(signed)) {
      return c.json({ error: 'signed profile is required' }, 400)
    }
    if (signed.body?.author !== c.get('userAddress')) {
      return c.json(
        { error: 'member profile author must match logged-in user' },
        403
      )
    }
    try {
      const result = await engine.updateChannelMemberProfile(name, signed, {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, ...result })
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

  app.get('/api/channels/:name/presence', c => {
    try {
      return c.json(
        engine.getChannelPresence(c.req.param('name'), {
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

  app.put('/api/channels/:name/fold', async c => {
    const name = c.req.param('name')
    const body = await c.req.json()
    try {
      const folded = engine.setChannelFolded(name, Boolean(body.folded), {
        ownerAddress: c.get('userAddress'),
      })
      return c.json({ success: true, folded })
    } catch (err) {
      return c.json({ error: err.message }, 400)
    }
  })
}
