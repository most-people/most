import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

import {
  getDownloadCheckErrorMessageFromPayload,
  getDownloadLinkValidationMessage,
} from '../../server/src/utils/downloadMessages.js'
import { requiredStaticEntries } from '../../scripts/static-routes.mjs'

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

const repoRootPath = fileURLToPath(new URL('../../', import.meta.url))

const SOURCE_PATHS = {
  agents: 'AGENTS.md',
  packageJson: 'package.json',
  readme: 'README.md',
  viteConfig: 'vite.config.ts',
  components: {
    featurePortal: 'src/components/FeaturePortal.tsx',
    footer: 'src/components/Footer.tsx',
    remoteNodePanel: 'src/components/RemoteNodeConnectPanel.tsx',
  },
  features: {
    admin: 'src/features/admin/AdminPage.tsx',
    about: 'src/features/about/AboutPage.tsx',
    chat: 'src/features/chat/ChatPage.tsx',
    cid: 'src/features/cid/CidPage.tsx',
    download: 'src/features/download/DownloadPage.tsx',
    files: 'src/features/files/AppPage.tsx',
    ganDengYan: 'src/features/game/gandengyan/GanDengYanPage.tsx',
  },
  i18n: {
    entry: 'src/lib/i18n/messages.ts',
    catalogs: 'src/lib/i18n/messages',
    provider: 'src/lib/i18n/index.tsx',
  },
  routes: {
    about: 'src/routes/about/index.tsx',
    app: 'src/routes/app/index.tsx',
    admin: 'src/routes/admin/index.tsx',
    cid: 'src/routes/cid/$cid/index.tsx',
    download: 'src/routes/download/index.tsx',
    root: 'src/routes/__root.tsx',
    tree: 'src/routes',
  },
  scripts: {
    checkStaticOutput: 'scripts/check-static-output.mjs',
    staticRoutes: 'scripts/static-routes.mjs',
  },
}

async function importBundledSource(sourcePath) {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL(`../../${sourcePath}`, import.meta.url)),
    ],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    logLevel: 'silent',
    platform: 'node',
    write: false,
    plugins: [
      {
        name: 'repo-alias',
        setup(build) {
          build.onResolve({ filter: /^~server\// }, args => ({
            path: resolveServerAlias(args.path),
          }))
          build.onResolve({ filter: /^~\// }, args => ({
            path: resolveSrcAlias(args.path),
          }))
        },
      },
    ],
  })
  const bundled = result.outputFiles[0].text
  return import(
    `data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`
  )
}

function resolveSrcAlias(importPath) {
  return resolveWithExtensions(
    path.join(repoRootPath, 'src', importPath.slice(2))
  )
}

function resolveServerAlias(importPath) {
  return resolveWithExtensions(
    path.join(repoRootPath, 'server', importPath.slice('~server/'.length))
  )
}

function resolveWithExtensions(resolvedPath) {
  const candidates = [
    resolvedPath,
    `${resolvedPath}.ts`,
    `${resolvedPath}.tsx`,
    `${resolvedPath}.js`,
    `${resolvedPath}.jsx`,
    path.join(resolvedPath, 'index.ts'),
    path.join(resolvedPath, 'index.tsx'),
    path.join(resolvedPath, 'index.js'),
    path.join(resolvedPath, 'index.jsx'),
  ]
  return (
    candidates.find(
      candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ) || resolvedPath
  )
}

function listSourceFiles(path) {
  return fs
    .readdirSync(new URL(`../../${path}/`, import.meta.url), {
      withFileTypes: true,
    })
    .flatMap(entry => {
      const childPath = `${path}/${entry.name}`
      return entry.isDirectory() ? listSourceFiles(childPath) : [childPath]
    })
}

function readI18nSources() {
  return [
    SOURCE_PATHS.i18n.entry,
    ...listSourceFiles(SOURCE_PATHS.i18n.catalogs)
      .filter(file => file.endsWith('.ts'))
      .sort(),
  ]
    .map(readSource)
    .join('\n')
}

