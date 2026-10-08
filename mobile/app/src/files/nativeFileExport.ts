import { requireOptionalNativeModule } from 'expo-modules-core'

export type SavedDocument = {
  uri: string
  fileName: string
  bytesCopied: number
}

type NativeFileExport = {
  saveToDirectory: (
    sourceUri: string,
    directoryUri: string,
    fileName: string,
    mimeType: string,
    expectedSize: number
  ) => Promise<SavedDocument>
}

export async function saveFileToDirectory(
  sourceUri: string,
  directoryUri: string,
  fileName: string,
  mimeType: string,
  expectedSize: number
): Promise<SavedDocument> {
  const exporter =
    requireOptionalNativeModule<NativeFileExport>('MostFileExport')
  if (!exporter) throw new Error('Native file export is unavailable')
  return exporter.saveToDirectory(
    sourceUri,
    directoryUri,
    fileName,
    mimeType,
    expectedSize
  )
}
