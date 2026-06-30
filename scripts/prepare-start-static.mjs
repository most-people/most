import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'out')
const clientDir = path.join(outDir, 'client')
const serverDir = path.join(outDir, 'server')
const transientBuildDirs = new Set(['client', 'server'])

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

if (!(await exists(path.join(clientDir, 'index.html')))) {
  throw new Error('TanStack Start client build is missing out/client/index.html')
}

const outEntries = await fs.readdir(outDir, { withFileTypes: true })
for (const entry of outEntries) {
  if (transientBuildDirs.has(entry.name)) continue
  await fs.rm(path.join(outDir, entry.name), { recursive: true, force: true })
}

const entries = await fs.readdir(clientDir, { withFileTypes: true })

for (const entry of entries) {
  const source = path.join(clientDir, entry.name)
  const target = path.join(outDir, entry.name)

  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(source, target, { recursive: true })
}

await fs.rm(serverDir, { recursive: true, force: true })
await fs.rm(clientDir, { recursive: true, force: true })

console.log('Prepared static TanStack Start output in out/')
