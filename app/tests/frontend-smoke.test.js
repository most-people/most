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

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

const repoRootPath = fileURLToPath(new URL('../../', import.meta.url))

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
          build.onResolve({ filter: /^~\// }, args => ({
            path: resolveRepoAlias(args.path),
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

function resolveRepoAlias(importPath) {
  const resolvedPath = path.join(repoRootPath, importPath.slice(2))
  const candidates = [
    resolvedPath,
    `${resolvedPath}.ts`,
    `${resolvedPath}.tsx`,
    `${resolvedPath}.js`,
    `${resolvedPath}.jsx`,
  ]
  return candidates.find(candidate => fs.existsSync(candidate)) || resolvedPath
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

describe('frontend smoke checks', () => {
  it('keeps the share modal aligned with the MVP seeding promise', () => {
    const source = readSource('app/app/page.tsx')
    const messages = readSource('lib/i18n/messages.ts')

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
    const source = readSource('app/admin/page.tsx')
    const messages = readSource('lib/i18n/messages.ts')

    assert.match(source, /NodeHolding/)
    assert.match(source, /formatSeedStatus/)
    assert.match(source, /admin\.seedStatus\.active/)
    assert.match(source, /admin\.seedStatus\.queued/)
    assert.match(messages, /'admin\.seedStatus\.active': '做种中'/)
    assert.match(messages, /'admin\.seedStatus\.queued': '队列中'/)
  })

  it('does not advertise unlimited file size in user-facing copy', () => {
    const sources = [
      readSource('README.md'),
      readSource('app/admin/page.tsx'),
      readSource('components/FeaturePortal.tsx'),
      readSource('lib/i18n/messages.ts'),
      readSource('app/download/page.tsx'),
    ].join('\n')

    assert.doesNotMatch(sources, /无限文件大小|无限制传输/)
    assert.match(sources, /10GB|10 GB/)
  })

  it('lets users choose R2 or GitHub download sources', () => {
    const source = readSource('components/DownloadOptions.tsx')

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
    const readme = readSource('README.md')

    assert.match(releaseWorkflow, /most-box-releases/)
    assert.match(releaseWorkflow, /https:\/\/download\.most\.box/)
    assert.match(releaseWorkflow, /most-box-backup/)
    assert.match(readme, /most-box-releases/)
    assert.match(readme, /https:\/\/download\.most\.box/)
    assert.match(readme, /most-box-backup/)
  })

  it('documents current runtime and desktop dependency requirements', () => {
    const readme = readSource('README.md')
    const agents = readSource('AGENTS.md')
    const downloadPage = readSource('app/download/page.tsx')
    const portal = readSource('components/FeaturePortal.tsx')
    const messages = readSource('lib/i18n/messages.ts')
    const remoteNodePanel = readSource('components/RemoteNodeConnectPanel.tsx')

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
    const packageJson = readSource('package.json')
    const viteConfig = readSource('vite.config.ts')
    const rootRoute = readSource('src/routes/__root.tsx')
    const appRoute = readSource('src/routes/app/index.tsx')
    const adminRoute = readSource('src/routes/admin/index.tsx')
    const downloadRoute = readSource('src/routes/download/index.tsx')

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

  it('keeps static output checks aligned with TanStack static routes', () => {
    const checkStaticOutput = readSource('scripts/check-static-output.mjs')
    const checkedRoutes = Array.from(
      checkStaticOutput.matchAll(/route:\s*'([^']+)'/g),
      ([, route]) => route
    ).sort()

    const staticRoutes = listSourceFiles('src/routes')
      .filter((file) => file.endsWith('.tsx'))
      .flatMap((file) => {
        const source = readSource(file)
        const match = source.match(/createFileRoute\(\s*'([^']+)'\s*\)/)
        if (!match) {
          return []
        }

        const route = match[1]
        if (route.includes('$') || !/component\s*:/.test(source)) {
          return []
        }

        return [route]
      })
      .sort()

    assert.deepEqual(checkedRoutes, staticRoutes)
    assert.match(checkStaticOutput, /admin\/index\.html/)
    assert.match(checkStaticOutput, /chat\/index\.html/)
    assert.match(checkStaticOutput, /note\/index\.html/)
    assert.match(checkStaticOutput, /web3\/index\.html/)
    assert.match(checkStaticOutput, /game\/gandengyan\/index\.html/)
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

  it('keeps Gan Deng Yan game page wired to the server rules and P2P channel', () => {
    const source = readSource('app/game/gandengyan/page.tsx')
    const gameRoomSource = readSource('hooks/useGameRoom.ts')

    assert.match(source, /GAME_ID = 'gandengyan'/)
    assert.match(source, /useGameRoom/)
    assert.match(source, /from '~\/server\/src\/games\/gandengyan\.js'/)
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

  it('keeps P2P chat controls shared without the discarded chat extras', () => {
    const chatSource = readSource('app/chat/page.tsx')
    const demoSource = readSource('app/demo/page.tsx')
    const componentSource = readSource('components/ChatUi.tsx')
    const sidebarAccountSource = readSource('components/SidebarAccount.tsx')
    const uiIndexSource = readSource('components/ui/index.ts')
    const chatUnreadSource = readSource('lib/chatUnread.js')
    const i18nMessages = readSource('lib/i18n/messages.ts')

    assert.match(chatSource, /from '~\/components\/ChatUi'/)
    assert.match(demoSource, /from '~\/components\/ChatUi'/)
    assert.match(demoSource, /P2P Chat/)
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
    assert.match(sidebarAccountSource, /ActionMenu/)
    assert.doesNotMatch(sidebarAccountSource, /danger: true/)
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
      /account-actions-menu|account-actions-dropdown|account-actions-item|logout-btn/
    )
    assert.doesNotMatch(chatSource, /PINNED_CHANNELS|ChatTypingIndicator|__duplicate/)
    assert.doesNotMatch(chatSource, /正在输入|告诉我可以帮你做什么|修改名称/)
  })

  it('uses key-based i18n without DOM translation', () => {
    const rootRoute = readSource('src/routes/__root.tsx')
    const i18nSource = readSource('lib/i18n/index.tsx')
    const messagesSource = readSource('lib/i18n/messages.ts')
    const downloadValidationSource = readSource(
      'lib/i18n/downloadValidation.ts'
    )
    const portalSource = readSource('components/FeaturePortal.tsx')
    const navSource = readSource('components/Nav.tsx')
    const appSource = readSource('app/app/page.tsx')
    const chatSource = readSource('app/chat/page.tsx')

    assert.match(rootRoute, /I18nProvider/)
    assert.match(navSource, /LanguageToggle/)
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
    assert.match(messagesSource, /'app\.download\.validation\.empty'/)
    assert.match(messagesSource, /type MessageKey = keyof typeof zhCNMessages/)
    assert.match(messagesSource, /satisfies Record<MessageKey, string>/)
    assert.match(i18nSource, /translateMessage/)
    assert.doesNotMatch(i18nSource, /MutationObserver|createTreeWalker|translateDocument/)
  })

  it('keeps migrated surfaces free of hardcoded Chinese UI copy', () => {
    const migratedSources = [
      readSource('app/download/page.tsx'),
      readSource('components/DownloadOptions.tsx'),
      readSource('components/Footer.tsx'),
      readSource('components/CopyButton.tsx'),
      readSource('components/AppGlobals.tsx'),
      readSource('components/PingPanel.tsx'),
      readSource('components/PemBlock.tsx'),
      readSource('components/MilkdownEditor.tsx'),
      readSource('components/GameSidebar.tsx'),
      readSource('components/NoteMoreMenu.tsx'),
      readSource('components/UserLoginModal.tsx'),
      readSource('app/error-boundary.tsx'),
      readSource('app/not-found.tsx'),
      readSource('app/chat/page.tsx'),
      readSource('app/chat/join/page.tsx'),
      readSource('app/note/page.tsx'),
      readSource('app/note/useNoteBackupSync.ts'),
      readSource('app/admin/page.tsx'),
      readSource('app/web3/page.tsx'),
      ...listSourceFiles('app/web3/components')
        .filter(file => file.endsWith('.tsx'))
        .map(readSource),
      readSource('app/game/zhajinhua/page.tsx'),
      readSource('app/game/gandengyan/page.tsx'),
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
    const i18n = await importBundledSource('lib/i18n/index.tsx')
    const downloadValidation = await importBundledSource(
      'lib/i18n/downloadValidation.ts'
    )
    const validCid =
      'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

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
    assert.deepEqual(
      downloadValidation.getMostLinkValidationMessageKey(
        'https://example.com/file'
      ),
      { key: 'app.download.validation.protocol' }
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
      readSource('components/AppFileCards.tsx'),
      readSource('components/ChatUi.tsx'),
      readSource('components/ChatAttachmentCard.tsx'),
      readSource('components/FilePreviewOverlay.tsx'),
      readSource('components/MoveModal.tsx'),
      readSource('components/NoteMoveModal.tsx'),
      readSource('app/note/page.tsx'),
      readSource('app/app/page.tsx'),
      readSource('app/admin/page.tsx'),
      readSource('components/PemBlock.tsx'),
      readSource('components/KeyCard.tsx'),
    ].join('\n')

    assert.match(sources, /className="card-name" translate="no"/)
    assert.match(sources, /chat-channel-title-text" translate="no"/)
    assert.match(sources, /className="message-bubble" translate="no"/)
    assert.match(sources, /share-link-text" translate="no"/)
    assert.match(sources, /className="preview-text" translate="no"/)
    assert.match(sources, /className="textarea mono"[\s\S]*translate="no"/)
    assert.match(sources, /title=\{holding\.cid\} translate="no"/)
  })
})
