import { readFile, writeFile } from 'node:fs/promises'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const importerPackage = findPackageJSON(
  'ipfs-unixfs-importer',
  pathToFileURL(join(process.cwd(), 'package.json'))
)
const unixfsPackage = findPackageJSON(
  'ipfs-unixfs',
  pathToFileURL(importerPackage)
)
const runtimePath = dirname(
  findPackageJSON('protons-runtime', pathToFileURL(unixfsPackage))
)
const { version } = JSON.parse(
  await readFile(join(runtimePath, 'package.json'), 'utf8')
)
if (!version.startsWith('7.') && !version.startsWith('8.')) {
  throw new Error(
    `Revalidate the UnixFS uint64 patch for protons-runtime ${version}`
  )
}

const sourcePath = join(runtimePath, 'dist/src/utils/longbits.js')
const source = await readFile(sourcePath, 'utf8')
let patched = source

// Signed halves truncate uint64 writes at 2GiB and leave uninitialized bytes.
for (const half of ['lo', 'hi']) {
  const before = `this.${half} = ${half} | 0;`
  const after = `this.${half} = ${half} >>> 0;`
  if (patched.includes(after)) continue
  if (!patched.includes(before)) {
    throw new Error(`Unexpected protons-runtime LongBits ${half} encoding`)
  }
  patched = patched.replace(before, after)
}

if (patched !== source) await writeFile(sourcePath, patched)
console.log(
  `UnixFS uint64 encoding patch applied (protons-runtime ${version}).`
)
