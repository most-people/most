import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  AppError,
  ValidationError,
  FileSizeError,
  PathSecurityError,
  PeerNotFoundError,
  IntegrityError,
  PermissionError,
  EngineNotInitializedError,
  isErrorWithCode
} from '../../src/utils/errors.js'

describe('AppError', () => {
  it('creates error with message and code', () => {
    const err = new AppError('test message', 'TEST_CODE')
    assert.strictEqual(err.message, 'test message')
    assert.strictEqual(err.code, 'TEST_CODE')
    assert.strictEqual(err.name, 'AppError')
  })

  it('defaults code to UNKNOWN', () => {
    const err = new AppError('test')
    assert.strictEqual(err.code, 'UNKNOWN')
  })

  it('is instanceof Error', () => {
    const err = new AppError('test', 'TEST')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof AppError)
  })
})

describe('ValidationError', () => {
  it('has VALIDATION_ERROR code', () => {
    const err = new ValidationError('invalid input')
    assert.strictEqual(err.code, 'VALIDATION_ERROR')
    assert.strictEqual(err.name, 'ValidationError')
    assert.strictEqual(err.message, 'invalid input')
  })

  it('is instanceof AppError', () => {
    const err = new ValidationError('test')
    assert.ok(err instanceof AppError)
  })
})

describe('FileSizeError', () => {
  it('has FILE_SIZE_ERROR code', () => {
    const err = new FileSizeError('file too large', 999999)
    assert.strictEqual(err.code, 'FILE_SIZE_ERROR')
    assert.strictEqual(err.name, 'FileSizeError')
    assert.strictEqual(err.message, 'file too large')
    assert.strictEqual(err.size, 999999)
  })

  it('can be created without size', () => {
    const err = new FileSizeError('file too large')
    assert.strictEqual(err.size, undefined)
  })
})

describe('PathSecurityError', () => {
  it('has PATH_SECURITY_ERROR code', () => {
    const err = new PathSecurityError('path traversal')
    assert.strictEqual(err.code, 'PATH_SECURITY_ERROR')
    assert.strictEqual(err.name, 'PathSecurityError')
    assert.strictEqual(err.message, 'path traversal')
  })

  it('has default message', () => {
    const err = new PathSecurityError()
    assert.strictEqual(err.message, 'Path validation failed')
  })
})

describe('PeerNotFoundError', () => {
  it('has PEER_NOT_FOUND code', () => {
    const err = new PeerNotFoundError('no peers')
    assert.strictEqual(err.code, 'PEER_NOT_FOUND')
    assert.strictEqual(err.name, 'PeerNotFoundError')
  })

  it('has default message about publisher', () => {
    const err = new PeerNotFoundError()
    assert.ok(err.message.includes('publisher'))
  })
})

describe('IntegrityError', () => {
  it('has INTEGRITY_ERROR code', () => {
    const err = new IntegrityError('mismatch')
    assert.strictEqual(err.code, 'INTEGRITY_ERROR')
    assert.strictEqual(err.name, 'IntegrityError')
  })

  it('has default message about corruption', () => {
    const err = new IntegrityError()
    assert.ok(err.message.includes('corrupted') || err.message.includes('tampered'))
  })
})

describe('PermissionError', () => {
  it('has PERMISSION_ERROR code', () => {
    const err = new PermissionError('access denied')
    assert.strictEqual(err.code, 'PERMISSION_ERROR')
    assert.strictEqual(err.name, 'PermissionError')
  })

  it('has default message', () => {
    const err = new PermissionError()
    assert.strictEqual(err.message, 'Permission denied')
  })
})

describe('EngineNotInitializedError', () => {
  it('has ENGINE_NOT_INITIALIZED code', () => {
    const err = new EngineNotInitializedError()
    assert.strictEqual(err.code, 'ENGINE_NOT_INITIALIZED')
    assert.strictEqual(err.name, 'EngineNotInitializedError')
  })

  it('has default message about start()', () => {
    const err = new EngineNotInitializedError()
    assert.ok(err.message.includes('start()'))
  })
})

describe('isErrorWithCode', () => {
  it('returns true for matching code', () => {
    const err = new ValidationError('test')
    assert.strictEqual(isErrorWithCode(err, 'VALIDATION_ERROR'), true)
  })

  it('returns false for non-matching code', () => {
    const err = new ValidationError('test')
    assert.strictEqual(isErrorWithCode(err, 'WRONG_CODE'), false)
  })

  it('returns falsy for null/undefined', () => {
    assert.ok(!isErrorWithCode(null, 'CODE'))
    assert.ok(!isErrorWithCode(undefined, 'CODE'))
    assert.ok(!isErrorWithCode({}, 'CODE'))
  })

  it('works with any error-like object', () => {
    const err = { code: 'CUSTOM_CODE', message: 'test' }
    assert.strictEqual(isErrorWithCode(err, 'CUSTOM_CODE'), true)
  })
})