describe('frontend smoke checks', () => {
  it('keeps documented root dev command backed by package scripts', () => {
    const packageJson = JSON.parse(readSource(SOURCE_PATHS.packageJson))

    assert.equal(packageJson.scripts.dev, 'vite')
    assert.match(readSource(SOURCE_PATHS.readme), /npm run dev/)
    assert.match(readSource(SOURCE_PATHS.agents), /npm run dev/)
  })

  it('keeps the chat join and search labels concise across locales', async () => {
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.equal(messages['zh-CN']['chat.search.placeholder'], '搜索')
    assert.equal(messages['zh-CN']['chat.joinChannel'], '加入聊天')
    assert.equal(messages['zh-TW']['chat.search.placeholder'], '搜尋')
    assert.equal(messages['zh-TW']['chat.joinChannel'], '加入聊天')
    assert.equal(messages.en['chat.search.placeholder'], 'Search')
    assert.equal(messages.en['chat.joinChannel'], 'Join chat')
  })

  it('keeps the portal landing copy concise across locales', async () => {
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')
    const descriptionKeys = [
      'portal.feature.app.desc',
      'portal.feature.chat.desc',
      'portal.feature.note.desc',
      'portal.feature.game.desc',
      'portal.feature.web3.desc',
    ]

    for (const locale of ['zh-CN', 'zh-TW']) {
      assert.ok(messages[locale]['portal.hero.subtitle'].length <= 42)
      for (const key of descriptionKeys) {
        assert.ok(messages[locale][key].length <= 32, `${locale} ${key}`)
      }
    }

    assert.ok(messages.en['portal.hero.subtitle'].length <= 76)
    for (const key of descriptionKeys) {
      assert.ok(messages.en[key].length <= 68, `en ${key}`)
    }

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.doesNotMatch(
        messages[locale]['portal.feature.web3.desc'],
        /Ed25519|x25519|key pairs|密钥对|金鑰對|地址派生|derived addresses/
      )
    }
  })

  it('keeps the share modal aligned with the MVP seeding promise', () => {
    const source = readSource(SOURCE_PATHS.features.files)
    const shareLinkSource = readSource('src/lib/shareLink.ts')
    const messages = readI18nSources()

    assert.match(
      source,
      /buildMostShareLink\(shareItem\.cid, shareItem\.fileName\)/
    )
    assert.match(
      source,
      /buildCidShareLink\(shareItem\.cid, shareItem\.fileName\)/
    )
    assert.match(source, /\{mostShareLink\}/)
    assert.match(source, /\{webShareLink\}/)
    assert.match(source, /app\.shareMostLink/)
    assert.match(source, /app\.shareWebLink/)
    assert.match(shareLinkSource, /most:\/\/\$\{cid\}/)
    assert.match(shareLinkSource, /https:\/\/most\.box/)
    assert.match(shareLinkSource, /\/cid\/\$\{encodeURIComponent\(cid\)\}/)
    assert.match(
      shareLinkSource,
      /\?filename=\$\{encodeURIComponent\(trimmedFileName\)\}/
    )
    assert.match(source, /app\.shareSeedNote/)
    assert.match(messages, /本机在线时可下载/)
    assert.match(messages, /下载者完成后会默认继续做种/)
  })

  it('keeps the download modal validation messages user-readable', () => {
    assert.equal(
      getDownloadLinkValidationMessage(''),
      '请先粘贴分享链接或 CID。'
    )
    assert.equal(
      getDownloadLinkValidationMessage('https://example.com/file'),
      'CID 无效，请确认输入末尾是有效的 CID 或 CID?filename=...。'
    )
    assert.equal(
      getDownloadCheckErrorMessageFromPayload({ status: 503 }),
      '暂时没有发现在线种子。请确认分享者或其他下载者仍在线做种，稍后再检测。'
    )
  })

  it('shows node holdings and seed states in the admin console', () => {
    const source = readSource(SOURCE_PATHS.features.admin)
    const messages = readI18nSources()

    assert.match(source, /NodeHolding/)
    assert.match(source, /formatSeedStatus/)
    assert.match(source, /admin\.seedStatus\.active/)
    assert.match(source, /admin\.seedStatus\.queued/)
    assert.match(messages, /'admin\.seedStatus\.active': '做种中'/)
    assert.match(messages, /'admin\.seedStatus\.queued': '队列中'/)
  })

  it('does not advertise unlimited file size in user-facing copy', () => {
    const sources = [
      readSource(SOURCE_PATHS.readme),
      readSource(SOURCE_PATHS.features.admin),
      readSource(SOURCE_PATHS.components.featurePortal),
      readI18nSources(),
      readSource(SOURCE_PATHS.features.download),
    ].join('\n')

    assert.doesNotMatch(sources, /无限文件大小|无限制传输/)
    assert.match(sources, /10GB|10 GB/)
  })

  it('formats publish file size limit messages', async () => {
    const { getPublishFileLimitViolation } = await importBundledSource(
      'src/lib/publishLimits.ts'
    )
    const t = (key, params) => `超过最大 ${params.maxSize} 限制`

    assert.equal(
      getPublishFileLimitViolation(
        { name: 'large.bin', size: 15 * 1024 * 1024 },
        { maxFileSizeBytes: 10 * 1024 * 1024 },
        t
      ),
      '超过最大 10 MB 限制'
    )
    assert.equal(
      getPublishFileLimitViolation(
        { name: 'small.bin', size: 5 * 1024 * 1024 },
        { maxFileSizeBytes: 10 * 1024 * 1024 },
        t
      ),
      ''
    )

    assert.match(
      readSource('src/lib/i18n/messages/files.ts'),
      /'app\.publish\.fileTooLarge':\s*'超过最大 \{maxSize\} 限制'/
    )
  })

  it('parses and normalizes admin storage limit input', async () => {
    const {
      parseStorageLimitInput,
      formatStorageLimitInput,
      convertStorageLimitUnit,
      splitStorageLimitInput,
      storageLimitToBytes,
    } = await importBundledSource('src/lib/storageLimitInput.ts')

    assert.equal(parseStorageLimitInput('10 MB'), 10 * 1024 * 1024)
    assert.equal(parseStorageLimitInput('0.01 GiB'), 10737418)
    assert.equal(parseStorageLimitInput('0.01'), 10737418)
    assert.equal(formatStorageLimitInput(10737418), '10.24 MB')
    assert.equal(formatStorageLimitInput(10 * 1024 * 1024 * 1024), '10 GiB')
    assert.deepEqual(splitStorageLimitInput(10737418), {
      value: '10.24',
      unit: 'MB',
    })
    assert.deepEqual(splitStorageLimitInput(10 * 1024 * 1024 * 1024), {
      value: '10',
      unit: 'GiB',
    })
    assert.equal(storageLimitToBytes('10.2', 'MB'), 10695475)
    assert.equal(storageLimitToBytes('0.01', 'GiB'), 10737418)
    assert.equal(convertStorageLimitUnit('10', 'MB', 'GiB'), '0.009765625')
    assert.equal(convertStorageLimitUnit('0.01', 'GiB', 'MB'), '10.24')
  })

  it('preflights publish size limits before uploading', () => {
    const fileApiSource = readSource('src/lib/fileApi.ts')
    const filesSource = readSource(SOURCE_PATHS.features.files)
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')

    assert.match(fileApiSource, /getNodePolicy/)
    assert.match(fileApiSource, /getPublishFileLimitViolation/)
    assert.match(fileApiSource, /getPublishFileErrorMessage/)
    assert.match(fileApiSource, /throwHttpErrors:\s*false/)

    const filesPolicyIndex = filesSource.indexOf(
      'const publishPolicy = await fileApi.getNodePolicy()'
    )
    const filesCheckIndex = filesSource.indexOf(
      'const limitMessage = getPublishFileLimitViolation'
    )
    const filesNameExistsIndex = filesSource.indexOf('const nameExists =')
    const filesPublishIndex = filesSource.indexOf(
      'const result = await fileApi.publishFile'
    )
    assert.ok(filesPolicyIndex >= 0)
    assert.ok(filesCheckIndex > filesPolicyIndex)
    assert.ok(filesNameExistsIndex > filesCheckIndex)
    assert.ok(filesPublishIndex > filesCheckIndex)
    assert.match(filesSource, /e\.target\.value = ''/)

    const chatPolicyIndex = chatSource.indexOf(
      'const publishPolicy = await fileApi.getNodePolicy()'
    )
    const chatCheckIndex = chatSource.indexOf(
      'const limitMessage = getPublishFileLimitViolation'
    )
    const chatPublishIndex = chatSource.indexOf(
      'const result = await fileApi.publishFile'
    )
    assert.ok(chatPolicyIndex >= 0)
    assert.ok(chatCheckIndex > chatPolicyIndex)
    assert.ok(chatPublishIndex > chatCheckIndex)
    assert.match(chatUiSource, /event\.currentTarget\.value = ''/)
  })

  it('publishes files and chat attachments without success toasts', () => {
    const filesSource = readSource(SOURCE_PATHS.features.files)
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const i18nMessages = readI18nSources()
    const processStart = filesSource.indexOf(
      'const processFiles = async (files: FileList | File[]) => {'
    )
    const processEnd = filesSource.indexOf(
      '\n  const mostShareLink',
      processStart
    )
    const handlerStart = chatSource.indexOf(
      'async function handleSelectAttachmentFiles'
    )
    const handlerEnd = chatSource.indexOf(
      '\n  async function handleOpenAttachment',
      handlerStart
    )
    const processSource = filesSource.slice(processStart, processEnd)
    const handlerSource = chatSource.slice(handlerStart, handlerEnd)

    assert.ok(processStart >= 0)
    assert.ok(processEnd > processStart)
    assert.match(processSource, /fileApi\.publishFile/)
    assert.match(processSource, /status:\s*'completed'/)
    assert.doesNotMatch(processSource, /app\.fileAddedLocal/)

    assert.ok(handlerStart >= 0)
    assert.ok(handlerEnd > handlerStart)
    assert.match(handlerSource, /fileApi\.publishFile/)
    assert.match(handlerSource, /sendChannelMessage\(link, attachment\)/)
    assert.doesNotMatch(handlerSource, /chat\.attachment\.published/)
    assert.doesNotMatch(i18nMessages, /app\.fileAddedLocal/)
    assert.doesNotMatch(i18nMessages, /chat\.attachment\.published/)
  })

  it('treats node-local downloads as importable unless the user already has the file', () => {
    const filesSource = readSource(SOURCE_PATHS.features.files)
    const apiSource = readSource('src/lib/fileApi.ts')
    const checkStart = filesSource.indexOf(
      'const handleCheckDownloadAvailability = async () => {'
    )
    const checkEnd = filesSource.indexOf(
      '\n  const handleDownloadSharedFile',
      checkStart
    )
    const downloadStart = filesSource.indexOf(
      'const handleDownloadSharedFile = async () => {'
    )
    const downloadEnd = filesSource.indexOf(
      '\n  const handleCancelTransfer',
      downloadStart
    )
    const checkSource = filesSource.slice(checkStart, checkEnd)
    const downloadSource = filesSource.slice(downloadStart, downloadEnd)

    assert.ok(checkStart >= 0)
    assert.ok(checkEnd > checkStart)
    assert.ok(downloadStart >= 0)
    assert.ok(downloadEnd > downloadStart)
    assert.match(apiSource, /localAvailable\?: boolean/)
    assert.match(checkSource, /result\.alreadyExists\s*\?/)
    assert.match(checkSource, /app\.fileAlreadyLocal/)
    assert.doesNotMatch(
      checkSource,
      /result\.localAvailable[\s\S]*app\.fileAlreadyLocal/
    )
    assert.match(downloadSource, /result\.localAvailable/)
    assert.match(downloadSource, /refreshFiles\(\)/)
  })

  it('lets the admin max file field accept MB or GiB input', () => {
    const adminSource = readSource(SOURCE_PATHS.features.admin)
    const selectControlSource = readSource(
      'src/components/ui/SelectControl.tsx'
    )
    const globalsSource = readSource('src/styles/globals.css')

    assert.match(adminSource, /SegmentedControl/)
    assert.match(adminSource, /SelectControl/)
    assert.match(adminSource, /splitStorageLimitInput/)
    assert.match(adminSource, /storageLimitToBytes/)
    assert.match(adminSource, /maxFileSizeValue/)
    assert.match(adminSource, /maxFileSizeUnit/)
    assert.match(adminSource, /convertStorageLimitUnit/)
    assert.match(adminSource, /MAX_FILE_SIZE_UNIT_OPTIONS/)
    assert.match(adminSource, /className="admin-unit-field"/)
    assert.match(adminSource, /step="any"/)
    assert.match(
      adminSource,
      /ariaLabel=\{t\('admin\.settings\.maxFileSizeUnit'\)\}/
    )
    assert.match(adminSource, /options=\{MAX_FILE_SIZE_UNIT_OPTIONS\}/)
    assert.match(adminSource, /value=\{configForm\.maxFileSizeUnit\}/)
    assert.match(adminSource, /onChange=\{nextUnit =>/)
    assert.match(adminSource, /<SelectControl/)
    assert.match(adminSource, /ariaLabel=\{t\('admin\.table\.pageSize'\)\}/)
    assert.match(
      adminSource,
      /onChange=\{nextPageSize => table\.setPageSize\(nextPageSize\)\}/
    )
    assert.match(adminSource, /size="compact"/)
    assert.doesNotMatch(adminSource, /<select/)
    assert.doesNotMatch(adminSource, /admin-unit-segment/)
    assert.doesNotMatch(adminSource, /admin-unit-select/)
    assert.doesNotMatch(adminSource, /admin-page-size-select/)
    assert.doesNotMatch(adminSource, /maxFileSizeGiB/)
    assert.doesNotMatch(adminSource, /maxFileSizeText/)
    assert.match(selectControlSource, /export function SelectControl/)
    assert.match(selectControlSource, /<select/)
    assert.match(selectControlSource, /ui-select-field/)
    assert.match(selectControlSource, /ui-select-control/)
    assert.match(selectControlSource, /ChevronDown/)
    assert.match(selectControlSource, /ui-select-icon/)
    assert.doesNotMatch(selectControlSource, /role="listbox"/)
    assert.doesNotMatch(selectControlSource, /role="option"/)
    assert.match(globalsSource, /\.ui-select-control/)
    assert.match(
      globalsSource,
      /\.ui-select-control \{[\s\S]*font-weight:\s*400;/
    )
    assert.match(globalsSource, /appearance:\s*none/)
    assert.match(globalsSource, /\.ui-select-icon/)
    assert.match(globalsSource, /color-scheme:\s*dark/)
    assert.match(globalsSource, /\.ui-select-control option/)
    assert.doesNotMatch(globalsSource, /\.ui-select-menu/)
    assert.doesNotMatch(globalsSource, /\.ui-select-option/)
  })

  it('lets users choose R2 or GitHub download sources', () => {
    const source = [
      readSource('src/components/DownloadOptions.tsx'),
      readSource('src/lib/downloadOptions.ts'),
    ].join('\n')

    assert.match(source, /VITE_RELEASE_MANIFEST_URL/)
    assert.match(source, /VITE_R2_PUBLIC_BASE_URL/)
    assert.match(source, /releases\/latest\.json/)
    assert.match(source, /https:\/\/download\.most\.box/)
    assert.match(source, /github\.com\/most-people\/most\/releases\/latest/)
    assert.match(source, /Cloudflare R2/)
    assert.match(source, /GitHub Releases/)
    assert.match(source, /role="tablist"/)
  })

  it('defines expressive theme tokens without flattening dark surfaces', () => {
    const globalStyles = readSource('src/styles/globals.css')
    const downloadStyles = readSource('src/styles/download.css')
    const cardMatch = downloadStyles.match(
      /\.download-current-card\s*\{([\s\S]*?)\n\}/
    )

    assert.match(globalStyles, /--surface-page-glow-primary:/)
    assert.match(globalStyles, /--surface-page-glow-secondary:/)
    assert.match(globalStyles, /--surface-card-glow-primary:/)
    assert.match(globalStyles, /--surface-card-glow-secondary:/)
    assert.match(globalStyles, /--card-bg-expressive:/)
    assert.match(globalStyles, /--card-border-expressive:/)
    assert.match(globalStyles, /--card-shadow-expressive:/)
    assert.match(globalStyles, /--accent-glow:/)
    assert.match(globalStyles, /--success-glow:/)
    assert.match(globalStyles, /--info-glow:/)
    assert.match(globalStyles, /\[data-theme='dark'\][\s\S]*--card-bg-expressive:/)
    assert.ok(cardMatch)
    assert.match(cardMatch[1], /background:\s*var\(--card-bg-expressive\);/)
    assert.match(cardMatch[1], /border:\s*1px solid var\(--card-border-expressive\);/)
    assert.match(cardMatch[1], /box-shadow:\s*var\(--card-shadow-expressive\);/)
    assert.match(downloadStyles, /background:\s*var\(--accent-glow\);/)
    assert.doesNotMatch(
      downloadStyles,
      /\[data-theme='light'\]\s+\.download-current-card/
    )
  })

  it('selects current-system release resources with GitHub fallback', async () => {
    const { getDownloadOptionsState, getReleaseManifestUrl } =
      await importBundledSource('src/lib/downloadOptions.ts')
    const manifest = {
      version: '0.2.0',
      publishedAt: '2026-06-02T00:00:00.000Z',
      assets: [
        {
          platform: 'windows',
          arch: 'x64',
          kind: 'installer',
          filename: 'MostBox-0.2.0-win-x64-setup.exe',
          size: 113246208,
          cid: 'bafkreibax3b55elk3vr76ejckvn32ucdogkiq5kkwu5vuxgmccf2hdhbiq',
          r2Url:
            'https://download.most.box/releases/v0.2.0/MostBox-0.2.0-win-x64-setup.exe',
          githubUrl:
            'https://github.com/most-people/most/releases/download/v0.2.0/MostBox-0.2.0-win-x64-setup.exe',
        },
        {
          platform: 'linux',
          arch: 'x64',
          kind: 'installer',
          filename: 'MostBox-0.2.0-linux-x86_64.AppImage',
          size: 124780544,
          cid: 'bafkreig6cnqx3ee7sxd35w25kapmwfxcnoofkrtevizwnfmdqpiksnh5ni',
          githubUrl:
            'https://github.com/most-people/most/releases/download/v0.2.0/MostBox-0.2.0-linux-x86_64.AppImage',
        },
        {
          platform: 'android',
          arch: 'universal',
          kind: 'installer',
          filename: 'mostbox-android-0.2.0-release.apk',
          size: 68452352,
          cid: 'bafkreif4csfzuslg5x6k2z5q4kptmw4cy7rkzpb5z4k5yfll5pnoc3s4ua',
          r2Url:
            'https://download.most.box/releases/v0.2.0/mostbox-android-0.2.0-release.apk',
          githubUrl:
            'https://github.com/most-people/most/releases/download/v0.2.0/mostbox-android-0.2.0-release.apk',
        },
      ],
    }

    const windowsState = getDownloadOptionsState({
      manifest,
      currentKey: 'windows:x64',
      requestedSource: 'r2',
    })
    assert.equal(windowsState.currentAsset?.kind, 'installer')
    assert.equal(
      windowsState.currentAsset?.filename,
      'MostBox-0.2.0-win-x64-setup.exe'
    )
    assert.equal(windowsState.currentDownload?.source, 'r2')
    assert.equal(windowsState.currentDownload?.url, manifest.assets[0].r2Url)

    const linuxState = getDownloadOptionsState({
      manifest,
      currentKey: 'linux:x64',
      requestedSource: 'r2',
    })
    assert.equal(linuxState.currentAsset?.filename, manifest.assets[1].filename)
    assert.equal(linuxState.currentDownload?.source, 'github')
    assert.equal(linuxState.currentDownload?.url, manifest.assets[1].githubUrl)

    const androidState = getDownloadOptionsState({
      manifest,
      currentKey: 'android:universal',
      requestedSource: 'r2',
    })
    assert.equal(
      androidState.currentAsset?.filename,
      'mostbox-android-0.2.0-release.apk'
    )
    assert.equal(androidState.currentDownload?.source, 'r2')
    assert.equal(androidState.currentDownload?.url, manifest.assets[2].r2Url)
    assert.equal(
      getReleaseManifestUrl({
        VITE_R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
      }),
      'https://cdn.example.com/releases/latest.json'
    )
  })

  it('offers Android APK downloads instead of listing Android as coming soon', () => {
    const source = [
      readSource('src/components/DownloadOptions.tsx'),
      readSource('src/lib/downloadOptions.ts'),
    ].join('\n')

    assert.match(source, /android:universal/)
    assert.match(source, /ext:\s*'\.apk'/)
    assert.doesNotMatch(source, /key:\s*'android'[\s\S]*comingSoon/)
  })

  it('builds and uploads Android APK assets during release', () => {
    const releaseWorkflow = readSource('.github/workflows/release.yml')
    const buildScript = readSource('mobile/android/scripts/build-apk.mjs')

    assert.match(releaseWorkflow, /build-android:/)
    assert.match(releaseWorkflow, /npm ci --prefix mobile\/android/)
    assert.match(releaseWorkflow, /npm test --prefix mobile\/android/)
    assert.match(releaseWorkflow, /MOST_ANDROID_RELEASE_VERSION/)
    assert.match(releaseWorkflow, /npm run build --prefix mobile\/android/)
    assert.match(releaseWorkflow, /mostbox-android-\*-release\.apk/)
    assert.match(releaseWorkflow, /build-android/)
    assert.match(buildScript, /MOST_ANDROID_RELEASE_VERSION/)
    assert.match(
      buildScript,
      /expo[\s\S]*prebuild[\s\S]*--platform[\s\S]*android/
    )
  })

  it('documents the dedicated R2 release bucket defaults', () => {
    const releaseWorkflow = readSource('.github/workflows/release.yml')
    const readme = readSource(SOURCE_PATHS.readme)

    assert.match(releaseWorkflow, /most-box-releases/)
    assert.match(releaseWorkflow, /https:\/\/download\.most\.box/)
    assert.match(releaseWorkflow, /most-box-backup/)
    assert.match(releaseWorkflow, /head-object/)
    assert.match(releaseWorkflow, /expected STANDARD/)
    assert.match(releaseWorkflow, /max-age=31536000, immutable/)
    assert.match(releaseWorkflow, /stale-while-revalidate=300/)
    assert.doesNotMatch(releaseWorkflow, /blockmap/)
    assert.doesNotMatch(releaseWorkflow, /mac-\*\.zip/)
    assert.doesNotMatch(releaseWorkflow, /--recursive/)
    assert.match(readme, /most-box-releases/)
    assert.match(readme, /https:\/\/download\.most\.box/)
    assert.match(readme, /most-box-backup/)
    assert.match(readme, /Standard/)
    assert.match(readme, /不再发布 updater \/ blockmap 资产/)
    assert.match(readme, /max-age=31536000, immutable/)
    assert.match(readme, /stale-while-revalidate=300/)
  })

  it('documents current runtime and desktop dependency requirements', () => {
    const readme = readSource(SOURCE_PATHS.readme)
    const agents = readSource(SOURCE_PATHS.agents)
    const downloadPage = readSource(SOURCE_PATHS.features.download)
    const portal = readSource(SOURCE_PATHS.components.featurePortal)
    const messages = readI18nSources()
    const remoteNodePanel = readSource(SOURCE_PATHS.components.remoteNodePanel)

    assert.match(readme, /Node\.js >= 22\.12/)
    assert.match(readme, /npx most-box@latest/)
    assert.match(readme, /桌面客户端（推荐）/)
    assert.match(readme, /Web 入口只负责连接已有 MostBox 节点/)
    assert.match(readme, /Electron 42/)
    assert.match(readme, /TanStack Start static prerender/)
    assert.doesNotMatch(readme, /Node\.js >= 18/)
    assert.doesNotMatch(readme, /npx most-box\s*$/m)
    assert.match(downloadPage, /download\.hero\.desc/)
    assert.match(downloadPage, /download\.npmNote/)
    assert.match(messages, /Web 端只连接已有 MostBox 节点/)
    assert.match(messages, /Node\.js >= 22\.12/)
    assert.match(messages, /npx most-box@latest/)
    assert.doesNotMatch(portal, /portal\.status\.note/)
    assert.doesNotMatch(portal, /portal-status-band/)
    assert.match(messages, /Web 端只连接已有节点，桌面端提供完整 P2P 能力/)
    assert.match(remoteNodePanel, /remote\.hint/)
    assert.match(messages, /Web 端只连接已有 MostBox 节点/)
    assert.match(messages, /本机完整 P2P 能力请使用桌面客户端/)
    assert.doesNotMatch(readme, /Electron 41/)
    assert.match(agents, /ipfs-unixfs-importer@17\.0\.1/)
    assert.doesNotMatch(agents, /components\/AppHomeMode\.tsx/)
  })

  it('documents the equal toolbox acceptance path without weakening protocol regression', () => {
    const acceptance = readSource('docs/acceptance.md')
    const agents = readSource(SOURCE_PATHS.agents)

    assert.match(acceptance, /平权工具箱/)
    assert.match(acceptance, /文件、聊天、知识库、游戏和 Web3 是同等入口/)
    assert.match(acceptance, /`http:\/\/localhost:3000\/`/)
    assert.match(acceptance, /`\/app\/` 保留完整文件发布、下载和做种管理/)
    assert.match(acceptance, /聊天设置不再提供知识库导出入口/)
    assert.match(acceptance, /发布者退出/)
    assert.match(acceptance, /`game\.<gameId>\.<roomCode>` Channel/)
    assert.match(acceptance, /`most:\/\/<cid>\?filename=\.\.\.`/)
    assert.match(acceptance, /cidVersion: 1/)
    assert.match(acceptance, /rawLeaves: true/)
    assert.match(acceptance, /wrapWithDirectory: false/)
    assert.match(acceptance, /cid\.multihash\.digest/)
    assert.match(acceptance, /`\/<cid>`/)
    assert.match(acceptance, /下载完成后必须重算 UnixFS CID v1/)
    assert.match(acceptance, /Web3 工具箱独立/)
    assert.match(acceptance, /cd mobile\/android[\s\S]*npm test/)
    assert.match(agents, /代码、README 和验收文档是当前事实来源/)
    assert.match(
      agents,
      /\| 新用户、本地验收和 MVP 回归\s*\| `docs\/acceptance\.md`/
    )
    assert.doesNotMatch(
      acceptance,
      new RegExp('当前主线验收从 `/' + 'chat/` 开始')
    )
    assert.doesNotMatch(acceptance, new RegExp('保存聊天记录到' + '知识库'))
    assert.doesNotMatch(
      acceptance,
      /主应用\s*\|\s*`http:\/\/localhost:3000\/app\/`\s*\|\s*发布文件/
    )
  })

  it('keeps Android aligned with the attachment and seeding MVP', () => {
    const appSource = readSource('mobile/android/App.tsx')
    const chatRoomSource = readSource(
      'mobile/android/src/features/chat/ChatRoomScreen.tsx'
    )
    const nodeStatusSource = readSource(
      'mobile/android/src/features/node/NodeStatusScreen.tsx'
    )
    const androidReadme = readSource('mobile/android/README.md')
    const androidAlpha = readSource('docs/mobile-android-alpha.md')
    const readme = readSource(SOURCE_PATHS.readme)
    const androidSources = [appSource, chatRoomSource, nodeStatusSource].join(
      '\n'
    )

    assert.match(appSource, /createMostBoxCore/)
    assert.match(appSource, /P2P 核心启动失败/)
    assert.match(appSource, /content: attachment\.link/)
    assert.match(appSource, /parseMostLink/)
    assert.match(appSource, /handleDownloadAttachment/)
    assert.match(chatRoomSource, /accessibilityLabel="发送附件"/)
    assert.match(chatRoomSource, /accessibilityLabel="下载附件"/)
    assert.match(nodeStatusSource, /waitingCore: '等待核心'/)
    assert.match(androidSources, /chat-android/)
    assert.doesNotMatch(
      androidSources,
      /Channel Probe|Send Probe Message|No channel messages/
    )
    assert.doesNotMatch(androidSources, /\{__DEV__ \? \(/)
    assert.match(androidReadme, /Android foreground P2P alpha/)
    assert.match(androidReadme, /Sending an attachment publishes/)
    assert.match(
      androidReadme,
      /Received chat messages that contain a `most:\/\/` link/
    )
    assert.match(androidAlpha, /Android 内测验收清单/)
    assert.match(androidAlpha, /Android 聊天附件发送/)
    assert.match(androidAlpha, /发布者退出后继续传播/)
    assert.match(readme, /Android Alpha/)
    assert.match(readme, /收发消息、用 `most:\/\/` 附件传文件/)
    assert.doesNotMatch(readme, new RegExp('Android 聊天' + '优先完整种子 MVP'))
  })

  it('uses TanStack Start static prerender for the web shell', () => {
    const packageJson = readSource(SOURCE_PATHS.packageJson)
    const viteConfig = readSource(SOURCE_PATHS.viteConfig)
    const rootRoute = readSource(SOURCE_PATHS.routes.root)
    const appRoute = readSource(SOURCE_PATHS.routes.app)
    const adminRoute = readSource(SOURCE_PATHS.routes.admin)
    const downloadRoute = readSource(SOURCE_PATHS.routes.download)

    assert.match(packageJson, /"@tanstack\/react-start"/)
    assert.doesNotMatch(packageJson, /"next"/)
    assert.match(viteConfig, /tanstackStart/)
    assert.match(viteConfig, /prerender/)
    assert.match(viteConfig, /autoStaticPathsDiscovery:\s*true/)
    assert.match(viteConfig, /autoSubfolderIndex:\s*true/)
    assert.match(viteConfig, /crawlLinks:\s*true/)
    assert.match(viteConfig, /failOnError:\s*true/)
    assert.match(viteConfig, /outDir:\s*'out'/)
    assert.match(rootRoute, /HeadContent/)
    assert.match(rootRoute, /Scripts/)
    assert.match(appRoute, /ssr:\s*false/)
    assert.match(adminRoute, /ssr:\s*false/)
    assert.doesNotMatch(downloadRoute, /ssr:\s*false/)
  })

  it('shows the static package version in the footer', () => {
    const footer = readSource(SOURCE_PATHS.components.footer)
    const portal = readSource('src/components/FeaturePortal.tsx')
    const admin = readSource(SOURCE_PATHS.features.admin)

    assert.match(footer, /from '..\/..\/package\.json'/)
    assert.match(portal, /useAppStore/)
    assert.match(portal, /getPortalBackendStatus/)
    assert.match(portal, /portal-node-status/)
    assert.doesNotMatch(portal, /portal-node-panel/)
    assert.match(footer, /const version = packageJson\.version/)
    assert.match(footer, /v\{version\}/)
    assert.doesNotMatch(portal, /portal-status-band/)
    assert.doesNotMatch(footer, /useAppStore/)
    assert.doesNotMatch(footer, /mkt-footer-status/)
    assert.doesNotMatch(footer, /title=\{version\}/)
    assert.doesNotMatch(footer, /commit=|build=/)
    assert.doesNotMatch(admin, /admin\.nodeStatus\.webBuild/)
    assert.doesNotMatch(admin, /buildVersion|buildIdentifier|buildInfo/)
  })

  it('routes footer About to a product about page', () => {
    const footer = readSource(SOURCE_PATHS.components.footer)
    const aboutPage = readSource(SOURCE_PATHS.features.about)
    const aboutRoute = readSource(SOURCE_PATHS.routes.about)
    const aboutLazyRoute = readSource('src/routes/about/index.lazy.tsx')
    const staticManifest = readSource(SOURCE_PATHS.scripts.staticRoutes)
    const messages = readI18nSources()

    assert.match(footer, /to:\s*'\/about\/'/)
    assert.match(aboutRoute, /createFileRoute\('\/about\/'\)/)
    assert.match(aboutLazyRoute, /createLazyFileRoute\('\/about\/'\)/)
    assert.match(aboutLazyRoute, /AboutPage/)
    assert.match(staticManifest, /'\/about\/'/)
    assert.match(aboutPage, /MarketingLayout/)
    assert.match(aboutPage, /AppTop/)
    assert.match(aboutPage, /header=\{<AboutHeader \/>/)
    assert.match(aboutPage, /about\.hero\.title/)
    assert.match(aboutPage, /about\.summary\.cid/)
    assert.match(aboutPage, /about\.summary\.opensource/)
    assert.match(aboutPage, /about\.section\.identity\.title/)
    assert.match(aboutPage, /about\.section\.spread\.title/)
    assert.match(aboutPage, /about\.section\.boundary\.title/)
    assert.match(aboutPage, /about\.section\.chat\.title/)
    assert.match(aboutPage, /about\.section\.chat\.bullet\.voice/)
    assert.match(aboutPage, /about\.section\.note\.title/)
    assert.match(aboutPage, /about\.section\.game\.title/)
    assert.match(aboutPage, /about\.section\.web3\.title/)
    assert.match(aboutPage, /featured:\s*true/)
    assert.match(aboutPage, /about-topic featured/)
    assert.match(aboutPage, /to="\/chat\/"/)
    assert.match(aboutPage, /to="\/download\/"/)
    assert.match(messages, /About MOST PEOPLE/)
    assert.match(messages, /Decentralized P2P toolbox/)
    assert.match(messages, /MOST PEOPLE is a fully open source P2P toolbox/)
    assert.doesNotMatch(
      messages,
      new RegExp('MOST PEOPLE starts from ' + 'chat')
    )
    assert.match(messages, /邀请大家/)
    assert.doesNotMatch(
      messages,
      /像微信一样|先把人连起来|Like familiar chat apps/
    )
    assert.match(messages, /Multi-person voice calls/)
    assert.match(messages, /magnet links and BT torrents/)
    assert.match(messages, /MOST PEOPLE is fully open source/)
    assert.match(messages, /most:\/\/<cid>/)
    assert.match(messages, /not cloud storage/)
    assert.match(messages, /Knowledge Base/)
    assert.match(messages, /Open-source account system/)
    assert.match(
      messages,
      /MOST PEOPLE accounts use this local identity system/
    )
    assert.match(messages, /Other projects can use it/)
    assert.match(messages, /'portal\.feature\.web3\.title': 'Web3'/)
    assert.match(
      messages,
      /'portal\.feature\.web3\.subtitle': 'Open-source account system'/
    )
    assert.match(messages, /Open source and reusable/)
    assert.doesNotMatch(messages, /Independent account toolbox/)
  })

  it('keeps static output checks aligned with TanStack static routes', () => {
    const checkStaticOutput = readSource(SOURCE_PATHS.scripts.checkStaticOutput)
    const staticManifest = readSource(SOURCE_PATHS.scripts.staticRoutes)
    const checkedRoutes = requiredStaticEntries.map(({ route }) => route).sort()

    const staticRoutes = Array.from(
      new Set(
        listSourceFiles(SOURCE_PATHS.routes.tree)
          .filter(file => file.endsWith('.tsx'))
          .flatMap(file => {
            const source = readSource(file)
            const match = source.match(
              /create(?:Lazy)?FileRoute\(\s*'([^']+)'\s*\)/
            )
            if (!match) {
              return []
            }

            const route = match[1]
            if (route.includes('$') || !/component\s*:/.test(source)) {
              return []
            }

            return [route]
          })
      )
    ).sort()

    assert.deepEqual(checkedRoutes, staticRoutes)
    assert.match(checkStaticOutput, /requiredStaticEntries/)
    assert.match(staticManifest, /admin/)
    assert.match(staticManifest, /chat\/join/)
    assert.match(staticManifest, /note/)
    assert.match(staticManifest, /web3/)
    assert.doesNotMatch(staticManifest, /web3\/ed25519/)
    assert.doesNotMatch(staticManifest, /web3\/tools/)
    assert.match(staticManifest, /game\/gandengyan/)
  })

  it('checks desktop updates through the public release manifest', () => {
    const mainSource = readSource('electron/main.js')
    const checkerSource = readSource('electron/updateChecker.js')
    const preloadSource = readSource('electron/preload.cjs')

    assert.match(mainSource, /checkForUpdates/)
    assert.match(mainSource, /dialog\.showMessageBox/)
    assert.match(mainSource, /shell\.openExternal\(update\.downloadUrl\)/)
    assert.match(mainSource, /formatBytes/)
    assert.doesNotMatch(mainSource, /downloadCidToPath/)
    assert.doesNotMatch(mainSource, /seedCidFileFromPath/)
    assert.doesNotMatch(mainSource, /installDownloadedUpdate/)
    assert.doesNotMatch(mainSource, /updates:/)
    assert.match(preloadSource, /selectNoteVaultDirectory/)
    assert.doesNotMatch(preloadSource, /ipcRenderer\.(send|on|once)\(/)
    assert.doesNotMatch(preloadSource, /ipcRenderer:\s*ipcRenderer/)
    assert.doesNotMatch(preloadSource, /updates:/)
    assert.match(checkerSource, /MOSTBOX_RELEASE_MANIFEST_URL/)
    assert.match(checkerSource, /download\.most\.box\/releases\/latest\.json/)
    assert.match(checkerSource, /getInstallerReleaseAssets/)
    assert.doesNotMatch(checkerSource, /findCompatibleUpdateAsset/)
  })

  it('registers and routes most protocol deep links to the CID page', () => {
    const packageJson = readSource(SOURCE_PATHS.packageJson)
    const mainSource = readSource('electron/main.js')
    const deepLinkSource = readSource('electron/deepLink.js')
    const cidRoute = readSource(SOURCE_PATHS.routes.cid)

    assert.match(packageJson, /"schemes":\s*\[\s*"most"\s*\]/)
    assert.match(mainSource, /setAsDefaultProtocolClient\('most'/)
    assert.match(mainSource, /requestSingleInstanceLock/)
    assert.match(mainSource, /second-instance/)
    assert.match(mainSource, /open-url/)
    assert.match(deepLinkSource, /createCidRoutePathFromMostLink/)
    assert.match(
      deepLinkSource,
      /\/cid\/\$\{encodeURIComponent\(url\.hostname\)\}/
    )
    assert.match(cidRoute, /createFileRoute\('\/cid\/\$cid\/'\)/)
    assert.match(cidRoute, /ssr:\s*false/)
  })

  it('offers a browser handoff from CID landing pages to the desktop client', () => {
    const cidPage = readSource(SOURCE_PATHS.features.cid)
    const cidStyles = readSource('src/styles/cid.css')
    const messages = readI18nSources()

    assert.match(
      cidPage,
      /import \{ MarketingHeader \} from '~\/components\/MarketingHeader'/
    )
    assert.match(cidPage, /<div className="cid-layout">/)
    assert.match(cidPage, /<MarketingHeader \/>/)
    assert.match(cidStyles, /\.cid-layout/)
    assert.match(cidPage, /href=\{mostLink\}/)
    assert.match(cidPage, /onClick=\{handleOpenMostBox\}/)
    assert.match(cidPage, /HANDOFF_FALLBACK_DELAY_MS/)
    assert.match(cidPage, /cid\.handoff\.fallback/)
    assert.match(cidPage, /to="\/download\/"/)
    assert.match(messages, /'cid\.handoff\.action': '用 MostBox 打开'/)
    assert.match(messages, /系统协议未注册/)
    assert.match(messages, /'cid\.handoff\.action': 'Open in MostBox'/)
    assert.match(messages, /system protocol may not be registered/)
  })

  it('keeps the CID page as a check-before-download flow', () => {
    const cidPage = readSource(SOURCE_PATHS.features.cid)
    const rootRoute = readSource(SOURCE_PATHS.routes.root)
    const messages = readI18nSources()

    assert.match(cidPage, /buildMostLinkFromRoute/)
    assert.match(cidPage, /fileApi\.checkDownload\(mostLink\)/)
    assert.match(cidPage, /fileApi\.downloadFile\(mostLink\)/)
    assert.match(cidPage, /getAuthenticatedWebSocketUrl\('\/ws'\)/)
    assert.match(cidPage, /fileApi\s*\.\s*getDataPath\(\)/)
    assert.match(cidPage, /parseMostLink\(mostLink\)/)
    assert.match(rootRoute, /styles\/cid\.css/)
    assert.match(messages, /'cid\.startAction': '开始下载'/)
    assert.match(messages, /MostBox 数据目录\/downloads/)
    assert.match(messages, /'cid\.startAction': 'Start download'/)
  })

  it('uses shared app shell components by navigation density', () => {
    const headerSource = readSource('src/components/MarketingHeader.tsx')
    const gameSidebarSource = readSource('src/components/GameSidebar.tsx')
    const noteSidebarSource = readSource('src/components/NoteSidebar.tsx')
    const appPageSource = readSource('src/features/files/AppPage.tsx')
    const chatPageSource = readSource('src/features/chat/ChatPage.tsx')
    const chatJoinSource = readSource('src/features/chat/ChatJoinPage.tsx')
    const web3PageSource = readSource('src/features/web3/Web3Page.tsx')
    const appTopSource = readSource('src/components/AppTop.tsx')
    const appEmptySource = readSource('src/components/AppEmpty.tsx')
    const appGlobalsSource = readSource('src/components/AppGlobals.tsx')
    const userStoreSource = readSource('src/stores/userStore.ts')
    const useBackSource = readSource('src/hooks/useBack.ts')

    assert.match(userStoreSource, /firstPath: string/)
    assert.match(appGlobalsSource, /setFirstPath\(pathname \|\| '\/'\)/)
    assert.match(useBackSource, /firstPath === pathname/)
    assert.match(useBackSource, /setFirstPath\('\/'\)/)
    assert.match(useBackSource, /navigate\(\{ to: '\/', replace: true \}\)/)
    assert.match(useBackSource, /window\.history\.back\(\)/)
    assert.match(headerSource, /useBack/)
    for (const source of [
      gameSidebarSource,
      appPageSource,
      chatPageSource,
      web3PageSource,
    ]) {
      assert.match(source, /<AppTop onNavigate=\{closeSidebar\} \/>/)
      assert.doesNotMatch(source, /useBack/)
      assert.doesNotMatch(source, /ArrowLeft/)
    }
    for (const source of [noteSidebarSource]) {
      assert.match(source, /<AppTop \/>/)
      assert.doesNotMatch(source, /useBack/)
      assert.doesNotMatch(source, /ArrowLeft/)
    }
    assert.match(
      chatJoinSource,
      /<AppEmpty className="chat-join-loading-page">/
    )
    assert.doesNotMatch(chatJoinSource, /<AppTop/)
    assert.doesNotMatch(chatJoinSource, /AppShell/)
    assert.match(
      appTopSource,
      /<Link\s+to="\/"\s+className="sidebar-header sidebar-header-link"/
    )
    assert.match(appEmptySource, /<main className=\{className\}>/)
    assert.doesNotMatch(headerSource, /<Link to="\/" className="mkt-nav-logo"/)
  })

  it('keeps chat join progress aligned with chat restoring loading', () => {
    const chatJoinSource = readSource('src/features/chat/ChatJoinPage.tsx')
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatRestoringSource = readSource(
      'src/features/chat/ChatRestoringIndicator.tsx'
    )
    const chatCssSource = readSource('src/styles/chat.css')
    const i18nMessages = readI18nSources()

    assert.doesNotMatch(chatJoinSource, /useBack/)
    assert.doesNotMatch(chatJoinSource, /ArrowLeft/)
    assert.doesNotMatch(chatJoinSource, /KeyRound/)
    assert.doesNotMatch(chatJoinSource, /Check/)
    assert.match(
      chatJoinSource,
      /const \[retryAttempt, setRetryAttempt\] = useState\(0\)/
    )
    assert.match(chatJoinSource, /flowKeyRef\.current = ''/)
    assert.match(chatJoinSource, /setRetryAttempt\(attempt => attempt \+ 1\)/)
    assert.match(chatJoinSource, /retryAttempt,/)
    assert.match(chatJoinSource, /className="chat-join-actions"/)
    assert.match(chatJoinSource, /t\('chatJoin\.action\.retry'\)/)
    assert.doesNotMatch(chatJoinSource, /t\('common\.back'\)/)
    assert.doesNotMatch(chatJoinSource, /chatJoin\.status\./)
    assert.doesNotMatch(i18nMessages, /'chatJoin\.status\./)
    assert.doesNotMatch(chatJoinSource, /className="chat-join-status"/)
    assert.doesNotMatch(chatJoinSource, /<p>\{status/)
    assert.match(
      chatJoinSource,
      /import \{ ChatRestoringIndicator \} from '~\/features\/chat\/ChatRestoringIndicator'/
    )
    assert.match(chatJoinSource, /<ChatRestoringIndicator \/>/)
    assert.match(chatSource, /<ChatRestoringIndicator \/>/)
    assert.doesNotMatch(chatJoinSource, /ChatJoinLoadingIndicator/)
    assert.doesNotMatch(chatJoinSource, /Loader/)
    assert.doesNotMatch(chatSource, /chat\.restoring\.title/)
    assert.doesNotMatch(chatSource, /chat\.restoring\.desc/)
    assert.match(
      chatRestoringSource,
      /<div className="chat-join-loading">[\s\S]*<span className="chat-join-status-spinner" aria-hidden="true" \/>[\s\S]*<\/div>/
    )
    assert.doesNotMatch(chatRestoringSource, /Loader/)
    assert.doesNotMatch(chatRestoringSource, /ui-spinner/)
    assert.doesNotMatch(chatRestoringSource, /chat-restoring-indicator/)
    assert.doesNotMatch(chatRestoringSource, /chat-restoring-icon/)
    assert.doesNotMatch(chatRestoringSource, /ui-empty-title/)
    assert.doesNotMatch(chatRestoringSource, /ui-empty-desc/)
    assert.doesNotMatch(chatRestoringSource, /chat\.restoring\.title/)
    assert.doesNotMatch(chatRestoringSource, /chat\.restoring\.desc/)
    assert.doesNotMatch(i18nMessages, /'chat\.restoring\.(title|desc)'/)
    assert.doesNotMatch(
      chatJoinSource,
      /<div className="chat-join-error">[\s\S]*chat-join-status-spinner[\s\S]*<div className="chat-join-actions">/
    )
    assert.doesNotMatch(chatJoinSource, /className="chat-join-loading"/)
    assert.doesNotMatch(chatJoinSource, /className="chat-join-success"/)
    assert.match(chatCssSource, /\.chat-join-actions/)
    assert.match(chatCssSource, /\.chat-join-loading/)
    assert.match(chatCssSource, /\.chat-join-status-spinner/)
    assert.match(
      chatCssSource,
      /\.chat-join-status-spinner\s*\{[\s\S]*width: 32px;[\s\S]*height: 32px;[\s\S]*border: 4px solid color-mix\(in srgb, #6A60FF 22%, transparent\);[\s\S]*border-top-color: #6A60FF;[\s\S]*box-shadow: 0 0 0 6px color-mix\(in srgb, #6A60FF 14%, transparent\);[\s\S]*animation: spin 0\.8s linear infinite;[\s\S]*\}/
    )
    assert.match(chatCssSource, /#6A60FF/)
    assert.doesNotMatch(chatCssSource, /\.chat-restoring-indicator/)
    assert.match(i18nMessages, /'chatJoin\.action\.retry': '重试'/)
    assert.match(i18nMessages, /'chatJoin\.action\.retry': 'Retry'/)
  })

  it('keeps chat join invite theme and appearance fields explicit', async () => {
    const inviteSource = readSource('src/lib/chatJoinInvite.ts')
    const chatJoinDemoSource = readSource(
      'src/features/chat/ChatJoinDemoPage.tsx'
    )
    const chatJoinSource = readSource('src/features/chat/ChatJoinPage.tsx')
    const rootRoute = readSource(SOURCE_PATHS.routes.root)
    const chatStyles = readSource('src/styles/chat.css')
    const i18nMessages = readI18nSources()
    const { normalizeChatJoinInvitePayload } = await importBundledSource(
      'src/lib/chatJoinInvite.ts'
    )
    const baseInvite = {
      uid: 'demo-user',
      channels: [{ id: 'chatjoin_support' }],
    }

    assert.equal(
      normalizeChatJoinInvitePayload({
        ...baseInvite,
        appearance: 'dark',
      })?.appearance,
      'dark'
    )
    assert.equal(
      normalizeChatJoinInvitePayload({
        ...baseInvite,
        appearance: 'light',
      })?.appearance,
      'light'
    )
    assert.equal(
      normalizeChatJoinInvitePayload({
        ...baseInvite,
        appearance: 'auto',
      })?.appearance,
      undefined
    )
    assert.equal(
      normalizeChatJoinInvitePayload({
        ...baseInvite,
        appearance: 'sparkbit',
      })?.appearance,
      undefined
    )

    assert.match(inviteSource, /appearance\?: 'dark' \| 'light'/)
    assert.match(chatJoinDemoSource, /import \{ SelectControl \}/)
    assert.match(chatJoinDemoSource, /function DemoFieldLabel/)
    assert.match(chatJoinDemoSource, /const \[theme, setTheme\]/)
    assert.match(chatJoinDemoSource, /const \[appearance, setAppearance\]/)
    assert.match(chatJoinDemoSource, /const LOCALE_OPTIONS/)
    assert.match(chatJoinDemoSource, /const APPEARANCE_OPTIONS/)
    assert.doesNotMatch(chatJoinDemoSource, /value: 'auto'/)
    assert.match(chatJoinDemoSource, /value: 'dark'/)
    assert.match(chatJoinDemoSource, /value: 'light'/)
    assert.match(chatJoinDemoSource, /type="radio"/)
    assert.match(chatJoinDemoSource, /value="sparkbit"/)
    assert.match(chatJoinDemoSource, /checked=\{theme === 'sparkbit'\}/)
    assert.match(
      chatJoinDemoSource,
      /setTheme\(theme === 'sparkbit' \? undefined : 'sparkbit'\)/
    )
    assert.match(chatJoinDemoSource, /if \(appearance\)/)
    assert.match(chatJoinDemoSource, /invite\.appearance = appearance/)
    assert.match(
      chatJoinDemoSource,
      /className="chat-join-demo-radio-options"[\s\S]*name="chat-join-demo-appearance"[\s\S]*value=\{option\.value\}[\s\S]*checked=\{appearance === option\.value\}[\s\S]*onClick=\{\(\) =>[\s\S]*setAppearance\([\s\S]*appearance === option\.value[\s\S]*\? undefined[\s\S]*: option\.value[\s\S]*readOnly/
    )
    assert.match(
      chatJoinDemoSource,
      /<SelectControl<Locale>[\s\S]*ariaLabel=\{t\('chatJoin\.demo\.field\.locale'\)\}[\s\S]*value=\{locale\}[\s\S]*options=\{LOCALE_OPTIONS\}[\s\S]*onChange=\{setLocale\}[\s\S]*size="compact"/
    )
    assert.match(
      chatStyles,
      /\.chat-join-demo-radio-options \{[\s\S]*min-height: 39px;/
    )
    assert.match(
      chatStyles,
      /\.chat-join-demo-toggle \{[\s\S]*min-height: 39px;/
    )
    assert.doesNotMatch(
      chatJoinDemoSource,
      /<DemoField[\s\S]*name="appearance"[\s\S]*(<select|<SelectControl)/
    )
    assert.doesNotMatch(chatJoinDemoSource, /<select/)
    assert.match(
      chatJoinDemoSource,
      /name="origin"[\s\S]*description=\{t\('chatJoin\.demo\.field\.origin'\)\}/
    )
    assert.match(
      chatJoinDemoSource,
      /name="uid"[\s\S]*description=\{t\('chatJoin\.demo\.field\.uid'\)\}/
    )
    assert.match(
      chatJoinDemoSource,
      /name="appearance"[\s\S]*description=\{t\('chatJoin\.demo\.field\.appearance'\)\}/
    )
    assert.doesNotMatch(chatJoinDemoSource, /type="checkbox"[\s\S]*sparkbit/)
    assert.match(chatJoinSource, /const setIsDarkMode = useAppStore/)
    assert.match(
      chatJoinSource,
      /if \(invite\.appearance === 'dark'\)[\s\S]*setIsDarkMode\(true\)/
    )
    assert.match(
      chatJoinSource,
      /if \(invite\.appearance === 'light'\)[\s\S]*setIsDarkMode\(false\)/
    )
    assert.match(
      rootRoute,
      /var resolvedTheme = theme === 'dark' \|\| \(!theme && window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches\)\s*\?\s*'dark'\s*:\s*'light'/
    )
    assert.match(
      rootRoute,
      /document\.documentElement\.setAttribute\('data-theme', resolvedTheme\)/
    )
    assert.match(i18nMessages, /chatJoin\.demo\.field\.theme/)
    assert.match(i18nMessages, /chatJoin\.demo\.field\.appearance/)
    assert.match(
      i18nMessages,
      /'chatJoin\.demo\.field\.payload': '邀请内容 JSON'/
    )
    assert.match(i18nMessages, /'chatJoin\.demo\.field\.token': '加密令牌'/)
    assert.match(i18nMessages, /'chatJoin\.demo\.field\.pub': '发送方公钥'/)
    assert.match(
      i18nMessages,
      /'chatJoin\.demo\.field\.payload': 'Invite payload JSON'/
    )
    assert.match(
      i18nMessages,
      /'chatJoin\.demo\.field\.token': 'Encrypted token'/
    )
  })

  it('keeps Gan Deng Yan game page wired to the server rules and P2P channel', () => {
    const source = readSource(SOURCE_PATHS.features.ganDengYan)
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')

    assert.match(source, /GAME_ID = 'gandengyan'/)
    assert.match(source, /useGameRoom/)
    assert.match(source, /from '~server\/src\/games\/gandengyan\.js'/)
    assert.match(source, /createGanDengYanRoom/)
    assert.match(source, /startGanDengYanRound/)
    assert.match(source, /playGanDengYanCards/)
    assert.match(source, /analyzeCards/)
    assert.match(source, /syncGanDengYanLobby/)
    assert.match(source, /deriveGameRoomLobby/)
    assert.match(source, /getLatestGameState/)
    assert.match(source, /sendRoomEvent/)
    assert.match(source, /game\.action\.createRoom/)
    assert.match(source, /game\.action\.joinRoom/)
    assert.match(source, /game\.action\.startRound/)
    assert.match(source, /game\.action\.nextRound/)
    assert.match(gameRoomSource, /useChannelMessages/)
    assert.doesNotMatch(gameRoomSource, /extraSubscribedChannelNames/)
  })

  it('keeps game room errors localized and card suits stable', () => {
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')
    const zhajinhuaSource = readSource(
      'src/features/game/zhajinhua/ZhajinhuaPage.tsx'
    )
    const i18nMessages = readI18nSources()

    for (const key of [
      'game.room.error.readLog',
      'game.room.error.invalidCode',
      'game.room.error.createFailed',
      'game.room.error.joinFailed',
      'game.room.error.sendEventFailed',
    ]) {
      assert.match(gameRoomSource, new RegExp(key.replaceAll('.', '\\.')))
      assert.match(i18nMessages, new RegExp(`'${key}'`))
    }
    assert.doesNotMatch(gameRoomSource, /[\u4e00-\u9fff]/)
    assert.doesNotMatch(
      gameRoomSource,
      /无法读取房间记录|请输入 4-8 位房间码|创建房间失败|进入房间失败|发送房间事件失败/
    )

    assert.match(zhajinhuaSource, /S:\s*'\\u2660'/)
    assert.match(zhajinhuaSource, /H:\s*'\\u2665'/)
    assert.match(zhajinhuaSource, /C:\s*'\\u2663'/)
    assert.match(zhajinhuaSource, /D:\s*'\\u2666'/)
    assert.doesNotMatch(zhajinhuaSource, /S:\s*'S'|H:\s*'H'|C:\s*'C'|D:\s*'D'/)
    assert.doesNotMatch(zhajinhuaSource, /[\u2660\u2665\u2666\u2663]/)
    assert.doesNotMatch(zhajinhuaSource, /\uFFFD/)
  })

  it('keeps game rooms independent from the chat detail drawer for now', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatCssSource = readSource('src/styles/chat.css')
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')
    const ganDengYanSource = readSource(SOURCE_PATHS.features.ganDengYan)
    const zhajinhuaSource = readSource(
      'src/features/game/zhajinhua/ZhajinhuaPage.tsx'
    )

    assert.doesNotMatch(chatSource, /function getChatGameRoomCode/)
    assert.doesNotMatch(chatSource, /function getChatGameUrl/)
    assert.doesNotMatch(chatSource, /\/game\/\$\{gameId\}\/\?room=/)
    assert.doesNotMatch(chatSource, /chat\.games\./)
    assert.doesNotMatch(chatSource, /channel-game-section/)
    assert.doesNotMatch(chatCssSource, /channel-game-actions/)
    assert.match(gameRoomSource, /gameRoomCodeToChannelName\(gameId, code\)/)
    assert.match(gameRoomSource, /GAME_CHANNEL_TYPE/)
    assert.match(gameRoomSource, /useChannelMessages/)
    assert.doesNotMatch(gameRoomSource, /\/api\/game|gameRoutes/)
    assert.match(
      ganDengYanSource,
      /new URLSearchParams\(window\.location\.search\)/
    )
    assert.match(ganDengYanSource, /game\.joinRoom\(code\)/)
    assert.match(
      zhajinhuaSource,
      /new URLSearchParams\(window\.location\.search\)/
    )
    assert.match(zhajinhuaSource, /game\.joinRoom\(code\)/)
  })

  it('keeps P2P chat controls shared without the discarded chat extras', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const componentSource = readSource('src/components/ChatUi.tsx')
    const voicePanelSource = readSource('src/components/ChatVoiceRoomPanel.tsx')
    const globalVoiceSource = readSource(
      'src/features/chat/GlobalVoiceRoom.tsx'
    )
    const voiceHookSource = readSource('src/hooks/useVoiceRoom.ts')
    const attachmentCardSource = readSource(
      'src/components/ChatAttachmentCard.tsx'
    )
    const chatCssSource = readSource('src/styles/chat.css')
    const rootRouteSource = readSource(SOURCE_PATHS.routes.root)
    const uiIndexSource = readSource('src/components/ui/index.ts')
    const chatUnreadSource = readSource('src/lib/chatUnread.js')
    const i18nMessages = readI18nSources()

    assert.match(chatSource, /from '~\/components\/ChatUi'/)
    assert.match(uiIndexSource, /ActionMenu/)
    assert.match(componentSource, /export function ChatMessageItem/)
    assert.match(componentSource, /export function ChatComposer/)
    assert.match(componentSource, /export function ChannelMemberGrid/)
    assert.match(
      componentSource,
      /<textarea[\s\S]*className="textarea chat-composer-input"/
    )
    assert.match(componentSource, /KeyboardEvent<HTMLTextAreaElement>/)
    assert.match(
      componentSource,
      /event\.shiftKey \|\| event\.nativeEvent\.isComposing/
    )
    assert.match(componentSource, /event\.preventDefault\(\)/)
    assert.match(
      chatCssSource,
      /\.chat-composer-input[\s\S]*field-sizing: content/
    )
    assert.match(
      chatCssSource,
      /\.message-bubble \{[\s\S]*white-space: pre-wrap/
    )
    assert.match(
      chatCssSource,
      /&\.has-attachment \{[\s\S]*white-space: normal/
    )
    assert.match(componentSource, /unread = false/)
    assert.match(componentSource, /chat-channel-unread-dot/)
    assert.match(componentSource, /ActionMenu/)
    assert.match(componentSource, /t\('chat\.unpin'\).*t\('chat\.pin'\)/s)
    assert.match(componentSource, /t\('chat\.rename'\)/)
    assert.match(componentSource, /t\('chat\.delete'\)/)
    assert.doesNotMatch(
      componentSource,
      /key: 'delete'[\s\S]{0,120}danger: true/
    )
    assert.doesNotMatch(chatSource, /SidebarAccount/)
    assert.match(chatSource, /setChannelPinned/)
    assert.match(chatSource, /channelToRename/)
    assert.match(chatSource, /lastMessageAt/)
    assert.match(chatSource, /extraSubscribedChannelNames/)
    assert.match(chatUnreadSource, /CHAT_READ_STORAGE_PREFIX/)
    assert.match(chatSource, /playChannelNotificationSound/)
    assert.match(
      chatSource,
      /onReconnect:\s*\(\) => \{[\s\S]{0,200}refreshChannels\(\)/
    )
    assert.match(chatSource, /markChannelRead\(/)
    assert.match(chatSource, /btn btn-secondary btn-block/)
    assert.doesNotMatch(chatSource, /CopyButton|getChatInviteUrl/)
    assert.doesNotMatch(chatSource, /chat\.invite\./)
    assert.doesNotMatch(chatSource, /channel-invite-section/)
    assert.match(
      chatSource,
      /status: 'checking' \| 'ready' \| 'downloading' \| 'available' \| 'error'/
    )
    assert.match(chatSource, /message=\{downloadState\?\.message\}/)
    assert.match(chatSource, /t\('chat\.attachment\.noSeedsTitle'\)/)
    assert.match(chatSource, /t\('chat\.attachment\.noSeedsFallback'\)/)
    assert.doesNotMatch(
      chatSource,
      /attachmentDownloadStatus\[failedAttachment\.cid\]\?\.message/
    )
    assert.match(attachmentCardSource, /chat\.attachment\.download/)
    assert.match(attachmentCardSource, /chat\.attachment\.downloading/)
    assert.match(attachmentCardSource, /chat-attachment-action-label/)
    assert.match(chatSource, /useGlobalVoiceRoom/)
    assert.match(chatSource, /setPreviewRoom/)
    assert.match(chatSource, /className="chat-voice-banner"/)
    assert.match(chatSource, /onOpenVoiceRoom=\{handleOpenActiveVoiceRoom\}/)
    assert.match(rootRouteSource, /GlobalVoiceRoomProvider/)
    assert.match(globalVoiceSource, /useVoiceRoom/)
    assert.match(globalVoiceSource, /<ChatVoiceRoomPanel/)
    assert.match(globalVoiceSource, /VoiceAudioSink/)
    assert.match(globalVoiceSource, /chat-voice-floating/)
    assert.match(globalVoiceSource, /isMinimized/)
    assert.match(componentSource, /labelKey: 'chat\.voice\.menu'/)
    assert.match(i18nMessages, /'chat\.voice\.menu': '语音通话'/)
    assert.match(i18nMessages, /'chat\.voice\.menu': '語音通話'/)
    assert.match(i18nMessages, /'chat\.voice\.menu': 'Voice call'/)
    assert.match(componentSource, /onOpenVoiceRoom/)
    assert.doesNotMatch(voicePanelSource, /useVoiceRoom\(/)
    assert.match(voicePanelSource, /onMinimize/)
    assert.match(voicePanelSource, /chat\.voice\.join/)
    assert.match(voicePanelSource, /chat\.voice\.mute/)
    assert.match(voicePanelSource, /chat\.voice\.leave/)
    assert.match(voicePanelSource, /chat\.voice\.minimize/)
    assert.match(voiceHookSource, /RTCPeerConnection/)
    assert.match(voiceHookSource, /getUserMedia/)
    assert.match(voiceHookSource, /stun:stun\.l\.google\.com:19302/)
    assert.match(voiceHookSource, /channel:voice:join/)
    assert.match(voiceHookSource, /channel:voice:signal/)
    assert.match(chatCssSource, /\.chat-voice-room-panel/)
    assert.match(chatCssSource, /\.chat-voice-member-grid/)
    assert.match(chatCssSource, /\.chat-voice-banner/)
    assert.match(chatCssSource, /\.chat-voice-floating/)
    assert.match(i18nMessages, /chat\.voice\.bannerActive/)
    assert.match(i18nMessages, /chat\.voice\.bannerJoined/)
    assert.match(i18nMessages, /chat\.voice\.floatingActive/)
    assert.match(componentSource, /labelKey: 'chat\.attachment\.image'/)
    assert.match(componentSource, /labelKey: 'chat\.attachment\.video'/)
    assert.match(componentSource, /labelKey: 'chat\.attachment\.file'/)
    assert.match(i18nMessages, /'chat\.attachment\.image': '图片'/)
    assert.match(i18nMessages, /'chat\.attachment\.video': '视频'/)
    assert.match(i18nMessages, /'chat\.attachment\.file': '文件'/)
    assert.match(
      i18nMessages,
      /'chat\.attachment\.downloadAvailable': '可下载'/
    )
    assert.match(i18nMessages, /'chat\.attachment\.preview': '预览'/)
    assert.doesNotMatch(i18nMessages, /chat\.attachment\.noSeedsBrief/)
    assert.doesNotMatch(i18nMessages, /chat\.invite\.|chat\.games\./)
    assert.match(i18nMessages, /'chat\.details\.channelId': '房间 ID'/)
    assert.doesNotMatch(componentSource, /application\/pdf/)
    assert.doesNotMatch(componentSource, /video\/mp4/)
    assert.doesNotMatch(
      componentSource,
      /chat-tool-dropdown|chat-tool-btn-wrap|chat-tool-item-tooltip|channel-actions-dropdown|channel-actions-item/
    )
    assert.doesNotMatch(
      chatSource,
      /PINNED_CHANNELS|ChatTypingIndicator|__duplicate/
    )
    assert.doesNotMatch(chatSource, /正在输入|告诉我可以帮你做什么|修改名称/)
  })

  it('keeps chat settings independent from the knowledge base', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const noteRouteSource = readSource('src/routes/note/index.tsx')
    const i18nMessages = readI18nSources()

    assert.doesNotMatch(chatSource, /createChatNoteDraft/)
    assert.doesNotMatch(chatSource, /getChatNoteDraftHref/)
    assert.doesNotMatch(chatSource, /handleSaveChannelToNote/)
    assert.doesNotMatch(chatSource, /getChatHistoryNoteDraftContent/)
    assert.doesNotMatch(chatSource, /isSaveableChannelMessage/)
    assert.doesNotMatch(chatSource, /chat\.noteDraft\./)
    assert.doesNotMatch(
      chatSource,
      /chat\.channel\.createdAt[\s\S]*chat\.noteDraft/
    )
    assert.doesNotMatch(chatSource, /NotebookPen/)
    assert.doesNotMatch(chatSource, /handleSaveMessageToNote/)
    assert.doesNotMatch(chatSource, /chat\.message\.saveToNote/)
    assert.doesNotMatch(chatUiSource, /actions\?: ActionMenuItem\[\]/)
    assert.doesNotMatch(chatUiSource, /chat-message-actions-trigger/)
    assert.doesNotMatch(chatCssSource, /chat-message-actions/)
    assert.match(noteRouteSource, /chatDraft/)
    assert.match(noteSource, /readChatNoteDraft/)
    assert.doesNotMatch(i18nMessages, /'chat\.noteDraft\./)
    assert.doesNotMatch(i18nMessages, new RegExp('保存聊天记录到' + '知识库'))
    assert.doesNotMatch(
      i18nMessages,
      /chat\.messageActions|chat\.message\.saveToNote/
    )
  })

  it('uses key-based i18n without DOM translation', () => {
    const rootRoute = readSource(SOURCE_PATHS.routes.root)
    const i18nSource = readSource(SOURCE_PATHS.i18n.provider)
    const messagesSource = readSource(SOURCE_PATHS.i18n.entry)
    const messageCatalogs = readI18nSources()
    const downloadValidationSource = readSource(
      'src/lib/i18n/downloadValidation.ts'
    )
    const portalSource = readSource('src/components/FeaturePortal.tsx')
    const marketingLayoutSource = readSource(
      'src/components/MarketingLayout.tsx'
    )
    const marketingHeaderSource = readSource(
      'src/components/MarketingHeader.tsx'
    )
    const appShellSource = readSource('src/components/AppShell.tsx')
    const languageToggleSource = readSource('src/components/LanguageToggle.tsx')
    const appearanceToggleSource = readSource(
      'src/components/AppearanceToggle.tsx'
    )
    const accountMenuSource = readSource('src/features/profile/AccountMenu.tsx')
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const appSource = readSource(SOURCE_PATHS.features.files)
    const chatSource = readSource(SOURCE_PATHS.features.chat)

    assert.match(rootRoute, /I18nProvider/)
    assert.match(rootRoute, /supportedLocales = \['zh-CN', 'zh-TW', 'en'\]/)
    assert.match(appShellSource, /AccountMenuButton/)
    assert.match(appShellSource, /AppearanceToggle/)
    assert.match(appShellSource, /LanguageToggle/)
    assert.match(marketingLayoutSource, /AccountMenuButton/)
    assert.match(marketingLayoutSource, /AppearanceToggle/)
    assert.match(marketingLayoutSource, /LanguageToggle/)
    assert.match(marketingHeaderSource, /AppearanceToggle/)
    assert.match(marketingHeaderSource, /LanguageToggle/)
    assert.doesNotMatch(
      accountMenuSource,
      /ActionMenu|LOCALES|setLocale|setIsDarkMode/
    )
    assert.doesNotMatch(
      profileSource,
      /ProfilePreferencesPanel|profile-preferences-panel|profile-locale-grid|profile-preference-action|LOCALES\.map|localeNames\[item\]|setLocale\(item\)|setIsDarkMode\(!isDarkMode\)/
    )
    assert.match(languageToggleSource, /ActionMenu/)
    assert.match(languageToggleSource, /getLanguageToggleLocales\(theme\)/)
    assert.match(languageToggleSource, /items=\{locales\.map/)
    assert.match(languageToggleSource, /localeNames\[item\]/)
    assert.match(languageToggleSource, /setLocale\(item\)/)
    assert.match(languageToggleSource, /<Check size=\{16\}/)
    assert.match(languageToggleSource, /Earth/)
    assert.match(languageToggleSource, /Languages/)
    assert.match(
      languageToggleSource,
      /theme === 'sparkbit' \? <Earth size=\{16\} \/> : <Languages size=\{16\} \/>/
    )
    assert.match(appearanceToggleSource, /setIsDarkMode\(!isDarkMode\)/)
    assert.match(appearanceToggleSource, /t\('common\.appearance\.toggle'\)/)
    assert.doesNotMatch(
      messageCatalogs,
      /common\.locale\.current|common\.locale\.switchTo/
    )
    assert.match(portalSource, /titleKey: 'portal\.feature\.app\.title'/)
    assert.match(portalSource, /to=\{f\.path\}/)
    assert.match(portalSource, /portal-feature-card-icon/)
    assert.match(portalSource, /<FolderOpen size=\{28\}/)
    assert.match(
      portalSource,
      /FolderOpen|MessagesSquare|NotebookPen|Gamepad2|Wallet/
    )
    assert.doesNotMatch(portalSource, /useState<string>\('chat'\)/)
    assert.doesNotMatch(portalSource, /portal-marketing/)
    assert.doesNotMatch(portalSource, /activeFeature/)
    assert.doesNotMatch(portalSource, /portal-feature-card-dot/)
    const portalStyles = readSource('src/styles/portal.css')
    assert.match(
      portalStyles,
      /background:\s*linear-gradient\(135deg,\s*var\(--text-primary\),\s*var\(--accent\)\)/
    )
    assert.match(
      portalStyles,
      /\.portal-feature-card:hover\s*\{[\s\S]*transform:\s*translateY\(-2px\)/
    )
    assert.match(
      portalStyles,
      /\.portal-feature-card-icon\s*\{[\s\S]*color:\s*var\(--accent\)/
    )
    assert.match(
      portalStyles,
      /\.portal-page\s*\{[\s\S]*min-height:\s*calc\(100dvh - 64px - 89px\)/
    )
    assert.match(
      portalStyles,
      /\.portal-hero\s*\{[\s\S]*display:\s*flex[\s\S]*align-items:\s*center/
    )
    const marketingStyles = readSource('src/styles/marketing.css')
    assert.match(
      marketingStyles,
      /\.mkt-nav-inner\s*\{[\s\S]*max-width:\s*1440px[\s\S]*padding-inline:\s*clamp\(24px,\s*6vw,\s*72px\)/
    )
    assert.match(
      marketingStyles,
      /\.about-app-header \.mkt-container\s*\{[\s\S]*max-width:\s*1440px[\s\S]*padding-inline:\s*clamp\(24px,\s*6vw,\s*72px\)/
    )
    const legacyPortalCopyPattern = new RegExp(
      [
        'chat-' + 'first',
        'Start with ' + 'chat',
        '从聊天' + '开始',
        '聊天' + '优先',
      ].join('|')
    )
    assert.doesNotMatch(messageCatalogs, legacyPortalCopyPattern)
    assert.doesNotMatch(
      messageCatalogs,
      /portal\.feature\.game\.desc'[\s\S]{0,180}(game\.\*|协议|協議|protocol)/
    )
    assert.doesNotMatch(
      messageCatalogs,
      /portal\.feature\.game\.[^']*'[\s\S]{0,180}(人机|人機|陪测|陪測|bot seats|bot testing)/
    )
    assert.match(appSource, /getLocalizedDownloadLinkValidationMessage/)
    assert.match(chatSource, /getLocalizedDownloadLinkValidationMessage/)
    assert.match(downloadValidationSource, /parseMostLink/)
    assert.match(downloadValidationSource, /MOST_LINK_ERROR_CODES/)
    assert.match(downloadValidationSource, /MessageKey/)
    assert.doesNotMatch(appSource, /getDownloadLinkValidationMessage/)
    assert.doesNotMatch(chatSource, /getDownloadLinkValidationMessage/)
    assert.doesNotMatch(
      downloadValidationSource,
      /Unsupported query parameter:/
    )
    assert.doesNotMatch(appSource, /[\u4e00-\u9fff]/)
    assert.match(messageCatalogs, /'app\.download\.validation\.empty'/)
    assert.match(
      messagesSource,
      /LOCALES = \['zh-CN', 'zh-TW', 'en'\] as const/
    )
    assert.match(messagesSource, /type MessageKey = keyof typeof zhCNMessages/)
    assert.match(messagesSource, /export const zhTWMessages/)
    assert.match(messagesSource, /'zh-TW': zhTWMessages/)
    assert.match(messagesSource, /satisfies Record<MessageKey, string>/)
    assert.match(i18nSource, /translateMessage/)
    assert.doesNotMatch(
      i18nSource,
      /MutationObserver|createTreeWalker|translateDocument/
    )
  })

  it('uses shared icon button styling for header utility controls', () => {
    const languageToggleSource = readSource('src/components/LanguageToggle.tsx')
    const appearanceToggleSource = readSource(
      'src/components/AppearanceToggle.tsx'
    )
    const globalsSource = readSource('src/styles/globals.css')

    assert.match(languageToggleSource, /className="btn btn-icon"/)
    assert.match(appearanceToggleSource, /className="btn btn-icon"/)
    assert.doesNotMatch(globalsSource, /\.header-tool-btn\b/)
  })

  it('hides simplified Chinese from SparkBit language options', async () => {
    const { getLanguageToggleLocales } = await importBundledSource(
      'src/components/LanguageToggle.tsx'
    )
    const appShellSource = readSource('src/components/AppShell.tsx')
    const chatSource = readSource(SOURCE_PATHS.features.chat)

    assert.equal(typeof getLanguageToggleLocales, 'function')
    assert.deepEqual(getLanguageToggleLocales(), ['zh-CN', 'zh-TW', 'en'])
    assert.deepEqual(getLanguageToggleLocales('sparkbit'), ['zh-TW', 'en'])
    assert.match(appShellSource, /languageTheme\?: LanguageToggleTheme/)
    assert.match(appShellSource, /<LanguageToggle theme=\{languageTheme\} \/>/)
    assert.match(
      chatSource,
      /languageTheme=\{isInviteUser \? 'sparkbit' : undefined\}/
    )
  })

  it('keeps migrated surfaces free of hardcoded Chinese UI copy', () => {
    const migratedSources = [
      readSource('src/features/download/DownloadPage.tsx'),
      readSource('src/components/DownloadOptions.tsx'),
      readSource('src/components/Footer.tsx'),
      readSource('src/components/CopyButton.tsx'),
      readSource('src/components/AppGlobals.tsx'),
      readSource('src/components/LanguageToggle.tsx'),
      readSource('src/components/AppearanceToggle.tsx'),
      readSource('src/components/PingPanel.tsx'),
      readSource('src/components/PemBlock.tsx'),
      readSource('src/components/MilkdownEditor.tsx'),
      readSource('src/components/GameSidebar.tsx'),
      readSource('src/components/UserLoginModal.tsx'),
      readSource('src/features/system/ErrorBoundary.tsx'),
      readSource('src/features/system/NotFoundPage.tsx'),
      readSource('src/features/chat/ChatPage.tsx'),
      readSource('src/features/chat/ChatJoinPage.tsx'),
      readSource('src/features/note/NotePage.tsx'),
      readSource('src/features/profile/ProfilePage.tsx'),
      readSource('src/features/profile/AccountMenu.tsx'),
      readSource('src/features/profile/useAccountBackup.ts'),
      readSource('src/features/admin/AdminPage.tsx'),
      readSource('src/features/web3/Web3Page.tsx'),
      ...listSourceFiles('src/features/web3/components')
        .filter(file => file.endsWith('.tsx'))
        .map(readSource),
      readSource('src/features/game/zhajinhua/ZhajinhuaPage.tsx'),
      readSource('src/features/game/gandengyan/GanDengYanPage.tsx'),
      readSource('src/routes/__root.tsx'),
      readSource('src/routes/download/index.tsx'),
      readSource('src/routes/ping/index.tsx'),
    ].join('\n')

    assert.doesNotMatch(migratedSources, /[\u4e00-\u9fff]/)
    assert.match(migratedSources, /download\.hero\.desc/)
    assert.match(migratedSources, /chat\.joinChannel/)
    assert.match(migratedSources, /ping\.retryAll/)
    assert.match(migratedSources, /admin\.title/)
    assert.match(migratedSources, /web3\.view\.wallet/)
    assert.match(migratedSources, /game\.zhajinhua\.title/)
    assert.match(migratedSources, /game\.gandengyan\.title/)
  })

  it('translates stable keys and most link validation messages', async () => {
    const i18n = await importBundledSource('src/lib/i18n/index.tsx')
    const downloadValidation = await importBundledSource(
      'src/lib/i18n/downloadValidation.ts'
    )
    const validCid =
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

    assert.deepEqual([...i18n.LOCALES], ['zh-CN', 'zh-TW', 'en'])
    assert.ok(i18n.messages['zh-TW'])
    assert.equal(i18n.normalizeLocale('zh-TW'), 'zh-TW')
    assert.equal(i18n.normalizeLocale('fr'), 'zh-CN')
    assert.equal(i18n.getNextLocale('zh-CN'), 'zh-TW')
    assert.equal(i18n.getNextLocale('zh-TW'), 'en')
    assert.equal(i18n.getNextLocale('en'), 'zh-CN')
    assert.equal(i18n.formatLocalizedTime('zh-CN', '下午04:05'), '下午04:05')
    assert.equal(i18n.formatLocalizedTime('zh-TW', '下午04:05'), '下午 04:05')
    assert.equal(i18n.formatLocalizedTime('en', '4:05 PM'), '4:05 PM')
    assert.equal(
      i18n.translateMessage('app.fileAvailable', 'zh-CN', {
        fileName: '计划.md',
      }),
      '计划.md 可下载'
    )
    assert.equal(
      i18n.translateMessage('app.fileAvailable', 'en', {
        fileName: '计划.md',
      }),
      '计划.md is available to download'
    )
    assert.equal(
      i18n.translateMessage('app.fileAvailable', 'zh-TW', {
        fileName: '計畫.md',
      }),
      '計畫.md 可下載'
    )
    assert.equal(i18n.translateMessage('profile.kicker', 'zh-CN'), '个人资料')
    assert.equal(i18n.translateMessage('profile.kicker', 'zh-TW'), '個人資料')
    assert.equal(i18n.translateMessage('profile.kicker', 'en'), 'Profile')
    assert.equal(
      i18n.translateMessage('portal.feature.note.title', 'zh-CN'),
      '知识库'
    )
    assert.equal(
      i18n.translateMessage('portal.feature.note.title', 'zh-TW'),
      '知識庫'
    )
    assert.equal(
      i18n.translateMessage('portal.feature.note.title', 'en'),
      'Knowledge Base'
    )
    assert.equal(
      i18n.translateMessage('app.publishFile', 'zh-CN'),
      '添加到文件库'
    )
    assert.equal(
      i18n.translateMessage('app.downloadFile', 'en'),
      'Download to file library'
    )
    assert.equal(i18n.translateMessage('app.transfers', 'zh-TW'), '傳輸管理')
    assert.deepEqual(
      downloadValidation.getMostLinkValidationMessageKey(
        'https://example.com/file'
      ),
      { key: 'app.download.validation.invalidCid' }
    )
    assert.equal(
      downloadValidation.getMostLinkValidationMessageKey(
        `https://most.box/cid/${validCid}?filename=test.txt`
      ),
      null
    )
    assert.equal(
      downloadValidation.getMostLinkValidationMessageKey(validCid),
      null
    )
    assert.equal(
      downloadValidation.getMostLinkValidationMessageKey(
        `${validCid}?filename=test.txt`
      ),
      null
    )
    assert.equal(
      downloadValidation.getMostLinkValidationMessageKey(`most://${validCid}`),
      null
    )
    assert.equal(
      downloadValidation.getMostLinkValidationMessageKey(
        `most://${validCid}?filename=%20%20`
      ),
      null
    )
    assert.deepEqual(
      downloadValidation.getMostLinkValidationMessageKey(
        `most://${validCid}?filename=test.txt&x=1`
      ),
      {
        key: 'app.download.validation.unsupportedParam',
        params: { param: 'x' },
      }
    )
  })

  it('marks user-authored content as not translatable', () => {
    const sources = [
      readSource('src/components/AppFileCards.tsx'),
      readSource('src/components/ChatUi.tsx'),
      readSource('src/components/ChatAttachmentCard.tsx'),
      readSource('src/components/FilePreviewOverlay.tsx'),
      readSource('src/components/MoveModal.tsx'),
      readSource('src/components/NoteMoveModal.tsx'),
      readSource('src/features/note/NotePage.tsx'),
      readSource('src/features/files/AppPage.tsx'),
      readSource('src/features/admin/AdminPage.tsx'),
      readSource('src/components/PemBlock.tsx'),
      readSource('src/components/KeyCard.tsx'),
    ].join('\n')

    assert.match(sources, /className="card-name" translate="no"/)
    assert.match(sources, /chat-channel-title-text" translate="no"/)
    assert.match(sources, /className="message-bubble" translate="no"/)
    assert.match(sources, /share-link-text" translate="no"/)
    assert.match(sources, /className="preview-text" translate="no"/)
    assert.match(sources, /className="textarea mono"[\s\S]*translate="no"/)
    assert.match(sources, /title=\{holding\.cid\} translate="no"/)
  })

  it('saves preview files through authenticated fetch and local save APIs', async () => {
    const { saveFileToLocal } = await importBundledSource(
      'src/lib/saveLocalFile.ts'
    )
    const cid = 'bafy-preview-save'
    const blob = new Blob(['preview content'])
    const calls = {
      fetchInput: '',
      fetchHeaders: null,
      suggestedName: '',
      writtenBlob: null,
      closed: false,
    }

    const result = await saveFileToLocal({
      cid,
      fileName: 'chat-file/168/preview.txt',
      getFileDownloadUrl: value => `/api/files/${value}/download`,
      getRequestHeaders: async (method, path) => ({
        authorization: `${method} ${path}`,
      }),
      fetchFile: async (input, options) => {
        calls.fetchInput = input
        calls.fetchHeaders = options.headers
        return new Response(blob)
      },
      showSaveFilePicker: async options => {
        calls.suggestedName = options.suggestedName
        return {
          createWritable: async () => ({
            write: async value => {
              calls.writtenBlob = value
            },
            close: async () => {
              calls.closed = true
            },
          }),
        }
      },
    })

    assert.equal(result.method, 'picker')
    assert.equal(calls.fetchInput, `/api/files/${cid}/download`)
    assert.deepEqual(calls.fetchHeaders, {
      authorization: `GET /api/files/${cid}/download`,
    })
    assert.equal(calls.suggestedName, 'preview.txt')
    assert.equal(await calls.writtenBlob.text(), 'preview content')
    assert.equal(calls.closed, true)
  })

  it('falls back to blob download when the local save picker is unavailable', async () => {
    const { saveFileToLocal } = await importBundledSource(
      'src/lib/saveLocalFile.ts'
    )
    const blob = new Blob(['fallback content'])
    const anchor = {
      href: '',
      download: '',
      clicked: false,
      click() {
        this.clicked = true
      },
    }
    const calls = []

    const result = await saveFileToLocal({
      cid: 'bafy-preview-fallback',
      fileName: 'chat-file\\168\\fallback.txt',
      getFileDownloadUrl: cid => `/api/files/${cid}/download`,
      getRequestHeaders: async () => ({}),
      fetchFile: async () => new Response(blob),
      showSaveFilePicker: null,
      documentRef: {
        body: {
          appendChild(node) {
            calls.push(['append', node])
          },
          removeChild(node) {
            calls.push(['remove', node])
          },
        },
        createElement(tagName) {
          assert.equal(tagName, 'a')
          return anchor
        },
      },
      urlApi: {
        createObjectURL(value) {
          calls.push(['createObjectURL', value])
          return 'blob:preview'
        },
        revokeObjectURL(value) {
          calls.push(['revokeObjectURL', value])
        },
      },
    })

    assert.equal(result.method, 'download')
    assert.equal(anchor.href, 'blob:preview')
    assert.equal(anchor.download, 'fallback.txt')
    assert.equal(anchor.clicked, true)
    assert.deepEqual(calls, [
      ['createObjectURL', blob],
      ['append', anchor],
      ['remove', anchor],
      ['revokeObjectURL', 'blob:preview'],
    ])
  })

  it('exposes save-as from file preview overlays in files and chat', () => {
    const overlaySource = readSource('src/components/FilePreviewOverlay.tsx')
    const filesSource = readSource('src/features/files/AppPage.tsx')
    const chatSource = readSource('src/features/chat/ChatPage.tsx')

    assert.match(overlaySource, /onSaveAs\?:/)
    assert.match(overlaySource, /className="preview-save"/)
    assert.match(overlaySource, /t\('app\.saveAs'\)/)
    assert.match(filesSource, /onSaveAs=\{handleSaveAs\}/)
    assert.match(chatSource, /onSaveAs=\{handleSavePreviewItem\}/)
  })

  it('disables custom avatar save until a URL is entered', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')

    assert.match(
      profileSource,
      /const canSaveAvatarUrl = avatarUrlDraft\.trim\(\)\.length > 0/
    )
    assert.match(profileSource, /disabled=\{!canSaveAvatarUrl\}/)
  })

  it('keeps recommended profile avatar labels translated', () => {
    const messages = readI18nSources()
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const rocketAvatarPath = new URL(
      '../../public/avatars/default/rocket.svg',
      import.meta.url
    )

    assert.match(messages, /'profile\.avatar\.custom':/)
    assert.doesNotMatch(messages, /'profile\.avatar\.current':/)
    assert.doesNotMatch(messages, /'profile\.avatar\.rocket':/)
    assert.doesNotMatch(messages, /'profile\.avatar\.dog':/)
    assert.doesNotMatch(profileSource, /'rocket'/)
    assert.equal(fs.existsSync(rocketAvatarPath), false)
  })

  it('builds stable account avatar URLs for empty custom avatar slots', async () => {
    const { getAccountAvatarUrl } = await importBundledSource(
      'src/lib/avatarCloudUpload.js'
    )
    const avatarUrl =
      'https://api.most.box/avatar/0xc8f9e8a7a8c2cdab4b141330d5bef5c7c7df8778'

    assert.equal(
      getAccountAvatarUrl('0xC8F9E8A7A8C2CDAB4B141330D5BEF5C7C7DF8778'),
      avatarUrl
    )
    assert.equal(getAccountAvatarUrl(''), '')
  })

  it('wires profile avatar uploads through the authenticated cloud API', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const avatarCloudUploadSource = readSource('src/lib/avatarCloudUpload.js')
    const accountBackupSource = readSource('server/src/utils/accountBackup.js')
    const profileMessages = readSource('src/lib/i18n/messages/profile.ts')
    const uploadButtonStart = profileSource.indexOf('onClick={handleUploadAvatar}')
    const uploadButtonEnd = profileSource.indexOf(
      "t('profile.action.uploadAvatar')",
      uploadButtonStart
    )
    const uploadButtonBlock = profileSource.slice(
      uploadButtonStart,
      uploadButtonEnd
    )

    assert.match(profileSource, /id="profile-avatar-file"/)
    assert.match(profileSource, /prepareAvatarUploadFile/)
    assert.match(
      profileSource,
      /from '~\/lib\/avatarCloudUpload\.js'/
    )
    assert.match(profileSource, /uploadAccountAvatar\(identity, prepared\.file\)/)
    assert.doesNotMatch(profileSource, /\/api\/user\/avatar/)
    assert.match(
      profileSource,
      /const canUploadAvatar = Boolean\(avatarUploadFile\) && !avatarUploading/
    )
    assert.match(
      avatarCloudUploadSource,
      /ACCOUNT_AVATAR_API_URL = 'https:\/\/api\.most\.box\/auth\/avatar'/
    )
    assert.match(
      avatarCloudUploadSource,
      /ACCOUNT_AVATAR_BASE_URL = 'https:\/\/api\.most\.box\/avatar'/
    )
    assert.match(avatarCloudUploadSource, /export function getAccountAvatarUrl/)
    assert.doesNotMatch(avatarCloudUploadSource, /getOwnAvatarDisplayUrl/)
    assert.match(avatarCloudUploadSource, /FormData/)
    assert.match(avatarCloudUploadSource, /formData\.append\('file', file\)/)
    assert.match(
      avatarCloudUploadSource,
      /getAccountAvatarAuthHeaders\(wallet, 'POST', url\)/
    )
    assert.doesNotMatch(accountBackupSource, /ACCOUNT_AVATAR_API_URL/)
    assert.doesNotMatch(accountBackupSource, /uploadAccountAvatar/)
    assert.match(profileSource, /const data = await uploadAccountAvatar\(identity, prepared\.file\)/)
    assert.match(profileSource, /setAvatarUrlDraft\(data\.url\)/)
    assert.match(profileSource, /updateAvatar\(data\.url\)/)
    assert.match(
      profileSource,
      /const message = await getApiErrorMessage\(\s*err,\s*t\('profile\.avatar\.uploadFailed'\)\s*\)/
    )
    assert.doesNotMatch(profileSource, /setAvatarUrlError\(message\)/)
    assert.match(profileSource, /addToast\(message, 'error'\)/)
    assert.match(profileSource, /className="profile-avatar-file-input"/)
    assert.match(profileSource, /className="profile-avatar-file-control"/)
    assert.match(profileSource, /profile\.action\.chooseAvatar/)
    assert.doesNotMatch(uploadButtonBlock, /<Upload size=\{16\}/)
    assert.match(profileMessages, /'profile\.action\.uploadAvatar': '上传到云端'/)
    assert.match(profileMessages, /'profile\.action\.uploadAvatar': '上傳到雲端'/)
    assert.match(profileMessages, /'profile\.action\.uploadAvatar': 'Upload to cloud'/)
    assert.doesNotMatch(profileMessages, /上传到 R2|上傳到 R2|Upload to R2/)
    assert.match(profileMessages, /'profile\.avatar\.tooLarge':/)
    assert.match(profileMessages, /'profile\.avatar\.compressionFailed':/)
  })

  it('prefills the profile avatar URL field from the stored avatar value', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')

    assert.match(
      profileSource,
      /setAvatarUrlDraft\(\s*normalizeDefaultAvatarValue\(identity\.avatar\) \|\| identity\.avatar \|\| ''\s*\)/
    )
    assert.match(profileSource, /isSupportedAvatarValue/)
  })

  it('uses SafeImage for avatar fallbacks and scene-specific image errors', () => {
    const safeImagePath = new URL(
      '../../src/components/SafeImage.tsx',
      import.meta.url
    )
    const safeImageSource = readSource('src/components/SafeImage.tsx')
    const fallbackImageSource = readSource('public/avatars/fallback-broken.svg')
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const accountMenuSource = readSource('src/features/profile/AccountMenu.tsx')
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const voiceRoomSource = readSource('src/components/ChatVoiceRoomPanel.tsx')
    const loginModalSource = readSource('src/components/UserLoginModal.tsx')
    const walletIdentitySource = readSource(
      'src/features/web3/components/WalletIdentityView.tsx'
    )
    const gandengyanSource = readSource(
      'src/features/game/gandengyan/GanDengYanPage.tsx'
    )
    const zhajinhuaSource = readSource(
      'src/features/game/zhajinhua/ZhajinhuaPage.tsx'
    )
    const previewOverlaySource = readSource(
      'src/components/FilePreviewOverlay.tsx'
    )
    const chatPageSource = readSource('src/features/chat/ChatPage.tsx')

    assert.equal(fs.existsSync(safeImagePath), true)
    assert.match(safeImageSource, /DEFAULT_IMAGE_FALLBACK = '\/avatars\/fallback-broken\.svg'/)
    assert.match(safeImageSource, /event\.defaultPrevented/)
    assert.match(fallbackImageSource, /<svg/)
    assert.match(fallbackImageSource, /viewBox="0 0 64 64"/)
    assert.doesNotMatch(fallbackImageSource, /lucide-image-off/)
    assert.doesNotMatch(fallbackImageSource, /M22 43l20-20/)
    assert.match(profileSource, /referrerPolicy="no-referrer"/)
    assert.match(profileSource, /import \{ SafeImage \} from '~\/components\/SafeImage'/)
    assert.ok(
      profileSource.includes(
        'const customAvatarValue =\n' +
          '    activeAvatar && !isDefaultAvatarValue(activeAvatar)\n' +
          '      ? activeAvatar\n' +
          '      : getAccountAvatarUrl(identity.address)'
      )
    )
    assert.doesNotMatch(profileSource, /getOwnAvatarDisplayUrl/)
    assert.doesNotMatch(profileSource, /const customAvatarValue = `\/avatar\/\$\{address\}`/)
    assert.match(profileSource, /const customAvatarOption =/)
    assert.match(profileSource, /labelKey: 'profile\.avatar\.custom'/)
    assert.match(
      profileSource,
      /const displayedAvatarOptions = \[\s*avatarOptions\[0\],\s*customAvatarOption,\s*\.\.\.avatarOptions\.slice\(1\),\s*\]/
    )
    assert.match(profileSource, /displayedAvatarOptions\.map/)
    assert.doesNotMatch(profileSource, /getAvatarCrossOrigin/)
    assert.doesNotMatch(profileSource, /crossOrigin=\{getAvatarCrossOrigin/)
    assert.match(profileSource, /<SafeImage\s+className="profile-avatar-large"/)
    assert.match(profileSource, /<SafeImage\s+src=\{generateAvatar\(identity\.address, option\.value\)\}/)
    assert.match(accountMenuSource, /import \{ SafeImage \} from '~\/components\/SafeImage'/)
    assert.match(accountMenuSource, /referrerPolicy="no-referrer"/)
    assert.match(accountMenuSource, /<SafeImage/)
    assert.doesNotMatch(accountMenuSource, /getAvatarCrossOrigin/)
    assert.doesNotMatch(accountMenuSource, /crossOrigin=\{getAvatarCrossOrigin/)
    assert.match(chatUiSource, /<SafeImage\s+className="msg-avatar"/)
    assert.match(chatUiSource, /<SafeImage\s+className="channel-member-avatar"/)
    assert.match(voiceRoomSource, /<SafeImage\s+className="chat-voice-avatar"/)
    assert.match(loginModalSource, /<SafeImage\s+className="login-avatar-preview"/)
    assert.match(walletIdentitySource, /<SafeImage\s+src=\{avatarSrc\}/)
    assert.match(gandengyanSource, /<SafeImage src=\{generateAvatar\(player\.address, display\.avatar\)\}/)
    assert.match(zhajinhuaSource, /<SafeImage\s+src=\{generateAvatar\(player\.address, display\.avatar\)\}/)
    assert.match(previewOverlaySource, /onError=\{handleImagePreviewError\}/)
    assert.match(previewOverlaySource, /setPreviewError\(t\('preview\.loadFailed'\)\)/)
    assert.match(chatPageSource, /onError=\{\(\) => \{/)
  })

  it('keeps account backup scoped and restores once after fresh login', () => {
    const appGlobalsSource = readSource('src/components/AppGlobals.tsx')
    const appShellSource = readSource('src/components/AppShell.tsx')
    const marketingHeaderSource = readSource(
      'src/components/MarketingHeader.tsx'
    )
    const marketingLayoutSource = readSource(
      'src/components/MarketingLayout.tsx'
    )
    const languageToggleSource = readSource('src/components/LanguageToggle.tsx')
    const appearanceToggleSource = readSource(
      'src/components/AppearanceToggle.tsx'
    )
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const profileStyles = readSource('src/styles/profile.css')
    const profileMessagesSource = readSource('src/lib/i18n/messages/profile.ts')
    const accountMenuSource = readSource('src/features/profile/AccountMenu.tsx')
    const chatSource = readSource('src/features/chat/ChatPage.tsx')
    const sidebarSources = [
      readSource('src/features/files/AppPage.tsx'),
      chatSource,
      readSource('src/components/NoteSidebar.tsx'),
      readSource('src/components/GameSidebar.tsx'),
    ].join('\n')
    const appHeaderPageSources = [
      readSource('src/features/files/AppPage.tsx'),
      readSource('src/features/note/NotePage.tsx'),
      chatSource,
      readSource('src/features/web3/Web3Page.tsx'),
      readSource('src/features/game/gandengyan/GanDengYanPage.tsx'),
      readSource('src/features/game/zhajinhua/ZhajinhuaPage.tsx'),
    ].join('\n')
    const backupSource = readSource('src/features/profile/useAccountBackup.ts')
    const formatSource = readSource('src/lib/format.ts')
    const profileMessages = readSource('src/lib/i18n/messages/profile.ts')
    const userStoreSource = readSource('src/stores/userStore.ts')
    const marketingDownloadIndex =
      marketingLayoutSource.indexOf('to="/download/"')
    const marketingAccountMenuIndex = marketingLayoutSource.indexOf(
      '<AccountMenuButton />'
    )
    const appHeaderRightIndex = appShellSource.indexOf('{headerRight}')
    const appAccountMenuIndex = appShellSource.indexOf('<AccountMenuButton />')

    assert.doesNotMatch(appGlobalsSource, /startUserMetadataSync/)
    assert.doesNotMatch(appGlobalsSource, /reconcileUserProfileSync/)
    assert.doesNotMatch(appGlobalsSource, /getAuthenticatedWebSocketUrl/)
    assert.match(appGlobalsSource, /consumePendingCloudRestore/)
    assert.match(
      appGlobalsSource,
      /restoreFromCloud\(\{[\s\S]*onlyWhenLocalEmpty:\s*true/
    )
    assert.match(userStoreSource, /pendingCloudRestoreAddress/)
    assert.match(appShellSource, /AccountMenuButton/)
    assert.match(appShellSource, /hideAccountMenu\?: boolean/)
    assert.match(appShellSource, /hideAccountMenu = false/)
    assert.match(
      appShellSource,
      /\{!hideAccountMenu && <AccountMenuButton \/>\}/
    )
    assert.match(appShellSource, /AppearanceToggle/)
    assert.match(appShellSource, /LanguageToggle/)
    assert.match(chatSource, /hideAccountMenu=\{isInviteUser\}/)
    assert.match(marketingHeaderSource, /AccountMenuButton/)
    assert.match(marketingHeaderSource, /AppearanceToggle/)
    assert.match(marketingHeaderSource, /LanguageToggle/)
    assert.match(marketingLayoutSource, /AccountMenuButton/)
    assert.match(marketingLayoutSource, /AppearanceToggle/)
    assert.match(marketingLayoutSource, /LanguageToggle/)
    assert.ok(
      marketingDownloadIndex !== -1 &&
        marketingAccountMenuIndex !== -1 &&
        marketingDownloadIndex < marketingAccountMenuIndex
    )
    assert.ok(
      appHeaderRightIndex !== -1 &&
        appAccountMenuIndex !== -1 &&
        appHeaderRightIndex < appAccountMenuIndex
    )
    assert.doesNotMatch(
      marketingLayoutSource,
      /mkt-nav-avatar-trigger|nav\.getStarted|openLoginModal/
    )
    assert.match(profileSource, /profile-backup-card/)
    assert.match(profileSource, /profile-backup-summary/)
    assert.match(profileSource, /profile\.backup\.summary\.notes/)
    assert.match(profileSource, /profile\.backup\.summary\.files/)
    assert.match(profileSource, /profile\.backup\.summary\.trash/)
    assert.match(profileSource, /profile\.backup\.summary\.channels/)
    assert.match(profileSource, /formatNumber\(item\.value\)/)
    assert.match(profileSource, /profile-backup-actions/)
    assert.match(profileSource, /profile-backup-action-group/)
    assert.match(profileSource, /profile-backup-action-group-title/)
    assert.match(profileSource, /profile\.backup\.group\.cloud/)
    assert.match(profileSource, /profile\.backup\.group\.local/)
    assert.match(
      profileMessagesSource,
      /'profile\.backup\.group\.cloud': '云端同步'/
    )
    assert.match(
      profileMessagesSource,
      /'profile\.backup\.group\.local': '本地文件'/
    )
    assert.match(
      profileMessagesSource,
      /'profile\.backup\.action\.exportLocal': '备份到本地'/
    )
    assert.match(
      profileMessagesSource,
      /'profile\.backup\.action\.importLocal': '从本地恢复'/
    )
    assert.doesNotMatch(profileMessagesSource, /导出到本地|导入到本地/)
    assert.match(
      profileStyles,
      /\.profile-backup-action-group-title\s*\{[\s\S]*text-align:\s*center/
    )
    assert.match(
      profileStyles,
      /\.profile-backup-action\s*\{[\s\S]*flex-direction:\s*column/
    )
    assert.match(
      profileStyles,
      /\.profile-backup-action svg\s*\{[\s\S]*width:\s*24px[\s\S]*height:\s*24px/
    )
    assert.match(profileSource, /`is-\$\{action\.tone\}`/)
    assert.doesNotMatch(
      profileSource,
      /ProfilePreferencesPanel|profile-preferences-panel|profile-locale-grid|profile-preference-action|LOCALES\.map|localeNames\[item\]|setLocale\(item\)|setIsDarkMode\(!isDarkMode\)/
    )
    assert.match(languageToggleSource, /ActionMenu/)
    assert.match(languageToggleSource, /getLanguageToggleLocales\(theme\)/)
    assert.match(languageToggleSource, /items=\{locales\.map/)
    assert.match(languageToggleSource, /localeNames\[item\]/)
    assert.match(languageToggleSource, /setLocale\(item\)/)
    assert.match(appearanceToggleSource, /setIsDarkMode\(!isDarkMode\)/)
    assert.match(profileSource, /backupConfirm/)
    assert.match(profileSource, /ConfirmModal/)
    assert.match(profileSource, /useAccountBackup\(\)/)
    assert.match(profileSource, /profile\.logout\.backupReminder/)
    assert.match(profileSource, /accountBackup\.backupToCloud/)
    assert.match(profileSource, /accountBackup\.restoreFromCloud/)
    assert.match(profileSource, /accountBackup\.exportLocalBackup/)
    assert.match(profileSource, /accountBackup\.importLocalBackup/)
    assert.match(profileSource, /requestImportBackupConfirm/)
    assert.match(formatSource, /export function formatAddressShort/)
    assert.match(formatSource, /slice\(0, 6\).*slice\(-4\)/s)
    assert.match(accountMenuSource, /export function AccountMenuButton/)
    assert.doesNotMatch(
      accountMenuSource,
      /AccountBackupPanel|AccountBackupMenuButton/
    )
    assert.doesNotMatch(
      accountMenuSource,
      /useAccountBackup|ConfirmModal|ActionMenu|LOCALES|setLocale|setIsDarkMode|account-menu-|profile\.section\.backup/
    )
    assert.match(accountMenuSource, /useUserStore/)
    assert.match(accountMenuSource, /generateAvatar/)
    assert.match(accountMenuSource, /t\('nav\.profile'\)/)
    assert.match(accountMenuSource, /to="\/profile\/"/)
    assert.match(accountMenuSource, /account-profile-link/)
    assert.match(accountMenuSource, /account-profile-link-avatar/)
    assert.doesNotMatch(
      accountMenuSource,
      /key: 'language-status'|key: 'backup-status'/
    )
    assert.match(accountMenuSource, /<User size=\{18\}/)
    assert.match(profileSource, /openCloudBackupConfirm/)
    assert.match(profileSource, /openCloudRestoreConfirm/)
    assert.match(profileSource, /requestConfirm:\s*requestImportBackupConfirm/)
    assert.doesNotMatch(
      appHeaderPageSources,
      /AccountBackupMenuButton|AccountBackupPanel|setIsDarkMode|common\.theme\.toggle/
    )
    assert.doesNotMatch(
      appHeaderPageSources,
      /from '~\/features\/profile\/Account/
    )
    assert.doesNotMatch(
      appHeaderPageSources,
      /Sun size=\{16\}.*Moon size=\{16\}/s
    )
    assert.doesNotMatch(
      appHeaderPageSources,
      /useNoteBackupSync|NoteMoreMenu|backupSync/
    )
    assert.doesNotMatch(sidebarSources, /SidebarAccount/)
    assert.match(backupSource, /backupToCloud/)
    assert.match(backupSource, /restoreFromCloud/)
    assert.match(backupSource, /backupSummary/)
    assert.match(backupSource, /refreshBackupSummary/)
    assert.match(backupSource, /countBackupItems/)
    assert.match(backupSource, /\/api\/user\/export/)
    assert.match(backupSource, /onlyWhenLocalEmpty/)
    assert.match(backupSource, /exportLocalBackup/)
    assert.match(backupSource, /importLocalBackup/)
    assert.match(backupSource, /requestConfirm/)
    assert.match(
      backupSource,
      /displayName:\s*currentIdentity\.displayName \|\| currentIdentity\.username/
    )
    assert.match(backupSource, /avatar:\s*currentIdentity\.avatar \|\| ''/)
    assert.match(
      backupSource,
      /preferences:\s*\{[\s\S]*theme:\s*useAppStore\.getState\(\)\.isDarkMode \? 'dark' : 'light'[\s\S]*locale/
    )
    assert.match(backupSource, /preferences:\s*payload\.preferences \|\| null/)
    assert.match(backupSource, /normalizeBackupPreferences/)
    assert.match(
      backupSource,
      /setIsDarkMode\(restoredPreferences\.theme === 'dark'\)/
    )
    assert.match(backupSource, /setLocale\(restoredPreferences\.locale\)/)
    assert.match(backupSource, /applyProfileToIdentity/)
    assert.match(backupSource, /profile\.displayName \|\| identity\.username/)
    assert.match(backupSource, /avatar:\s*profile\.avatar \|\| undefined/)
    assert.match(profileMessages, /显示名称、头像、偏好设置/)
    assert.match(profileMessages, /display name, avatar, preferences/)
    assert.doesNotMatch(backupSource, /window\.confirm/)
  })

  it('uses profile identity as the single source for chat and game messages', () => {
    const chatSource = readSource('src/features/chat/ChatPage.tsx')
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')
    const channelMessagesSource = readSource('src/hooks/useChannelMessages.ts')
    const userProfileSource = readSource('src/lib/userProfile.ts')

    assert.match(userProfileSource, /getUserMessageIdentity/)
    assert.match(userProfileSource, /getUserChannelProfile/)
    assert.match(channelMessagesSource, /useUserStore/)
    assert.match(
      channelMessagesSource,
      /getUserMessageIdentity\(userIdentity\)/
    )
    assert.doesNotMatch(chatSource, /author:\s*userIdentity\.address/)
    assert.doesNotMatch(gameRoomSource, /author:\s*userIdentity\.address/)
    assert.match(gameRoomSource, /getUserChannelProfile\(userIdentity\)/)
    assert.match(gameRoomSource, /getGamePlayerPayload\(/)
    assert.match(gameRoomSource, /getUserMessageIdentity\(userIdentity\)/)
    assert.match(gameRoomSource, /await sendMessage\(\{[\s\S]*optimisticId:/)
    assert.match(gameRoomSource, /avatar:\s*identity\.avatar \|\| ''/)
  })

  it('saves profile metadata locally without automatic cloud backup', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const backupSource = readSource('src/features/profile/useAccountBackup.ts')
    const saveProfileBlock = profileSource.slice(
      profileSource.indexOf('async function saveBackendProfile'),
      profileSource.indexOf('function updateAvatar')
    )

    assert.match(profileSource, /saveBackendProfile\(nextIdentity\)/)
    assert.match(profileSource, /\/api\/user\/profile/)
    assert.doesNotMatch(saveProfileBlock, /backupToCloud/)
    assert.match(backupSource, /\/api\/user\/export/)
    assert.match(backupSource, /\/api\/user\/import/)
    assert.match(backupSource, /readRestoredProfile/)
    assert.match(backupSource, /\/api\/user\/profile/)
    assert.match(backupSource, /createNotesFromNoteVaultSnapshot/)
    assert.match(backupSource, /createNoteVaultSnapshotFromNotes/)
    assert.match(backupSource, /canRestoreToDesktopNoteVault/)
    assert.match(
      backupSource,
      /payload\.notes\s*=\s*await createNotesFromNoteVaultSnapshot\(noteVault\)/
    )
    assert.match(
      backupSource,
      /hasNoteVaultPayload\(payload\)[\s\S]*createNoteVaultSnapshotFromNotes/
    )
    assert.match(
      backupSource,
      /hasNoteVaultPayload\(payload\) \|\| Array\.isArray\(payload\.notes\)/
    )
    assert.match(
      backupSource,
      /restoredNotes\s*=\s*await createNotesFromNoteVaultSnapshot\(vaultSnapshot\)/
    )
    assert.match(backupSource, /setUserIdentity/)
    assert.doesNotMatch(backupSource, /profileUpdated\?/)
  })

  it('uses default channel list filtering without legacy filter parameters', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const channelApiSource = readSource('src/lib/channelApi.ts')
    const removedOptionName = 'exclude' + 'Type'

    assert.match(chatSource, /channelApi\.getChannels\(\)/)
    assert.doesNotMatch(
      `${chatSource}\n${channelApiSource}`,
      new RegExp(removedOptionName)
    )
  })

  it('does not keep removed local identity compatibility branches', () => {
    const userStoreSource = readSource('src/stores/userStore.ts')
    const userIdentitySource = readSource('server/src/utils/userIdentity.js')

    assert.doesNotMatch(userStoreSource, /LEGACY_/)
    assert.doesNotMatch(userStoreSource, /匿名/)
    assert.doesNotMatch(userIdentitySource, /mostbox_guest_identity/)
  })

  it('auto joins requested chat channels after the channel list loads', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)

    assert.ok(
      chatSource.includes(
        'const [hasLoadedChannels, setHasLoadedChannels] = useState(false)'
      )
    )
    assert.match(chatSource, /autoJoinChannelAttemptsRef/)
    assert.match(chatSource, /autoLoginPromptedChannelsRef/)
    assert.match(
      chatSource,
      /if \(!isBackendReady \|\| !hasLoadedChannels\) return/
    )
    assert.match(
      chatSource,
      /autoJoinChannelAttemptsRef\.current\.has\(attemptKey\)/
    )
    assert.match(chatSource, /void handleJoinChannel\(requestedChannelName\)/)
  })

  it('keeps invite chat restoring until active channel messages sync', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const channelMessagesSource = readSource('src/hooks/useChannelMessages.ts')

    assert.match(channelMessagesSource, /syncedChannelName/)
    assert.match(chatSource, /syncedChannelName: syncedChannelMessagesName/)
    assert.match(chatSource, /isLoadingActiveChannelMessages/)
    assert.match(
      chatSource,
      /shouldShowChatRestoring[\s\S]*isLoadingActiveChannelMessages/
    )
    assert.match(
      chatSource,
      /shouldShowChatRestoring \? \(\s*<ChatRestoringIndicator \/>\s*\) : activeChannel \?/
    )
  })

  it('derives chat members from channel messages without the members API', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const channelApiSource = readSource('src/lib/channelApi.ts')

    assert.match(chatSource, /const channelMembers = useMemo/)
    assert.match(chatSource, /channelMessages\.forEach/)
    assert.match(chatSource, /membersByAuthor/)
    assert.match(chatSource, /messageProfileByAddress/)
    assert.match(chatSource, /messageProfile\?\.displayName/)
    assert.match(chatSource, /messageProfile\?\.avatar/)
    assert.doesNotMatch(chatSource, /getChannelMembers/)
    assert.doesNotMatch(channelApiSource, /getChannelMembers/)
    assert.doesNotMatch(channelApiSource, /interface ChannelMember/)
  })

  it('renders channel member joins as centered system messages', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const channelApiSource = readSource('src/lib/channelApi.ts')
    const messagesSource = readSource('src/lib/i18n/messages/chat.ts')

    assert.match(channelApiSource, /event\?: string/)
    assert.match(chatSource, /isChannelMemberJoinedSystemMessage/)
    assert.match(chatSource, /ChatSystemMessageItem/)
    assert.match(chatSource, /chat\.system\.memberJoined/)
    assert.match(chatUiSource, /function ChatSystemMessageItem/)
    assert.match(chatCssSource, /\.chat-system-message/)
    assert.match(messagesSource, /'chat\.system\.memberJoined'/)
  })

  it('renders chat member online indicators from channel presence', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const channelApiSource = readSource('src/lib/channelApi.ts')
    const channelHookSource = readSource('src/hooks/useChannelMessages.ts')

    assert.match(channelApiSource, /interface ChannelPresence/)
    assert.match(channelApiSource, /getChannelPresence/)
    assert.match(chatSource, /refreshChannelPresence/)
    assert.match(chatSource, /presenceByAddress/)
    assert.match(chatSource, /onlineMemberAddressSet/)
    assert.match(chatSource, /isOnline={isOnline}/)
    assert.match(chatSource, /online: onlineMemberAddressSet\.has/)
    assert.match(chatSource, /presenceEnabled/)
    assert.match(channelHookSource, /channel:presence:join/)
    assert.match(channelHookSource, /channel:presence:heartbeat/)
    assert.match(channelHookSource, /channel:presence:profile/)
    assert.match(channelHookSource, /channel:presence:leave/)
    assert.match(chatUiSource, /className="chat-online-dot"/)
    assert.match(chatUiSource, /className="channel-member-avatar-wrap"/)
    assert.match(chatUiSource, /className="chat-avatar-wrap"/)
    assert.match(chatCssSource, /\.chat-online-dot/)
  })

  it('renders game room player presence without removing player snapshots', () => {
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')
    const ganDengYanSource = readSource(
      'src/features/game/gandengyan/GanDengYanPage.tsx'
    )
    const zhaJinHuaSource = readSource(
      'src/features/game/zhajinhua/ZhajinhuaPage.tsx'
    )
    const ganDengYanCss = readSource(
      'src/features/game/gandengyan/page.module.css'
    )
    const zhaJinHuaCss = readSource(
      'src/features/game/zhajinhua/page.module.css'
    )

    assert.match(gameRoomSource, /getChannelPresence/)
    assert.match(gameRoomSource, /handleGameSocketEvent/)
    assert.match(
      gameRoomSource,
      /presenceEnabled:\s*Boolean\(channelName && userIdentity\)/
    )
    assert.match(gameRoomSource, /presenceProfile/)
    assert.match(gameRoomSource, /presenceByAddress/)
    assert.match(gameRoomSource, /onlineAddresses/)
    assert.match(gameRoomSource, /playerPayload/)
    assert.match(ganDengYanSource, /getGamePlayerDisplay/)
    assert.match(
      ganDengYanSource,
      /presenceByAddress={game\.presenceByAddress}/
    )
    assert.match(ganDengYanSource, /onlineAddresses={game\.onlineAddresses}/)
    assert.match(ganDengYanSource, /styles\.onlineDot/)
    assert.match(zhaJinHuaSource, /getGamePlayerDisplay/)
    assert.match(zhaJinHuaSource, /game\.presenceByAddress/)
    assert.match(zhaJinHuaSource, /game\.onlineAddresses/)
    assert.match(zhaJinHuaSource, /styles\.onlineDot/)
    assert.match(ganDengYanCss, /\.onlineDot/)
    assert.match(zhaJinHuaCss, /\.onlineDot/)
  })

  it('prefers remote nodes before localhost and same-origin backends', async () => {
    const storeSource = readSource('src/stores/useAppStore.ts')
    const checkStart = storeSource.indexOf('checkBackend: async () => {')
    const checkEnd = storeSource.indexOf('\n  },\n\n  // Theme', checkStart)
    const checkBackendSource = storeSource.slice(checkStart, checkEnd)
    const remoteIndex = checkBackendSource.indexOf('getRemoteUrlExport')
    const localhostIndex = checkBackendSource.indexOf('detectLocalhostBackend')
    const sameOriginIndex = checkBackendSource.indexOf(
      'getSameOriginBackendUrlExport'
    )
    const joinSource = readSource('src/features/chat/ChatJoinPage.tsx')
    const remotePanelSource = readSource(
      SOURCE_PATHS.components.remoteNodePanel
    )
    const { shouldConnectChatJoinInviteNode } = await importBundledSource(
      'src/lib/chatJoinRemote.ts'
    )

    assert.ok(remoteIndex >= 0)
    assert.ok(localhostIndex > remoteIndex)
    assert.ok(sameOriginIndex > localhostIndex)
    assert.doesNotMatch(checkBackendSource, /clearBackendConnection/)
    assert.match(joinSource, /shouldConnectChatJoinInviteNode/)
    assert.doesNotMatch(joinSource, /invite\.node_url && !isUsingRemote/)
    assert.equal(
      shouldConnectChatJoinInviteNode({
        inviteNodeUrl: 'https://remote-b.example.com/base',
        inviteNodeInvite: 'invite-b',
        hasBackend: true,
        activeBackendUrl: 'https://remote-a.example.com/base',
        activeRemoteUrl: 'https://remote-a.example.com/base',
        activeRemoteInvite: 'invite-a',
      }),
      true
    )
    assert.equal(
      shouldConnectChatJoinInviteNode({
        inviteNodeUrl: 'https://remote-b.example.com/base',
        inviteNodeInvite: 'invite-b',
        hasBackend: true,
        activeBackendUrl: 'https://remote-b.example.com/base/',
        activeRemoteUrl: 'https://remote-b.example.com/base',
        activeRemoteInvite: 'invite-b',
      }),
      false
    )
    assert.equal(
      shouldConnectChatJoinInviteNode({
        inviteNodeUrl: 'https://remote-b.example.com/base',
        inviteNodeInvite: 'invite-b',
        hasBackend: true,
        activeBackendUrl: 'https://remote-b.example.com/base',
        activeRemoteUrl: 'https://remote-b.example.com/base',
        activeRemoteInvite: 'invite-a',
      }),
      true
    )
    assert.match(remotePanelSource, /getNodeHistoryExport/)
    assert.match(remotePanelSource, /remote\.history\.title/)
  })

  it('lists localhost in the connection history panel without a special label', () => {
    const remotePanelSource = readSource(
      SOURCE_PATHS.components.remoteNodePanel
    )

    assert.match(remotePanelSource, /getNodeHistoryExport/)
    assert.match(remotePanelSource, /formatRemoteNodeHost\(node\.url\)/)
    assert.doesNotMatch(remotePanelSource, /remote\.history\.localNode/)
    assert.doesNotMatch(remotePanelSource, /remote-node-url/)
  })

  it('hides download client entry points in the desktop client runtime', () => {
    const hookSource = readSource('src/hooks/index.ts')
    const electronMainSource = readSource('electron/main.js')
    const marketingLayoutSource = readSource(
      'src/components/MarketingLayout.tsx'
    )
    const portalSource = readSource('src/components/FeaturePortal.tsx')
    const noteSource = readSource('src/features/note/NotePage.tsx')

    assert.match(hookSource, /electronAPI\?\.isElectron === true/)
    assert.match(hookSource, /navigator\?\.userAgent/)
    assert.match(hookSource, /Electron\\\/\\d\+/)
    assert.doesNotMatch(hookSource, /hasBackend/)
    assert.doesNotMatch(
      hookSource,
      /isLocalBackendUrlExport|getBackendUrlExport|getSameOriginBackendUrlExport/
    )
    assert.match(
      marketingLayoutSource,
      /const isDesktopClient = useIsDesktopClient\(\)/
    )
    assert.match(
      electronMainSource,
      /pendingDeepLinkUrl \|\| getLocalAppUrl\('\/'\)/
    )
    assert.doesNotMatch(
      electronMainSource,
      /pendingDeepLinkUrl \|\| getLocalAppUrl\('\/chat\/'\)/
    )
    assert.match(marketingLayoutSource, /!\s*isDesktopClient &&/)
    assert.match(portalSource, /!\s*isDesktopClient &&/)
    assert.doesNotMatch(portalSource, /hideInDesktopClient/)
    assert.doesNotMatch(portalSource, /activeFeatureSteps/)
    assert.match(noteSource, /useConfiguredNoteVaultBackend/)
    assert.match(
      noteSource,
      /isLocalBackend && \(isDesktopClient \|\| hasConfiguredVaultBackend\)/
    )
    assert.match(noteSource, /canSelectNoteVaultDirectory/)
    assert.match(noteSource, /canOpenVaultDirectory && \(/)
    assert.match(noteSource, /window\.electronAPI\?\.selectNoteVaultDirectory/)
  })

  it('keeps note read headers as static titles while editing uses title inputs', () => {
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const noteStyles = readSource('src/styles/note.css')

    assert.match(noteSource, /const canEditCurrentVaultFile =/)
    assert.match(
      noteStyles,
      /\.note-editor-title-area h3\s*\{[\s\S]*padding:\s*0 10px/
    )
    assert.match(
      noteStyles,
      /\.note-editor-info\s*\{[\s\S]*padding:\s*4px 10px/
    )
    assert.match(
      noteSource,
      /\{isEditing \? \([\s\S]*className="note-title-input"/
    )
    assert.match(
      noteSource,
      /\{isEditing && selectedFile \? \([\s\S]*className="note-title-input"/
    )
    assert.match(noteSource, /<h3 translate="no">\s*\{selectedTitle\}\s*<\/h3>/)
    assert.doesNotMatch(noteSource, /readOnly=\{!canEditCurrentNote\}/)
    assert.match(
      noteSource,
      /<MilkdownEditor[\s\S]*readOnly=\{!canEditCurrentVaultFile\}/
    )
  })

  it('shows note cancel buttons only while editing', () => {
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const editOnlyCancelButtons =
      noteSource.match(
        /isEditing && \(\s*<button\s+type="button"\s+className="btn btn-sm btn-secondary"\s+onClick=\{closeEditor\}\s+>\s*<X size=\{16\} \/>\s*\{t\('common\.cancel'\)\}/g
      ) || []

    assert.equal(editOnlyCancelButtons.length, 2)
    assert.doesNotMatch(noteSource, /common\.close/)
    assert.doesNotMatch(
      noteSource,
      /isEditing \? closeEditor : \(\) => navigateTo(?:Note|Vault)\(\)/
    )
  })

  it('keeps note editor privacy controls aligned between web and desktop vault flows', () => {
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const editorActionSections =
      noteSource.match(
        /<div className="note-editor-actions">[\s\S]*?<\/div>/g
      ) || []

    assert.equal(editorActionSections.length, 2)
    for (const section of editorActionSections) {
      assert.match(section, /<Eye size=\{16\} \/>/)
      assert.match(section, /t\('note\.privacy\.public'\)/)
    }
    assert.match(editorActionSections[0], /setEditIsSecret/)
    assert.match(
      editorActionSections[1],
      /aria-label=\{[\s\S]*t\('note\.privacy\.public'\)[\s\S]*\}/
    )
    assert.match(editorActionSections[1], /disabled/)
  })

  it('keeps note move and delete actions in the note tree menu', () => {
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const noteStyles = readSource('src/styles/note.css')
    const editorActionSections =
      noteSource.match(
        /<div className="note-editor-actions">[\s\S]*?<\/div>/g
      ) || []
    const treeActionMenus =
      noteSource.match(
        /<NoteTreeActionsMenu[\s\S]*?onDelete=\{openDeleteConfirm\}[\s\S]*?\/>/g
      ) || []

    assert.equal(editorActionSections.length, 2)
    assert.equal(treeActionMenus.length, 2)
    assert.match(noteSource, /function NoteTreeActionsMenu/)
    assert.match(
      noteSource,
      /key: 'move'[\s\S]*label: t\('note\.action\.move'\)/
    )
    assert.match(noteSource, /key: 'delete'[\s\S]*danger: true/)
    assert.match(noteSource, /className="note-list-actions-trigger"/)
    for (const section of editorActionSections) {
      assert.doesNotMatch(section, /note\.action\.move/)
      assert.doesNotMatch(section, /note\.action\.delete/)
      assert.doesNotMatch(section, /openMoveModal/)
      assert.doesNotMatch(section, /openDeleteConfirm/)
      assert.doesNotMatch(section, /<Move size=\{16\} \/>/)
      assert.doesNotMatch(section, /<Trash2 size=\{16\} \/>/)
    }
    assert.doesNotMatch(noteSource, /openMoveModal\(selectedNote\)/)
    assert.doesNotMatch(noteSource, /openDeleteConfirm\(selectedNote\)/)
    assert.doesNotMatch(noteStyles, /note-editor-action-danger/)
  })

  it('does not trigger account backup from note save flows', () => {
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const milkdownSource = readSource('src/components/MilkdownEditor.tsx')
    const saveStart = noteSource.indexOf('async function handleSaveEditor()')
    const createStart = noteSource.indexOf(
      'function openCreateNoteModal()',
      saveStart
    )
    const saveHandlerSource = noteSource.slice(saveStart, createStart)

    const saveIndex = saveHandlerSource.indexOf(
      'const nextCid = await saveNote'
    )
    const routeIndex = saveHandlerSource.indexOf(
      'navigateToNote({ cid: nextCid }, true)'
    )

    assert.ok(saveIndex >= 0)
    assert.ok(routeIndex > saveIndex)
    assert.match(noteSource, /ActionMenu/)
    assert.match(noteSource, /note-list-actions-trigger/)
    assert.match(noteSource, /MoreHorizontal/)
    assert.match(noteSource, /renderWikiNoteLinks/)
    assert.match(noteSource, /resolveWikiLinkNote/)
    assert.match(noteSource, /getNoteHref\(\{ cid: note\.cid \}\)/)
    assert.match(noteSource, /getNoteHref\(\{ file: note\.cid \}\)/)
    assert.match(noteSource, /onInternalNoteLinkOpen=\{openInternalNoteLink\}/)
    assert.match(noteSource, /resolveWikiNoteLink=\{resolvePreviewWikiLink\}/)
    assert.match(milkdownSource, /onInternalNoteLinkOpen/)
    assert.match(milkdownSource, /data-note-wiki-link/)
    assert.match(milkdownSource, /url\.pathname !== '\/note\/'/)
    assert.doesNotMatch(noteSource, /uploadNow|backupSync|useNoteBackupSync/)
  })
})
