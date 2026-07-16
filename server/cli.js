#!/usr/bin/env node
import { main } from './index.js'

const [command, ...args] = process.argv.slice(2)

if (command === 'migrate-v0.5' || command === 'cleanup-v0.5') {
  const { runV05StorageMigrationCli } =
    await import('./src/node/storageMigration.js')
  try {
    if (command === 'migrate-v0.5') {
      await runV05StorageMigrationCli(args)
    } else {
      const { runV05StorageCleanupCli } =
        await import('./src/node/storageCleanup.js')
      await runV05StorageCleanupCli(args)
    }
  } catch (error) {
    const action = command === 'migrate-v0.5' ? 'migration' : 'cleanup'
    console.error(`[MostBox] Storage ${action} failed: ${error.message}`)
    if (error.stagePath) {
      console.error(`[MostBox] Incomplete stage kept at: ${error.stagePath}`)
    }
    if (error.cleanupPath) {
      console.error(
        `[MostBox] Incomplete cleanup kept at: ${error.cleanupPath}`
      )
    }
    process.exitCode = 1
  }
} else {
  main()
}
