import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.dirname(fileURLToPath(import.meta.url))
const baseConfig = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8')
).expo
const profiles = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'product-profiles.json'), 'utf8')
)
const requested = String(
  process.env.MOST_PRODUCT || process.env.EXPO_PUBLIC_MOST_PRODUCT || ''
)
  .trim()
  .toLowerCase()
const productId =
  requested === 'inkbox' || requested === 'mohe' || requested === '墨盒'
    ? 'inkbox'
    : 'most'
const profile = profiles[productId]

export default {
  expo: {
    ...baseConfig,
    name: profile.appName,
    slug: productId === 'most' ? baseConfig.slug : 'mohe',
    scheme: profile.scheme,
    android: {
      ...baseConfig.android,
      package: profile.androidPackage,
      permissions: (baseConfig.android.permissions || []).filter(
        permission =>
          (profile.features.voice ||
            !String(permission).endsWith('RECORD_AUDIO')) &&
          (profile.features.chat ||
            (!String(permission).endsWith('CAMERA') &&
              !String(permission).endsWith('POST_NOTIFICATIONS')))
      ),
      blockedPermissions: [
        ...(baseConfig.android.blockedPermissions || []),
        ...(!profile.features.voice ? ['android.permission.RECORD_AUDIO'] : []),
        ...(!profile.features.chat ? ['android.permission.CAMERA'] : []),
        ...(!profile.features.chat
          ? ['android.permission.POST_NOTIFICATIONS']
          : []),
      ],
    },
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: profile.iosBundleIdentifier,
    },
    extra: {
      ...baseConfig.extra,
      product: productId,
    },
  },
}
