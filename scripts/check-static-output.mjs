import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { requiredStaticEntries, staticShellFile } from './static-routes.mjs'

const requiredDirectories = ['assets']
const maxClientChunkBytes = 500_000
const allowedTopLevelEntries = new Set(requiredDirectories)
allowedTopLevelEntries.add(staticShellFile)

for (const { file } of requiredStaticEntries) {
  allowedTopLevelEntries.add(file.split('/')[0])
}

if (existsSync('public')) {
  for (const entry of readdirSync('public', { withFileTypes: true })) {
    allowedTopLevelEntries.add(entry.name)
  }
}

const missing = []
const unexpected = []
const oversizedChunks = []

if (!existsSync(join('out', staticShellFile))) {
  missing.push(`out/${staticShellFile}`)
}

for (const { route, file } of requiredStaticEntries) {
  if (!existsSync(join('out', file))) {
    missing.push(`out/${file} (${route})`)
  }
}

for (const dir of requiredDirectories) {
  if (!existsSync(join('out', dir))) {
    missing.push(`out/${dir}`)
  }
}

if (existsSync('out')) {
  for (const entry of readdirSync('out', { withFileTypes: true })) {
    if (!allowedTopLevelEntries.has(entry.name)) {
      unexpected.push(`out/${entry.name}`)
    }
  }
}

const assetsPath = join('out', 'assets')
if (existsSync(assetsPath)) {
  for (const entry of readdirSync(assetsPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const size = statSync(join(assetsPath, entry.name)).size
    if (size > maxClientChunkBytes) {
      oversizedChunks.push(`${entry.name} (${size} bytes)`)
    }
  }
}

if (missing.length || unexpected.length || oversizedChunks.length) {
  if (missing.length) {
    console.error(`Missing static output: ${missing.join(', ')}`)
  }
  if (unexpected.length) {
    console.error(`Unexpected static output entries: ${unexpected.join(', ')}`)
  }
  if (oversizedChunks.length) {
    console.error(
      `Client chunks exceed ${maxClientChunkBytes} bytes: ${oversizedChunks.join(', ')}`
    )
  }
  process.exit(1)
}

console.log('Static TanStack Start output looks good.')
