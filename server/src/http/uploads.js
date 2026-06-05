import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Busboy from 'busboy'
import { MAX_FILE_SIZE } from '../config.js'

export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'most-box-uploads')

function decodeFilenameFromHeader(headerStr) {
  if (!headerStr) return null

  const filenameStarMatch = headerStr.match(
    /filename\*=(?:UTF-8''|utf-8'')([^;\r\n]+)/i
  )
  if (filenameStarMatch) {
    return decodeURIComponent(filenameStarMatch[1])
  }

  const filenameMatch = headerStr.match(/filename="([^"]+)"/)
  if (filenameMatch) {
    const rawFilename = filenameMatch[1]
    try {
      const buf = Buffer.from(rawFilename, 'latin1')
      const decoded = buf.toString('utf8')
      if (decoded.includes('\ufffd')) {
        return rawFilename
      }
      return decoded
    } catch {
      return rawFilename
    }
  }

  const filenamePlainMatch = headerStr.match(/filename=([^;\r\n]+)/)
  if (filenamePlainMatch) {
    return filenamePlainMatch[1].trim()
  }
  return null
}

export async function parseMultipartBusboy(req, maxUploadSize = MAX_FILE_SIZE) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(UPLOAD_TMP_DIR)) {
      fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true })
    }

    const busboy = Busboy({
      headers: req.headers,
      preservePath: true,
      limits: {
        fileSize: maxUploadSize,
        files: 1,
        fields: 0,
      },
    })

    const result = { filePath: null, filename: null }
    let fileSize = 0
    let writeStream = null
    let tempPath = null

    busboy.on('file', (name, stream, info) => {
      result.filename = decodeFilenameFromHeader(`filename="${info.filename}"`)
      tempPath = path.join(
        UPLOAD_TMP_DIR,
        `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      )
      writeStream = fs.createWriteStream(tempPath)

      stream.on('data', chunk => {
        fileSize += chunk.length
        if (fileSize > maxUploadSize) {
          stream.destroy()
          writeStream.destroy()
          fs.unlink(tempPath, () => {})
          reject(new Error('File too large'))
          return
        }
      })

      stream.on('error', () => {
        if (tempPath) fs.unlink(tempPath, () => {})
      })

      stream.pipe(writeStream)

      writeStream.on('finish', () => {
        result.filePath = tempPath
        resolve(result)
      })

      writeStream.on('error', err => {
        if (tempPath) fs.unlink(tempPath, () => {})
        reject(err)
      })
    })

    busboy.on('error', err => {
      if (tempPath) fs.unlink(tempPath, () => {})
      reject(err)
    })

    busboy.on('close', () => {
      if (!result.filename) {
        resolve(null)
      }
    })

    req.on('error', err => {
      if (tempPath) fs.unlink(tempPath, () => {})
      reject(err)
    })
    req.pipe(busboy)
  })
}
