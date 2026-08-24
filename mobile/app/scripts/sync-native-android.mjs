import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const androidDir = path.join(projectDir, 'android')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')
)
const appJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8')
).expo
const appName = String(appJson.name || 'MostBox').trim() || 'MostBox'
const iconSource = resolveProjectAsset(appJson.icon || './assets/icon.png')
const adaptiveIcon = appJson.android?.adaptiveIcon || {}
const adaptiveForegroundSource = resolveProjectAsset(
  adaptiveIcon.foregroundImage || './assets/adaptive-icon-foreground.png'
)
const iconBackgroundColor =
  String(adaptiveIcon.backgroundColor || '#FFFFFF').trim() || '#FFFFFF'
const androidPackage = resolveAndroidPackage(appJson.android?.package)
const androidJavaDir = path.join(androidDir, 'app', 'src', 'main', 'java')
const androidPackageDir = path.join(
  androidJavaDir,
  ...androidPackage.split('.')
)
const mainApplicationPath = path.join(androidPackageDir, 'MainApplication.kt')
const platformConstantsPackagePath = path.join(
  androidPackageDir,
  'PlatformConstantsPackage.kt'
)
const buildGradlePath = path.join(androidDir, 'app', 'build.gradle')
const autolinkingCacheDir = path.join(
  androidDir,
  'build',
  'generated',
  'autolinking'
)
const autolinkingConfigPath = path.join(autolinkingCacheDir, 'autolinking.json')
const appAutolinkingGeneratedDir = path.join(
  androidDir,
  'app',
  'build',
  'generated',
  'autolinking'
)
const releaseGradlePath = path.join(projectDir, 'release.gradle')
const gradlePropertiesPath = path.join(androidDir, 'gradle.properties')
const androidManifestPath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'AndroidManifest.xml'
)
const resValuesDir = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'res',
  'values'
)
const stringsXmlPath = path.join(resValuesDir, 'strings.xml')
const colorsXmlPath = path.join(resValuesDir, 'colors.xml')
const nativeHelperJniDir = path.join(androidDir, 'app', 'src', 'main', 'jni')
const nativeHelperCMakePath = path.join(nativeHelperJniDir, 'CMakeLists.txt')
const nativeHelperShimPath = path.join(
  nativeHelperJniDir,
  'nativehelper_shim.c'
)

const nativeHelperCMake = `cmake_minimum_required(VERSION 3.13)

project(appmodules)

add_library(nativehelper SHARED nativehelper_shim.c)
target_link_libraries(nativehelper dl log)

include(\${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)
`

const nativeHelperShim = `#include <android/log.h>
#include <dlfcn.h>
#include <jni.h>

static JavaVM *mostbox_java_vm = 0;

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
  (void)reserved;
  mostbox_java_vm = vm;
  return JNI_VERSION_1_6;
}

JNIEXPORT jint JNICALL JNI_GetCreatedJavaVMs(JavaVM **vmBuf, jsize bufLen, jsize *nVMs) {
  if (mostbox_java_vm != 0) {
    if (nVMs != 0) {
      *nVMs = 1;
    }
    if (vmBuf != 0 && bufLen > 0) {
      vmBuf[0] = mostbox_java_vm;
    }
    return JNI_OK;
  }

  typedef jint (*GetCreatedJavaVMsFn)(JavaVM **, jsize, jsize *);
  void *art = dlopen("libart.so", RTLD_NOW | RTLD_NOLOAD);
  if (art != 0) {
    GetCreatedJavaVMsFn getCreatedJavaVMs =
      (GetCreatedJavaVMsFn)dlsym(art, "JNI_GetCreatedJavaVMs");
    if (getCreatedJavaVMs != 0 && getCreatedJavaVMs != JNI_GetCreatedJavaVMs) {
      return getCreatedJavaVMs(vmBuf, bufLen, nVMs);
    }
  }

  __android_log_print(
    ANDROID_LOG_WARN,
    "MostBoxNativeHelper",
    "JNI_GetCreatedJavaVMs called before JNI_OnLoad"
  );

  if (nVMs != 0) {
    *nVMs = 0;
  }
  return JNI_OK;
}
`

