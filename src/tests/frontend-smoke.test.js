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
  it('keeps the share modal aligned with the MVP seeding promise', () => {
    const source = readSource(SOURCE_PATHS.features.files)
    const shareLinkSource = readSource('src/lib/shareLink.ts')
    const messages = readI18nSources()

    assert.match(
      source,
      /buildCidShareLink\(shareItem\.cid, shareItem\.fileName\)/
    )
    assert.match(source, /\{shareLink\}/)
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
      '请先粘贴 most:// 分享链接。'
    )
    assert.equal(
      getDownloadLinkValidationMessage('https://example.com/file'),
      '链接协议不正确，应以 most:// 开头。'
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
    assert.match(buildScript, /expo[\s\S]*prebuild[\s\S]*--platform[\s\S]*android/)
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
    assert.match(portal, /portal\.feature\.app\.bullet\.desktop/)
    assert.match(messages, /Web 端只连接已有节点，桌面端提供完整 P2P 能力/)
    assert.match(remoteNodePanel, /remote\.hint/)
    assert.match(messages, /Web 端只连接已有 MostBox 节点/)
    assert.match(messages, /本机完整 P2P 能力请使用桌面客户端/)
    assert.doesNotMatch(readme, /Electron 41/)
    assert.match(agents, /ipfs-unixfs-importer@17\.0\.1/)
    assert.doesNotMatch(agents, /components\/AppHomeMode\.tsx/)
  })

  it('documents the chat-first MVP acceptance path without weakening protocol regression', () => {
    const acceptance = readSource('docs/acceptance.md')
    const agents = readSource(SOURCE_PATHS.agents)

    assert.match(acceptance, /聊天主入口/)
    assert.match(acceptance, /`http:\/\/localhost:3000\/chat\/`/)
    assert.match(acceptance, /当前主线验收从 `\/chat\/` 开始/)
    assert.match(acceptance, /`\/app\/` 现在是文件库和传输管理入口/)
    assert.match(acceptance, /聊天附件传文件/)
    assert.match(acceptance, /发布者退出/)
    assert.match(acceptance, /保存聊天记录到知识库/)
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
      /主应用\s*\|\s*`http:\/\/localhost:3000\/app\/`\s*\|\s*发布文件/
    )
  })

  it('keeps Android aligned with the chat-first attachment MVP', () => {
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
    assert.match(androidReadme, /Android chat-first alpha/)
    assert.match(androidReadme, /Sending an attachment publishes/)
    assert.match(androidReadme, /Received chat messages that contain a `most:\/\/` link/)
    assert.match(androidAlpha, /Android 内测验收清单/)
    assert.match(androidAlpha, /Android 聊天附件发送/)
    assert.match(androidAlpha, /发布者退出后继续传播/)
    assert.match(readme, /Android 聊天优先完整种子 MVP/)
    assert.match(readme, /收发消息、用 `most:\/\/` 附件传文件/)
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
    const admin = readSource(SOURCE_PATHS.features.admin)

    assert.match(footer, /from '..\/..\/package\.json'/)
    assert.match(footer, /const version = packageJson\.version/)
    assert.match(footer, /v\{version\}/)
    assert.doesNotMatch(footer, /title=\{version\}/)
    assert.doesNotMatch(footer, /commit=|build=/)
    assert.doesNotMatch(admin, /admin\.nodeStatus\.webBuild/)
    assert.doesNotMatch(admin, /buildVersion|buildIdentifier|buildInfo/)
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
    assert.match(chatJoinSource, /<AppEmpty className="chat-join-loading-page">/)
    assert.doesNotMatch(chatJoinSource, /<AppTop/)
    assert.doesNotMatch(chatJoinSource, /AppShell/)
    assert.match(
      appTopSource,
      /<Link\s+to="\/"\s+className="sidebar-header sidebar-header-link"/
    )
    assert.match(appEmptySource, /<main className=\{className\}>/)
    assert.doesNotMatch(headerSource, /<Link to="\/" className="mkt-nav-logo"/)
  })

  it('keeps chat join failure state retryable and navigable', () => {
    const chatJoinSource = readSource('src/features/chat/ChatJoinPage.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const i18nMessages = readI18nSources()

    assert.match(chatJoinSource, /const back = useBack\(\)/)
    assert.match(
      chatJoinSource,
      /const \[retryAttempt, setRetryAttempt\] = useState\(0\)/
    )
    assert.match(chatJoinSource, /flowKeyRef\.current = ''/)
    assert.match(chatJoinSource, /setRetryAttempt\(attempt => attempt \+ 1\)/)
    assert.match(chatJoinSource, /retryAttempt,/)
    assert.match(chatJoinSource, /className="chat-join-actions"/)
    assert.match(chatJoinSource, /t\('chatJoin\.action\.retry'\)/)
    assert.match(chatJoinSource, /t\('common\.back'\)/)
    assert.match(
      chatJoinSource,
      /t\('common\.back'\)[\s\S]*t\('chatJoin\.action\.retry'\)/
    )
    assert.match(chatCssSource, /\.chat-join-actions/)
    assert.match(i18nMessages, /'chatJoin\.action\.retry': '重试'/)
    assert.match(i18nMessages, /'chatJoin\.action\.retry': 'Retry'/)
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
    assert.match(ganDengYanSource, /new URLSearchParams\(window\.location\.search\)/)
    assert.match(ganDengYanSource, /game\.joinRoom\(code\)/)
    assert.match(zhajinhuaSource, /new URLSearchParams\(window\.location\.search\)/)
    assert.match(zhajinhuaSource, /game\.joinRoom\(code\)/)
  })

  it('keeps P2P chat controls shared without the discarded chat extras', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const componentSource = readSource('src/components/ChatUi.tsx')
    const voicePanelSource = readSource('src/components/ChatVoiceRoomPanel.tsx')
    const globalVoiceSource = readSource('src/features/chat/GlobalVoiceRoom.tsx')
    const voiceHookSource = readSource('src/hooks/useVoiceRoom.ts')
    const attachmentCardSource = readSource('src/components/ChatAttachmentCard.tsx')
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
    assert.match(chatCssSource, /\.chat-composer-input[\s\S]*field-sizing: content/)
    assert.match(chatCssSource, /\.message-bubble \{[\s\S]*white-space: pre-wrap/)
    assert.match(chatCssSource, /&\.has-attachment \{[\s\S]*white-space: normal/)
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
    assert.match(i18nMessages, /'chat\.attachment\.downloadAvailable': '可下载'/)
    assert.match(i18nMessages, /'chat\.attachment\.preview': '预览'/)
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

  it('saves current chat history into note drafts from chat settings', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const noteRouteSource = readSource('src/routes/note/index.tsx')
    const draftSource = readSource('src/lib/chatNoteDraft.ts')
    const i18nMessages = readI18nSources()

    assert.match(draftSource, /CHAT_NOTE_DRAFT_STORAGE_PREFIX/)
    assert.match(draftSource, /window\.localStorage/)
    assert.match(draftSource, /chatDraft/)
    assert.doesNotMatch(draftSource, /\/api\/|fetch\(|api\./)
    assert.match(chatSource, /createChatNoteDraft/)
    assert.match(chatSource, /getChatNoteDraftHref/)
    assert.match(chatSource, /handleSaveChannelToNote/)
    assert.match(chatSource, /getChatHistoryNoteDraftContent/)
    assert.match(chatSource, /isSaveableChannelMessage/)
    assert.match(chatSource, /chat\.noteDraft\.saveAll/)
    assert.match(chatSource, /chat\.noteDraft\.settingsTitle/)
    assert.match(chatSource, /chat\.noteDraft\.messageCount/)
    assert.match(
      chatSource,
      /chat\.channel\.createdAt[\s\S]*chat\.noteDraft\.settingsTitle/
    )
    assert.match(chatSource, /channel-detail-hint/)
    assert.doesNotMatch(chatSource, /NotebookPen/)
    assert.doesNotMatch(chatSource, /handleSaveMessageToNote/)
    assert.doesNotMatch(chatSource, /chat\.message\.saveToNote/)
    assert.doesNotMatch(chatUiSource, /actions\?: ActionMenuItem\[\]/)
    assert.doesNotMatch(chatUiSource, /chat-message-actions-trigger/)
    assert.doesNotMatch(chatCssSource, /chat-message-actions/)
    assert.match(chatCssSource, /channel-detail-hint/)
    assert.match(noteRouteSource, /chatDraft/)
    assert.match(noteSource, /readChatNoteDraft/)
    assert.match(noteSource, /deleteChatNoteDraft/)
    assert.match(noteSource, /importChatDraftToNote/)
    assert.match(noteSource, /importChatDraftToVault/)
    assert.match(
      noteSource,
      /saveNote\(\{[\s\S]*content: draft\.content[\s\S]*isSecret: false/
    )
    assert.match(noteSource, /createNoteVaultFile\(targetPath, draft\.content\)/)
    assert.match(
      noteSource,
      /navigateToNote\(\{ cid: newCid, mode: 'edit' \}, true\)/
    )
    assert.match(
      noteSource,
      /navigateToVault\(\{ file: file\.path, mode: 'edit' \}, true\)/
    )
    assert.match(i18nMessages, /'chat\.noteDraft\.saveAll': '保存聊天记录到知识库'/)
    assert.match(i18nMessages, /'chat\.noteDraft\.empty': '当前聊天还没有可保存的消息'/)
    assert.doesNotMatch(i18nMessages, /chat\.messageActions|chat\.message\.saveToNote/)
    assert.match(i18nMessages, /'note\.chatDraft\.created': '已保存到知识库'/)
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
    const marketingHeaderSource = readSource('src/components/MarketingHeader.tsx')
    const appShellSource = readSource('src/components/AppShell.tsx')
    const languageToggleSource = readSource('src/components/LanguageToggle.tsx')
    const themeToggleSource = readSource('src/components/ThemeToggle.tsx')
    const accountMenuSource = readSource('src/features/profile/AccountMenu.tsx')
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const appSource = readSource(SOURCE_PATHS.features.files)
    const chatSource = readSource(SOURCE_PATHS.features.chat)

    assert.match(rootRoute, /I18nProvider/)
    assert.match(rootRoute, /supportedLocales = \['zh-CN', 'zh-TW', 'en'\]/)
    assert.match(appShellSource, /AccountMenuButton/)
    assert.match(appShellSource, /ThemeToggle/)
    assert.match(appShellSource, /LanguageToggle/)
    assert.match(marketingLayoutSource, /AccountMenuButton/)
    assert.match(marketingLayoutSource, /ThemeToggle/)
    assert.match(marketingLayoutSource, /LanguageToggle/)
    assert.match(marketingHeaderSource, /ThemeToggle/)
    assert.match(marketingHeaderSource, /LanguageToggle/)
    assert.doesNotMatch(accountMenuSource, /ActionMenu|LOCALES|setLocale|setIsDarkMode/)
    assert.doesNotMatch(
      profileSource,
      /ProfilePreferencesPanel|profile-preferences-panel|profile-locale-grid|profile-preference-action|LOCALES\.map|localeNames\[item\]|setLocale\(item\)|setIsDarkMode\(!isDarkMode\)/
    )
    assert.match(languageToggleSource, /ActionMenu/)
    assert.match(languageToggleSource, /LOCALES\.map/)
    assert.match(languageToggleSource, /localeNames\[item\]/)
    assert.match(languageToggleSource, /setLocale\(item\)/)
    assert.match(languageToggleSource, /<Check size=\{16\}/)
    assert.match(themeToggleSource, /setIsDarkMode\(!isDarkMode\)/)
    assert.match(themeToggleSource, /t\('common\.theme\.toggle'\)/)
    assert.doesNotMatch(
      messageCatalogs,
      /common\.locale\.current|common\.locale\.switchTo/
    )
    assert.match(portalSource, /titleKey: 'portal\.feature\.app\.title'/)
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

  it('keeps migrated surfaces free of hardcoded Chinese UI copy', () => {
    const migratedSources = [
      readSource('src/features/download/DownloadPage.tsx'),
      readSource('src/components/DownloadOptions.tsx'),
      readSource('src/components/Footer.tsx'),
      readSource('src/components/CopyButton.tsx'),
      readSource('src/components/AppGlobals.tsx'),
      readSource('src/components/LanguageToggle.tsx'),
      readSource('src/components/ThemeToggle.tsx'),
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
    assert.equal(
      i18n.translateMessage('app.transfers', 'zh-TW'),
      '傳輸管理'
    )
    assert.deepEqual(
      downloadValidation.getMostLinkValidationMessageKey(
        'https://example.com/file'
      ),
      { key: 'app.download.validation.protocol' }
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

  it('disables custom avatar save until a URL is entered', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')

    assert.match(
      profileSource,
      /const canSaveAvatarUrl = avatarUrlDraft\.trim\(\)\.length > 0/
    )
    assert.match(profileSource, /disabled=\{!canSaveAvatarUrl\}/)
  })

  it('prefills the profile avatar URL field from the stored avatar value', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')

    assert.match(
      profileSource,
      /setAvatarUrlDraft\(\s*normalizeDefaultAvatarValue\(identity\.avatar\) \|\| identity\.avatar \|\| ''\s*\)/
    )
    assert.match(profileSource, /isSupportedAvatarValue/)
  })

  it('keeps account backup scoped and restores once after fresh login', () => {
    const appGlobalsSource = readSource('src/components/AppGlobals.tsx')
    const appShellSource = readSource('src/components/AppShell.tsx')
    const marketingHeaderSource = readSource('src/components/MarketingHeader.tsx')
    const marketingLayoutSource = readSource('src/components/MarketingLayout.tsx')
    const languageToggleSource = readSource('src/components/LanguageToggle.tsx')
    const themeToggleSource = readSource('src/components/ThemeToggle.tsx')
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
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
      readSource('src/features/chat/ChatJoinPage.tsx'),
      readSource('src/features/web3/Web3Page.tsx'),
      readSource('src/features/game/gandengyan/GanDengYanPage.tsx'),
      readSource('src/features/game/zhajinhua/ZhajinhuaPage.tsx'),
    ].join('\n')
    const backupSource = readSource('src/features/profile/useAccountBackup.ts')
    const formatSource = readSource('src/lib/format.ts')
    const profileMessages = readSource('src/lib/i18n/messages/profile.ts')
    const userStoreSource = readSource('src/stores/userStore.ts')
    const marketingDownloadIndex = marketingLayoutSource.indexOf('to="/download/"')
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
    assert.match(appShellSource, /\{!hideAccountMenu && <AccountMenuButton \/>\}/)
    assert.match(appShellSource, /ThemeToggle/)
    assert.match(appShellSource, /LanguageToggle/)
    assert.match(chatSource, /hideAccountMenu=\{isInviteUser\}/)
    assert.match(marketingHeaderSource, /AccountMenuButton/)
    assert.match(marketingHeaderSource, /ThemeToggle/)
    assert.match(marketingHeaderSource, /LanguageToggle/)
    assert.match(marketingLayoutSource, /AccountMenuButton/)
    assert.match(marketingLayoutSource, /ThemeToggle/)
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
    assert.doesNotMatch(marketingLayoutSource, /mkt-nav-avatar-trigger|nav\.getStarted|openLoginModal/)
    assert.match(profileSource, /profile-backup-card/)
    assert.match(profileSource, /profile-backup-summary/)
    assert.match(profileSource, /profile\.backup\.summary\.notes/)
    assert.match(profileSource, /profile\.backup\.summary\.files/)
    assert.match(profileSource, /profile\.backup\.summary\.trash/)
    assert.match(profileSource, /profile\.backup\.summary\.channels/)
    assert.match(profileSource, /formatNumber\(item\.value\)/)
    assert.match(profileSource, /profile-backup-actions/)
    assert.match(profileSource, /`is-\$\{action\.tone\}`/)
    assert.doesNotMatch(
      profileSource,
      /ProfilePreferencesPanel|profile-preferences-panel|profile-locale-grid|profile-preference-action|LOCALES\.map|localeNames\[item\]|setLocale\(item\)|setIsDarkMode\(!isDarkMode\)/
    )
    assert.match(languageToggleSource, /ActionMenu/)
    assert.match(languageToggleSource, /LOCALES\.map/)
    assert.match(languageToggleSource, /localeNames\[item\]/)
    assert.match(languageToggleSource, /setLocale\(item\)/)
    assert.match(themeToggleSource, /setIsDarkMode\(!isDarkMode\)/)
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
    assert.doesNotMatch(accountMenuSource, /AccountBackupPanel|AccountBackupMenuButton/)
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
    assert.doesNotMatch(accountMenuSource, /key: 'language-status'|key: 'backup-status'/)
    assert.match(accountMenuSource, /<User size=\{18\}/)
    assert.match(profileSource, /openCloudBackupConfirm/)
    assert.match(profileSource, /openCloudRestoreConfirm/)
    assert.match(
      profileSource,
      /requestConfirm:\s*requestImportBackupConfirm/
    )
    assert.doesNotMatch(
      appHeaderPageSources,
      /AccountBackupMenuButton|AccountBackupPanel|setIsDarkMode|common\.theme\.toggle/
    )
    assert.doesNotMatch(appHeaderPageSources, /from '~\/features\/profile\/Account/)
    assert.doesNotMatch(appHeaderPageSources, /Sun size=\{16\}.*Moon size=\{16\}/s)
    assert.doesNotMatch(appHeaderPageSources, /useNoteBackupSync|NoteMoreMenu|backupSync/)
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
    assert.match(backupSource, /setIsDarkMode\(restoredPreferences\.theme === 'dark'\)/)
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
    assert.match(gameRoomSource, /presenceEnabled:\s*Boolean\(channelName && userIdentity\)/)
    assert.match(gameRoomSource, /presenceProfile/)
    assert.match(gameRoomSource, /presenceByAddress/)
    assert.match(gameRoomSource, /onlineAddresses/)
    assert.match(gameRoomSource, /playerPayload/)
    assert.match(ganDengYanSource, /getGamePlayerDisplay/)
    assert.match(ganDengYanSource, /presenceByAddress={game\.presenceByAddress}/)
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
    assert.match(marketingLayoutSource, /!\s*isDesktopClient &&/)
    assert.match(portalSource, /hideInDesktopClient: true/)
    assert.match(portalSource, /activeFeatureSteps/)
    assert.match(portalSource, /!\s*isDesktopClient &&/)
    assert.match(noteSource, /useConfiguredNoteVaultBackend/)
    assert.match(
      noteSource,
      /isLocalBackend && \(isDesktopClient \|\| hasConfiguredVaultBackend\)/
    )
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
