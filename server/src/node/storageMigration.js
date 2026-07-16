import fs from 'node:fs'
import path from 'node:path'
import { createNodeConfigStore } from './config.js'
import {
  migrateLegacyV042Storage,
  scanLegacyV042Storage,
} from './legacyV042Migration.js'

function migrationError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function parseCliArgs(args) {
  const options = {
    apply: false,
    dataPath: '',
    sourcePath: '',
    help: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--data-path' || arg === '--source-path') {
      const value = String(args[index + 1] || '').trim()
      if (!value) {
        throw migrationError(
          `${arg} requires a value.`,
          'STORAGE_MIGRATION_INVALID_ARGUMENT'
        )
      }
      if (arg === '--data-path') options.dataPath = value
      else options.sourcePath = value
      index += 1
    } else if (arg.startsWith('--data-path=')) {
      options.dataPath = arg.slice('--data-path='.length).trim()
      if (!options.dataPath) {
        throw migrationError(
          '--data-path requires a value.',
          'STORAGE_MIGRATION_INVALID_ARGUMENT'
        )
      }
    } else if (arg.startsWith('--source-path=')) {
      options.sourcePath = arg.slice('--source-path='.length).trim()
      if (!options.sourcePath) {
        throw migrationError(
          '--source-path requires a value.',
          'STORAGE_MIGRATION_INVALID_ARGUMENT'
        )
      }
    } else {
      throw migrationError(
        `Unknown migration argument: ${arg}`,
        'STORAGE_MIGRATION_INVALID_ARGUMENT'
      )
    }
  }
  return options
}

function findLatestLegacyBackup(dataPath) {
  const resolved = path.resolve(dataPath)
  const parent = path.dirname(resolved)
  const prefix = `${path.basename(resolved)}.pre-v0.5.0-`
  if (!fs.existsSync(parent)) return ''
  const matches = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
    .map(entry => path.join(parent, entry.name))
    .sort()
  return matches.at(-1) || ''
}

function printMigrationUsage(write) {
  write(
    'Usage: most-box migrate-v0.5 [--source-path <legacy>] [--data-path <target>] [--apply]'
  )
  write('')
  write('Without --apply, the command verifies all legacy content read-only.')
  write('With --apply, it builds and verifies a separate v0.5 directory first.')
  write('Stop every MostBox process that uses either path before --apply.')
}

function printScanResult(write, sourcePath, targetPath, result) {
  write(`Legacy source: ${sourcePath}`)
  write(`v0.5 target: ${targetPath}`)
  write(`Holdings: ${result.holdingCount}`)
  write(`Published records: ${result.publishedCount}`)
  write(`Verified file contents: ${result.fileCount}`)
  write(`Collections: ${result.collectionCount}`)
  write(`Channels: ${result.channelCount}`)
  write(`Channel history entries: ${result.channelEntryCount}`)
  write(`Verified bytes: ${result.totalBytes}`)
  write(`Unavailable legacy items: ${result.unavailableCount}`)
  for (const item of result.unavailableItems.slice(0, 20)) {
    const location = item.collectionPath ? ` (${item.collectionPath})` : ''
    const subject = item.cid || `${item.channelKey}#${item.index}`
    write(`  - ${subject}${location}: ${item.reason}`)
  }
  if (result.unavailableItems.length > 20) {
    write(`  ... ${result.unavailableItems.length - 20} more`)
  }
  write('No changes were made. Re-run with --apply after stopping MostBox.')
}

export async function runV05StorageMigrationCli(args, options = {}) {
  const write = options.write || console.log
  const parsed = parseCliArgs(args)
  if (parsed.help) {
    printMigrationUsage(write)
    return { status: 'help', changed: false }
  }

  const targetPath = path.resolve(
    parsed.dataPath || createNodeConfigStore().getDataPath()
  )
  const sourcePath = path.resolve(
    parsed.sourcePath || findLatestLegacyBackup(targetPath) || targetPath
  )
  const onProgress = event => {
    if (event.stage === 'imported-file') {
      write(`Imported file CID: ${event.cid}`)
    } else if (event.stage === 'imported-collection') {
      write(`Imported collection CID: ${event.cid}`)
    }
  }

  if (!parsed.apply) {
    write('Verifying legacy Corestore content read-only...')
    const result = await scanLegacyV042Storage(sourcePath)
    printScanResult(write, sourcePath, targetPath, result)
    return {
      status: 'verified',
      changed: false,
      sourcePath,
      targetPath,
      ...result,
    }
  }

  write(`Legacy source: ${sourcePath}`)
  write(`v0.5 target: ${targetPath}`)
  write('Verifying legacy Corestore content read-only...')
  write('Building a separate v0.5 store. The legacy source is read-only.')
  const result = await migrateLegacyV042Storage(
    { sourcePath, targetPath },
    { onProgress }
  )
  write(`Imported holdings: ${result.importedHoldingCount}`)
  write(`Imported published records: ${result.importedPublishedCount}`)
  write(`Imported channels: ${result.importedChannelCount}`)
  write(`Imported channel entries: ${result.importedChannelEntryCount}`)
  write(`Unavailable legacy items: ${result.unavailableCount}`)
  write(`Migration report: ${path.join(targetPath, 'v0.5-import-report.json')}`)
  if (result.archivedTarget) {
    write(`Previous target archived at: ${result.archivedTarget}`)
  }
  write('The verified v0.5 store is now active.')
  return { status: 'migrated', changed: true, ...result }
}
