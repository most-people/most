import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function read(relativePath) {
  return fs.readFileSync(path.join(projectDir, relativePath), 'utf8')
}

test('native store entry creates the profile-aware mobile node client', () => {
  const source = read('src/mobileCore/createMostBoxCore.ts')

  assert.match(source, /from '\.\/mobileClient'/)
  assert.match(source, /remoteEnabled: PRODUCT_PROFILE\.features\.remoteNode/)
})

test('native node connection panel exposes profile-gated remote controls', () => {
  const source = read('src/features/node/NodeConnectionPanel.tsx')

  assert.match(source, /PRODUCT_PROFILE\.features\.remoteNode/)
  assert.match(source, /client\.connectRemote/)
  assert.match(source, /client\.signIn/)
})

test('native app configuration contains no remote identity storage plugin', () => {
  const packageJson = JSON.parse(read('package.json'))
  const appJson = JSON.parse(read('app.json'))

  assert.equal(packageJson.dependencies['expo-secure-store'], undefined)
  assert.equal(appJson.expo.plugins.includes('expo-secure-store'), false)
})

test('Expo Web keeps its remote node client and connection controls', () => {
  const coreSource = read('src/mobileCore/createMostBoxCore.web.ts')
  const clientSource = read('src/mobileCore/mobileClient.ts')
  const panelSource = read('src/features/node/NodeConnectionPanel.web.tsx')
  const storageSource = read('src/remoteNode/storage.web.ts')

  assert.match(coreSource, /from '\.\/mobileClient'/)
  assert.match(coreSource, /remoteOnly: true/)
  assert.match(clientSource, /from '\.\.\/remoteNode\/storage'/)
  assert.match(panelSource, /client\.connectRemote/)
  assert.match(panelSource, /client\.signIn/)
  assert.match(
    panelSource,
    /placeholder=\{t\('node\.connection\.invite'\)\}\s+secureTextEntry\s+value=\{invite\}/
  )
  assert.match(storageSource, /localStorage/)
  assert.equal(
    fs.existsSync(path.join(projectDir, 'src/remoteNode/storage.ts')),
    true
  )
})
