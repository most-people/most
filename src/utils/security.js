import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

import { MAX_FILE_SIZE } from '../config.js'

const DANGEROUS_CHARS = /[<>:"|?*\x00-\x1f]/g
const DANGEROUS_PREFIXES = /^[\s.]+|[\s.]+$/
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * 清理文件名以防止安全问题
 * @param {string} filename - 原始文件名
 * @returns {string} - 清理后的文件名
 */
export function sanitizeFilename(filename) {
  if (typeof filename !== 'string') {
    throw new Error('Filename must be a string')
  }
  
  let sanitized = filename
  
  // 将反斜杠规范化为正斜杠（S3 风格路径）
  sanitized = sanitized.replace(/\\/g, '/')
  
  // 移除危险字符但保留 / 以支持文件夹路径
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_')
  
  // 移除危险前缀/后缀
  sanitized = sanitized.replace(DANGEROUS_PREFIXES, '')
  
  // 防止路径遍历
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '_')
  }
  
  // 规范多个连续斜杠
  sanitized = sanitized.replace(/\/{2,}/g, '/')
  
  // 移除首尾斜杠
  sanitized = sanitized.replace(/^\/+|\/+$/g, '')
  
  // 单独清理每个路径段
  const segments = sanitized.split('/')
  const safeSegments = segments.map(seg => {
    let safe = seg.replace(/[<>:"|?*]/g, '_')
    const baseName = safe.replace(/\.[^.]+$/, '')
    if (RESERVED_NAMES.test(baseName)) {
      safe = '_' + safe
    }
    return safe.substring(0, 255) || 'unnamed'
  })
  
  sanitized = safeSegments.join('/')
  
  return sanitized || 'unnamed_file'
}

/**
 * 验证并清理文件路径以防止路径遍历攻击
 * @param {string} inputPath - 用户输入路径
 * @param {object} options - 验证选项
 * @param {string} [options.allowedBase] - 路径必须在的基础目录（可选）
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
    if (resolvedPath !== allowedBase && !resolvedPath.startsWith(allowedBase + path.sep)) {
      return { cleanPath: '', error: 'Path must be within allowed directory' }
    }
  }
  
  return { cleanPath }
}

/**
 * 检查文件大小是否在限制内
 * @param {string} filePath - 文件路径
 * @param {number} [maxSize] - 最大允许大小（字节，默认 100GB）
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
 * 检查目录是否可写
 * @param {string} dirPath - 要检查的目录路径
 * @returns {{ writable: boolean, error?: string }}
 */
export async function checkDirectoryWritable(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    
    const testFile = path.join(dirPath, `.write-test-${crypto.randomUUID()}`)
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
 * 获取人类可读的文件大小字符串
 * @param {number} bytes - 字节大小
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