export function syncNativeAndroidProject({
  version = process.env.MOST_ANDROID_RELEASE_VERSION ||
    appJson.version ||
    packageJson.version ||
    '0.0.0',
  versionCode = process.env.MOST_ANDROID_VERSION_CODE ||
    appJson.android?.versionCode,
  playSigningRequired = false,
  syncVersionValues = true,
} = {}) {
  if (!fs.existsSync(androidDir)) {
    throw new Error(`Native Android project is missing: ${androidDir}`)
  }
  if (!fs.existsSync(iconSource)) {
    throw new Error(`Android icon source is missing: ${iconSource}`)
  }
  if (!fs.existsSync(adaptiveForegroundSource)) {
    throw new Error(
      `Android adaptive icon foreground is missing: ${adaptiveForegroundSource}`
    )
  }

  const releaseVersion = resolveReleaseVersion(version)
  const releaseVersionCode = resolveVersionCode(versionCode, releaseVersion)

  syncAndroidPackage()
  if (syncVersionValues) {
    syncVersion(releaseVersion, releaseVersionCode)
  }
  if (playSigningRequired) {
    syncPlayReleaseSigning()
  } else {
    repairMissingReleaseGradle()
  }
  syncAppName()
  syncIconBackgroundColor()
  syncGradleJvmArgs()
  syncNativeHelperShim()
  cleanupPlatformConstantsPackage()
  cleanupNativeHelperManifestDeclaration()
  syncAndroidManifestPolicy()
  syncLauncherIcons()

  console.log(
    syncVersionValues
      ? `[android] native project synced: package=${androidPackage}, versionName=${releaseVersion}, versionCode=${releaseVersionCode}`
      : `[android] native project synced: package=${androidPackage}, version values preserved`
  )
}

function syncAndroidPackage() {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
  const nextBuildGradle = applyAndroidPackageConfig(buildGradle, androidPackage)
  writeIfChanged(buildGradlePath, nextBuildGradle)
  cleanupStaleAutolinkingPackage()

  for (const fileName of ['MainActivity.kt', 'MainApplication.kt']) {
    const targetPath = path.join(androidPackageDir, fileName)
    const sourcePath = fs.existsSync(targetPath)
      ? targetPath
      : findJavaSourceFile(androidJavaDir, fileName)
    if (!sourcePath) {
      throw new Error(`Android source is missing: ${fileName}`)
    }

    const source = fs.readFileSync(sourcePath, 'utf8')
    const nextSource = applyKotlinPackageDeclaration(source, androidPackage)
    fs.mkdirSync(androidPackageDir, { recursive: true })
    writeIfChanged(targetPath, nextSource)

    if (sourcePath !== targetPath) {
      fs.rmSync(sourcePath)
      removeEmptyJavaParents(path.dirname(sourcePath))
    }
  }
}

function cleanupStaleAutolinkingPackage() {
  if (!fs.existsSync(autolinkingConfigPath)) return

  let cachedPackage = ''
  try {
    const config = JSON.parse(fs.readFileSync(autolinkingConfigPath, 'utf8'))
    cachedPackage = String(config.project?.android?.packageName || '')
  } catch {
    cachedPackage = ''
  }

  if (!isStaleAndroidPackage(cachedPackage, androidPackage)) return
  fs.rmSync(autolinkingCacheDir, { recursive: true, force: true })
  fs.rmSync(appAutolinkingGeneratedDir, { recursive: true, force: true })
}

export function isStaleAndroidPackage(cachedPackage, expectedPackage) {
  const expected = resolveAndroidPackage(expectedPackage)
  const cached = String(cachedPackage || '').trim()
  return Boolean(cached) && cached !== expected
}

export function applyAndroidPackageConfig(buildGradle, packageName) {
  const value = resolveAndroidPackage(packageName)
  const namespacePattern = /namespace\s+['"][^'"]+['"]/
  const applicationIdPattern = /applicationId\s+['"][^'"]+['"]/
  if (
    !namespacePattern.test(buildGradle) ||
    !applicationIdPattern.test(buildGradle)
  ) {
    throw new Error('Unable to update Android package configuration')
  }

  const withNamespace = buildGradle.replace(
    namespacePattern,
    `namespace '${value}'`
  )
  const result = withNamespace.replace(
    applicationIdPattern,
    `applicationId '${value}'`
  )
  return result
}

