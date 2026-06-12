import { existsSync } from 'node:fs'
import { join } from 'node:path'

const requiredFiles = [
  'index.html',
  'download/index.html',
  'ping/index.html',
  'app/index.html',
]

const requiredDirectories = ['assets']
const forbiddenDirectories = ['client', 'server']

const missing = []
const unexpected = []

for (const file of requiredFiles) {
  if (!existsSync(join('out', file))) {
    missing.push(`out/${file}`)
  }
}

for (const dir of requiredDirectories) {
  if (!existsSync(join('out', dir))) {
    missing.push(`out/${dir}`)
  }
}

for (const dir of forbiddenDirectories) {
  if (existsSync(join('out', dir))) {
    unexpected.push(`out/${dir}`)
  }
}

if (missing.length || unexpected.length) {
  if (missing.length) {
    console.error(`Missing static output: ${missing.join(', ')}`)
  }
  if (unexpected.length) {
    console.error(`Unexpected static output directories: ${unexpected.join(', ')}`)
  }
  process.exit(1)
}

console.log('Static TanStack Start output looks good.')
