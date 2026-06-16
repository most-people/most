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
    entryPoints: [fileURLToPath(new URL(`../../${sourcePath}`, import.meta.url))],
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
  return resolveWithExtensions(path.join(repoRootPath, 'src', importPath.slice(2)))
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
    candidates.find(candidate =>
      fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ) || resolvedPath
  )
}

function listSourceFiles(path) {
  return fs
    .readdirSync(new URL(`../../${path}/`, import.meta.url), {
      withFileTypes: true,
    })
    .flatMap((entry) => {
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
    const messages = readI18nSources()

    assert.match(source, /most:\/\/\$\{shareItem\.cid\}\?filename=/)
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
    const source = readSource('src/components/DownloadOptions.tsx')

    assert.match(source, /VITE_RELEASE_MANIFEST_URL/)
    assert.match(source, /VITE_R2_PUBLIC_BASE_URL/)
    assert.match(source, /releases\/latest\.json/)
    assert.match(source, /https:\/\/download\.most\.box/)
    assert.match(source, /github\.com\/most-people\/most\/releases\/latest/)
    assert.match(source, /Cloudflare R2/)
    assert.match(source, /GitHub Releases/)
    assert.match(source, /role="tablist"/)
  })

  it('documents the dedicated R2 release bucket defaults', () => {
    const releaseWorkflow = readSource('.github/workflows/release.yml')
    const readme = readSource(SOURCE_PATHS.readme)

    assert.match(releaseWorkflow, /most-box-releases/)
    assert.match(releaseWorkflow, /https:\/\/download\.most\.box/)
    assert.match(releaseWorkflow, /most-box-backup/)
    assert.match(readme, /most-box-releases/)
    assert.match(readme, /https:\/\/download\.most\.box/)
    assert.match(readme, /most-box-backup/)
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
          .filter((file) => file.endsWith('.tsx'))
          .flatMap((file) => {
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

    assert.match(mainSource, /checkForUpdates/)
    assert.match(mainSource, /showMessageBox/)
    assert.match(mainSource, /openExternal/)
    assert.match(checkerSource, /MOSTBOX_RELEASE_MANIFEST_URL/)
    assert.match(checkerSource, /download\.most\.box\/releases\/latest\.json/)
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
    assert.match(deepLinkSource, /\/cid\/\$\{encodeURIComponent\(url\.hostname\)\}/)
    assert.match(cidRoute, /createFileRoute\('\/cid\/\$cid\/'\)/)
    assert.match(cidRoute, /ssr:\s*false/)
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

  it('uses back navigation for secondary marketing headers', () => {
    const headerSource = readSource('src/components/MarketingHeader.tsx')
    const gameSidebarSource = readSource('src/components/GameSidebar.tsx')
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
    assert.match(gameSidebarSource, /useBack/)
    assert.doesNotMatch(headerSource, /<Link to="\/" className="mkt-nav-logo"/)
    assert.doesNotMatch(gameSidebarSource, /<Link to="\/" className="sidebar-header/)
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
    assert.doesNotMatch(
      zhajinhuaSource,
      /S:\s*'S'|H:\s*'H'|C:\s*'C'|D:\s*'D'/
    )
    assert.doesNotMatch(zhajinhuaSource, /[\u2660\u2665\u2666\u2663]/)
    assert.doesNotMatch(zhajinhuaSource, /\uFFFD/)
  })

  it('keeps P2P chat controls shared without the discarded chat extras', () => {
    const chatSource = readSource(SOURCE_PATHS.features.chat)
    const componentSource = readSource('src/components/ChatUi.tsx')
    const sidebarAccountSource = readSource('src/components/SidebarAccount.tsx')
    const uiIndexSource = readSource('src/components/ui/index.ts')
    const chatUnreadSource = readSource('src/lib/chatUnread.js')
    const i18nMessages = readI18nSources()

    assert.match(chatSource, /from '~\/components\/ChatUi'/)
    assert.match(uiIndexSource, /ActionMenu/)
    assert.match(componentSource, /export function ChatMessageItem/)
    assert.match(componentSource, /export function ChatComposer/)
    assert.match(componentSource, /export function ChannelMemberGrid/)
    assert.match(componentSource, /unread = false/)
    assert.match(componentSource, /chat-channel-unread-dot/)
    assert.match(componentSource, /ActionMenu/)
    assert.match(componentSource, /t\('chat\.unpin'\).*t\('chat\.pin'\)/s)
    assert.match(componentSource, /t\('chat\.rename'\)/)
    assert.match(componentSource, /t\('chat\.delete'\)/)
    assert.doesNotMatch(componentSource, /key: 'delete'[\s\S]{0,120}danger: true/)
    assert.match(sidebarAccountSource, /to="\/profile\/"/)
    assert.match(sidebarAccountSource, /className="btn btn-secondary logout-btn"/)
    assert.match(sidebarAccountSource, /t\('account\.logout'\)/)
    assert.doesNotMatch(sidebarAccountSource, /ActionMenu|MoreHorizontal/)
    assert.match(chatSource, /setChannelPinned/)
    assert.match(chatSource, /channelToRename/)
    assert.match(chatSource, /lastMessageAt/)
    assert.match(chatSource, /extraSubscribedChannelNames/)
    assert.match(chatUnreadSource, /CHAT_READ_STORAGE_PREFIX/)
    assert.match(chatSource, /playChannelNotificationSound/)
    assert.match(chatSource, /onReconnect: refreshChannels/)
    assert.match(chatSource, /markChannelRead\(/)
    assert.match(chatSource, /btn btn-secondary btn-block/)
    assert.match(componentSource, /labelKey: 'chat\.attachment\.image'/)
    assert.match(componentSource, /labelKey: 'chat\.attachment\.video'/)
    assert.match(componentSource, /labelKey: 'chat\.attachment\.file'/)
    assert.match(i18nMessages, /'chat\.attachment\.image': '图片'/)
    assert.match(i18nMessages, /'chat\.attachment\.video': '视频'/)
    assert.match(i18nMessages, /'chat\.attachment\.file': '文件'/)
    assert.doesNotMatch(componentSource, /application\/pdf/)
    assert.doesNotMatch(componentSource, /video\/mp4/)
    assert.doesNotMatch(
      componentSource,
      /chat-tool-dropdown|chat-tool-btn-wrap|chat-tool-item-tooltip|channel-actions-dropdown|channel-actions-item/
    )
    assert.doesNotMatch(
      sidebarAccountSource,
      /account-actions-menu|account-actions-dropdown|account-actions-item|account-menu-trigger/
    )
    assert.doesNotMatch(chatSource, /PINNED_CHANNELS|ChatTypingIndicator|__duplicate/)
    assert.doesNotMatch(chatSource, /正在输入|告诉我可以帮你做什么|修改名称/)
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
    const navSource = readSource('src/components/Nav.tsx')
    const languageSource = readSource('src/components/LanguageToggle.tsx')
    const appSource = readSource(SOURCE_PATHS.features.files)
    const chatSource = readSource(SOURCE_PATHS.features.chat)

    assert.match(rootRoute, /I18nProvider/)
    assert.match(rootRoute, /supportedLocales = \['zh-CN', 'zh-TW', 'en'\]/)
    assert.match(navSource, /LanguageToggle/)
    assert.match(languageSource, /ActionMenu/)
    assert.match(languageSource, /LOCALES\.map/)
    assert.match(languageSource, /<Check size=\{16\}/)
    assert.doesNotMatch(languageSource, /locale === 'zh-CN'/)
    assert.match(portalSource, /titleKey: 'portal\.feature\.app\.title'/)
    assert.match(appSource, /getLocalizedDownloadLinkValidationMessage/)
    assert.match(chatSource, /getLocalizedDownloadLinkValidationMessage/)
    assert.match(downloadValidationSource, /parseMostLink/)
    assert.match(downloadValidationSource, /MOST_LINK_ERROR_CODES/)
    assert.match(downloadValidationSource, /MessageKey/)
    assert.doesNotMatch(appSource, /getDownloadLinkValidationMessage/)
    assert.doesNotMatch(chatSource, /getDownloadLinkValidationMessage/)
    assert.doesNotMatch(downloadValidationSource, /Unsupported query parameter:/)
    assert.doesNotMatch(appSource, /[\u4e00-\u9fff]/)
    assert.match(messageCatalogs, /'app\.download\.validation\.empty'/)
    assert.match(messagesSource, /LOCALES = \['zh-CN', 'zh-TW', 'en'\] as const/)
    assert.match(messagesSource, /type MessageKey = keyof typeof zhCNMessages/)
    assert.match(messagesSource, /export const zhTWMessages/)
    assert.match(messagesSource, /'zh-TW': zhTWMessages/)
    assert.match(messagesSource, /satisfies Record<MessageKey, string>/)
    assert.match(i18nSource, /translateMessage/)
    assert.doesNotMatch(i18nSource, /MutationObserver|createTreeWalker|translateDocument/)
  })

  it('keeps migrated surfaces free of hardcoded Chinese UI copy', () => {
    const migratedSources = [
      readSource('src/features/download/DownloadPage.tsx'),
      readSource('src/components/DownloadOptions.tsx'),
      readSource('src/components/Footer.tsx'),
      readSource('src/components/CopyButton.tsx'),
      readSource('src/components/AppGlobals.tsx'),
      readSource('src/components/PingPanel.tsx'),
      readSource('src/components/PemBlock.tsx'),
      readSource('src/components/MilkdownEditor.tsx'),
      readSource('src/components/GameSidebar.tsx'),
      readSource('src/components/NoteMoreMenu.tsx'),
      readSource('src/components/UserLoginModal.tsx'),
      readSource('src/features/system/ErrorBoundary.tsx'),
      readSource('src/features/system/NotFoundPage.tsx'),
      readSource('src/features/chat/ChatPage.tsx'),
      readSource('src/features/chat/ChatJoinPage.tsx'),
      readSource('src/features/note/NotePage.tsx'),
      readSource('src/features/note/useNoteBackupSync.ts'),
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

  it('keys profile metadata sync by address, display name, and avatar', () => {
    const appGlobalsSource = readSource('src/components/AppGlobals.tsx')
    const userSyncSource = readSource('src/lib/userSync.ts')
    const keyStart = userSyncSource.indexOf(
      'export function getUserProfileSyncKey'
    )
    const keyEnd = userSyncSource.indexOf(
      'export function getUserChannelProfile',
      keyStart
    )
    const keySource = userSyncSource.slice(keyStart, keyEnd)

    assert.match(appGlobalsSource, /getUserProfileSyncKey\(identity\)/)
    assert.doesNotMatch(
      appGlobalsSource,
      /const syncKey = identity\.address\.toLowerCase\(\)/
    )
    assert.match(keySource, /identity\.address\.toLowerCase\(\)/)
    assert.match(keySource, /getUserDisplayName\(identity\)/)
    assert.match(keySource, /identity\.avatar \|\| ''/)
  })

  it('uses profile identity as the single source for chat and game messages', () => {
    const chatSource = readSource('src/features/chat/ChatPage.tsx')
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')
    const channelMessagesSource = readSource('src/hooks/useChannelMessages.ts')
    const userSyncSource = readSource('src/lib/userSync.ts')

    assert.match(userSyncSource, /getUserMessageIdentity/)
    assert.match(userSyncSource, /getUserChannelProfile/)
    assert.match(channelMessagesSource, /useUserStore/)
    assert.match(channelMessagesSource, /getUserMessageIdentity\(userIdentity\)/)
    assert.doesNotMatch(chatSource, /author:\s*userIdentity\.address/)
    assert.doesNotMatch(gameRoomSource, /author:\s*userIdentity\.address/)
    assert.match(gameRoomSource, /getUserChannelProfile\(userIdentity\)/)
    assert.match(gameRoomSource, /getGamePlayerPayload\(/)
    assert.match(gameRoomSource, /getUserMessageIdentity\(userIdentity\)/)
    assert.match(gameRoomSource, /await sendMessage\(\{[\s\S]*optimisticId:/)
    assert.match(gameRoomSource, /avatar:\s*identity\.avatar \|\| ''/)
  })

  it('syncs profile saves through existing user metadata and channel APIs', () => {
    const profileSource = readSource('src/features/profile/ProfilePage.tsx')
    const userSyncSource = readSource('src/lib/userSync.ts')

    assert.match(profileSource, /syncUserProfileMetadata/)
    assert.match(profileSource, /void syncSavedProfile\(nextIdentity\)/)
    assert.match(
      userSyncSource,
      /startUserMetadataSync\(identity\)[\s\S]*refreshJoinedChannelProfiles\(identity\)/
    )
    assert.match(userSyncSource, /channelApi\.getChannels\(\)/)
    assert.match(userSyncSource, /channelApi\.createChannel/)
  })

  it('hides download client entry points in the desktop client runtime', () => {
    const hookSource = readSource('src/hooks/index.ts')
    const navSource = readSource('src/components/Nav.tsx')
    const portalSource = readSource('src/components/FeaturePortal.tsx')

    assert.match(hookSource, /electronAPI\?\.isElectron === true/)
    assert.match(navSource, /const isDesktopClient = useIsDesktopClient\(\)/)
    assert.match(navSource, /!\s*isDesktopClient &&/)
    assert.match(portalSource, /hideInDesktopClient: true/)
    assert.match(portalSource, /activeFeatureSteps/)
    assert.match(portalSource, /!\s*isDesktopClient &&/)
  })

  it('keeps note save route updates ahead of silent backup sync', () => {
    const noteSource = readSource('src/features/note/NotePage.tsx')
    const saveStart = noteSource.indexOf('async function handleSaveEditor()')
    const createStart = noteSource.indexOf('function openCreateNoteModal()', saveStart)
    const saveHandlerSource = noteSource.slice(saveStart, createStart)

    const saveIndex = saveHandlerSource.indexOf('const nextCid = await saveNote')
    const routeIndex = saveHandlerSource.indexOf(
      'navigateToNote({ cid: nextCid }, true)'
    )
    const backupIndex = saveHandlerSource.indexOf(
      'await backupSync.uploadNow({ silent: true })'
    )

    assert.ok(saveIndex >= 0)
    assert.ok(routeIndex > saveIndex)
    assert.ok(backupIndex > routeIndex)
  })
})
