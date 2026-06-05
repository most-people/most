import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const EXPECTED_ASSETS = [
  ['windows', 'x64'],
  ['windows', 'arm64'],
  ['macos', 'x64'],
  ['macos', 'arm64'],
  ['linux', 'x64'],
  ['linux', 'arm64'],
]

const PLATFORM_BY_TOKEN = {
  win: 'windows',
  mac: 'macos',
  linux: 'linux',
}

function parseArgs(argv) {
  const args = new Map()
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (!key?.startsWith('--') || !value) {
      throw new Error(`Invalid argument near ${key || '<end>'}`)
    }
    args.set(key.slice(2), value)
  }
  return args
}

function requireArg(args, name) {
  const value = args.get(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256')
  const file = await fs.open(filePath, 'r')
  try {
    for await (const chunk of file.createReadStream()) {
      hash.update(chunk)
    }
  } finally {
    await file.close()
  }
  return hash.digest('hex')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const assetsDir = requireArg(args, 'assets')
  const tag = requireArg(args, 'tag')
  const repo = requireArg(args, 'repo')
  const publicBaseUrl = normalizeBaseUrl(requireArg(args, 'base-url'))
  const version = tag.replace(/^v/, '')
  const files = await fs.readdir(assetsDir)
  const assetPattern = new RegExp(
    `^MostBox-${escapeRegExp(version)}-(win|mac|linux)-(x64|x86_64|arm64)(?:-setup)?\\.(exe|dmg|AppImage)$`
  )

  const assets = []
  for (const filename of files) {
    const match = filename.match(assetPattern)
    if (!match) continue

    const [, platformToken, archToken] = match
    const filePath = path.join(assetsDir, filename)
    const stat = await fs.stat(filePath)
    const platform = PLATFORM_BY_TOKEN[platformToken]
    const arch = archToken === 'x86_64' ? 'x64' : archToken

    assets.push({
      platform,
      arch,
      kind: 'installer',
      filename,
      size: stat.size,
      sha256: await sha256(filePath),
      r2Url: `${publicBaseUrl}/releases/${tag}/${encodeURIComponent(filename)}`,
      githubUrl: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(filename)}`,
    })
  }

  const present = new Set(assets.map(asset => `${asset.platform}:${asset.arch}`))
  const missing = EXPECTED_ASSETS.filter(
    ([platform, arch]) => !present.has(`${platform}:${arch}`)
  )
  if (missing.length > 0) {
    throw new Error(
      `Missing release assets: ${missing
        .map(([platform, arch]) => `${platform}/${arch}`)
        .join(', ')}`
    )
  }

  const order = new Map(
    EXPECTED_ASSETS.map(([platform, arch], index) => [`${platform}:${arch}`, index])
  )
  assets.sort(
    (a, b) => order.get(`${a.platform}:${a.arch}`) - order.get(`${b.platform}:${b.arch}`)
  )

  const manifest = {
    version,
    publishedAt: new Date().toISOString(),
    assets,
  }

  const manifestPath = path.join(assetsDir, 'latest.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${manifestPath} with ${assets.length} assets`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
