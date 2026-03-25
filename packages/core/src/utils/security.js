import path from 'node:path'
import fs from 'node:fs'

import { MAX_FILE_SIZE } from '../config.js'

const DANGEROUS_CHARS = /[<>:"|?*\x00-\x1f]/g
const DANGEROUS_PREFIXES = /^[\s.]+|[\s.]+$/
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * Sanitize filename to prevent security issues
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (typeof filename !== 'string') {
    throw new Error('Filename must be a string')
  }
  
  let sanitized = filename
  
  sanitized = sanitized.replace(DANGEROUS_CHARS, '_')
  
  sanitized = sanitized.replace(/[\/\\]/g, '_')
  
  sanitized = sanitized.replace(DANGEROUS_PREFIXES, '')
  
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_')
  
  const baseName = sanitized.replace(/\.[^.]+$/, '')
  if (RESERVED_NAMES.test(baseName)) {
    sanitized = '_' + sanitized
  }
  
  sanitized = sanitized.substring(0, 255)
  
  return sanitized || 'unnamed_file'
}

/**
 * Validate and sanitize file path to prevent path traversal attacks
 * @param {string} inputPath - User input path
 * @param {object} options - Validation options
 * @param {string} [options.allowedBase] - Base directory that paths must be within (optional)
 * @returns {{ cleanPath: string, error?: string }}
 */
export function validateAndSanitizePath(inputPath, options = {}) {
  if (typeof inputPath !== 'string') {
    return { cleanPath: '', error: 'Path must be a string' }
  }
  
  let cleanPath = inputPath
  
  cleanPath = cleanPath.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '')
  
  cleanPath = cleanPath.replace(/"/g, '').trim()
  
  const pathTraversalPattern = /\.\./
  if (pathTraversalPattern.test(cleanPath)) {
    return { cleanPath: '', error: 'Path traversal detected: path cannot contain ".."' }
  }
  
  cleanPath = path.normalize(cleanPath)
  
  if (options.allowedBase) {
    const resolvedPath = path.resolve(cleanPath)
    const allowedBase = path.resolve(options.allowedBase)
    if (!resolvedPath.startsWith(allowedBase)) {
      return { cleanPath: '', error: 'Path must be within allowed directory' }
    }
  }
  
  return { cleanPath }
}

/**
 * Check if file size is within limits
 * @param {string} filePath - Path to file
 * @param {number} [maxSize] - Maximum allowed size in bytes (default: 100GB)
 * @returns {{ valid: boolean, size?: number, error?: string }}
 */
export async function validateFileSize(filePath, maxSize = MAX_FILE_SIZE) {
  try {
    const stats = await fs.promises.stat(filePath)
    const size = stats.size
    
    if (!stats.isFile()) {
      return { valid: false, error: 'Path is not a file' }
    }
    
    if (size > maxSize) {
      const maxGB = Math.round(maxSize / (1024 * 1024 * 1024))
      return { 
        valid: false, 
        size, 
        error: `File size exceeds limit of ${maxGB} GB` 
      }
    }
    
    return { valid: true, size }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { valid: false, error: 'File does not exist' }
    }
    return { valid: false, error: `Failed to check file size: ${err.message}` }
  }
}

/**
 * Check if directory is writable
 * @param {string} dirPath - Directory path to check
 * @returns {{ writable: boolean, error?: string }}
 */
export async function checkDirectoryWritable(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    
    const testFile = path.join(dirPath, '.write-test-' + Date.now())
    await fs.promises.writeFile(testFile, 'test')
    await fs.promises.unlink(testFile)
    
    return { writable: true }
  } catch (err) {
    return { 
      writable: false, 
      error: `Cannot write to directory: ${err.message}` 
    }
  }
}

/**
 * Get human-readable file size string
 * @param {number} bytes - Size in bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let size = bytes
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`
}

