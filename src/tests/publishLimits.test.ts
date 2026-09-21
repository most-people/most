import { describe, expect, it } from 'vitest'

import {
  getPublishFileLimitViolation,
  getPublishFileTooLargeMessageFromPayload,
} from '~/lib/publishLimits'

// Echoes the call so tests can assert the formatted params instead of copy.
const t = (_key: string, params?: Record<string, string | number>) =>
  JSON.stringify(params ?? {})

const parseParams = (value: string) =>
  JSON.parse(value) as Record<string, string>

describe('getPublishFileLimitViolation', () => {
  it('allows a file that fits the limit', () => {
    expect(
      getPublishFileLimitViolation(
        { name: 'a.bin', size: 100 },
        { maxFileSizeBytes: 100 },
        t
      )
    ).toBe('')
  })

  it('allows a file exactly at the limit', () => {
    expect(
      getPublishFileLimitViolation(
        { name: 'a.bin', size: 1024 },
        { maxFileSizeBytes: 1024 },
        t
      )
    ).toBe('')
  })

  it('reports a file above the limit with formatted sizes', () => {
    const message = getPublishFileLimitViolation(
      { name: 'movie.mp4', size: 2048 },
      { maxFileSizeBytes: 1024 },
      t
    )

    expect(parseParams(message)).toEqual({
      fileName: 'movie.mp4',
      maxSize: '1 KB',
      fileSize: '2 KB',
    })
  })

  it('treats a missing policy as unlimited', () => {
    expect(
      getPublishFileLimitViolation(
        { name: 'a.bin', size: Number.MAX_SAFE_INTEGER },
        null,
        t
      )
    ).toBe('')
    expect(
      getPublishFileLimitViolation({ name: 'a.bin', size: 100 }, undefined, t)
    ).toBe('')
  })

  it('treats a non-finite or missing limit as unlimited', () => {
    for (const maxFileSizeBytes of [
      Number.NaN,
      -1,
      undefined,
      'nope',
      Number.POSITIVE_INFINITY,
    ]) {
      expect(
        getPublishFileLimitViolation(
          { name: 'a.bin', size: 10 ** 12 },
          { maxFileSizeBytes } as { maxFileSizeBytes?: number | null },
          t
        )
      ).toBe('')
    }
  })

  it('treats an explicit null limit as zero rather than unlimited', () => {
    // `Number(null)` is 0, which is finite and >= 0, so it becomes a real
    // limit that rejects every non-empty file.
    const message = getPublishFileLimitViolation(
      { name: 'a.bin', size: 1 },
      { maxFileSizeBytes: null },
      t
    )
    expect(parseParams(message).maxSize).toBe('0 B')
  })

  it('accepts a zero limit as a real limit', () => {
    const message = getPublishFileLimitViolation(
      { name: 'a.bin', size: 1 },
      { maxFileSizeBytes: 0 },
      t
    )
    expect(parseParams(message).maxSize).toBe('0 B')
  })
})

describe('getPublishFileTooLargeMessageFromPayload', () => {
  it('ignores payloads that are not a file size error', () => {
    expect(
      getPublishFileTooLargeMessageFromPayload({ code: 'VALIDATION_ERROR' }, t)
    ).toBe('')
    expect(getPublishFileTooLargeMessageFromPayload({}, t)).toBe('')
  })

  it('ignores a size error without a usable limit', () => {
    expect(
      getPublishFileTooLargeMessageFromPayload(
        { code: 'FILE_SIZE_ERROR', details: { sizeBytes: 2048 } },
        t
      )
    ).toBe('')
  })

  it('builds the message from payload details', () => {
    const message = getPublishFileTooLargeMessageFromPayload(
      {
        code: 'FILE_SIZE_ERROR',
        details: { sizeBytes: 2048, maxFileSizeBytes: 1024 },
      },
      t
    )

    expect(parseParams(message)).toEqual({
      fileName: '',
      maxSize: '1 KB',
      fileSize: '2 KB',
    })
  })

  it('uses the fallback file name with the payload details', () => {
    const message = getPublishFileTooLargeMessageFromPayload(
      {
        code: 'FILE_SIZE_ERROR',
        details: { sizeBytes: 3145728, maxFileSizeBytes: 1048576 },
      },
      t,
      'clip.mp4'
    )

    expect(parseParams(message)).toEqual({
      fileName: 'clip.mp4',
      maxSize: '1 MB',
      fileSize: '3 MB',
    })
  })

  it('falls back to "0 B" for a missing size', () => {
    const message = getPublishFileTooLargeMessageFromPayload(
      { code: 'FILE_SIZE_ERROR', details: { maxFileSizeBytes: 1024 } },
      t
    )

    expect(parseParams(message).fileSize).toBe('0 B')
  })
})
