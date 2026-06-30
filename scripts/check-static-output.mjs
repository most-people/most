import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { requiredStaticEntries } from './static-routes.mjs'

const requiredDirectories = ['assets']
const allowedTopLevelEntries = new Set(requiredDirectories)

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

if (missing.length || unexpected.length) {
  if (missing.length) {
    console.error(`Missing static output: ${missing.join(', ')}`)
  }
  if (unexpected.length) {
    console.error(`Unexpected static output entries: ${unexpected.join(', ')}`)
  }
  process.exit(1)
}

console.log('Static TanStack Start output looks good.')
