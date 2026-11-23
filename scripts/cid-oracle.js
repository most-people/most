// F4 external CID oracle: the desktop engine, the mobile core and kubo must
// give the same CID for every sample. Usage:
//   KUBO_BIN=/path/to/ipfs node scripts/cid-oracle.js [--quick]
// --quick skips the samples above 1GiB (2/4/10GiB encoding boundaries). Prints one JSON line per sample and
// exits non-zero on any mismatch.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { calculateCid as desktopCid } from '../server/src/core/cid.js'
import { calculateCid as mobileCid } from '../app/backend/mobile-core.mjs'

const KIB = 1024
const GIB = 1024 ** 3
const CHUNK = 256 * KIB
const LAYER = 174 * CHUNK // one balanced layer: 174 leaves

const samples = [
  ['empty', 0],
  ['one-byte', 1],
  ['chunk-1', CHUNK - 1],
  ['chunk', CHUNK],
  ['chunk+1', CHUNK + 1],
  ['layer-1', LAYER - 1],
  ['layer', LAYER],
  ['layer+1', LAYER + 1],
  ['2GiB-1', 2 * GIB - 1],
  ['2GiB', 2 * GIB],
  ['4GiB-1', 4 * GIB - 1],
  ['4GiB', 4 * GIB],
  ['10GiB', 10 * GIB],
]

// Byte i of every sample is i % 251, so chunks differ from each other.
// PERIOD is a multiple of 251, so every full piece starts at pattern offset 0.
const PERIOD = 251 * 4096
const pattern = Buffer.from(Array.from({ length: PERIOD }, (_, i) => i % 251))

async function* content(size) {
  for (let offset = 0; offset < size; offset += PERIOD) {
    yield pattern.subarray(0, Math.min(PERIOD, size - offset))
  }
}

function kuboCid(bin, env, size) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        'add',
        '-Q',
        '--only-hash',
        '--pin=false',
        '--cid-version=1',
        '--raw-leaves',
        `--chunker=size-${CHUNK}`,
        '--max-file-links=174',
      ],
      { env, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', data => (stdout += data))
    child.stderr.on('data', data => (stderr += data))
    child.on('error', reject)
    child.on('close', code =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`kubo exited ${code}: ${stderr.trim()}`))
    )
    child.stdin.on('error', reject)
    ;(async () => {
      for await (const piece of content(size)) {
        if (!child.stdin.write(piece)) {
          await new Promise(done => child.stdin.once('drain', done))
        }
      }
      child.stdin.end()
    })().catch(reject)
  })
}

async function main() {
  const bin = process.env.KUBO_BIN || 'ipfs'
  const quick = process.argv.includes('--quick')
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'most-kubo-'))
  const env = { ...process.env, IPFS_PATH: repo }
  let failures = 0

  try {
    execFileSync(bin, ['init', '--empty-repo'], { env, stdio: 'ignore' })
    const kubo = execFileSync(bin, ['version'], { env }).toString().trim()
    console.log(JSON.stringify({ kubo, node: process.version }))

    for (const [name, size] of samples) {
      if (quick && size > GIB) continue
      const started = Date.now()
      const [desktop, mobile, external] = await Promise.all([
        desktopCid(content(size)).then(result => result.cid.toString()),
        mobileCid({ stream: content(size) }).then(result => result.cid),
        kuboCid(bin, env, size),
      ])
      const match = desktop === mobile && mobile === external
      if (!match) failures += 1
      console.log(
        JSON.stringify({
          name,
          size,
          desktop,
          mobile,
          kubo: external,
          match,
          ms: Date.now() - started,
        })
      )
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }

  if (failures > 0) {
    console.error(`${failures} sample(s) disagree`)
    process.exitCode = 1
  }
}

await main()
