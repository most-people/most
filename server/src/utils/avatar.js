import { createAvatar } from '@dicebear/core'
import { botttsNeutral } from '@dicebear/collection'

export function generateAvatar(address) {
  if (!address) return '/avatar.png'
  return createAvatar(botttsNeutral, {
    seed: 'most.box@' + address,
    flip: true,
    backgroundType: ['gradientLinear'],
  }).toDataUri()
}
