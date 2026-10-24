import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const USERNAME = 'unlock-user'
const PASSWORD = '床前明月光疑是地上霜举头望明月低头思故乡'

class MemoryStorage {
  #items = new Map()
  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null
  }
  setItem(key, value) {
    this.#items.set(key, String(value))
  }
  removeItem(key) {
    this.#items.delete(key)
  }
}

async function loadModules() {
  globalThis.localStorage = new MemoryStorage()
  const bundle = async entry => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
      bundle: true,
      format: 'esm',
      platform: 'node',
      write: false,
      logLevel: 'silent',
      // 打成单文件 ESM 后，依赖里的 CommonJS require 需要一个真实的解析基准。
      banner: {
        js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(${JSON.stringify(pathToFileURL(`${process.cwd()}/index.js`).href)});`,
      },
      alias: {
        '~server': fileURLToPath(new URL('../../server', import.meta.url)),
        '~': fileURLToPath(new URL('..', import.meta.url)),
      },
    })
    return import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
    )
  }
  const { useUserStore } = await bundle('../stores/userStore.ts')
  return { useUserStore }
}

async function signIn(useUserStore) {
  const state = () => useUserStore.getState()
  state().setLoginUsername(USERNAME)
  state().setLoginPassword(PASSWORD)
  state().previewLoginIdentity()
  return state().loginUser()
}

test('login persists device credentials but keeps the seed only in memory', async () => {
  const { useUserStore } = await loadModules()
  const identity = await signIn(useUserStore)

  assert.ok(identity?.device.cert)
  const stored = JSON.parse(localStorage.getItem('mostbox_identity'))
  assert.equal('danger' in stored, false)
  assert.ok(stored.syncKey && stored.syncTopic && stored.publicKeys)
  const { seed } = useUserStore.getState()
  assert.match(seed, /^0x[0-9a-f]{64}$/)
  assert.equal(JSON.stringify(stored).includes(seed), false)
})

test('a reload drops the seed and unlocking needs the right password', async () => {
  const { useUserStore } = await loadModules()
  await signIn(useUserStore)
  const state = () => useUserStore.getState()

  state().initializeUser()
  assert.equal(state().seed, null)
  assert.ok(state().identity)

  let settled = false
  const pending = state()
    .unlockSeed()
    .then(seed => {
      settled = true
      return seed
    })
  assert.equal(state().unlockOpen, true)

  state().submitUnlock('')
  assert.equal(state().unlockError, 'unlock.error.passwordRequired')
  state().submitUnlock('this is definitely not the password')
  assert.equal(state().unlockError, 'unlock.error.wrongPassword')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  assert.equal(state().unlockOpen, true)

  state().submitUnlock(PASSWORD)
  const seed = await pending
  assert.match(seed, /^0x[0-9a-f]{64}$/)
  assert.equal(state().unlockOpen, false)
  assert.equal(state().unlockError, '')
  assert.equal(await state().unlockSeed(), seed)
})

test('cancelling the unlock resolves callers with null', async () => {
  const { useUserStore } = await loadModules()
  await signIn(useUserStore)
  const state = () => useUserStore.getState()
  state().initializeUser()

  const first = state().unlockSeed()
  const second = state().unlockSeed()
  state().cancelUnlock()
  assert.equal(await first, null)
  assert.equal(await second, null)
  assert.equal(state().unlockOpen, false)
})

test('logging out clears the seed and rejects unlocking', async () => {
  const { useUserStore } = await loadModules()
  await signIn(useUserStore)
  const state = () => useUserStore.getState()

  const pendingBefore = (state().initializeUser(), state().unlockSeed())
  state().logoutUser()
  assert.equal(await pendingBefore, null)
  assert.equal(state().seed, null)
  assert.equal(state().identity, null)
  assert.equal(localStorage.getItem('mostbox_identity'), null)
  assert.equal(await state().unlockSeed(), null)
})

test('a certificate close to expiry asks for the password and is renewed', async () => {
  const { useUserStore } = await loadModules()
  const { createLoginSession } = await import(
    new URL('../../server/src/utils/userIdentity.js', import.meta.url).href
  )
  const old = await createLoginSession(USERNAME, PASSWORD, {
    now: Date.now() - 29 * 24 * 60 * 60 * 1000,
  })
  localStorage.setItem('mostbox_identity', JSON.stringify(old.identity))
  const state = () => useUserStore.getState()

  state().initializeUser()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state().unlockOpen, true)

  state().submitUnlock(PASSWORD)
  for (
    let i = 0;
    i < 50 && state().identity.device.cert === old.identity.device.cert;
    i++
  ) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  const renewed = state().identity
  assert.notEqual(renewed.device.cert, old.identity.device.cert)
  assert.equal(renewed.device.publicKey, old.identity.device.publicKey)
  assert.equal(renewed.device.secretKey, old.identity.device.secretKey)
  const expiresAt = JSON.parse(
    Buffer.from(renewed.device.cert.split('.')[1], 'base64url').toString()
  ).expiresAt
  assert.ok(expiresAt - Date.now() > 29 * 24 * 60 * 60 * 1000)
  assert.equal(
    JSON.parse(localStorage.getItem('mostbox_identity')).device.cert,
    renewed.device.cert
  )
})

test('a fresh certificate does not prompt for the password', async () => {
  const { useUserStore } = await loadModules()
  await signIn(useUserStore)
  useUserStore.getState().initializeUser()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(useUserStore.getState().unlockOpen, false)
})
