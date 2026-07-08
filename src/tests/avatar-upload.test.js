import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  AVATAR_UPLOAD_MAX_BYTES,
  AvatarUploadSizeError,
  canCompressAvatarFile,
  compressAvatarImageWithCanvas,
  getCompressedAvatarFileName,
  prepareAvatarUploadFile,
} from '../lib/avatarUpload.js'

function makeFile({ size, type = 'image/jpeg', name = 'avatar.jpg' }) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('avatar upload preparation', () => {
  it('keeps avatars within the upload limit unchanged', async () => {
    const file = makeFile({ size: AVATAR_UPLOAD_MAX_BYTES - 1 })
    let compressed = false

    const result = await prepareAvatarUploadFile(file, {
      compressAvatarImage: async () => {
        compressed = true
        return makeFile({ size: 100 })
      },
    })

    assert.strictEqual(result.file, file)
    assert.equal(result.compressed, false)
    assert.equal(compressed, false)
  })

  it('compresses oversized raster avatars before upload', async () => {
    const file = makeFile({
      size: AVATAR_UPLOAD_MAX_BYTES + 10,
      type: 'image/png',
      name: 'profile.png',
    })

    const result = await prepareAvatarUploadFile(file, {
      compressAvatarImage: async input => {
        assert.strictEqual(input, file)
        return makeFile({
          size: AVATAR_UPLOAD_MAX_BYTES - 200,
          type: 'image/jpeg',
          name: 'profile.jpg',
        })
      },
    })

    assert.equal(result.compressed, true)
    assert.equal(result.file.type, 'image/jpeg')
    assert.equal(result.file.size < AVATAR_UPLOAD_MAX_BYTES, true)
  })

  it('rejects oversized avatars that cannot be compressed safely', async () => {
    const file = makeFile({
      size: AVATAR_UPLOAD_MAX_BYTES + 10,
      type: 'image/gif',
      name: 'avatar.gif',
    })

    await assert.rejects(
      () => prepareAvatarUploadFile(file),
      err =>
        err instanceof AvatarUploadSizeError &&
        err.code === 'AVATAR_UPLOAD_TOO_LARGE'
    )
  })

  it('identifies compressible types and compressed file names', () => {
    assert.equal(canCompressAvatarFile({ type: 'image/jpeg' }), true)
    assert.equal(canCompressAvatarFile({ type: 'image/png' }), true)
    assert.equal(canCompressAvatarFile({ type: 'image/webp' }), true)
    assert.equal(canCompressAvatarFile({ type: 'image/svg+xml' }), false)
    assert.equal(getCompressedAvatarFileName('avatar.png'), 'avatar.jpg')
    assert.equal(getCompressedAvatarFileName('avatar'), 'avatar.jpg')
  })

  it('uses canvas compression until a raster avatar fits the limit', async () => {
    const file = makeFile({
      size: AVATAR_UPLOAD_MAX_BYTES + 100,
      type: 'image/png',
      name: 'wide.png',
    })
    const qualities = []
    let imageClosed = false
    const canvas = {
      width: 0,
      height: 0,
      getContext(type) {
        assert.equal(type, '2d')
        return {
          fillStyle: '',
          fillRect() {},
          drawImage() {},
        }
      },
      toBlob(callback, type, quality) {
        qualities.push(quality)
        const size =
          quality > 0.75
            ? AVATAR_UPLOAD_MAX_BYTES + 20
            : AVATAR_UPLOAD_MAX_BYTES - 20
        callback(new Blob([new Uint8Array(size)], { type }))
      },
    }

    const result = await compressAvatarImageWithCanvas(file, {
      createImageBitmap: async () => ({
        width: 4000,
        height: 2000,
        close() {
          imageClosed = true
        },
      }),
      document: {
        createElement(tagName) {
          assert.equal(tagName, 'canvas')
          return canvas
        },
      },
      maxBytes: AVATAR_UPLOAD_MAX_BYTES,
    })

    assert.equal(canvas.width, 768)
    assert.equal(canvas.height, 384)
    assert.equal(result.name, 'wide.jpg')
    assert.equal(result.type, 'image/jpeg')
    assert.equal(result.size <= AVATAR_UPLOAD_MAX_BYTES, true)
    assert.deepEqual(qualities, [0.86, 0.74])
    assert.equal(imageClosed, true)
  })
})
