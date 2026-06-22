const path = require('path')
const { pathToFileURL } = require('url')

function fileUrl(...parts) {
  return pathToFileURL(path.join(__dirname, ...parts)).href
}

module.exports = {
  'node:crypto': fileUrl('backend', 'node-crypto-shim.mjs'),
  'multiformats/hashes/sha2': fileUrl(
    'node_modules',
    'multiformats',
    'dist',
    'src',
    'hashes',
    'sha2.js'
  ),
}
