import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { createNodeConfigStore } from './config.js'
import { STORAGE_SCHEMA_FILE, STORAGE_SCHEMA_VERSION } from './storageSchema.js'

const MIGRATION_REPORT_FILE = 'v0.5-import-report.json'

function cleanupError(message, code, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function samePath(left, right) {
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function isNestedPath(parent, child) {
  const relative = path.relative(parent, child)
  return Boolean(
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}

function resolveSafeTarget(dataPath) {
  const input = String(dataPath || '').trim()
  if (!input) {
    throw cleanupError(
      'Cleanup data path is required.',
      'STORAGE_CLEANUP_UNSAFE_PATH'
    )
  }
  const resolved = path.resolve(input)
  if (
    resolved === path.parse(resolved).root ||
    resolved === path.resolve(os.homedir())
  ) {
    throw cleanupError(
      `Refusing to use an unsafe cleanup data path: ${resolved}`,
      'STORAGE_CLEANUP_UNSAFE_PATH'
    )
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw cleanupError(
      `Cleanup data path does not exist: ${resolved}`,
      'STORAGE_CLEANUP_TARGET_NOT_FOUND'
    )
  }
  return resolved
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw cleanupError(
      `${label} is missing or invalid: ${filePath}`,
      'STORAGE_CLEANUP_METADATA_INVALID',
      { cause: error.message }
    )
  }
}

function formatTimestamp(value) {
  return value.toISOString().replace(/[-:.TZ]/g, '')
}

function loadCleanupMetadata(targetPath) {
  const schema = readJsonFile(
    path.join(targetPath, STORAGE_SCHEMA_FILE),
    'Storage schema'
  )
  if (schema?.version !== STORAGE_SCHEMA_VERSION) {
    throw cleanupError(
      'Cleanup requires an active MostBox storage schema 1 target.',
      'STORAGE_CLEANUP_SCHEMA_UNSUPPORTED'
    )
  }

  const reportPath = path.join(targetPath, MIGRATION_REPORT_FILE)
  const report = readJsonFile(reportPath, 'Migration report')
  if (
    report?.schemaVersion !== 1 ||
    !report.sourcePath ||
    Number.isNaN(Date.parse(report.createdAt))
  ) {
    throw cleanupError(
      'Migration report does not contain a valid v0.5 import record.',
      'STORAGE_CLEANUP_METADATA_INVALID'
    )
  }
  return { report, reportPath }
}

function getCleanupCandidates(targetPath, report) {
  const explicit = Array.isArray(report.cleanupCandidates)
    ? report.cleanupCandidates
        .map(candidate => ({
          kind: String(candidate?.kind || '').trim(),
          path: String(candidate?.path || '').trim(),
        }))
        .filter(candidate => candidate.kind && candidate.path)
    : []
  if (explicit.length > 0) return explicit

  const candidates = []
  const sourcePath = path.resolve(report.sourcePath)
  if (!samePath(sourcePath, targetPath)) {
    candidates.push({ kind: 'legacy-source', path: sourcePath })
  }
  const archivePath = `${targetPath}.before-v0.5-import-${formatTimestamp(
    new Date(report.createdAt)
  )}`
  candidates.push({ kind: 'previous-target', path: archivePath })
  return candidates
}

function hasLegacyStorageMarker(candidatePath) {
  const corestoreMarkers = ['CORESTORE', 'db', 'corestore-v2']
  const metadataMarkers = [
    'node-holdings.json',
    'node-holdings.json.bak',
    'published-files.json',
    'channels.json',
  ]
  return (
    corestoreMarkers.some(marker =>
      fs.existsSync(path.join(candidatePath, marker))
    ) &&
    metadataMarkers.some(marker =>
      fs.existsSync(path.join(candidatePath, marker))
    )
  )
}

function validateCandidate(targetPath, candidate) {
  const candidatePath = path.resolve(candidate.path)
  if (
    candidatePath === path.parse(candidatePath).root ||
    candidatePath === path.resolve(os.homedir()) ||
    samePath(candidatePath, targetPath) ||
    isNestedPath(candidatePath, targetPath) ||
    isNestedPath(targetPath, candidatePath)
  ) {
    throw cleanupError(
      `Refusing to clean an unsafe migration path: ${candidatePath}`,
      'STORAGE_CLEANUP_UNSAFE_PATH'
    )
  }

  if (!fs.existsSync(candidatePath)) {
    return {
      ...candidate,
      path: candidatePath,
      exists: false,
      files: 0,
      bytes: 0,
    }
  }
  const stat = fs.lstatSync(candidatePath)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw cleanupError(
      `Cleanup candidate is not a real directory: ${candidatePath}`,
      'STORAGE_CLEANUP_UNSAFE_PATH'
    )
  }

  if (candidate.kind === 'legacy-source') {
    if (!hasLegacyStorageMarker(candidatePath)) {
      throw cleanupError(
        `Legacy cleanup candidate has no MostBox storage markers: ${candidatePath}`,
        'STORAGE_CLEANUP_CANDIDATE_INVALID'
      )
    }
  } else if (candidate.kind === 'previous-target') {
    const expectedPrefix = `${path.basename(targetPath)}.before-v0.5-import-`
    if (
      path.dirname(candidatePath) !== path.dirname(targetPath) ||
      !path.basename(candidatePath).startsWith(expectedPrefix)
    ) {
      throw cleanupError(
        `Previous-target cleanup candidate has an unexpected path: ${candidatePath}`,
        'STORAGE_CLEANUP_CANDIDATE_INVALID'
      )
    }
    const schemaPath = path.join(candidatePath, STORAGE_SCHEMA_FILE)
    const schema = readJsonFile(schemaPath, 'Previous target storage schema')
    if (schema?.version !== STORAGE_SCHEMA_VERSION) {
      throw cleanupError(
        `Previous target does not use storage schema 1: ${candidatePath}`,
        'STORAGE_CLEANUP_CANDIDATE_INVALID'
      )
    }
  } else {
    throw cleanupError(
      `Unknown cleanup candidate kind: ${candidate.kind}`,
      'STORAGE_CLEANUP_CANDIDATE_INVALID'
    )
  }

  return { ...candidate, path: candidatePath, exists: true }
}

function measureDirectory(directoryPath) {
  const stack = [directoryPath]
  let files = 0
  let bytes = 0
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(entryPath)
      } else {
        files += 1
        bytes += fs.lstatSync(entryPath).size
      }
    }
  }
  return { files, bytes }
}

