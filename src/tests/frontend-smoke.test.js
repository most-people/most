import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

import {
  createCidRoutePathFromMostLink,
  createMostDeepLinkTarget,
} from '../../electron/deepLink.js'
import { requiredStaticEntries } from '../../scripts/static-routes.mjs'

const repoRootPath = fileURLToPath(new URL('../../', import.meta.url))

const SOURCE_PATHS = {
  packageJson: 'package.json',
  readme: 'README.md',
  acceptance: 'docs/acceptance.md',
  viteConfig: 'vite.config.ts',
  checkStaticOutput: 'scripts/check-static-output.mjs',
  admin: 'src/features/admin/AdminPage.tsx',
  cid: 'src/features/cid/CidPage.tsx',
  cidCss: 'src/styles/cid.css',
  files: 'src/features/files/AppPage.tsx',
  appCss: 'src/styles/app.css',
}

function readSource(sourcePath) {
  return fs.readFileSync(
    new URL(`../../${sourcePath}`, import.meta.url),
    'utf-8'
  )
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

function getStaticRoutes() {
  return requiredStaticEntries.map(entry => entry.route)
}

describe('frontend smoke checks', () => {
  it('keeps the documented frontend commands wired to package scripts', () => {
    const packageJson = JSON.parse(readSource(SOURCE_PATHS.packageJson))

    assert.equal(packageJson.scripts.dev, 'vite')
    assert.equal(
      packageJson.scripts['test:frontend'],
      'node --test src/tests/*.test.js'
    )
    assert.match(readSource(SOURCE_PATHS.readme), /npm run dev/)
    assert.match(readSource(SOURCE_PATHS.acceptance), /npm run test:frontend/)
  })

  it('keeps the static web shell route list focused on public entry points', () => {
    const routes = getStaticRoutes()

    assert.deepEqual(
      routes.filter(route =>
        ['/', '/app/', '/chat/', '/download/', '/note/', '/web3/'].includes(
          route
        )
      ),
      ['/', '/app/', '/chat/', '/download/', '/note/', '/web3/']
    )
    assert.ok(routes.includes('/game/gandengyan/'))
    assert.ok(routes.includes('/game/zhajinhua/'))
    assert.ok(!routes.some(route => route.includes('$')))
    assert.match(
      readSource(SOURCE_PATHS.checkStaticOutput),
      /requiredStaticEntries/
    )
    assert.match(readSource(SOURCE_PATHS.viteConfig), /prerender/)
  })

  it('keeps native and web CID share links compatible with desktop deep links', async () => {
    const { buildCidShareLink, buildCidSharePath, buildMostShareLink } =
      await importBundledSource('src/lib/shareLink.ts')
    const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

    assert.equal(
      buildCidSharePath(cid, 'hello most.txt'),
      `/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      buildMostShareLink(cid, 'hello most.txt'),
      `most://${cid}?filename=hello%20most.txt`
    )
    globalThis.window = {
      location: {
        origin: 'http://localhost:3000',
      },
    }
    try {
      assert.equal(
        buildCidShareLink(cid, 'hello most.txt'),
        `http://localhost:3000/cid/${cid}?filename=hello%20most.txt`
      )
    } finally {
      delete globalThis.window
    }
    assert.equal(
      buildCidShareLink(cid, 'hello most.txt'),
      `https://most.box/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      createCidRoutePathFromMostLink(`most://${cid}?filename=hello%20most.txt`),
      `/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      createMostDeepLinkTarget(
        `most://${cid}?filename=hello%20most.txt`,
        'http://localhost:1976'
      ),
      `http://localhost:1976/cid/${cid}?filename=hello%20most.txt`
    )

    const filesSource = readSource(SOURCE_PATHS.files)
    const cidSource = readSource(SOURCE_PATHS.cid)
    assert.match(filesSource, /buildMostShareLink\(file\.cid, file\.fileName\)/)
    assert.match(filesSource, /buildCidSharePath\(file\.cid, file\.fileName\)/)
    assert.match(cidSource, /fileApi\.checkDownload\(mostLink\)/)
    assert.match(cidSource, /fileApi\.downloadFile\(mostLink\)/)
  })

  it('routes file share actions to the CID page and exposes web QR sharing there', async () => {
    const filesSource = readSource(SOURCE_PATHS.files)
    const cidSource = readSource(SOURCE_PATHS.cid)
    const cidCss = readSource(SOURCE_PATHS.cidCss)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(filesSource, /useNavigate\(/)
    assert.match(
      filesSource,
      /navigate\(\{ href: buildCidSharePath\(file\.cid, file\.fileName\) \}\)/
    )
    assert.match(
      filesSource,
      /navigate\(\{\s*href: buildCidSharePath\(shareResult\.cid, shareResult\.fileName\),?\s*\}\)/
    )
    assert.doesNotMatch(filesSource, /className="share-modal"/)

    assert.match(cidSource, /QRCodeCanvas/)
    assert.match(cidSource, /buildCidShareLink\(cid, shareFileName\)/)
    assert.match(cidSource, /handleDownloadQrCode/)
    assert.match(cidSource, /cid\.copyWebShareLink/)
    assert.match(cidSource, /cid\.downloadQrAction/)
    assert.match(cidSource, /cidProcessSteps/)
    assert.match(cidSource, /className="cid-process-steps"/)
    assert.match(cidSource, /cid\.transfer\.title/)
    assert.match(cidSource, /cid\.process\.step\.open\.title/)
    assert.match(cidSource, /cid\.process\.step\.seed\.desc/)
    assert.match(cidSource, /className="cid-bottom-handoff"/)
    assert.match(
      cidSource,
      /className="cid-workspace"[\s\S]*className="cid-bottom-handoff"/
    )
    assert.match(cidSource, /className="cid-process-action"/)
    assert.match(
      cidSource,
      /<span className="cid-process-desc">\{step\.desc\}<\/span>/
    )
    assert.match(cidSource, /case 'open':[\s\S]*cid\.copyLinkAction/)
    assert.match(cidSource, /case 'open':[\s\S]*handleCopyWebShareLink/)
    assert.match(cidSource, /case 'check':[\s\S]*runCheck/)
    assert.match(cidSource, /case 'verify':[\s\S]*handleStartDownload/)
    assert.match(cidSource, /case 'seed':[\s\S]*cid\.viewFileAction/)
    assert.match(cidSource, /case 'seed':[\s\S]*<FolderOpen size=\{16\} \/>/)
    assert.match(cidSource, /case 'seed':[\s\S]*to="\/app\/"/)
    assert.doesNotMatch(cidSource, /cid\.share\.note/)
    assert.doesNotMatch(cidCss, /cid-share-note/)
    assert.doesNotMatch(cidSource, /className="cid-actions"/)
    assert.doesNotMatch(cidSource, /Share2/)
    assert.doesNotMatch(cidCss, /\.cid-process-step span:last-child/)
    assert.match(
      cidCss,
      /\.cid-web-link-row\s*{[\s\S]*grid-template-columns: 1fr/
    )
    assert.match(
      cidCss,
      /\.cid-process-desc\s*{[\s\S]*color: var\(--text-secondary\);/
    )
    assert.match(cidCss, /\.cid-process-action/)
    assert.match(
      cidCss,
      /\.cid-process-action \.btn\s*{[\s\S]*min-width: 0;[\s\S]*white-space: normal;/
    )
    assert.match(
      cidCss,
      /\.cid-process-action \.btn span\s*{[\s\S]*min-width: 0;[\s\S]*overflow-wrap: anywhere;/
    )
    assert.match(
      cidCss,
      /\.cid-process-action \.btn svg\s*{[\s\S]*flex: 0 0 auto;/
    )

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(typeof messages[locale]['cid.share.title'], 'string')
      assert.equal(typeof messages[locale]['cid.copyWebShareLink'], 'string')
      assert.equal(typeof messages[locale]['cid.downloadQrAction'], 'string')
      assert.equal(typeof messages[locale]['cid.copyLinkAction'], 'string')
      assert.equal(typeof messages[locale]['cid.viewFileAction'], 'string')
      assert.equal(typeof messages[locale]['cid.transfer.title'], 'string')
      assert.equal(
        typeof messages[locale]['cid.process.step.open.title'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['cid.process.step.seed.desc'],
        'string'
      )
    }

    assert.equal(
      messages['zh-CN']['cid.transfer.title'],
      '接收并继续传播这个文件'
    )
    assert.equal(
      messages['zh-CN']['cid.process.step.seed.desc'],
      '下载完成后默认加入传播。'
    )
    assert.equal(messages['zh-CN']['cid.share.title'], '转发')
    assert.equal(messages['zh-CN']['cid.copyLinkAction'], '复制链接')
    assert.equal(messages['zh-CN']['cid.viewFileAction'], '查看文件')
  })

  it('labels the CID page return action as the file library', async () => {
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.equal(messages['zh-CN']['cid.openAppAction'], '打开文件库')
    assert.equal(messages['zh-TW']['cid.openAppAction'], '開啟檔案庫')
    assert.equal(messages.en['cid.openAppAction'], 'Open file library')
  })

  it('uses collection-specific download check semantics in the UI', async () => {
    const filesSource = readSource(SOURCE_PATHS.files)
    const cidSource = readSource(SOURCE_PATHS.cid)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(filesSource, /app\.collectionManifestAvailable/)
    assert.match(filesSource, /app\.collectionChildDownloadCheck/)
    assert.match(cidSource, /cid\.status\.collectionAvailable/)
    assert.match(cidSource, /cid\.collectionSummary/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(
        typeof messages[locale]['app.collectionManifestAvailable'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['app.collectionChildDownloadCheck'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['cid.status.collectionAvailable'],
        'string'
      )
      assert.equal(typeof messages[locale]['cid.collectionSummary'], 'string')
    }

    assert.equal(
      messages.en['app.collectionManifestAvailable'],
      '{fileName} manifest is readable. Child files will be checked for online seeders when downloaded.'
    )
    assert.equal(
      messages.en['app.collectionChildDownloadCheck'],
      'Checked during download'
    )
    assert.equal(
      messages.en['cid.status.collectionAvailable'],
      '{fileName} manifest is readable. Child files will be checked one by one when downloading.'
    )
  })

  it('preflights folder sharing against local complete copies', async () => {
    const { getFolderShareState } = await importBundledSource(
      'src/lib/folderShare.ts'
    )

    assert.deepEqual(
      getFolderShareState(
        [
          {
            fileName: 'Show/S01E01.txt',
            kind: 'file',
            localAvailable: true,
          },
          {
            fileName: 'Show/S01E02.txt',
            kind: 'file',
            seedStatus: 'error',
          },
          {
            fileName: 'Other/S01E03.txt',
            kind: 'file',
            localAvailable: true,
          },
        ],
        'Show'
      ),
      {
        canShare: false,
        reason: 'missingLocalFiles',
        fileCount: 2,
        missingCount: 1,
      }
    )
    assert.deepEqual(
      getFolderShareState(
        [
          {
            fileName: 'Show/S01E01.txt',
            kind: 'file',
            localAvailable: true,
          },
          {
            fileName: 'Show/S01E02.txt',
            kind: 'file',
            localAvailable: true,
          },
        ],
        'Show'
      ),
      {
        canShare: true,
        reason: '',
        fileCount: 2,
        missingCount: 0,
      }
    )
    assert.match(
      readSource(SOURCE_PATHS.files),
      /getFolderShareState\(items, folder\.path\)/
    )
  })

  it('keeps download choices backed by release manifests with GitHub fallback', async () => {
    const {
      FALLBACK_DOWNLOAD_ASSETS,
      getDownloadOptionsState,
      getReleaseManifestUrl,
    } = await importBundledSource('src/lib/downloadOptions.ts')
    const manifest = {
      version: '0.3.9',
      publishedAt: '2026-01-01T00:00:00.000Z',
      assets: [
        {
          platform: 'windows',
          arch: 'x64',
          kind: 'installer',
          filename: 'MostBox-0.3.9-win-x64-setup.exe',
          size: 1024,
          cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
          r2Url: 'https://download.most.box/releases/MostBox.exe',
          githubUrl:
            'https://github.com/most-people/most/releases/download/v0.3.9/MostBox.exe',
        },
      ],
    }

    assert.equal(
      getReleaseManifestUrl({}),
      'https://download.most.box/releases/latest.json'
    )
    assert.ok(
      FALLBACK_DOWNLOAD_ASSETS.some(
        asset => asset.platform === 'android' && asset.arch === 'universal'
      )
    )

    assert.deepEqual(
      getDownloadOptionsState({
        manifest,
        currentKey: 'windows:x64',
        requestedSource: 'r2',
      }).currentDownload,
      {
        source: 'r2',
        url: 'https://download.most.box/releases/MostBox.exe',
      }
    )
    assert.equal(
      getDownloadOptionsState({
        manifest: null,
        currentKey: 'windows:x64',
        requestedSource: 'r2',
      }).activeSource,
      'github'
    )
  })

  it('keeps chat identity snapshots flowing through messages', () => {
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
    assert.match(gameRoomSource, /getUserChannelProfile\(userIdentity\)/)
    assert.match(gameRoomSource, /getUserMessageIdentity\(userIdentity\)/)
  })

  it('derives chat members from channel messages without the members API', () => {
    const chatSource = readSource('src/features/chat/ChatPage.tsx')
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

  it('keeps mention unread channels prioritized and previewed', () => {
    const chatSource = readSource('src/features/chat/ChatPage.tsx')
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const i18nMessages = readSource('src/lib/i18n/messages/chat.ts')

    assert.match(chatUiSource, /mentionPreview = ''/)
    assert.match(chatUiSource, /chat\.mentionUnreadTag/)
    assert.match(
      chatSource,
      /hasUnreadChannelMention\(b, channelMentionUnread\)[\s\S]*hasUnreadChannelMessage\(b, channelLastReadAt\)[\s\S]*Boolean\(b\.pinned\)/
    )
    assert.match(chatCssSource, /chat-channel-mention-label[\s\S]*#ff3b30/)
    assert.match(
      chatCssSource,
      /chat-channel-mention-label[\s\S]*flex:\s*0 0 auto/
    )
    assert.match(
      chatCssSource,
      /chat-channel-preview[\s\S]*text-overflow:\s*ellipsis/
    )
    assert.match(i18nMessages, /'chat\.mentionUnreadTag': '有人@我'/)
    assert.doesNotMatch(
      i18nMessages,
      /'chat\.mentionUnreadTag': 'Mentioned me'/
    )
  })

  it('keeps the admin console connected to local seeding visibility', () => {
    const source = readSource(SOURCE_PATHS.admin)

    assert.match(source, /NodeHolding/)
    assert.match(source, /formatSeedStatus/)
    assert.match(source, /admin\.seedStatus\.active/)
    assert.match(source, /admin\.seedStatus\.queued/)
  })

  it('keeps the file selection toolbar grouped and compact', () => {
    const source = readSource(SOURCE_PATHS.files)
    const appCss = readSource(SOURCE_PATHS.appCss)

    assert.match(source, /className="batch-selection"/)
    assert.match(source, /className="batch-actions batch-actions-primary"/)
    assert.match(source, /className="batch-actions batch-actions-danger"/)
    assert.match(source, /<Eye size=\{14\}/)
    assert.match(source, /<RotateCcw size=\{14\}/)
    assert.doesNotMatch(source, /<Share2 size=\{14\}/)
    assert.doesNotMatch(
      source,
      /onClick=\{\(\) => setShareItem\(selectedFile\)\}/
    )
    assert.match(appCss, /\.batch-action-label/)
    assert.match(appCss, /\.batch-actions-danger/)
  })
})
