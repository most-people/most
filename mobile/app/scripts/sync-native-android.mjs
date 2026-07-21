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
const mainApplicationPath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'java',
  'box',
  'most',
  'android',
  'MainApplication.kt'
)
const platformConstantsPackagePath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'java',
  'box',
  'most',
  'android',
  'PlatformConstantsPackage.kt'
)
const buildGradlePath = path.join(androidDir, 'app', 'build.gradle')
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
  versionCode = process.env.MOST_ANDROID_VERSION_CODE,
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

  syncVersion(releaseVersion, releaseVersionCode)
  repairMissingReleaseGradle()
  syncAppName()
  syncIconBackgroundColor()
  syncGradleJvmArgs()
  syncNativeHelperShim()
  cleanupPlatformConstantsPackage()
  cleanupNativeHelperManifestDeclaration()
  syncLauncherIcons()

  console.log(
    `[android] native project synced: versionName=${releaseVersion}, versionCode=${releaseVersionCode}`
  )
}

function repairMissingReleaseGradle() {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
  const nextBuildGradle = repairMissingReleaseGradleConfig(
    buildGradle,
    fs.existsSync(releaseGradlePath)
  )
  writeIfChanged(buildGradlePath, nextBuildGradle)
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

function resolveVersionCode(value, version) {
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
  if (buildGradle.includes('path "src/main/jni/CMakeLists.txt"')) return

  const config = `    externalNativeBuild {
        cmake {
            path "src/main/jni/CMakeLists.txt"
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

  fs.writeFileSync(buildGradlePath, nextBuildGradle)
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