function getAvailableDeletionPath(candidatePath, now) {
  const base = `${candidatePath}.deleting-${formatTimestamp(now)}`
  let result = base
  let suffix = 1
  while (fs.existsSync(result)) {
    result = `${base}-${suffix}`
    suffix += 1
  }
  return result
}

function writeJsonFile(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, content)
  fs.renameSync(tempPath, filePath)
  fs.writeFileSync(`${filePath}.bak`, content)
}

export function cleanupV05MigrationData(dataPath, options = {}) {
  const targetPath = resolveSafeTarget(dataPath)
  const apply = options.apply === true
  const now = options.now instanceof Date ? options.now : new Date()
  const { report, reportPath } = loadCleanupMetadata(targetPath)
  const seen = new Set()
  const candidates = []
  for (const candidate of getCleanupCandidates(targetPath, report)) {
    const validated = validateCandidate(targetPath, candidate)
    const key =
      process.platform === 'win32'
        ? validated.path.toLowerCase()
        : validated.path
    if (seen.has(key)) continue
    seen.add(key)
    const measured = validated.exists
      ? measureDirectory(validated.path)
      : { files: 0, bytes: 0 }
    candidates.push({ ...validated, ...measured })
  }

  const existing = candidates.filter(candidate => candidate.exists)
  const totalFiles = existing.reduce(
    (sum, candidate) => sum + candidate.files,
    0
  )
  const totalBytes = existing.reduce(
    (sum, candidate) => sum + candidate.bytes,
    0
  )
  if (!apply) {
    return {
      status: 'preview',
      changed: false,
      targetPath,
      reportPath,
      candidates,
      totalFiles,
      totalBytes,
    }
  }
  if (existing.length === 0) {
    return {
      status: 'already-clean',
      changed: false,
      targetPath,
      reportPath,
      candidates,
      totalFiles: 0,
      totalBytes: 0,
    }
  }

  const removed = []
  for (const candidate of existing) {
    const deletionPath = getAvailableDeletionPath(candidate.path, now)
    fs.renameSync(candidate.path, deletionPath)
    try {
      fs.rmSync(deletionPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      })
    } catch (error) {
      error.cleanupPath = deletionPath
      throw error
    }
    removed.push({
      kind: candidate.kind,
      path: candidate.path,
      files: candidate.files,
      bytes: candidate.bytes,
    })
  }

  writeJsonFile(reportPath, {
    ...report,
    cleanup: {
      completedAt: now.toISOString(),
      removed,
    },
  })
  return {
    status: 'cleaned',
    changed: true,
    targetPath,
    reportPath,
    candidates,
    removed,
    totalFiles,
    totalBytes,
  }
}

