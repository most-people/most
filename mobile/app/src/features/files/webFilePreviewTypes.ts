export type WebFilePreviewFile = {
  fileName: string
  fileUri: string
  mimeType: string
}

export type WebFilePreviewProps = {
  file: WebFilePreviewFile | null
  onClose: () => void
}
