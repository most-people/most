import fs from 'node:fs/promises'
import path from 'node:path'

export async function cleanupLegacyKnowledgeData({
  documentsPath,
  userDataPath,
  fileSystem = fs,
  logger = console,
}) {
  const documents = path.resolve(documentsPath)
  const parent = path.join(documents, 'MostBox')
  const target = path.join(parent, 'Notes')
  const marker = path.join(userDataPath, 'legacy-knowledge-cleanup-v1')

  try {
    if (
      (await fileSystem.readFile(marker, 'utf8').catch(() => '')) === 'done'
    ) {
      return
    }
    if (path.relative(documents, target) !== path.join('MostBox', 'Notes')) {
      throw new Error('Cleanup target is outside application storage')
    }
    const documentsStat = await fileSystem.lstat(documents).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (documentsStat?.isSymbolicLink()) {
      throw new Error('Refusing to follow a linked documents directory')
    }
    const parentStat = await fileSystem.lstat(parent).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    // A redirected parent would make rm traverse outside Documents/MostBox.
    if (parentStat?.isSymbolicLink()) {
      throw new Error('Refusing to follow a linked application directory')
    }
    // rm unlinks symbolic links within the target instead of following them.
    await fileSystem.rm(target, { recursive: true, force: true })
    await fileSystem.mkdir(userDataPath, { recursive: true })
    await fileSystem.writeFile(marker, 'done', 'utf8')
  } catch (error) {
    logger.warn('[legacy-cleanup] failed to remove desktop Notes:', error)
  }
}
