import * as FileSystem from 'expo-file-system/legacy'
import { createKnowledgeRepository } from './knowledgeRepository'
import type { KnowledgeStorageAdapter } from './types'

function getDocumentBaseUri() {
  if (!FileSystem.documentDirectory) {
    throw new Error('当前设备没有可用的应用文档目录')
  }
  return FileSystem.documentDirectory.replace(/\/$/, '')
}

function encodeRelativePath(path: string) {
  return path
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
}

function toDocumentUri(path: string) {
  return `${getDocumentBaseUri()}/${encodeRelativePath(path)}`
}

export function createExpoKnowledgeStorage(): KnowledgeStorageAdapter {
  return {
    async getInfo(path) {
      const info = await FileSystem.getInfoAsync(toDocumentUri(path))
      return {
        exists: info.exists,
        isDirectory: info.exists && info.isDirectory === true,
        size: info.exists && typeof info.size === 'number' ? info.size : 0,
        mtimeMs:
          info.exists && typeof info.modificationTime === 'number'
            ? info.modificationTime * 1000
            : 0,
      }
    },
    list: path => FileSystem.readDirectoryAsync(toDocumentUri(path)),
    read: path =>
      FileSystem.readAsStringAsync(toDocumentUri(path), {
        encoding: FileSystem.EncodingType.UTF8,
      }),
    write: (path, content) =>
      FileSystem.writeAsStringAsync(toDocumentUri(path), content, {
        encoding: FileSystem.EncodingType.UTF8,
      }),
    mkdir: path =>
      FileSystem.makeDirectoryAsync(toDocumentUri(path), {
        intermediates: true,
      }),
    move: (from, to) =>
      FileSystem.moveAsync({
        from: toDocumentUri(from),
        to: toDocumentUri(to),
      }),
    remove: path =>
      FileSystem.deleteAsync(toDocumentUri(path), { idempotent: true }),
  }
}

export function createExpoKnowledgeRepository() {
  return createKnowledgeRepository(createExpoKnowledgeStorage())
}
