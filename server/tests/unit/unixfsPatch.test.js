import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

it('patches the importer runtime when an unrelated version is hoisted', async t => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'mostbox-unixfs-patch-')
  )
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}')

  async function createPackage(parent, name, version) {
    const packagePath = path.join(parent, 'node_modules', name)
    await fs.mkdir(packagePath, { recursive: true })
    await fs.writeFile(
      path.join(packagePath, 'package.json'),
      JSON.stringify({
        name,
        version,
        type: 'module',
        exports: './index.js',
      })
    )
    await fs.writeFile(path.join(packagePath, 'index.js'), '')
    return packagePath
  }
  const hoisted = await createPackage(directory, 'protons-runtime', '8.0.1')
  const importer = await createPackage(
    directory,
    'ipfs-unixfs-importer',
    '17.0.1'
  )
  const unixfs = await createPackage(importer, 'ipfs-unixfs', '13.0.0')
  const runtime = await createPackage(unixfs, 'protons-runtime', '7.0.0')
  const source = (
    await fs.readFile(
      new URL(
        '../../../node_modules/protons-runtime/dist/src/utils/longbits.js',
        import.meta.url
      ),
      'utf8'
    )
  )
    .replace('this.lo = lo >>> 0;', 'this.lo = lo | 0;')
    .replace('this.hi = hi >>> 0;', 'this.hi = hi | 0;')
  const runtimeFile = path.join(runtime, 'dist/src/utils/longbits.js')
  const hoistedFile = path.join(hoisted, 'dist/src/utils/longbits.js')
  for (const file of [runtimeFile, hoistedFile]) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, source)
  }
  const script = fileURLToPath(
    new URL('../../../scripts/patch-unixfs-runtime.mjs', import.meta.url)
  )
  const runPatch = () =>
    execFileSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
    })
  runPatch()
  const patched = await fs.readFile(runtimeFile, 'utf8')
  runPatch()
  assert.equal(await fs.readFile(runtimeFile, 'utf8'), patched)
  assert.equal(await fs.readFile(hoistedFile, 'utf8'), source)
  const { LongBits } = await import(pathToFileURL(runtimeFile))
  assert.equal(new LongBits(2147483648, 0).lo, 2147483648)
  assert.equal(new LongBits(0, 2147483648).hi, 2147483648)
})
