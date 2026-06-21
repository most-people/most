const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, 'mjs'])
)
config.resolver.assetExts = Array.from(
  new Set([...config.resolver.assetExts, 'bundle'])
)

module.exports = config
