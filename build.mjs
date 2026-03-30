import * as esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const outFile = path.join(publicDir, 'bundle.js')

const isWatch = process.argv.includes('--watch')
const isDev = process.argv.includes('--dev')

const buildOptions = {
  entryPoints: [path.join(publicDir, 'index.jsx')],
  bundle: true,
  outfile: outFile,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
  },
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"'
  },
  minify: !isDev,
  sourcemap: isDev,
  target: ['es2020'],
  logLevel: 'info',
}

if (isWatch) {
  const ctx = await esbuild.context(buildOptions)
  await ctx.watch()
  console.log('[Build] Watching for changes...')
} else {
  await esbuild.build(buildOptions)
  console.log('[Build] Done.')
}
