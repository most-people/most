const fs = require('node:fs')
const path = require('node:path')

const ARCH_BY_VALUE = new Map([
  [0, 'ia32'],
  [1, 'x64'],
  [2, 'armv7l'],
  [3, 'arm64'],
  [4, 'universal'],
])

function normalizeArch(arch) {
  if (typeof arch === 'string') return arch
  if (typeof arch === 'number') return ARCH_BY_VALUE.get(arch) || String(arch)
  return String(arch || '')
}

function findPrebuildDirs(root) {
  const matches = []
  const stack = [root]

  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const fullPath = path.join(dir, entry.name)
      if (entry.name === 'prebuilds') {
        matches.push(fullPath)
        continue
      }
      stack.push(fullPath)
    }
  }

  return matches
}

function shouldKeepPrebuild(name, target) {
  return (
    name === target ||
    name.startsWith(`${target}-`) ||
    name.startsWith(`${target}+`)
  )
}

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName
  const arch = normalizeArch(context.arch)
  const target = `${platform}-${arch}`
  const nodeModulesDir = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules'
  )

  if (!platform || !arch || arch === 'universal' || !fs.existsSync(nodeModulesDir)) {
    return
  }

  let removed = 0
  for (const prebuildDir of findPrebuildDirs(nodeModulesDir)) {
    const entries = fs.readdirSync(prebuildDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (shouldKeepPrebuild(entry.name, target)) continue

      fs.rmSync(path.join(prebuildDir, entry.name), {
        force: true,
        recursive: true,
      })
      removed += 1
    }
  }

  if (removed > 0) {
    console.log(`[MostBox] Pruned ${removed} native prebuild directories for ${target}`)
  }
}
