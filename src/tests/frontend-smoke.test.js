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
    const { buildCidShareLink, buildMostShareLink } = await importBundledSource(
      'src/lib/shareLink.ts'
    )
    const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

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
    assert.match(filesSource, /buildMostShareLink\(shareItem\.cid/)
    assert.match(filesSource, /buildCidShareLink\(shareItem\.cid/)
    assert.match(cidSource, /fileApi\.checkDownload\(mostLink\)/)
    assert.match(cidSource, /fileApi\.downloadFile\(mostLink\)/)
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
