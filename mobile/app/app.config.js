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
