import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { runFeedbackAction } from './feedbackModel'

test('feedback actions dismiss before running the selected callback', () => {
  const events: string[] = []
  runFeedbackAction(
    () => events.push('dismiss'),
    () => events.push('confirm')
  )
  assert.deepEqual(events, ['dismiss', 'confirm'])
})

test('mobile production code does not call the unsupported Alert.alert API', async () => {
  const sourceRoot = path.resolve('src')
  const files = await collectSourceFiles(sourceRoot)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.equal(source.includes('Alert.alert('), false, file)
  }
})

test('native toast feedback uses the non-modal layer', async () => {
  const [feedbackSource, nativeLayerSource] = await Promise.all([
    readFile(path.resolve('src/ui/feedback.tsx'), 'utf8'),
    readFile(path.resolve('src/ui/FeedbackLayer.tsx'), 'utf8'),
  ])

  assert.equal(feedbackSource.includes('modal={false}'), true)
  assert.equal(nativeLayerSource.includes('if (!modal)'), true)
  assert.equal(nativeLayerSource.includes('<Modal'), true)
})

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(target)
      if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.test.ts')) {
        return []
      }
      return [target]
    })
  )
  return files.flat()
}
