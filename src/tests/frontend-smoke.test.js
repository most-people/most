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
  globalDownloads: 'src/features/cid/GlobalDownloadTasks.tsx',
  downloadTasks: 'src/lib/downloadTasks.ts',
  appGlobals: 'src/components/AppGlobals.tsx',
  appStore: 'src/stores/useAppStore.ts',
  cidCss: 'src/styles/cid.css',
  fileApi: 'src/lib/fileApi.ts',
  files: 'src/features/files/AppPage.tsx',
  chat: 'src/features/chat/ChatPage.tsx',
  chatJoin: 'src/features/chat/ChatJoinPage.tsx',
  chatRoom: 'src/lib/chatRoom.js',
  inputModal: 'src/components/ui/InputModal.tsx',
  mobileChatList: 'mobile/app/src/features/chat/ChatListScreen.tsx',
  featurePortal: 'src/components/FeaturePortal.tsx',
  hooks: 'src/hooks/index.ts',
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
    const {
      buildCidShareLink,
      buildCidSharePath,
      buildMostShareLink,
      createCidRoutePathFromDownloadInput,
    } = await importBundledSource('src/lib/shareLink.ts')
    const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

    assert.equal(
      buildCidSharePath(cid, 'hello most.txt'),
      `/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      buildMostShareLink(cid, 'hello most.txt'),
      `most://${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      createCidRoutePathFromDownloadInput(
        `most://${cid}?filename=hello%20most.txt`
      ),
      `/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      createCidRoutePathFromDownloadInput(
        `https://most.box/cid/${cid}?filename=hello%20most.txt`
      ),
      `/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(createCidRoutePathFromDownloadInput(cid), `/cid/${cid}`)
    assert.equal(createCidRoutePathFromDownloadInput('not-a-cid'), '')
    globalThis.window = {
      location: {
        origin: 'http://localhost:3000',
      },
    }
    try {
      assert.equal(
        buildCidShareLink(cid, 'hello most.txt'),
        `https://most.box/cid/${cid}?filename=hello%20most.txt`
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
    const chatSource = readSource(SOURCE_PATHS.chat)
    assert.match(filesSource, /createCidRoutePathFromDownloadInput/)
    assert.match(filesSource, /buildCidSharePath\(file\.cid, file\.fileName\)/)
    assert.doesNotMatch(filesSource, /fileApi\.checkDownload/)
    assert.doesNotMatch(filesSource, /fileApi\.downloadFile/)
    assert.match(cidSource, /fileApi\.checkDownload\(mostLink\)/)
    assert.match(
      cidSource,
      /fileApi\.downloadFileInBackground\(\s*mostLink,\s*isCollectionResult \? selectedCollectionPaths : undefined\s*\)/
    )
    assert.match(chatSource, /fileApi\.downloadFile\(attachment\.link\)/)
  })

  it('routes file share actions to the CID page and exposes web QR sharing there', async () => {
    const filesSource = readSource(SOURCE_PATHS.files)
    const cidSource = readSource(SOURCE_PATHS.cid)
    const cidCss = readSource(SOURCE_PATHS.cidCss)
    const acceptanceSource = readSource(SOURCE_PATHS.acceptance)
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
    assert.match(acceptanceSource, /发布成功后确认仍停留在文件库/)
    const publishFlow = filesSource.match(
      /const result = await fileApi\.publishFile\(file, fileName\)[\s\S]*?\}\s*catch \(err\)/
    )
    assert.ok(publishFlow)
    assert.doesNotMatch(publishFlow[0], /navigate\(/)

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
        typeof messages[locale]['cid.process.step.addLocal.title'],
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

    assert.doesNotMatch(filesSource, /selectedCollectionPaths/)
    assert.match(cidSource, /cid\.status\.collectionAvailable/)
    assert.match(cidSource, /cid\.collectionSummary/)
    assert.match(cidSource, /setSelectedCollectionPaths/)
    assert.match(cidSource, /\.filter\(file => file\.localAvailable !== true\)/)
    assert.match(cidSource, /className="cid-collection-list"/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(
        typeof messages[locale]['cid.collectionSelectionTitle'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['cid.collectionChildDownloadCheck'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['cid.status.collectionAvailable'],
        'string'
      )
      assert.equal(typeof messages[locale]['cid.collectionSummary'], 'string')
    }

    assert.equal(
      messages.en['cid.collectionSelectionTitle'],
      'Choose files to download'
    )
    assert.equal(
      messages.en['cid.collectionChildDownloadCheck'],
      'Check on download'
    )
    assert.equal(
      messages.en['cid.status.collectionAvailable'],
      '{fileName} manifest is readable. Child files will be checked one by one when downloading.'
    )
  })

  it('does not present fully local collection content as a download', async () => {
    const cidSource = readSource(SOURCE_PATHS.cid)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(cidSource, /function isDownloadCheckFullyLocal/)
    assert.match(cidSource, /fileCount > 0 && result\.missingLocalCount === 0/)
    assert.match(
      cidSource,
      /status: result\.alreadyExists[\s\S]*'local-available'/
    )
    assert.match(
      cidSource,
      /checkState\.status === 'available' \|\| isAddingLocalContent/
    )
    assert.match(cidSource, /cid\.process\.step\.addLocal\.title/)
    assert.match(cidSource, /t\('cid\.addToLibraryAction'\)/)
    assert.match(cidSource, /t\('cid\.inLibraryAction'\)/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(
        typeof messages[locale]['cid.status.collectionLocalAvailable'],
        'string'
      )
      assert.equal(typeof messages[locale]['cid.addToLibraryAction'], 'string')
      assert.equal(
        typeof messages[locale]['cid.collectionSummaryLocal'],
        'string'
      )
    }
  })

  it('marks completed CID downloads as local and keeps partial collections retryable', async () => {
    const cidSource = readSource(SOURCE_PATHS.cid)
    const tasksSource = readSource(SOURCE_PATHS.downloadTasks)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(
      cidSource,
      /latestDownloadOutcome\.status === 'completed'[\s\S]*setCheckState\(\{[\s\S]*status: 'already-local'/
    )
    assert.match(
      cidSource,
      /payload\.partial === true[\s\S]*\? 'partial'[\s\S]*: 'completed'/
    )
    assert.match(tasksSource, /readDownloadEventPaths\(payloadRecord\.files\)/)
    assert.match(
      tasksSource,
      /readDownloadEventPaths\(payloadRecord\.unavailableFiles\)/
    )
    assert.match(cidSource, /t\('cid\.retryUnavailableAction'\)/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(
        typeof messages[locale]['cid.retryUnavailableAction'],
        'string'
      )
    }
  })

  it('tracks CID downloads globally without taking over chat attachments', async () => {
    const cidSource = readSource(SOURCE_PATHS.cid)
    const globalSource = readSource(SOURCE_PATHS.globalDownloads)
    const cidCssSource = readSource(SOURCE_PATHS.cidCss)
    const storeSource = readSource(SOURCE_PATHS.appStore)
    const appGlobalsSource = readSource(SOURCE_PATHS.appGlobals)
    const chatSource = readSource(SOURCE_PATHS.chat)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(cidSource, /downloadTasksHydrated/)
    assert.match(cidSource, /activeDownloadTask/)
    assert.match(cidSource, /downloadFileInBackground/)
    assert.doesNotMatch(cidSource, /new WebSocket/)
    const autoCheckEffect = cidSource.match(
      /useEffect\(\(\) => \{\s*if \(!downloadTasksHydrated \|\| activeDownloadTask\) return[\s\S]*?\}, \[([\s\S]*?)\]\)/
    )
    assert.ok(autoCheckEffect)
    assert.doesNotMatch(autoCheckEffect[1], /checkResult/)
    assert.match(storeSource, /fileApi\.listDownloadTasks\(\)/)
    assert.match(globalSource, /getAuthenticatedWebSocketUrl\('\/ws'\)/)
    assert.match(globalSource, /fileApi\.cancelDownload\(task\.taskId\)/)
    assert.match(globalSource, /buildCidSharePath\(task\.cid, task\.fileName\)/)
    assert.match(globalSource, /socket\.onclose/)
    assert.match(globalSource, /const panelId = useId\(\)/)
    assert.match(
      globalSource,
      /const toggleRef = useRef<HTMLButtonElement>\(null\)/
    )
    assert.match(globalSource, /event\.key !== 'Escape'/)
    assert.match(globalSource, /aria-controls=\{panelId\}/)
    assert.match(globalSource, /aria-label=\{toggleLabel\}/)
    assert.doesNotMatch(
      globalSource,
      /parsed\.event === 'download:status'[\s\S]{0,120}parsed\.event === 'download:progress'/
    )
    assert.match(
      globalSource,
      /aria-valuetext=\{getTaskProgressLabel\(task, t\)\}/
    )
    assert.match(
      globalSource,
      /global-download-toggle ui-glass-surface ui-glass-surface-interactive/
    )
    assert.match(
      globalSource,
      /global-download-panel ui-glass-surface ui-glass-surface-elevated/
    )
    assert.match(globalSource, /className="ui-progress"/)
    assert.match(globalSource, /className="ui-spinner"/)
    assert.match(cidCssSource, /z-index:\s*180/)
    assert.match(cidCssSource, /env\(safe-area-inset-right\)/)
    assert.match(cidCssSource, /env\(safe-area-inset-left\)/)
    assert.match(cidCssSource, /env\(safe-area-inset-bottom\)/)
    assert.match(appGlobalsSource, /<GlobalDownloadTasks \/>/)
    assert.match(chatSource, /fileApi\.downloadFile\(attachment\.link\)/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(typeof messages[locale]['cid.tasks.title'], 'string')
      assert.equal(typeof messages[locale]['cid.tasks.viewFile'], 'string')
      assert.equal(typeof messages[locale]['cid.tasks.cancelFile'], 'string')
      assert.equal(
        typeof messages[locale]['cid.tasks.status.verifying'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['cid.toast.backgroundStarted'],
        'string'
      )
    }
  })

  it('normalizes download progress and collection terminal payloads', async () => {
    const { excludeTerminalDownloadTasks, parseDownloadEvent } =
      await importBundledSource('src/lib/downloadTasks.ts')

    assert.deepEqual(
      parseDownloadEvent(
        JSON.stringify({
          event: 'download:progress',
          data: {
            taskId: 'task-1',
            collection: true,
            completedFiles: 2,
            totalFiles: 4,
            percent: 50,
          },
        })
      ),
      {
        event: 'download:progress',
        payload: {
          taskId: 'task-1',
          collection: true,
          completedFiles: 2,
          totalFiles: 4,
          percent: 50,
          downloadedPaths: [],
          unavailablePaths: [],
          status: undefined,
          kind: undefined,
          code: undefined,
          errorCode: undefined,
          partial: undefined,
          loaded: undefined,
          total: undefined,
          fileCount: undefined,
          selectedFileCount: undefined,
          downloadedFileCount: undefined,
          unavailableFileCount: undefined,
          processedFiles: undefined,
          file: undefined,
          fileName: undefined,
          error: undefined,
          details: undefined,
        },
      }
    )

    const completed = parseDownloadEvent(
      JSON.stringify({
        event: 'download:success',
        data: {
          taskId: 'task-1',
          kind: 'collection',
          partial: true,
          files: [{ path: 'ready.txt' }],
          unavailableFiles: [{ path: 'later.txt' }],
        },
      })
    )
    assert.deepEqual(completed.payload.downloadedPaths, ['ready.txt'])
    assert.deepEqual(completed.payload.unavailablePaths, ['later.txt'])

    const activeTask = {
      taskId: 'task-active',
      cid: 'cid-active',
      fileName: 'active.bin',
    }
    const finishedTask = {
      taskId: 'task-finished',
      cid: 'cid-finished',
      fileName: 'finished.bin',
    }
    assert.deepEqual(
      excludeTerminalDownloadTasks(
        [activeTask, finishedTask],
        [{ taskId: 'task-finished' }]
      ),
      [activeTask]
    )

    const storeSource = readSource(SOURCE_PATHS.appStore)
    assert.match(storeSource, /let downloadTasksRevision = 0/)
    assert.match(
      storeSource,
      /if \(revision !== downloadTasksRevision\) \{\s*return get\(\)\.downloadTasks/
    )
  })

  it('does not apply the default ky timeout to file publishing', () => {
    const fileApiSource = readSource(SOURCE_PATHS.fileApi)

    assert.match(
      fileApiSource,
      /api\.post\('\/api\/publish',\s*\{[\s\S]*body: formData,[\s\S]*timeout: false,[\s\S]*throwHttpErrors: false,/
    )
  })

  it('gives P2P download checks enough time for cold peer discovery', () => {
    const fileApiSource = readSource(SOURCE_PATHS.fileApi)

    assert.match(fileApiSource, /DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS = 60000/)
    assert.match(fileApiSource, /DOWNLOAD_CHECK_REQUEST_GRACE_MS = 5000/)
    assert.match(
      fileApiSource,
      /json: \{ link, timeout \},[\s\S]*options\.requestTimeout \?\? timeout \+ DOWNLOAD_CHECK_REQUEST_GRACE_MS,/
    )
  })

  it('shows an accurate countdown during the default download check', async () => {
    const fileApiSource = readSource(SOURCE_PATHS.fileApi)
    const cidSource = readSource(SOURCE_PATHS.cid)
    const hooksSource = readSource(SOURCE_PATHS.hooks)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(
      fileApiSource,
      /export const DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS = 60000/
    )
    assert.match(hooksSource, /export function useCountdownSeconds/)
    assert.match(hooksSource, /const deadline = Date\.now\(\) \+ durationMs/)
    assert.match(
      hooksSource,
      /Math\.max\(0, Math\.ceil\(\(deadline - Date\.now\(\)\) \/ 1000\)\)/
    )
    assert.match(
      cidSource,
      /useCountdownSeconds\(\s*checkState\.status === 'checking',\s*DEFAULT_DOWNLOAD_CHECK_TIMEOUT_MS\s*\)/
    )
    assert.match(cidSource, /seconds: checkRemainingSeconds/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.match(messages[locale]['cid.status.checking'], /\{seconds\}/)
    }
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
            localAvailable: undefined,
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
            seedStatus: 'error',
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
      version: '0.4.0',
      publishedAt: '2026-01-01T00:00:00.000Z',
      assets: [
        {
          platform: 'windows',
          arch: 'x64',
          kind: 'installer',
          filename: 'MostBox-0.4.0-win-x64-setup.exe',
          size: 1024,
          cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
          r2Url: 'https://download.most.box/releases/MostBox.exe',
          githubUrl:
            'https://github.com/most-people/most/releases/download/v0.4.0/MostBox.exe',
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
    const chatSource = readSource(SOURCE_PATHS.chat)
    const channelApiSource = readSource('src/lib/channelApi.ts')

    assert.match(chatSource, /const channelMembers = useMemo/)
    assert.match(chatSource, /channelMessages\.forEach/)
    assert.match(chatSource, /membersByAuthor/)
    assert.match(chatSource, /messageProfileByAddress/)
    assert.match(chatSource, /messageProfile\?\.displayName/)
    assert.match(chatSource, /messageProfile\?\.avatar/)
    assert.match(channelApiSource, /interface ChannelMemberProfile/)
    assert.match(channelApiSource, /getChannelMemberProfiles/)
    assert.doesNotMatch(chatSource, /getChannelMembers/)
    assert.doesNotMatch(channelApiSource, /getChannelMembers/)
    assert.doesNotMatch(channelApiSource, /interface ChannelMember\s*\{/)
  })

  it('keeps mention unread channels prioritized and previewed', () => {
    const chatSource = readSource(SOURCE_PATHS.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const i18nMessages = readSource('src/lib/i18n/messages/chat.ts')

    assert.match(chatUiSource, /mentionPreview = ''/)
    assert.match(chatUiSource, /chat\.mentionUnreadTag/)
    assert.doesNotMatch(chatUiSource, /chat-channel-mention-badge/)
    assert.doesNotMatch(chatCssSource, /chat-channel-mention-badge/)
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

  it('renders localized chat member tags from member profiles', async () => {
    const chatSource = readSource(SOURCE_PATHS.chat)
    const chatUiSource = readSource('src/components/ChatUi.tsx')
    const chatCssSource = readSource('src/styles/chat.css')
    const channelApiSource = readSource('src/lib/channelApi.ts')
    const userProfileSource = readSource('src/lib/userProfile.ts')
    const gameRoomSource = readSource('src/hooks/useGameRoom.ts')
    const voiceRoomSource = readSource('src/features/chat/GlobalVoiceRoom.tsx')
    const { normalizeLocalizedTag, selectLocalizedTag } =
      await importBundledSource('src/lib/localizedTag.ts')

    assert.deepEqual(normalizeLocalizedTag(' 有人@我 '), {
      default: '有人@我',
    })
    assert.equal(
      selectLocalizedTag({ 'zh-CN': '有人@我', en: 'Mentioned' }, 'en'),
      'Mentioned'
    )
    assert.equal(selectLocalizedTag(null, 'zh-CN'), '')
    assert.match(channelApiSource, /interface ChannelMemberProfile/)
    assert.match(channelApiSource, /authorTag\?: LocalizedTag/)
    assert.match(channelApiSource, /getChannelMemberProfiles/)
    assert.match(channelApiSource, /updateChannelMemberProfile/)
    assert.match(chatSource, /selectLocalizedTag/)
    assert.match(chatSource, /channelMemberProfiles/)
    assert.match(chatSource, /channel:member-profile/)
    assert.match(chatSource, /getMessageDisplayTag/)
    assert.match(chatSource, /getMemberDisplayTag/)
    assert.match(chatSource, /useState\(-1\)/)
    assert.match(chatSource, /if \(index < 0\) return false/)
    assert.match(chatSource, /setMentionSelectedIndex\(-1\)/)
    assert.match(chatSource, /if \(mentionSelectedIndex < 0\) return false/)
    assert.match(
      chatSource,
      /index < 0 \? 0 : \(index \+ 1\) % mentionCandidates\.length/
    )
    assert.match(chatUiSource, /authorTag\?: string/)
    assert.match(chatUiSource, /channel-member-tag/)
    assert.doesNotMatch(chatSource, /\[\{candidate\.tag\}\]/)
    assert.doesNotMatch(chatUiSource, /\[\{authorTag\}\]/)
    assert.doesNotMatch(chatUiSource, /\[\{member\.tag\}\]/)
    assert.match(chatCssSource, /--chat-tag-text:\s*var\(--text-secondary\)/)
    assert.match(
      chatCssSource,
      /--chat-tag-bg:\s*rgba\(29,\s*29,\s*31,\s*0\.06\)/
    )
    assert.match(
      chatCssSource,
      /\[data-theme='dark'\]\s*\{[^}]*--chat-tag-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.12\)/
    )
    assert.match(
      chatCssSource,
      /\[data-theme='dark'\]\s*\{[^}]*--chat-tag-border:\s*rgba\(255,\s*255,\s*255,\s*0\.2\)/
    )
    assert.match(chatCssSource, /\.message-author-tag/)
    assert.match(chatCssSource, /\.channel-member-tag/)
    assert.match(
      chatCssSource,
      /\.message-author-tag\s*\{[^}]*color:\s*var\(--chat-tag-text\)/
    )
    assert.match(
      chatCssSource,
      /\.message-author-tag\s*\{[^}]*background:\s*var\(--chat-tag-bg\)/
    )
    assert.match(
      chatCssSource,
      /\.chat-mention-option-meta\s*\{[^}]*background:\s*var\(--chat-tag-bg\)/
    )
    assert.match(
      chatCssSource,
      /\.channel-member-tag\s*\{[^}]*color:\s*var\(--chat-tag-text\)/
    )
    assert.match(
      chatCssSource,
      /\.channel-member-tag\s*\{[^}]*background:\s*var\(--chat-tag-bg\)/
    )
    assert.match(chatSource, /chat-mention-menu-list/)
    assert.match(
      chatCssSource,
      /\.chat-mention-menu\s*\{[^}]*overflow:\s*hidden/
    )
    assert.match(chatCssSource, /\.chat-mention-menu-list\s*\{[^}]*gap:\s*4px/)
    assert.match(
      chatCssSource,
      /\.chat-mention-menu-list\s*\{[^}]*scrollbar-width:\s*none/
    )
    assert.match(
      chatCssSource,
      /\.chat-mention-menu-list::\-webkit-scrollbar\s*\{[^}]*display:\s*none/
    )
    assert.match(userProfileSource, /getUserPresenceProfile/)
    assert.match(userProfileSource, /authorTag/)
    assert.match(gameRoomSource, /getUserPresenceProfile/)
    assert.match(voiceRoomSource, /getUserPresenceProfile/)
  })

  it('locks the chat composer while a text message is being sent', () => {
    const chatSource = readSource(SOURCE_PATHS.chat)
    const componentSource = readSource('src/components/ChatUi.tsx')
    const sendHandlerSource = chatSource.slice(
      chatSource.indexOf('async function handleSendChannelMessage'),
      chatSource.indexOf('async function handleSelectAttachmentFiles')
    )

    assert.match(chatSource, /const \[isSendingChannelMessage/)
    assert.match(
      chatSource,
      /const isSendingChannelMessageRef = useRef\(false\)/
    )
    assert.match(
      sendHandlerSource,
      /if \(isSendingChannelMessageRef\.current\) return/
    )
    assert.match(
      sendHandlerSource,
      /isSendingChannelMessageRef\.current = true[\s\S]*setIsSendingChannelMessage\(true\)[\s\S]*await sendChannelMessage/
    )
    assert.match(
      sendHandlerSource,
      /finally \{[\s\S]*isSendingChannelMessageRef\.current = false[\s\S]*setIsSendingChannelMessage\(false\)/
    )
    assert.match(chatSource, /isSendingMessage=\{isSendingChannelMessage\}/)
    assert.match(componentSource, /isSendingMessage = false/)
    assert.match(
      componentSource,
      /const sendDisabled = disabled \|\| isSendingMessage \|\| !message\.trim\(\)/
    )
    assert.match(componentSource, /if \(!sendDisabled\) onSend\(\)/)
    assert.match(componentSource, /disabled=\{sendDisabled\}/)
    assert.match(componentSource, /aria-busy=\{isSendingMessage\}/)
    assert.match(
      componentSource,
      /isSendingMessage \? \([\s\S]*<Loader size=\{18\} className="ui-spinner" \/>/
    )
  })

  it('uses one open-channel flow for hash-based chat capabilities', () => {
    const chatSource = readSource(SOURCE_PATHS.chat)
    const chatJoinSource = readSource(SOURCE_PATHS.chatJoin)
    const chatRoomSource = readSource(SOURCE_PATHS.chatRoom)
    const inputModalSource = readSource(SOURCE_PATHS.inputModal)
    const mobileChatListSource = readSource(SOURCE_PATHS.mobileChatList)

    assert.match(chatRoomSource, /new Uint8Array\(16\)/)
    assert.match(chatRoomSource, /buildChatSharePath/)
    assert.match(
      chatRoomSource,
      /`\/chat\/#\$\{encodeURIComponent\(normalizeChatChannelId\(channelId\)\)\}`/
    )
    assert.match(chatSource, /getChannelIdFromHash\(window\.location\.hash\)/)
    assert.match(chatSource, /window\.addEventListener\('hashchange'/)
    assert.match(chatSource, /createRandomChannelId\(\)/)
    assert.match(chatSource, /setOpenChatDefaultValue\(generatedChatId\)/)
    assert.match(chatSource, /defaultValue=\{openChatDefaultValue\}/)
    assert.match(chatSource, /parseChatChannelInput/)
    assert.match(chatSource, /chat\.openChannel/)
    assert.match(inputModalSource, /onGenerateValue/)
    assert.match(mobileChatListSource, /onGenerateChannelId/)
    assert.match(mobileChatListSource, /onOpenChannelId/)
    assert.doesNotMatch(
      `${chatSource}\n${mobileChatListSource}`,
      /chat\.createChannel|chat\.joinChannel|onCreateChannel|onJoinChannel/
    )
    assert.doesNotMatch(`${chatSource}\n${chatJoinSource}`, /\?channel=/)
    assert.match(chatSource, /replaceHistory: true/)
    assert.match(chatSource, /window\.history\.replaceState/)
    assert.match(
      chatSource,
      /!previousBackendReadyRef\.current[\s\S]*autoJoinChannelAttemptsRef\.current\.clear\(\)/
    )
  })

  it('keeps the admin console connected to local seeding visibility', () => {
    const source = readSource(SOURCE_PATHS.admin)

    assert.match(source, /NodeHolding/)
    assert.match(source, /formatSeedStatus/)
    assert.match(source, /admin\.seedStatus\.active/)
    assert.match(source, /admin\.seedStatus\.queued/)
    assert.match(source, /\/api\/admin\/access/)
    assert.match(source, /claimAdminAccess/)
  })

  it('keeps the file selection toolbar grouped and compact', () => {
    const source = readSource(SOURCE_PATHS.files)
    const appCss = readSource(SOURCE_PATHS.appCss)

    assert.match(source, /className="batch-selection"/)
    assert.match(source, /className="batch-actions batch-actions-primary"/)
    assert.match(source, /className="batch-actions batch-actions-danger"/)
    assert.match(source, /<Eye size=\{14\}/)
    assert.match(source, /<Trash2 size=\{14\}/)
    assert.doesNotMatch(source, /<Share2 size=\{14\}/)
    assert.doesNotMatch(
      source,
      /onClick=\{\(\) => setShareItem\(selectedFile\)\}/
    )
    assert.match(appCss, /\.batch-action-label/)
    assert.match(appCss, /\.batch-actions-danger/)
  })

  it('labels icon-only file library controls', () => {
    const source = readSource(SOURCE_PATHS.files)

    assert.match(source, /aria-label=\{t\('app\.search\.clear'\)\}/)
    assert.match(source, /aria-label=\{t\('app\.transfers'\)\}/)
    assert.match(source, /aria-label=\{t\('common\.close'\)\}/)
    assert.match(
      source,
      /onClick=\{closeDownloadModal\}[\s\S]{0,160}aria-label=\{t\('common\.close'\)\}/
    )
  })
})
