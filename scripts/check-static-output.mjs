import { existsSync } from 'node:fs'
import { join } from 'node:path'

const requiredStaticEntries = [
  { route: '/', file: 'index.html' },
  { route: '/admin/', file: 'admin/index.html' },
  { route: '/app/', file: 'app/index.html' },
  { route: '/chat/', file: 'chat/index.html' },
  { route: '/chat/join/', file: 'chat/join/index.html' },
  { route: '/demo/', file: 'demo/index.html' },
  { route: '/download/', file: 'download/index.html' },
  { route: '/game/', file: 'game/index.html' },
  { route: '/game/gandengyan/', file: 'game/gandengyan/index.html' },
  { route: '/game/zhajinhua/', file: 'game/zhajinhua/index.html' },
  { route: '/note/', file: 'note/index.html' },
  { route: '/ping/', file: 'ping/index.html' },
  { route: '/web3/', file: 'web3/index.html' },
  { route: '/web3/ed25519/', file: 'web3/ed25519/index.html' },
  { route: '/web3/tools/', file: 'web3/tools/index.html' },
]

const requiredDirectories = ['assets']
const forbiddenDirectories = ['client', 'server']

const missing = []
const unexpected = []

for (const { route, file } of requiredStaticEntries) {
  if (!existsSync(join('out', file))) {
    missing.push(`out/${file} (${route})`)
  }
}

for (const dir of requiredDirectories) {
  if (!existsSync(join('out', dir))) {
    missing.push(`out/${dir}`)
  }
}

for (const dir of forbiddenDirectories) {
  if (existsSync(join('out', dir))) {
    unexpected.push(`out/${dir}`)
  }
}

if (missing.length || unexpected.length) {
  if (missing.length) {
    console.error(`Missing static output: ${missing.join(', ')}`)
  }
  if (unexpected.length) {
    console.error(`Unexpected static output directories: ${unexpected.join(', ')}`)
  }
  process.exit(1)
}

console.log('Static TanStack Start output looks good.')