function parseCleanupCliArgs(args) {
  const options = { apply: false, dataPath: '', help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--data-path') {
      options.dataPath = String(args[index + 1] || '').trim()
      if (!options.dataPath) {
        throw cleanupError(
          '--data-path requires a value.',
          'STORAGE_CLEANUP_INVALID_ARGUMENT'
        )
      }
      index += 1
    } else if (arg.startsWith('--data-path=')) {
      options.dataPath = arg.slice('--data-path='.length).trim()
      if (!options.dataPath) {
        throw cleanupError(
          '--data-path requires a value.',
          'STORAGE_CLEANUP_INVALID_ARGUMENT'
        )
      }
    } else {
      throw cleanupError(
        `Unknown cleanup argument: ${arg}`,
        'STORAGE_CLEANUP_INVALID_ARGUMENT'
      )
    }
  }
  return options
}

function printCleanupUsage(write) {
  write('Usage: npm run cleanup:v0.5')
  write('')
  write('The command finds the configured data path and asks before deleting.')
  write('Deletion is permanent. Stop MostBox before cleanup.')
}

function printCleanupCandidates(write, result) {
  write(`v0.5 target: ${result.targetPath}`)
  for (const candidate of result.candidates) {
    const state = candidate.exists
      ? `${candidate.files} files, ${candidate.bytes} bytes`
      : 'already absent'
    write(`Cleanup candidate [${candidate.kind}]: ${candidate.path} (${state})`)
  }
  write(
    `Total reclaimable: ${result.totalFiles} files, ${result.totalBytes} bytes`
  )
}

async function confirmCleanup(result, options) {
  if (typeof options.confirm === 'function') {
    return Boolean(await options.confirm(result))
  }
  const input = options.input || process.stdin
  const output = options.output || process.stdout
  if (!input.isTTY || !output.isTTY) return null

  const readline = createInterface({ input, output })
  try {
    const answer = await readline.question(
      'Delete these migration archives permanently? [y/N] '
    )
    return /^(y|yes)$/i.test(answer.trim())
  } finally {
    readline.close()
  }
}

export async function runV05StorageCleanupCli(args, options = {}) {
  const write = options.write || console.log
  const parsed = parseCleanupCliArgs(args)
  if (parsed.help) {
    printCleanupUsage(write)
    return { status: 'help', changed: false }
  }
  const dataPath =
    parsed.dataPath || options.dataPath || createNodeConfigStore().getDataPath()
  if (parsed.apply) {
    const result = cleanupV05MigrationData(dataPath, { apply: true })
    printCleanupCandidates(write, result)
    if (result.status === 'already-clean') {
      write('Migration cleanup was already completed; no changes were made.')
    } else {
      write('Migration cleanup completed permanently.')
    }
    return result
  }

  const preview = cleanupV05MigrationData(dataPath)
  printCleanupCandidates(write, preview)
  if (!preview.candidates.some(candidate => candidate.exists)) {
    write('Migration cleanup was already completed; no changes were made.')
    return { ...preview, status: 'already-clean' }
  }

  const confirmed = await confirmCleanup(preview, options)
  if (confirmed === null) {
    write(
      'No changes were made. Run this command in an interactive terminal to confirm cleanup.'
    )
    return preview
  }
  if (!confirmed) {
    write('Cleanup cancelled; no changes were made.')
    return { ...preview, status: 'cancelled' }
  }

  const result = cleanupV05MigrationData(dataPath, { apply: true })
  write('Migration cleanup completed permanently.')
  return result
}
