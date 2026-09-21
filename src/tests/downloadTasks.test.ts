import { describe, expect, it } from 'vitest'

import {
  excludeTerminalDownloadTasks,
  parseDownloadEvent,
  type ActiveDownloadTask,
  type DownloadTaskOutcome,
} from '~/lib/downloadTasks'
import { parseDownloadEvent as parseSharedDownloadEvent } from '@most-box/protocol/download-event'

describe('web download task model', () => {
  const task = (taskId: string): ActiveDownloadTask => ({
    taskId,
    cid: `cid-${taskId}`,
    fileName: `${taskId}.bin`,
    kind: 'file',
    status: 'downloading',
    progress: 10,
    loadedBytes: 1,
    totalBytes: 10,
    completedFiles: 0,
    totalFiles: 1,
    startedAt: 1,
    updatedAt: 2,
  })

  const outcome = (taskId: string): DownloadTaskOutcome => ({
    taskId,
    cid: `cid-${taskId}`,
    fileName: `${taskId}.bin`,
    kind: 'file',
    status: 'completed',
    payload: {},
    finishedAt: 3,
  })

  it('drops tasks that already have an outcome', () => {
    const result = excludeTerminalDownloadTasks(
      [task('a'), task('b')],
      [outcome('a')]
    )
    expect(result.map(item => item.taskId)).toEqual(['b'])
  })

  it('keeps every task when there are no outcomes', () => {
    expect(excludeTerminalDownloadTasks([task('a')], []).length).toBe(1)
  })

  it('returns an empty list when every task has an outcome', () => {
    expect(
      excludeTerminalDownloadTasks([task('a')], [outcome('a'), outcome('b')])
    ).toEqual([])
  })

  it('does not mutate the input list', () => {
    const tasks = [task('a'), task('b')]
    excludeTerminalDownloadTasks(tasks, [outcome('a')])
    expect(tasks.length).toBe(2)
  })
})

describe('shared parser wiring', () => {
  it('re-exports the shared parser instead of duplicating it', () => {
    // Same function identity proves the web module delegates to the package
    // rather than carrying a second implementation.
    expect(parseDownloadEvent).toBe(parseSharedDownloadEvent)
  })

  it('parses a daemon payload through the web import path', () => {
    const parsed = parseDownloadEvent(
      JSON.stringify({
        event: 'download:progress',
        data: { taskId: 't1', percent: 25 },
      })
    )
    expect(parsed?.event).toBe('download:progress')
    expect(parsed?.payload.percent).toBe(25)
  })
})
