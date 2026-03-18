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
  constructor(message) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class FileNotFoundError extends AppError {
  constructor(message = 'File not found') {
    super(message, 'FILE_NOT_FOUND')
    this.name = 'FileNotFoundError'
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

export class NetworkError extends AppError {
  constructor(message = 'Network error') {
    super(message, 'NETWORK_ERROR')
    this.name = 'NetworkError'
  }
}

export class PeerNotFoundError extends AppError {
  constructor(message = 'No peers found. Please ensure the publisher is online.') {
    super(message, 'PEER_NOT_FOUND')
    this.name = 'PeerNotFoundError'
  }
}

export class IntegrityError extends AppError {
  constructor(message = 'File integrity check failed. File may be corrupted or tampered.') {
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

export function isErrorWithCode(err, code) {
  return err && err.code === code
}

export function toPlainError(err) {
  return {
    message: err.message || 'Unknown error',
    code: err.code || 'UNKNOWN',
    name: err.name || 'Error'
  }
}