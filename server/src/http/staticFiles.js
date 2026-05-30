import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from '@hono/node-server/serve-static'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

export function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

export function registerStaticRoutes(app) {
  const publicDir = path.join(__dirname, '..', '..', '..', 'out')

  app.get('/static/*', serveStatic({ root: './out' }))
  app.get('/_next/*', serveStatic({ root: './out' }))

  app.all('/api/*', c => {
    return c.json({ error: 'Not found' }, 404)
  })

  app.get('*', async c => {
    const pathname = c.req.path
    const filePath = path.join(publicDir, pathname)
    const resolved = path.resolve(filePath)
    const resolvedPublic = path.resolve(publicDir)

    if (
      !resolved.startsWith(resolvedPublic + path.sep) &&
      resolved !== resolvedPublic
    ) {
      return c.json({ error: 'Not found' }, 404)
    }

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        c.header('Content-Type', getMimeType(filePath))
        return c.body(fs.readFileSync(filePath))
      }
      if (stat.isDirectory()) {
        const dirIndex = path.join(filePath, 'index.html')
        if (fs.existsSync(dirIndex)) {
          c.header('Content-Type', 'text/html; charset=utf-8')
          return c.body(fs.readFileSync(dirIndex, 'utf-8'))
        }
      }
    }

    const indexPath = path.join(publicDir, 'index.html')
    if (fs.existsSync(indexPath)) {
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.body(fs.readFileSync(indexPath, 'utf-8'))
    }

    return c.json({ error: 'Not found' }, 404)
  })
}
