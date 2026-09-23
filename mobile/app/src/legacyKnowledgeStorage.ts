const KNOWLEDGE_ROOT = 'mostbox-knowledge'
const NATIVE_MARKER = 'mostbox-legacy-knowledge-cleanup.v1'

interface LegacyStorage {
  documentDirectory: string | null
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>
  readDirectoryAsync: (uri: string) => Promise<string[]>
  deleteAsync: (uri: string, options: { idempotent: boolean }) => Promise<void>
  writeAsStringAsync: (uri: string, content: string) => Promise<void>
}

export async function cleanupLegacyMobileStorage(
  storage: LegacyStorage,
  logger: Pick<Console, 'warn'> = console
) {
  const base = storage.documentDirectory?.replace(/\/$/, '')
  if (!base) return

  try {
    if (!base.startsWith('file:///') || /[?#]/.test(base)) {
      throw new Error('Expected an application document directory')
    }
    const markerUri = `${base}/${NATIVE_MARKER}`
    if ((await storage.getInfoAsync(markerUri)).exists) return
    const entries = await storage.readDirectoryAsync(base)
    const targets = [
      KNOWLEDGE_ROOT,
      ...entries.filter(
        name =>
          name.startsWith(`${KNOWLEDGE_ROOT}.import-`) ||
          name.startsWith(`${KNOWLEDGE_ROOT}.backup-`)
      ),
    ]
    // Validate every entry before deleting anything. Each target is a direct
    // child of the trusted Expo sandbox, never a path supplied by a backup.
    if (targets.some(name => !/^[a-zA-Z0-9.-]+$/.test(name))) {
      throw new Error('Invalid legacy storage entry')
    }
    for (const name of targets) {
      // Expo's native remove operation unlinks symlinks rather than traversing
      // their targets (FileUtils.forceDelete / FileManager.removeItem).
      await storage.deleteAsync(`${base}/${name}`, { idempotent: true })
    }
    await storage.writeAsStringAsync(markerUri, 'done')
  } catch (error) {
    logger.warn('[legacy-cleanup] failed to clear mobile knowledge:', error)
  }
}
