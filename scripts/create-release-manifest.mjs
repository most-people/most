import fs from 'node:fs/promises'
import path from 'node:path'

import { calculateCid } from '../server/src/core/cid.js'

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

function getAssetKind(platform, ext) {
  if (platform === 'macos' && ext === 'zip') return 'updater'
  return 'installer'
}

function shouldAddUpdaterAlias(platform, ext) {
  return (
    (platform === 'windows' && ext === 'exe') ||
    (platform === 'linux' && ext === 'AppImage')
  )
}

function createAssetRecord({
  platform,
  arch,
  kind,
  filename,
  size,
  cid,
  publicBaseUrl,
  tag,
  repo,
}) {
  return {
    platform,
    arch,
    kind,
    filename,
    size,
    cid,
    r2Url: `${publicBaseUrl}/releases/${tag}/${encodeURIComponent(filename)}`,
    githubUrl: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(filename)}`,
  }
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
    `^MostBox-${escapeRegExp(version)}-(win|mac|linux)-(x64|x86_64|arm64)(?:-setup)?\\.(exe|dmg|zip|AppImage)$`
  )

  const assets = []
  for (const filename of files) {
    const match = filename.match(assetPattern)
    if (!match) continue

    const [, platformToken, archToken, ext] = match
    const filePath = path.join(assetsDir, filename)
    const stat = await fs.stat(filePath)
    const platform = PLATFORM_BY_TOKEN[platformToken]
    const arch = archToken === 'x86_64' ? 'x64' : archToken
    const cid = (await calculateCid(filePath)).cid.toString()
    const kind = getAssetKind(platform, ext)

    assets.push(createAssetRecord({
      platform,
      arch,
      kind,
      filename,
      size: stat.size,
      cid,
      publicBaseUrl,
      tag,
      repo,
    }))

    if (shouldAddUpdaterAlias(platform, ext)) {
      assets.push(createAssetRecord({
        platform,
        arch,
        kind: 'updater',
        filename,
        size: stat.size,
        cid,
        publicBaseUrl,
        tag,
        repo,
      }))
    }
  }

  const installerPresent = new Set(
    assets
      .filter(asset => asset.kind === 'installer')
      .map(asset => `${asset.platform}:${asset.arch}`)
  )
  const missing = EXPECTED_ASSETS.filter(
    ([platform, arch]) => !installerPresent.has(`${platform}:${arch}`)
  )
  const updaterPresent = new Set(
    assets
      .filter(asset => asset.kind === 'updater')
      .map(asset => `${asset.platform}:${asset.arch}`)
  )
  const missingUpdaters = EXPECTED_ASSETS.filter(
    ([platform, arch]) => !updaterPresent.has(`${platform}:${arch}`)
  )
  if (missing.length > 0) {
    throw new Error(
      `Missing release assets: ${missing
        .map(([platform, arch]) => `${platform}/${arch}`)
        .join(', ')}`
    )
  }
  if (missingUpdaters.length > 0) {
    throw new Error(
      `Missing updater assets: ${missingUpdaters
        .map(([platform, arch]) => `${platform}/${arch}`)
        .join(', ')}`
    )
  }

  const order = new Map(
    EXPECTED_ASSETS.map(([platform, arch], index) => [`${platform}:${arch}`, index])
  )
  assets.sort(
    (a, b) =>
      order.get(`${a.platform}:${a.arch}`) -
        order.get(`${b.platform}:${b.arch}`) ||
      a.kind.localeCompare(b.kind) ||
      a.filename.localeCompare(b.filename)
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
