import assert from 'node:assert/strict'
import test from 'node:test'
import { LOCALES } from './locales'
import { messageDefinitions, messages } from './messages'
import { translateMessage } from './translate'

test('all supported locales define every message', () => {
  const keys = Object.keys(messageDefinitions)

  assert.deepEqual(LOCALES, ['zh-CN', 'zh-TW', 'en'])
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(messages[locale]), keys)
    for (const key of keys) {
      assert.ok(messages[locale][key as keyof (typeof messages)[typeof locale]])
    }
  }
})

test('message interpolation uses the selected locale', () => {
  assert.equal(
    translateMessage('node.fileCount', 'zh-TW', { count: 2 }),
    '2 個檔案'
  )
  assert.equal(
    translateMessage('app.node.openStatus', 'en', { status: 'Online' }),
    'Online. View node status'
  )
  assert.equal(
    translateMessage('node.fileCount.one', 'en', { count: 1 }),
    '1 file'
  )
})

test('simplified Chinese remains the default presentation locale', () => {
  assert.equal(translateMessage('nav.knowledge'), '知识库')
  assert.equal(translateMessage('node.knowledge.restore'), '还原')
  assert.equal(translateMessage('node.seed.queued'), '队列中')
  assert.equal(translateMessage('node.seed.error'), '错误')
  assert.equal(translateMessage('files.section.library'), '文件库')
  assert.equal(
    translateMessage('files.action.downloadToLibrary'),
    '下载到文件库'
  )
  assert.equal(translateMessage('files.folder.type'), '文件夹')
  assert.equal(translateMessage('node.metric.remoteFiles'), '远程文件')
})
