import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const defaultInfoPlistPath = path.join(
  projectDir,
  'ios',
  'MostBox',
  'Info.plist'
)
const appJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8')
).expo

export function applyIosVersionInfo(infoPlist, version, buildNumber) {
  const releaseVersion = String(version || '').trim()
  const releaseBuildNumber = String(buildNumber || '').trim()

  if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) {
    throw new Error(`Invalid iOS release version: ${releaseVersion}`)
  }
  if (!/^[1-9]\d*$/.test(releaseBuildNumber)) {
    throw new Error(`Invalid iOS build number: ${releaseBuildNumber}`)
  }

  return replacePlistString(
    replacePlistString(infoPlist, 'CFBundleShortVersionString', releaseVersion),
    'CFBundleVersion',
    releaseBuildNumber
  )
}

export function applyIosNetworkPolicy(infoPlist, allowsArbitraryLoads) {
  const pattern = new RegExp(
    '(<key>NSAllowsArbitraryLoads</key>\\s*)<(?:true|false)\\s*/>'
  )
  if (!pattern.test(infoPlist)) {
    throw new Error('Unable to update NSAllowsArbitraryLoads in iOS Info.plist')
  }
  return infoPlist.replace(
    pattern,
    `$1<${allowsArbitraryLoads ? 'true' : 'false'}/>`
  )
}

export function applyIosMediaPermissions(infoPlist, permissions = {}) {
  let result = infoPlist
  for (const key of [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSMicrophoneUsageDescription',
  ]) {
    const description = permissions[key]
    if (typeof description !== 'string' || !description.trim()) continue
    const escaped = description
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    if (result.includes(`<key>${key}</key>`)) {
      result = replacePlistString(result, key, escaped)
    } else {
      const closing = /<\/dict>(\s*<\/plist>\s*)$/
      if (!closing.test(result))
        throw new Error('Unable to add media permissions to iOS Info.plist')
      result = result.replace(
        closing,
        (_match, suffix) =>
          `  <key>${key}</key>\n  <string>${escaped}</string>\n</dict>${suffix}`
      )
    }
  }
  return result
}

export function syncNativeIosProject({
  version = appJson.version,
  buildNumber = appJson.ios?.buildNumber,
  infoPlistPath = defaultInfoPlistPath,
} = {}) {
  if (!fs.existsSync(infoPlistPath)) {
    console.log(
      '[ios] native project is absent; Expo prebuild will generate it'
    )
    return false
  }

  const infoPlist = fs.readFileSync(infoPlistPath, 'utf8')
  const versionedInfoPlist = applyIosVersionInfo(
    infoPlist,
    version,
    buildNumber
  )
  const networkInfoPlist = applyIosNetworkPolicy(
    versionedInfoPlist,
    appJson.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads ===
      true
  )
  const nextInfoPlist = applyIosMediaPermissions(
    networkInfoPlist,
    appJson.ios?.infoPlist
  )
  if (nextInfoPlist !== infoPlist) {
    fs.writeFileSync(infoPlistPath, nextInfoPlist)
  }

  console.log(
    `[ios] native project synced: version=${version}, buildNumber=${buildNumber}`
  )
  return true
}

function replacePlistString(infoPlist, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`)
  if (!pattern.test(infoPlist)) {
    throw new Error(`Unable to update ${key} in iOS Info.plist`)
  }
  return infoPlist.replace(
    pattern,
    (_match, prefix, suffix) => `${prefix}${value}${suffix}`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncNativeIosProject()
}
