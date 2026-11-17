import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function importMessageTimeModule() {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/messageTime.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  const source = result.outputFiles[0].text
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  )
}

const now = new Date(2026, 10, 17, 9, 30)

test('formats message time by calendar day', async () => {
  const { formatMessageTime } = await importMessageTimeModule()
  const format = value => formatMessageTime(value, 'zh-CN', '昨天', now)

  assert.equal(format(new Date(2026, 10, 17, 0, 5)), '00:05')
  assert.equal(format(new Date(2026, 10, 16, 23, 59)), '昨天 23:59')
  assert.equal(format(new Date(2026, 10, 16, 0, 0)), '昨天 00:00')
  assert.equal(format(new Date(2026, 10, 15, 14, 9)), '11月15日 14:09')
  assert.equal(format(new Date(2026, 0, 1, 8, 0)), '1月1日 08:00')
  assert.equal(format(new Date(2025, 10, 3, 14, 9)), '2025年11月3日 14:09')
  assert.equal(format(new Date(2026, 10, 18, 10, 0)), '11月18日 10:00')
  assert.equal(format('not a date'), '')
})

test('treats Dec 31 as yesterday on Jan 1', async () => {
  const { formatMessageTime } = await importMessageTimeModule()
  assert.equal(
    formatMessageTime(
      new Date(2025, 11, 31, 22, 0),
      'zh-CN',
      '昨天',
      new Date(2026, 0, 1, 8, 0)
    ),
    '昨天 22:00'
  )
})

test('localizes dates for English', async () => {
  const { formatMessageTime } = await importMessageTimeModule()
  const format = value => formatMessageTime(value, 'en', 'Yesterday', now)

  assert.equal(format(new Date(2026, 10, 16, 14, 9)), 'Yesterday 02:09 PM')
  assert.equal(format(new Date(2026, 10, 3, 14, 9)), 'Nov 3 02:09 PM')
  assert.equal(format(new Date(2025, 10, 3, 14, 9)), 'Nov 3, 2025 02:09 PM')
})
