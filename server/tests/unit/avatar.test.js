import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  generateAvatar,
  getDefaultAvatarValue,
  normalizeDefaultAvatarValue,
} from '../../src/utils/avatar.js'

describe('generateAvatar', () => {
  it('returns default image for empty address', () => {
    const result = generateAvatar('')
    assert.strictEqual(result, '/avatar.png')
  })

  it('returns default image for null address', () => {
    const result = generateAvatar(null)
    assert.strictEqual(result, '/avatar.png')
  })

  it('returns a data URI for valid address', () => {
    const result = generateAvatar('0x1234567890abcdef')
    assert.ok(result.startsWith('data:image/svg+xml'))
  })

  it('treats built-in default avatars as regular links', () => {
    const avatar = getDefaultAvatarValue('panda')
    assert.strictEqual(avatar, '/avatars/default/panda.svg')
    assert.strictEqual(
      generateAvatar('0x1234567890abcdef', avatar),
      '/avatars/default/panda.svg'
    )
  })

  it('does not normalize removed default avatar aliases', () => {
    assert.strictEqual(
      getDefaultAvatarValue('mint'),
      '/avatars/default/mint.svg'
    )
    assert.strictEqual(
      normalizeDefaultAvatarValue('/avatars/default/ocean.svg'),
      ''
    )
    assert.strictEqual(
      generateAvatar('0x1234567890abcdef', '/avatars/default/dusk.svg'),
      '/avatars/default/dusk.svg'
    )
  })

  it('produces consistent avatar for same address', () => {
    const addr = '0xabcdef1234567890'
    const avatar1 = generateAvatar(addr)
    const avatar2 = generateAvatar(addr)
    assert.strictEqual(avatar1, avatar2)
  })

  it('produces different avatars for different addresses', () => {
    const avatar1 = generateAvatar('0x1111111111111111')
    const avatar2 = generateAvatar('0x2222222222222222')
    assert.notStrictEqual(avatar1, avatar2)
  })
})