export function applyKotlinPackageDeclaration(source, packageName) {
  const value = resolveAndroidPackage(packageName)
  const result = source.replace(
    /^package\s+[A-Za-z0-9_.]+/m,
    `package ${value}`
  )
  if (result === source && !source.startsWith(`package ${value}`)) {
    throw new Error('Unable to update Kotlin package declaration')
  }
  return result
}

function resolveAndroidPackage(value) {
  const packageName = String(value || '').trim()
  if (
    !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)
  ) {
    throw new Error(`Invalid Android package name: ${value}`)
  }
  return packageName
}

function findJavaSourceFile(directory, fileName) {
  if (!fs.existsSync(directory)) return ''
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const match = findJavaSourceFile(entryPath, fileName)
      if (match) return match
    } else if (entry.name === fileName) {
      return entryPath
    }
  }
  return ''
}

function removeEmptyJavaParents(directory) {
  let current = path.resolve(directory)
  const root = path.resolve(androidJavaDir)
  while (current.startsWith(`${root}${path.sep}`)) {
    if (fs.readdirSync(current).length > 0) return
    fs.rmdirSync(current)
    current = path.dirname(current)
  }
}

function syncAndroidManifestPolicy() {
  if (!fs.existsSync(androidManifestPath)) return
  const androidManifest = fs.readFileSync(androidManifestPath, 'utf8')
  const nextAndroidManifest = applyAndroidManifestPolicy(
    androidManifest,
    resolveAndroidManifestPolicy(appJson)
  )
  writeIfChanged(androidManifestPath, nextAndroidManifest)
}

function resolveAndroidManifestPolicy(expoConfig) {
  const androidConfig = { ...(expoConfig.android || {}) }
  const buildProperties = resolveExpoBuildProperties(expoConfig)
  const usesCleartextTraffic = buildProperties?.android?.usesCleartextTraffic

  if (typeof usesCleartextTraffic === 'boolean') {
    androidConfig.usesCleartextTraffic = usesCleartextTraffic
  }

  return androidConfig
}

function resolveExpoBuildProperties(expoConfig) {
  const plugins = Array.isArray(expoConfig.plugins) ? expoConfig.plugins : []

  for (const plugin of plugins) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      return plugin[1] || {}
    }
  }

  return {}
}

