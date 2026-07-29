import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const distDir = path.join(packageDir, 'dist')

await fs.rm(distDir, { recursive: true, force: true })
await fs.mkdir(distDir, { recursive: true })
await build({
  entryPoints: [path.join(packageDir, 'src/index.js')],
  outfile: path.join(distDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['ethers', 'tweetnacl'],
  legalComments: 'none',
})
await fs.copyFile(
  path.join(packageDir, 'src/index.d.ts'),
  path.join(distDir, 'index.d.ts')
)
