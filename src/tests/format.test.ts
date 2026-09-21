import { describe, expect, it } from 'vitest'

import { formatBytes, formatMegabytes, shortAddress } from '~/lib/format'

describe('formatBytes', () => {
  it('renders zero and invalid input as "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  it('renders raw bytes below 1 KiB', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('renders kilobytes with one digit', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB')
  })

  it('renders megabytes with one digit', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })

  it('renders gigabytes with two digits', () => {
    expect(formatBytes(1024 ** 3)).toBe('1 GB')
    expect(formatBytes(1024 ** 3 * 1.25)).toBe('1.25 GB')
  })

  it('keeps trailing zeros off the formatted value', () => {
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1024 ** 3 * 2)).toBe('2 GB')
  })
})

describe('formatMegabytes', () => {
  it('returns an empty string for zero and invalid input', () => {
    expect(formatMegabytes(0)).toBe('')
    expect(formatMegabytes(-1)).toBe('')
    expect(formatMegabytes(undefined)).toBe('')
    expect(formatMegabytes(Number.NaN)).toBe('')
  })

  it('renders one digit below 100 MB', () => {
    expect(formatMegabytes(1024 * 1024)).toBe('1 MB')
    expect(formatMegabytes(1024 * 1024 * 99)).toBe('99 MB')
  })

  it('renders no digits at 100 MB and above', () => {
    expect(formatMegabytes(1024 * 1024 * 100)).toBe('100 MB')
    expect(formatMegabytes(1024 * 1024 * 150.4)).toBe('150 MB')
  })
})

describe('shortAddress', () => {
  it('returns short values unchanged', () => {
    expect(shortAddress('')).toBe('')
    expect(shortAddress(undefined)).toBe('')
    expect(shortAddress('0x12345678')).toBe('0x12345678')
  })

  it('truncates values longer than ten characters', () => {
    expect(shortAddress('0x1234567890abcdef')).toBe('0x1234...cdef')
  })

  it('keeps a ten character value intact', () => {
    expect(shortAddress('0123456789')).toBe('0123456789')
  })
})