export function applyAndroidManifestPolicy(androidManifest, androidConfig) {
  let nextAndroidManifest = androidManifest
  const blockedPermissions = Array.isArray(androidConfig.blockedPermissions)
    ? androidConfig.blockedPermissions
    : []

  for (const permission of blockedPermissions) {
    const escapedPermission = escapeRegExp(String(permission))
    nextAndroidManifest = nextAndroidManifest.replace(
      new RegExp(
        `\\s*<uses-permission\\s+[^>]*android:name=["']${escapedPermission}["'][^>]*/>`,
        'g'
      ),
      ''
    )
    const removalDeclaration = `  <uses-permission android:name="${permission}" tools:node="remove"/>`
    if (!nextAndroidManifest.includes(removalDeclaration)) {
      nextAndroidManifest = nextAndroidManifest.replace(
        /(<manifest\b[^>]*>)/,
        `$1\n${removalDeclaration}`
      )
    }
  }

  if (typeof androidConfig.allowBackup === 'boolean') {
    const value = String(androidConfig.allowBackup)
    if (/android:allowBackup=["'][^"']*["']/.test(nextAndroidManifest)) {
      nextAndroidManifest = nextAndroidManifest.replace(
        /android:allowBackup=["'][^"']*["']/,
        `android:allowBackup="${value}"`
      )
    } else {
      nextAndroidManifest = nextAndroidManifest.replace(
        /<application\b/,
        `<application android:allowBackup="${value}"`
      )
    }
  }

  if (typeof androidConfig.usesCleartextTraffic === 'boolean') {
    const value = String(androidConfig.usesCleartextTraffic)
    if (
      /android:usesCleartextTraffic=["'][^"']*["']/.test(nextAndroidManifest)
    ) {
      nextAndroidManifest = nextAndroidManifest.replace(
        /android:usesCleartextTraffic=["'][^"']*["']/,
        `android:usesCleartextTraffic="${value}"`
      )
    } else {
      nextAndroidManifest = nextAndroidManifest.replace(
        /<application\b/,
        `<application android:usesCleartextTraffic="${value}"`
      )
    }
  }

  return nextAndroidManifest
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function syncPlayReleaseSigning() {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
  writeIfChanged(buildGradlePath, applyPlayReleaseSigningConfig(buildGradle))
}

export function applyPlayReleaseSigningConfig(buildGradle) {
  const signingEnvironment = `def mostboxUploadStoreFile = System.getenv("MOSTBOX_ANDROID_KEYSTORE")
def mostboxUploadStorePassword = System.getenv("MOSTBOX_ANDROID_KEYSTORE_PASSWORD")
def mostboxUploadKeyAlias = System.getenv("MOSTBOX_ANDROID_KEY_ALIAS")
def mostboxUploadKeyPassword = System.getenv("MOSTBOX_ANDROID_KEY_PASSWORD")

`
  let nextBuildGradle = buildGradle.includes('mostboxUploadStoreFile')
    ? buildGradle
    : buildGradle.replace(/android\s*\{/, `${signingEnvironment}android {`)

  if (!nextBuildGradle.includes('mostboxUploadStoreFile')) {
    throw new Error('Unable to insert Google Play signing environment')
  }

  if (!nextBuildGradle.includes('storeFile file(mostboxUploadStoreFile)')) {
    nextBuildGradle = nextBuildGradle.replace(
      /(signingConfigs\s*\{[\s\S]*?\n\s*debug\s*\{[\s\S]*?\n\s*\})/m,
      `$1
        release {
            storeFile file(mostboxUploadStoreFile)
            storePassword mostboxUploadStorePassword
            keyAlias mostboxUploadKeyAlias
            keyPassword mostboxUploadKeyPassword
        }`
    )
  }

  const buildTypesIndex = nextBuildGradle.search(/\n\s*buildTypes\s*\{/m)
  if (buildTypesIndex === -1) {
    throw new Error('Android build types block is missing')
  }

  const buildTypesPrefix = nextBuildGradle.slice(0, buildTypesIndex)
  const buildTypes = nextBuildGradle.slice(buildTypesIndex)
  const releaseBlockPattern = /(\n\s*release\s*\{\n)([\s\S]*?)(\n\s*\})/m
  const releaseBlock = buildTypes.match(releaseBlockPattern)
  if (!releaseBlock) throw new Error('Android release build type is missing')

  const releaseBody = releaseBlock[2]
  const signedReleaseBody = /^\s*signingConfig\s+/m.test(releaseBody)
    ? releaseBody.replace(
        /^([ \t]*)signingConfig\s+signingConfigs\.\w+/m,
        '$1signingConfig signingConfigs.release'
      )
    : `        signingConfig signingConfigs.release\n${releaseBody}`

  return `${buildTypesPrefix}${buildTypes.replace(
    releaseBlockPattern,
    `$1${signedReleaseBody}$3`
  )}`
}

function repairMissingReleaseGradle() {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
  const nextBuildGradle = repairMissingReleaseGradleConfig(
    removePlayReleaseSigningConfig(buildGradle),
    fs.existsSync(releaseGradlePath)
  )
  writeIfChanged(buildGradlePath, nextBuildGradle)
}

export function removePlayReleaseSigningConfig(buildGradle) {
  if (!buildGradle.includes('mostboxUploadStoreFile')) return buildGradle

  return buildGradle
    .replace(
      /^def mostboxUploadStoreFile = System\.getenv\("MOSTBOX_ANDROID_KEYSTORE"\)\r?\ndef mostboxUploadStorePassword = System\.getenv\("MOSTBOX_ANDROID_KEYSTORE_PASSWORD"\)\r?\ndef mostboxUploadKeyAlias = System\.getenv\("MOSTBOX_ANDROID_KEY_ALIAS"\)\r?\ndef mostboxUploadKeyPassword = System\.getenv\("MOSTBOX_ANDROID_KEY_PASSWORD"\)\r?\n\r?\n/m,
      ''
    )
    .replace(
      /\r?\n[ \t]*release\s*\{\r?\n[ \t]*storeFile file\(mostboxUploadStoreFile\)\r?\n[ \t]*storePassword mostboxUploadStorePassword\r?\n[ \t]*keyAlias mostboxUploadKeyAlias\r?\n[ \t]*keyPassword mostboxUploadKeyPassword\r?\n[ \t]*\}/m,
      ''
    )
    .replace(
      /signingConfig signingConfigs\.release/g,
      'signingConfig signingConfigs.debug'
    )
}

export function repairMissingReleaseGradleConfig(
  buildGradle,
  releaseGradleExists
) {
  if (releaseGradleExists) return buildGradle

  const withoutDanglingApply = buildGradle.replace(
    /\napply from: file\(["']\.\.\/\.\.\/release\.gradle["']\)\s*\n?/,
    '\n'
  )
  const releaseBlock = withoutDanglingApply.match(
    /^([ \t]*)release\s*\{(\r?\n)([\s\S]*?)^\1\}/m
  )
  if (!releaseBlock || /^\s*signingConfig\s+/m.test(releaseBlock[3])) {
    return withoutDanglingApply
  }

  return withoutDanglingApply.replace(
    /^([ \t]*)release\s*\{(\r?\n)/m,
    `$&$1    signingConfig signingConfigs.debug$2`
  )
}

function resolveReleaseVersion(value) {
  const version = String(value).trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid Android release version: ${value}`)
  }
  return version
}

export function resolveVersionCode(value, version) {
  if (value !== undefined && value !== '') {
    const code = Number(value)
    if (!Number.isInteger(code) || code <= 0) {
      throw new Error(`Invalid Android version code: ${value}`)
    }
    return code
  }

  const [major, minor, patch] = version.split(/[.+-]/, 3).map(Number)
  return major * 10000 + minor * 100 + patch
}

function resolveProjectAsset(assetPath) {
  const value = String(assetPath || '').trim()
  if (!value) return ''
  return path.resolve(projectDir, value)
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function syncVersion(version, versionCode) {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
  const nextBuildGradle = buildGradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`)

  if (nextBuildGradle !== buildGradle) {
    fs.writeFileSync(buildGradlePath, nextBuildGradle)
  }
}

function syncAppName() {
  fs.mkdirSync(resValuesDir, { recursive: true })
  const escapedName = escapeXml(appName)
  const fallback = '<resources>\n</resources>\n'
  const stringsXml = fs.existsSync(stringsXmlPath)
    ? fs.readFileSync(stringsXmlPath, 'utf8')
    : fallback

  const nextStringsXml = stringsXml.includes('name="app_name"')
    ? stringsXml.replace(
        /<string name="app_name">[\s\S]*?<\/string>/,
        `<string name="app_name">${escapedName}</string>`
      )
    : stringsXml.replace(
        /<\/resources>/,
        `  <string name="app_name">${escapedName}</string>\n</resources>`
      )

  writeIfChanged(stringsXmlPath, nextStringsXml)
}

function syncIconBackgroundColor() {
  fs.mkdirSync(resValuesDir, { recursive: true })
  const fallback = '<resources>\n</resources>\n'
  const colorsXml = fs.existsSync(colorsXmlPath)
    ? fs.readFileSync(colorsXmlPath, 'utf8')
    : fallback

  const nextColorsXml = colorsXml.includes('name="iconBackground"')
    ? colorsXml.replace(
        /<color name="iconBackground">[\s\S]*?<\/color>/,
        `<color name="iconBackground">${escapeXml(iconBackgroundColor)}</color>`
      )
    : colorsXml.replace(
        /<\/resources>/,
        `  <color name="iconBackground">${escapeXml(
          iconBackgroundColor
        )}</color>\n</resources>`
      )

  writeIfChanged(colorsXmlPath, nextColorsXml)
}

function syncGradleJvmArgs() {
  const gradleProperties = fs.readFileSync(gradlePropertiesPath, 'utf8')
  const jvmArgs = 'org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m'
  const nextGradleProperties = gradleProperties.replace(
    /^org\.gradle\.jvmargs=.*$/m,
    jvmArgs
  )

  if (nextGradleProperties !== gradleProperties) {
    fs.writeFileSync(gradlePropertiesPath, nextGradleProperties)
  }
}

function cleanupPlatformConstantsPackage() {
  fs.rmSync(platformConstantsPackagePath, { force: true })
  if (!fs.existsSync(mainApplicationPath)) return
  const mainApplication = fs.readFileSync(mainApplicationPath, 'utf8')
  const nextMainApplication = mainApplication.replace(
    /\n\s*add\(PlatformConstantsPackage\(\)\)/,
    ''
  )

  if (nextMainApplication !== mainApplication) {
    fs.writeFileSync(mainApplicationPath, nextMainApplication)
  }
}

function syncNativeHelperShim() {
  fs.mkdirSync(nativeHelperJniDir, { recursive: true })
  writeIfChanged(nativeHelperCMakePath, nativeHelperCMake)
  writeIfChanged(nativeHelperShimPath, nativeHelperShim)
  ensureExternalNativeBuildConfig()
  ensureNativeHelperLoaded()
}

function ensureExternalNativeBuildConfig() {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
  const nextBuildGradle = applyExternalNativeBuildConfig(buildGradle)
  writeIfChanged(buildGradlePath, nextBuildGradle)
}

export function applyExternalNativeBuildConfig(buildGradle) {
  const cmakePath = 'path "src/main/jni/CMakeLists.txt"'
  const stagingLine =
    '            buildStagingDirectory new File(System.getProperty("java.io.tmpdir"), "mostbox-cxx-${Integer.toUnsignedString(projectRoot.hashCode(), 36)}")'
  if (buildGradle.includes(cmakePath)) {
    if (buildGradle.includes(stagingLine.trim())) return buildGradle
    return buildGradle.replace(
      /^(\s*path "src\/main\/jni\/CMakeLists\.txt")(\r?\n)/m,
      `$1$2${stagingLine}$2`
    )
  }

  const config = `    externalNativeBuild {
        cmake {
            path "src/main/jni/CMakeLists.txt"
${stagingLine}
        }
    }
`
  const nextBuildGradle = buildGradle.replace(
    /(\n\s*androidResources\s*\{[\s\S]*?\n\s*\}\n)(\s*\}\n)/,
    `$1${config}$2`
  )

  if (nextBuildGradle === buildGradle) {
    throw new Error('Unable to insert Android externalNativeBuild config')
  }

  return nextBuildGradle
}

function ensureNativeHelperLoaded() {
  if (!fs.existsSync(mainApplicationPath)) return
  const mainApplication = fs.readFileSync(mainApplicationPath, 'utf8')
  if (mainApplication.includes('System.loadLibrary("nativehelper")')) return

  const nextMainApplication = mainApplication.replace(
    /(\n\s*super\.onCreate\(\)\n)/,
    '$1    System.loadLibrary("nativehelper")\n'
  )

  if (nextMainApplication === mainApplication) {
    throw new Error('Unable to insert nativehelper preload in MainApplication')
  }

  fs.writeFileSync(mainApplicationPath, nextMainApplication)
}

function cleanupNativeHelperManifestDeclaration() {
  if (!fs.existsSync(androidManifestPath)) return
  const androidManifest = fs.readFileSync(androidManifestPath, 'utf8')
  const nextAndroidManifest = androidManifest.replace(
    /\n\s*<uses-native-library android:name="libnativehelper\.so" android:required="false"\/>/,
    ''
  )

  if (nextAndroidManifest !== androidManifest) {
    fs.writeFileSync(androidManifestPath, nextAndroidManifest)
  }
}

function syncLauncherIcons() {
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

  for (const density of densities) {
    const mipmapDir = path.join(
      androidDir,
      'app',
      'src',
      'main',
      'res',
      `mipmap-${density}`
    )
    fs.mkdirSync(mipmapDir, { recursive: true })

    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      fs.rmSync(path.join(mipmapDir, `${name}.webp`), { force: true })
      fs.copyFileSync(iconSource, path.join(mipmapDir, `${name}.png`))
    }

    fs.rmSync(path.join(mipmapDir, 'ic_launcher_foreground.webp'), {
      force: true,
    })
    fs.copyFileSync(
      adaptiveForegroundSource,
      path.join(mipmapDir, 'ic_launcher_foreground.png')
    )
  }
}

function writeIfChanged(filePath, content) {
  if (
    fs.existsSync(filePath) &&
    fs.readFileSync(filePath, 'utf8') === content
  ) {
    return
  }

  fs.writeFileSync(filePath, content)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncNativeAndroidProject()
}
