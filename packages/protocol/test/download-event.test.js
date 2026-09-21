import { describe, expect, it } from 'vitest'

import {
  normalizeDownloadErrorPayload,
  parseDownloadEvent,
} from '../src/download-event.js'

/**
 * Behavior-preservation suite.
 *
 * These expectations were captured from the original implementation in
 * `src/lib/downloadTasks.ts` before the parser moved into this package. They
 * pin the exact output shape, including omitted keys, so a refactor cannot
 * silently change what clients see.
 */
describe('parseDownloadEvent golden shape', () => {
  it('keeps only the typed keys and always includes the path arrays', () => {
    const parsed = parseDownloadEvent(
      JSON.stringify({
        event: 'download:progress',
        data: {
          taskId: 't1',
          collection: true,
          completedFiles: 2,
          totalFiles: 4,
          percent: 50,
        },
      })
    )

    expect(parsed).toEqual({
      event: 'download:progress',
      payload: {
        taskId: 't1',
        collection: true,
        percent: 50,
        completedFiles: 2,
        totalFiles: 4,
        downloadedPaths: [],
        unavailablePaths: [],
      },
    })
    // `toEqual` ignores undefined values, so pin the exact key set: the parser
    // always materializes every field, and clients may rely on the shape.
    expect(Object.keys(parsed.payload).sort()).toEqual([
      'code',
      'collection',
      'completedFiles',
      'details',
      'downloadedFileCount',
      'downloadedPaths',
      'error',
      'errorCode',
      'file',
      'fileCount',
      'fileName',
      'kind',
      'loaded',
      'partial',
      'percent',
      'processedFiles',
      'selectedFileCount',
      'stage',
      'status',
      'taskId',
      'total',
      'totalFiles',
      'unavailableFileCount',
      'unavailablePaths',
    ])
  })

  it('drops every field whose runtime type is wrong', () => {
    const parsed = parseDownloadEvent(
      JSON.stringify({
        event: 'download:progress',
        data: { taskId: 7, percent: '42', loaded: null, collection: 'yes' },
      })
    )

    expect(parsed).toEqual({
      event: 'download:progress',
      payload: { downloadedPaths: [], unavailablePaths: [] },
    })
  })

  it('extracts path lists from the files and unavailableFiles arrays', () => {
    const parsed = parseDownloadEvent(
      JSON.stringify({
        event: 'download:success',
        data: {
          files: [{ path: 'a.bin' }, { nope: true }, null],
          unavailableFiles: [{ path: 'c.bin' }],
        },
      })
    )

    expect(parsed).toEqual({
      event: 'download:success',
      payload: {
        downloadedPaths: ['a.bin'],
        unavailablePaths: ['c.bin'],
      },
    })
  })

  it('normalizes nested error details', () => {
    const parsed = parseDownloadEvent(
      JSON.stringify({
        event: 'download:error',
        data: {
          code: 'X',
          errorCode: 'x',
          error: 'boom',
          details: { kind: 'collection', childPath: 'p' },
        },
      })
    )

    expect(parsed).toEqual({
      event: 'download:error',
      payload: {
        code: 'X',
        errorCode: 'x',
        error: 'boom',
        downloadedPaths: [],
        unavailablePaths: [],
        details: { kind: 'collection', childPath: 'p' },
      },
    })
  })

  it('ignores array or primitive details', () => {
    const fromArray = parseDownloadEvent(
      JSON.stringify({ event: 'download:error', data: { details: [] } })
    )
    expect(fromArray.payload.details).toBeUndefined()

    const fromString = parseDownloadEvent(
      JSON.stringify({ event: 'download:error', data: { details: 'boom' } })
    )
    expect(fromString.payload.details).toBeUndefined()
  })

  it('rejects every malformed envelope', () => {
    for (const raw of [
      'not json',
      '',
      '{',
      'null',
      '42',
      '"text"',
      '[]',
      JSON.stringify({ data: {} }),
      JSON.stringify({ event: 1, data: {} }),
      JSON.stringify({ event: 'download:status' }),
      JSON.stringify({ event: 'download:status', data: null }),
      JSON.stringify({ event: 'download:status', data: 'x' }),
    ]) {
      expect(parseDownloadEvent(raw)).toBeNull()
    }
  })

  it('returns unknown event names so callers can filter', () => {
    const parsed = parseDownloadEvent(
      JSON.stringify({ event: 'publish:success', data: { taskId: 't1' } })
    )
    expect(parsed?.event).toBe('publish:success')
    expect(parsed?.payload.taskId).toBe('t1')
  })
})

describe('normalizeDownloadErrorPayload golden shape', () => {
  it('returns an empty payload for non-object input', () => {
    expect(normalizeDownloadErrorPayload(null)).toEqual({})
    expect(normalizeDownloadErrorPayload([])).toEqual({})
    expect(normalizeDownloadErrorPayload('boom')).toEqual({})
  })

  it('keeps only the error fields', () => {
    expect(
      normalizeDownloadErrorPayload({
        code: 'C',
        error: 'e',
        taskId: 'ignored',
      })
    ).toEqual({ code: 'C', error: 'e' })
  })
})
