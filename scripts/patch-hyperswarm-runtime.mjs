import { readFile, writeFile } from 'node:fs/promises'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function patchHyperswarmSource(source, version) {
  // These are the desktop and Bare versions covered by the queue regression.
  // Revalidate internal state transitions before accepting another release.
  if (!['4.17.0', '4.17.2'].includes(version)) {
    throw new Error(
      `Revalidate the discovery retry patch for Hyperswarm ${version}`
    )
  }

  const replacements = [
    [
      '    const conn = this.dht.connect(peerInfo.publicKey, {',
      '    peerInfo.tried = true\n    const conn = this.dht.connect(peerInfo.publicKey, {',
    ],
    [
      '    if (!peerInfo.prioritized || peerInfo.server) peerInfo._reset()',
      '    // MostBox: rediscovery updates addresses, not retry state.\n' +
        '    if (peerInfo.waiting || peerInfo.queued) return',
    ],
    [
      '    this._queue = spq()\n  }\n\n  async resume(',
      '    this._queue = spq()\n' +
        '    // Both pending containers were discarded; allow discovery to requeue.\n' +
        '    for (const peerInfo of this.peers.values()) {\n' +
        '      peerInfo.queued = false\n' +
        '      peerInfo.waiting = false\n' +
        '    }\n' +
        '  }\n\n  async resume(',
    ],
  ]
  let patched = source
  for (const [before, after] of replacements) {
    if (patched.includes(after)) continue
    if (patched.split(before).length !== 2) {
      throw new Error(`Unexpected Hyperswarm ${version} discovery retry source`)
    }
    patched = patched.replace(before, after)
  }
  return patched
}

async function main() {
  const packagePath = findPackageJSON(
    'hyperswarm',
    pathToFileURL(join(process.cwd(), 'package.json'))
  )
  const { version } = JSON.parse(await readFile(packagePath, 'utf8'))
  const sourcePath = join(dirname(packagePath), 'index.js')
  const source = await readFile(sourcePath, 'utf8')
  const patched = patchHyperswarmSource(source, version)
  if (patched !== source) await writeFile(sourcePath, patched)
  console.log(`Discovery retry patch applied (Hyperswarm ${version}).`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
