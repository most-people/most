import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

async function importBurstDebounce() {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/burstDebounce.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
}

test('collapses a burst into one trailing run', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { createBurstDebounce } = await importBurstDebounce()
  let runs = 0
  const trigger = createBurstDebounce(() => runs++, 500, 3000)

  for (let i = 0; i < 10; i++) {
    trigger()
    context.mock.timers.tick(40)
  }
  assert.equal(runs, 0)
  context.mock.timers.tick(500)
  assert.equal(runs, 1)
})

test('still runs at least every maxWait during a long burst', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { createBurstDebounce } = await importBurstDebounce()
  let runs = 0
  const trigger = createBurstDebounce(() => runs++, 500, 3000)

  // 828 events 40 ms apart, like the account-sync burst seen on a test node.
  for (let i = 0; i < 828; i++) {
    trigger()
    context.mock.timers.tick(40)
  }
  context.mock.timers.tick(500)
  assert.ok(runs >= 11 && runs <= 13, `runs=${runs}`)
})

test('cancel drops a pending run', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { createBurstDebounce } = await importBurstDebounce()
  let runs = 0
  const trigger = createBurstDebounce(() => runs++, 500, 3000)

  trigger()
  trigger.cancel()
  context.mock.timers.tick(5000)
  assert.equal(runs, 0)
})
