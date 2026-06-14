import fs from 'node:fs'
import path from 'node:path'

export function resolveDataPathForSave(inputPath) {
  let dataPath = String(inputPath || '').trim()
  let basePath = dataPath

  if (!dataPath) {
    return { dataPath: '' }
  }

  if (dataPath.match(/^[A-Za-z]:\\$/)) {
    basePath = dataPath
    dataPath = path.join(dataPath, 'most-data')
  }

  if (!fs.existsSync(basePath)) {
    return { error: '目录不存在' }
  }

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }

  return { dataPath }
}
