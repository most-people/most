import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultProjectDir = path.resolve(scriptDir, '..')
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const REQUIRED_PRIVACY_API_CATEGORIES = [
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategorySystemBootTime',
]

export function expectedIosBuildNumber(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Invalid iOS release version: ${version}`)

  const [, major, minor, patch] = match.map(Number)
  return major * 10000 + minor * 100 + patch
}

export function readPngMetadata(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 33 ||
    !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error('App icon must be a valid PNG file')
  }

  let offset = PNG_SIGNATURE.length
  let metadata
  let hasTransparencyChunk = false

  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset)
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8)
    const chunkEnd = offset + 12 + chunkLength
    if (chunkEnd > buffer.length) throw new Error('App icon PNG is truncated')

    if (chunkType === 'IHDR') {
      if (chunkLength !== 13)
        throw new Error('App icon PNG has an invalid IHDR')
      metadata = {
        width: buffer.readUInt32BE(offset + 8),
        height: buffer.readUInt32BE(offset + 12),
        bitDepth: buffer[offset + 16],
        colorType: buffer[offset + 17],
      }
    }
    if (chunkType === 'tRNS') hasTransparencyChunk = true

    offset = chunkEnd
    if (chunkType === 'IEND') break
  }

  if (!metadata) throw new Error('App icon PNG is missing IHDR')
  return {
    ...metadata,
    hasAlpha:
      metadata.colorType === 4 ||
      metadata.colorType === 6 ||
      hasTransparencyChunk,
  }
}

export function collectIosReleaseIssues({
  expo,
  packageVersion,
  packageLockVersion,
  packageLockRootVersion,
  rootVersion,
  eas,
  iconMetadata,
}) {
  const issues = []
  const requireValue = (condition, message) => {
    if (!condition) issues.push(message)
  }

  requireValue(expo?.name === 'MostBox', 'Expo app name must be MostBox')
  requireValue(
    expo?.version === packageVersion,
    `Expo version ${expo?.version} must match package version ${packageVersion}`
  )
  requireValue(
    expo?.version === packageLockVersion &&
      expo?.version === packageLockRootVersion,
    'Expo version must match both mobile package-lock.json version fields'
  )
  requireValue(
    expo?.version === rootVersion,
    `Expo version ${expo?.version} must match root package version ${rootVersion}`
  )
  requireValue(
    expo?.orientation === 'portrait',
    'iOS must remain portrait-only'
  )
  requireValue(expo?.scheme === 'most', 'iOS URL scheme must be most')
  requireValue(
    expo?.ios?.bundleIdentifier === 'most.box',
    'iOS bundle identifier must be most.box'
  )
  requireValue(
    expo?.ios?.supportsTablet === false,
    'iOS App Store build must target iPhone only'
  )

  let minimumBuildNumber
  try {
    minimumBuildNumber = expectedIosBuildNumber(expo?.version)
  } catch (error) {
    issues.push(error.message)
  }
  const buildNumber = String(expo?.ios?.buildNumber || '')
  requireValue(
    /^[1-9]\d*$/.test(buildNumber),
    'iOS buildNumber must be a positive integer string'
  )
  if (minimumBuildNumber !== undefined && /^[1-9]\d*$/.test(buildNumber)) {
    requireValue(
      Number(buildNumber) >= minimumBuildNumber,
      `iOS buildNumber must be at least ${minimumBuildNumber}`
    )
  }

  const localNetworkDescription =
    expo?.ios?.infoPlist?.NSLocalNetworkUsageDescription
  requireValue(
    typeof localNetworkDescription === 'string' &&
      localNetworkDescription.trim().length > 0,
    'NSLocalNetworkUsageDescription is required for P2P networking'
  )

  const privacyManifest = expo?.ios?.privacyManifests
  requireValue(
    privacyManifest?.NSPrivacyTracking === false,
    'iOS privacy manifest must explicitly disable tracking'
  )
  requireValue(
    Array.isArray(privacyManifest?.NSPrivacyCollectedDataTypes) &&
      privacyManifest.NSPrivacyCollectedDataTypes.length === 0,
    'iOS privacy manifest must explicitly declare no collected data'
  )
  const accessedApiTypes = privacyManifest?.NSPrivacyAccessedAPITypes || []
  for (const category of REQUIRED_PRIVACY_API_CATEGORIES) {
    const declaration = accessedApiTypes.find(
      entry => entry.NSPrivacyAccessedAPIType === category
    )
    requireValue(
      Array.isArray(declaration?.NSPrivacyAccessedAPITypeReasons) &&
        declaration.NSPrivacyAccessedAPITypeReasons.length > 0,
      `iOS privacy manifest is missing a reason for ${category}`
    )
  }

  const buildProperties = expo?.plugins?.find(
    plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
  )
  requireValue(
    buildProperties?.[1]?.ios?.deploymentTarget === '16.4',
    'iOS deployment target must be 16.4'
  )

  requireValue(
    eas?.build?.['ios-production']?.distribution === 'store',
    'EAS ios-production profile must use store distribution'
  )
  requireValue(
    eas?.build?.['ios-production']?.environment === 'production',
    'EAS ios-production profile must use the production environment'
  )

  requireValue(
    iconMetadata?.width === 1024 && iconMetadata?.height === 1024,
    'iOS app icon must be 1024 x 1024'
  )
  requireValue(
    iconMetadata?.hasAlpha === false,
    'iOS app icon cannot use alpha'
  )

  return issues
}

export function checkIosRelease(projectDir = defaultProjectDir) {
  const packageJson = readJson(path.join(projectDir, 'package.json'))
  const packageLock = readJson(path.join(projectDir, 'package-lock.json'))
  const rootPackage = readJson(
    path.resolve(projectDir, '..', '..', 'package.json')
  )
  const expo = readJson(path.join(projectDir, 'app.json')).expo
  const eas = readJson(path.join(projectDir, 'eas.json'))
  const iconPath = path.resolve(projectDir, expo.icon)
  const iconMetadata = readPngMetadata(fs.readFileSync(iconPath))
  const issues = collectIosReleaseIssues({
    expo,
    packageVersion: packageJson.version,
    packageLockVersion: packageLock.version,
    packageLockRootVersion: packageLock.packages?.['']?.version,
    rootVersion: rootPackage.version,
    eas,
    iconMetadata,
  })

  if (issues.length > 0) {
    throw new Error(`iOS release preflight failed:\n- ${issues.join('\n- ')}`)
  }

  console.log(
    `iOS release preflight passed: ${expo.version} (${expo.ios.buildNumber}), ${expo.ios.bundleIdentifier}`
  )
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkIosRelease()
}
