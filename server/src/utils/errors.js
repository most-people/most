/**
 * Custom Error Classes
 * Helps categorize errors for better frontend handling
 */

export class AppError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export class ValidationError extends AppError {
  constructor(message, errorCode = '', details = undefined) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    if (errorCode) this.errorCode = errorCode
    if (details) this.details = details
  }
}

export class FileSizeError extends AppError {
  constructor(message, size) {
    super(message, 'FILE_SIZE_ERROR')
    this.name = 'FileSizeError'
    this.size = size
  }
}

export class PathSecurityError extends AppError {
  constructor(message = 'Path validation failed') {
    super(message, 'PATH_SECURITY_ERROR')
    this.name = 'PathSecurityError'
  }
}

export class PeerNotFoundError extends AppError {
  constructor(
    message = 'No peers found. Please ensure the publisher is online.'
  ) {
    super(message, 'PEER_NOT_FOUND')
    this.name = 'PeerNotFoundError'
  }
}

export class IntegrityError extends AppError {
  constructor(
    message = 'File integrity check failed. File may be corrupted or tampered.'
  ) {
    super(message, 'INTEGRITY_ERROR')
    this.name = 'IntegrityError'
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 'PERMISSION_ERROR')
    this.name = 'PermissionError'
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 'CONFLICT')
    this.name = 'ConflictError'
  }
}

export class StorageCapacityError extends AppError {
  constructor(message = 'Storage capacity exceeded') {
    super(message, 'STORAGE_CAPACITY_ERROR')
    this.name = 'StorageCapacityError'
  }
}

export class EngineNotInitializedError extends AppError {
  constructor(message = 'Engine not initialized. Call start() first.') {
    super(message, 'ENGINE_NOT_INITIALIZED')
    this.name = 'EngineNotInitializedError'
  }
}

export function isErrorWithCode(err, code) {
  return err && err.code === code
}
