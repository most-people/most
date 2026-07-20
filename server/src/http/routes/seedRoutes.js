import { errorJson } from '../errors.js'

export function registerSeedRoutes(
  app,
  { engine, appendNodeLog, broadcastNodeStatus }
) {
  app.get('/api/node/holdings', c => {
    try {
      return c.json(engine.listHoldings())
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/node/holdings', async c => {
    try {
      const body = await c.req.json()
      const holding = await engine.addHolding(body)
      appendNodeLog({
        event: 'node:holding:added',
        message: 'Node holding added',
        data: { cid: holding.cid, size: holding.size },
      })
      await broadcastNodeStatus()
      return c.json({ success: true, holding })
    } catch (err) {
      return errorJson(c, err)
    }
  })

  app.post('/api/p2p/pull', async c => {
    try {
      const body = await c.req.json()
      const timeout =
        body.timeout === undefined ? undefined : Number(body.timeout)
      const result = await engine.pullByCid({
        ...body,
        ownerAddress: c.get('userAddress'),
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
      })
      appendNodeLog({
        event: 'node:pull:success',
        message: 'P2P pull completed',
        data: { cid: result.cid, taskId: result.taskId },
      })
      await broadcastNodeStatus()
      return c.json({ success: true, ...result })
    } catch (err) {
      appendNodeLog({
        level: 'error',
        event: 'node:pull:error',
        message: err.message,
        data: { code: err.code || 'UNKNOWN' },
      })
      return errorJson(c, err)
    }
  })
}
