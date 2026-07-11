import { createNodeConfigStore } from '../../src/node/config.js'

const [configDir, adminAddress] = process.argv.slice(2)
const store = createNodeConfigStore(configDir)

process.send?.({ type: 'ready' })
process.on('message', message => {
  if (message?.type !== 'start') return

  try {
    process.send?.({
      type: 'result',
      result: store.claimAdminAddress(adminAddress),
    })
  } catch (err) {
    process.send?.({ type: 'error', error: err.message })
  } finally {
    process.disconnect?.()
  }
})
