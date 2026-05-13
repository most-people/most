import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_MAX_LOG_LINES = 1000

export function createNodeLogger(configDir, options = {}) {
  const maxLines = options.maxLines || DEFAULT_MAX_LOG_LINES
  const logFile = options.logFile || path.join(configDir, 'node-events.log')

  function append(input = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      level: input.level || 'info',
      event: input.event || 'node:event',
      message: input.message || input.event || 'Node event',
      data: input.data || {},
    }

    try {
      const logDir = path.dirname(logFile)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf-8')
      trimLogFile()
    } catch (err) {
      console.warn('[NodeLog] Failed to append:', err.message)
    }

    return entry
  }

  function list(limit = 100) {
    try {
      if (!fs.existsSync(logFile)) return []
      const lines = fs
        .readFileSync(logFile, 'utf-8')
        .split('\n')
        .filter(Boolean)
      return lines
        .slice(-Math.max(1, Math.min(Number(limit) || 100, maxLines)))
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .reverse()
    } catch (err) {
      console.warn('[NodeLog] Failed to read:', err.message)
      return []
    }
  }

  function clear() {
    try {
      const logDir = path.dirname(logFile)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      fs.writeFileSync(logFile, '', 'utf-8')
      return true
    } catch (err) {
      console.warn('[NodeLog] Failed to clear:', err.message)
      return false
    }
  }

  function trimLogFile() {
    try {
      if (!fs.existsSync(logFile)) return
      const lines = fs
        .readFileSync(logFile, 'utf-8')
        .split('\n')
        .filter(Boolean)
      if (lines.length <= maxLines) return
      fs.writeFileSync(
        logFile,
        `${lines.slice(-maxLines).join('\n')}\n`,
        'utf-8'
      )
    } catch {}
  }

  return {
    logFile,
    append,
    list,
    clear,
  }
}
