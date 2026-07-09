export const AVATAR_UPLOAD_MAX_BYTES = 1024 * 1024

const COMPRESSIBLE_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
const COMPRESSED_AVATAR_TYPE = 'image/jpeg'
const COMPRESSED_AVATAR_QUALITIES = [0.86, 0.74, 0.62, 0.5, 0.42]
const MAX_AVATAR_EDGE = 768

export class AvatarUploadSizeError extends Error {
  constructor(message = 'Avatar image is too large') {
    super(message)
    this.name = 'AvatarUploadSizeError'
    this.code = 'AVATAR_UPLOAD_TOO_LARGE'
  }
}

export class AvatarCompressionError extends Error {
  constructor(message = 'Avatar image compression failed') {
    super(message)
    this.name = 'AvatarCompressionError'
    this.code = 'AVATAR_COMPRESSION_FAILED'
  }
}

function normalizeMimeType(file) {
  return String(file?.type || '')
    .trim()
    .toLowerCase()
}

function isAvatarFileTooLarge(file, maxBytes = AVATAR_UPLOAD_MAX_BYTES) {
  return Number(file?.size || 0) > maxBytes
}

export function canCompressAvatarFile(file) {
  return COMPRESSIBLE_AVATAR_TYPES.has(normalizeMimeType(file))
}

export function getCompressedAvatarFileName(fileName) {
  const normalized = String(fileName || 'avatar').trim() || 'avatar'
  return normalized.replace(/\.[^.\\/]+$/, '') + '.jpg'
}

function getScaledAvatarDimensions(width, height, maxEdge = MAX_AVATAR_EDGE) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight))
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  }
}

function createCanvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new AvatarCompressionError())
      },
      type,
      quality
    )
  })
}

export async function compressAvatarImageWithCanvas(file, options = {}) {
  const maxBytes = options.maxBytes || AVATAR_UPLOAD_MAX_BYTES
  const createBitmap = options.createImageBitmap || globalThis.createImageBitmap
  const documentRef = options.document || globalThis.document

  if (typeof createBitmap !== 'function' || !documentRef?.createElement) {
    throw new AvatarCompressionError()
  }

  let image
  try {
    image = await createBitmap(file)
    const canvas = documentRef.createElement('canvas')
    const dimensions = getScaledAvatarDimensions(
      image.width,
      image.height,
      options.maxEdge || MAX_AVATAR_EDGE
    )
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new AvatarCompressionError()

    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of options.qualities || COMPRESSED_AVATAR_QUALITIES) {
      const blob = await createCanvasBlob(
        canvas,
        COMPRESSED_AVATAR_TYPE,
        quality
      )
      if (blob.size <= maxBytes) {
        return new File([blob], getCompressedAvatarFileName(file.name), {
          type: COMPRESSED_AVATAR_TYPE,
          lastModified: file.lastModified || Date.now(),
        })
      }
    }
  } catch (err) {
    if (err instanceof AvatarUploadSizeError) throw err
    if (err instanceof AvatarCompressionError) throw err
    throw new AvatarCompressionError(err?.message)
  } finally {
    if (image?.close) image.close()
  }

  throw new AvatarUploadSizeError()
}

export async function prepareAvatarUploadFile(file, options = {}) {
  const maxBytes = options.maxBytes || AVATAR_UPLOAD_MAX_BYTES
  if (!isAvatarFileTooLarge(file, maxBytes)) {
    return { file, compressed: false }
  }

  if (!canCompressAvatarFile(file)) {
    throw new AvatarUploadSizeError()
  }

  const compress =
    options.compressAvatarImage ||
    (input => compressAvatarImageWithCanvas(input, options))
  const compressedFile = await compress(file)
  if (isAvatarFileTooLarge(compressedFile, maxBytes)) {
    throw new AvatarUploadSizeError()
  }
  return { file: compressedFile, compressed: true }
}
