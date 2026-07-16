import fs from 'node:fs'
import path from 'node:path'

export const STORAGE_SCHEMA_VERSION = 1
export const STORAGE_SCHEMA_FILE = 'storage-schema.json'

function storageSchemaError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

export function ensureStorageSchema(storagePath) {
  fs.mkdirSync(storagePath, { recursive: true })
  const schemaPath = path.join(storagePath, STORAGE_SCHEMA_FILE)
  if (!fs.existsSync(schemaPath)) {
    const existing = fs
      .readdirSync(storagePath)
      .filter(entry => entry !== 'downloads')
    if (existing.length > 0) {
      throw storageSchemaError(
        'Existing MostBox data uses an unsupported storage format. Clear the app data before restarting.',
        'STORAGE_SCHEMA_RESET_REQUIRED'
      )
    }
    fs.writeFileSync(
      schemaPath,
      `${JSON.stringify({ version: STORAGE_SCHEMA_VERSION }, null, 2)}\n`
    )
    return { version: STORAGE_SCHEMA_VERSION, created: true }
  }
  let schema
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  } catch {
    throw storageSchemaError(
      'MostBox storage schema metadata is invalid.',
      'STORAGE_SCHEMA_UNSUPPORTED'
    )
  }
  if (schema?.version !== STORAGE_SCHEMA_VERSION) {
    throw storageSchemaError(
      `Unsupported MostBox storage schema version: ${schema?.version ?? 'unknown'}.`,
      'STORAGE_SCHEMA_UNSUPPORTED'
    )
  }
  return { version: STORAGE_SCHEMA_VERSION, created: false }
}
