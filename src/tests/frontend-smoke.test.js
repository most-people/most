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
import {
  requiredStaticEntries,
  staticShellFile,
} from '../../scripts/static-routes.mjs'

const repoRootPath = fileURLToPath(new URL('../../', import.meta.url))

const SOURCE_PATHS = {
  packageJson: 'package.json',
  readme: 'README.md',
  acceptance: 'docs/acceptance.md',
  viteConfig: 'vite.config.ts',
  checkStaticOutput: 'scripts/check-static-output.mjs',
  prepareStartStatic: 'scripts/prepare-start-static.mjs',
  admin: 'src/features/admin/AdminPage.tsx',
  docs: 'src/features/docs/DocsPage.tsx',
  openApiReference: 'src/features/docs/OpenApiReference.tsx',
  openApiRequest: 'src/features/docs/openapiRequest.js',
  about: 'src/features/about/AboutPage.tsx',
  hi: 'src/features/hi/HiPage.tsx',
  footer: 'src/components/Footer.tsx',
  cid: 'src/features/cid/CidPage.tsx',
  globalDownloads: 'src/features/cid/GlobalDownloadTasks.tsx',
  downloadTasks: 'src/lib/downloadTasks.ts',
  appGlobals: 'src/components/AppGlobals.tsx',
  userLoginModal: 'src/components/UserLoginModal.tsx',
  appShell: 'src/components/AppShell.tsx',
  marketingHeader: 'src/components/MarketingHeader.tsx',
  marketingLayout: 'src/components/MarketingLayout.tsx',
  profileAppearance: 'src/features/profile/ProfileAppearanceSettings.tsx',
  appearance: 'src/lib/appearance.ts',
  rootRoute: 'src/routes/__root.tsx',
  legacyAppRoute: 'src/routes/app/index.tsx',
  accountBackup: 'src/features/profile/useAccountBackup.ts',
  accountBackupSync: 'src/features/profile/accountBackupSync.ts',
  profile: 'src/features/profile/ProfilePage.tsx',
  electronMain: 'electron/main.js',
  electronPreload: 'electron/preload.cjs',
  appStore: 'src/stores/useAppStore.ts',
  cidCss: 'src/styles/cid.css',
  fileApi: 'src/lib/fileApi.ts',
  milkdownEditor: 'src/components/MilkdownEditor.tsx',
  mostMarkdown: 'src/lib/mostMarkdown.ts',
  mostMarkdownEditor: 'src/features/note/MostMarkdownEditor.tsx',
  note: 'src/features/note/NotePage.tsx',
  noteGit: 'src/features/note/NoteGitModal.tsx',
  noteVaultApi: 'src/features/note/noteVaultApi.ts',
  noteMigration: 'server/src/utils/noteMigration.js',
  noteCss: 'src/styles/note.css',
  files: 'src/features/files/AppPage.tsx',
  chat: 'src/features/chat/ChatPage.tsx',
  chatJoin: 'src/features/chat/ChatJoinPage.tsx',
  chatRoom: 'src/lib/chatRoom.js',
  inputModal: 'src/components/ui/InputModal.tsx',
  mobileChatList: 'mobile/app/src/features/chat/ChatListScreen.tsx',
  featurePortal: 'src/components/FeaturePortal.tsx',
  hooks: 'src/hooks/index.ts',
  appCss: 'src/styles/app.css',
  ping: 'src/components/PingPanel.tsx',
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
  it('reveals login confirmation only after identity preview', () => {
    const loginModalSource = readSource(SOURCE_PATHS.userLoginModal)

    assert.match(
      loginModalSource,
      /\{hasPreviewedAvatar && \([\s\S]*type="submit"[\s\S]*\)\}/
    )
  })

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

  it('keeps persisted dark, light, and system appearance preferences in profile', async () => {
    const profileAppearanceSource = readSource(SOURCE_PATHS.profileAppearance)
    const appStoreSource = readSource(SOURCE_PATHS.appStore)
    const rootRouteSource = readSource(SOURCE_PATHS.rootRoute)
    const navigationSource = [
      readSource(SOURCE_PATHS.appShell),
      readSource(SOURCE_PATHS.marketingHeader),
      readSource(SOURCE_PATHS.marketingLayout),
    ].join('\n')
    const {
      isAppearancePreference,
      normalizeAppearancePreference,
      resolveAppearancePreference,
    } = await importBundledSource(SOURCE_PATHS.appearance)

    assert.equal(isAppearancePreference('system'), true)
    assert.equal(isAppearancePreference('unexpected'), false)
    assert.equal(normalizeAppearancePreference('dark'), 'dark')
    assert.equal(normalizeAppearancePreference('light'), 'light')
    assert.equal(normalizeAppearancePreference('system'), 'system')
    assert.equal(normalizeAppearancePreference('unexpected'), 'system')
    assert.equal(resolveAppearancePreference('system', true), 'dark')
    assert.equal(resolveAppearancePreference('system', false), 'light')
    assert.equal(resolveAppearancePreference('light', true), 'light')
    assert.equal(resolveAppearancePreference('dark', false), 'dark')

    assert.match(profileAppearanceSource, /value: 'dark'/)
    assert.match(profileAppearanceSource, /value: 'light'/)
    assert.match(profileAppearanceSource, /value: 'system'/)
    assert.match(profileAppearanceSource, /role="radiogroup"/)
    assert.match(profileAppearanceSource, /aria-checked=\{selected\}/)
    assert.match(readSource(SOURCE_PATHS.profile), /<ProfileAppearanceSettings/)
    assert.doesNotMatch(navigationSource, /AppearanceToggle/)
    assert.match(appStoreSource, /systemTheme\.addEventListener\('change'/)
    assert.match(appStoreSource, /localStorage\.setItem\('theme', appearance\)/)
    assert.match(rootRouteSource, /data-theme-preference/)
  })

  it('edits and renders the current locale profile tag', async () => {
    const profileSource = readSource(SOURCE_PATHS.profile)
    const profileCssSource = readSource('src/styles/profile.css')
    const accountBackupSource = readSource(SOURCE_PATHS.accountBackup)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')
    const { selectExactLocalizedTag, selectLocalizedTag } =
      await importBundledSource('src/lib/localizedTag.ts')
    const tag = {
      'zh-CN': '测试用户',
      'zh-TW': '測試使用者',
      en: 'Test user',
    }

    assert.equal(selectLocalizedTag(tag, 'zh-CN'), '测试用户')
    assert.equal(selectLocalizedTag(tag, 'zh-TW'), '測試使用者')
    assert.equal(selectLocalizedTag(tag, 'en'), 'Test user')
    assert.equal(selectLocalizedTag({ en: 'Test user' }, 'zh-CN'), 'Test user')
    assert.equal(selectExactLocalizedTag({ en: 'Test user' }, 'zh-CN'), '')
    assert.equal(selectExactLocalizedTag(tag, 'zh-CN'), '测试用户')
    assert.match(profileSource, /selectLocalizedTag\(identity\.tag, locale\)/)
    assert.match(
      profileSource,
      /selectExactLocalizedTag\(identity\?\.tag, locale\)/
    )
    assert.match(profileSource, /normalizeLocalizedTag\(nextTagValues\)/)
    assert.match(profileSource, /nextTagValues\[locale\]/)
    assert.doesNotMatch(profileSource, /handleClearTag/)
    assert.doesNotMatch(profileSource, /profile\.action\.clearTag['"]/)
    assert.match(profileSource, /profile-tag-input-clear/)
    assert.match(profileSource, /setTagDraft\(''\)/)
    assert.match(profileSource, /profile-user-tag/)
    assert.match(profileSource, /profile\.label\.tag/)
    assert.match(profileCssSource, /\.profile-user-tag/)
    assert.match(profileCssSource, /\.profile-tag-input-clear/)
    assert.match(accountBackupSource, /tag:\s*currentIdentity\.tag/)
    assert.match(accountBackupSource, /hasOwnProperty\.call\(profile, 'tag'\)/)
    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.ok(messages[locale]['profile.label.tag'].includes('{locale}'))
      assert.ok(messages[locale]['profile.action.clearTagInput'])
    }
  })

  it('uses an automatic address-scoped note vault in Electron', async () => {
    const accountBackupSource = readSource(SOURCE_PATHS.accountBackup)
    const appGlobalsSource = readSource(SOURCE_PATHS.appGlobals)
    const profileSource = readSource(SOURCE_PATHS.profile)
    const noteSource = readSource(SOURCE_PATHS.note)
    const noteVaultApiSource = readSource(SOURCE_PATHS.noteVaultApi)
    const electronMainSource = readSource(SOURCE_PATHS.electronMain)
    const electronPreloadSource = readSource(SOURCE_PATHS.electronPreload)
    const { messages } = await importBundledSource('src/lib/i18n/messages.ts')

    assert.match(accountBackupSource, /isDesktopNoteVaultClient\(\)/)
    assert.match(accountBackupSource, /await getNoteVaultStatus\(\)/)
    assert.match(accountBackupSource, /await restoreNoteVaultSnapshot\(/)
    assert.doesNotMatch(accountBackupSource, /requestNoteVaultDirectory/)
    assert.doesNotMatch(appGlobalsSource, /NoteVaultLocationModal/)
    assert.doesNotMatch(profileSource, /NoteVaultLocationModal/)
    assert.doesNotMatch(noteSource, /selectNoteVaultDirectory/)
    assert.match(
      noteSource,
      /vaultFiles\.some\(file => file\.path === currentFilePath\)/
    )
    assert.match(
      noteSource,
      /navigate\(\{ to: '\/note\/', search: \{\} as never, replace: true \}\)/
    )
    assert.doesNotMatch(noteVaultApiSource, /\/api\/note-vault\/config/)
    assert.match(
      electronMainSource,
      /noteVaultRoot:\s*path\.join\(app\.getPath\('documents'\), 'MostBox', 'Notes'\)/
    )
    assert.doesNotMatch(electronMainSource, /note-vault:select-directory/)
    assert.doesNotMatch(electronPreloadSource, /note-vault:/)

    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      assert.equal(
        messages[locale]['profile.backup.noteVault.message'],
        undefined
      )
      assert.equal(
        messages[locale]['profile.backup.noteVault.useDefault'],
        undefined
      )
      assert.equal(
        messages[locale]['profile.backup.noteVault.selectFolder'],
        undefined
      )
    }
  })

  it('syncs newer cloud profile separately from account data after login', async () => {
    const accountBackupSource = readSource(SOURCE_PATHS.accountBackup)
    const appGlobalsSource = readSource(SOURCE_PATHS.appGlobals)
    const { hasDifferentAccountData, shouldRestoreCloudProfile } =
      await importBundledSource(SOURCE_PATHS.accountBackupSync)
    const baseIdentity = {
      username: 'alice',
      address: '0xabc',
      danger: 'secret',
      displayName: 'Alice',
    }
    const basePayload = {
      type: 'mostbox.account-backup',
      schemaVersion: 1,
      ownerAddress: '0xabc',
      exportedAt: '2026-07-29T00:00:00.000Z',
      notes: [],
      profile: { displayName: 'Alice', avatar: 'cloud.png', updatedAt: 20 },
      preferences: { theme: 'dark', locale: 'zh-CN' },
      files: [],
      channels: [],
    }

    assert.equal(
      shouldRestoreCloudProfile(baseIdentity, basePayload.profile),
      true
    )
    assert.equal(
      shouldRestoreCloudProfile(
        { ...baseIdentity, profileUpdatedAt: 30 },
        basePayload.profile
      ),
      false
    )
    assert.equal(
      shouldRestoreCloudProfile(baseIdentity, {
        displayName: 'Legacy cloud profile',
      }),
      false
    )
    assert.equal(
      await hasDifferentAccountData(
        { ...basePayload, profile: { displayName: 'Local', updatedAt: 40 } },
        basePayload
      ),
      false
    )
    assert.equal(
      await hasDifferentAccountData(
        {
          ...basePayload,
          notes: [{ content: 'same', name: 'note' }],
        },
        {
          ...basePayload,
          exportedAt: '2026-07-29T01:00:00.000Z',
          notes: [{ name: 'note', content: 'same' }],
        }
      ),
      false
    )
    const localSupersetPayload = {
      ...basePayload,
      files: [
        {
          cid: 'shared-file',
          fileName: 'local-newer.txt',
          size: 10,
          starred: true,
          updatedAt: 30,
        },
        { cid: 'local-only-file', fileName: 'local.txt', updatedAt: 30 },
      ],
      channels: [
        {
          channelId: 'same-room',
          channelKey: 'same-room',
          type: 'personal',
          writerCoreKeys: ['cloud-writer', 'local-writer'],
          member: { joinedAt: 20, profileUpdatedAt: 20 },
          remark: 'same remark',
          pinned: false,
          updatedAt: 10,
        },
        {
          channelId: 'local-only-room',
          channelKey: 'local-only-room',
          updatedAt: 30,
        },
      ],
    }
    const cloudSubsetPayload = {
      ...basePayload,
      files: [
        {
          cid: 'shared-file',
          fileName: 'cloud-older.txt',
          size: 10,
          starred: false,
          updatedAt: 20,
        },
      ],
      channels: [
        {
          channelId: 'same-room',
          channelKey: 'same-room',
          type: 'personal',
          writerCoreKeys: ['cloud-writer'],
          member: { joinedAt: 10, profileUpdatedAt: 10 },
          remark: 'same remark',
          pinned: false,
          updatedAt: 20,
        },
      ],
    }
    assert.equal(
      await hasDifferentAccountData(localSupersetPayload, cloudSubsetPayload),
      false
    )
    assert.equal(
      await hasDifferentAccountData(
        {
          ...basePayload,
          channels: [
            {
              ...cloudSubsetPayload.channels[0],
              writerCoreKeys: ['cloud-writer'],
              updatedAt: 10,
            },
          ],
        },
        {
          ...basePayload,
          channels: [
            {
              ...cloudSubsetPayload.channels[0],
              writerCoreKeys: ['cloud-writer', 'new-cloud-writer'],
            },
          ],
        }
      ),
      true
    )
    assert.equal(
      await hasDifferentAccountData(
        {
          ...basePayload,
          channels: [{ ...cloudSubsetPayload.channels[0], updatedAt: 10 }],
        },
        {
          ...basePayload,
          channels: [{ ...cloudSubsetPayload.channels[0], pinned: true }],
        }
      ),
      true
    )
    assert.equal(
      await hasDifferentAccountData(basePayload, {
        ...basePayload,
        files: [{ cid: 'cloud-only-file', fileName: 'cloud.txt' }],
      }),
      true
    )
    assert.equal(
      await hasDifferentAccountData(
        { ...basePayload, notes: [{ name: 'local' }] },
        basePayload
      ),
      true
    )
    assert.match(accountBackupSource, /downloadAccountBackup\(currentWallet\)/)
    assert.match(
      accountBackupSource,
      /await hasDifferentAccountData[\s\S]+activeWalletAfterCid/
    )
    assert.match(appGlobalsSource, /loginCloudRestorePending/)
    assert.match(appGlobalsSource, /<ConfirmModal/)
  })

  it('keeps the static web shell route list focused on public entry points', () => {
    const routes = getStaticRoutes()

    assert.deepEqual(routes, [
      '/',
      '/about/',
      '/hi/',
      '/admin/',
      '/app/',
      '/file/',
      '/chat/',
      '/chat/join/',
      '/chat/join/demo/',
      '/download/',
      '/docs/',
      '/docs/mcp/',
      '/docs/api/',
      '/note/',
      '/ping/',
      '/profile/',
      '/web3/',
    ])
    assert.ok(!routes.some(route => route.includes('$')))
    assert.match(
      readSource(SOURCE_PATHS.checkStaticOutput),
      /requiredStaticEntries/
    )
    assert.match(readSource(SOURCE_PATHS.viteConfig), /prerender/)
    assert.match(
      readSource(SOURCE_PATHS.viteConfig),
      /spa:\s*\{\s*enabled: true/
    )
    assert.equal(staticShellFile, '_shell.html')
    assert.match(
      readSource(SOURCE_PATHS.prepareStartStatic),
      /copyFile\(clientShellPath, clientIndexPath\)/
    )
    assert.equal(readSource('public/_redirects').trim(), '/cid/* /_shell 200')
    assert.match(
      readSource(SOURCE_PATHS.legacyAppRoute),
      /redirect\(\{ to: '\/file\/' \}\)/
    )
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
      buildCidSharePath(cid, 'chat-file/alice/private/report.zip'),
      `/cid/${cid}?filename=report.zip`
    )
    assert.equal(
      buildMostShareLink(cid, 'C:\\Users\\alice\\private\\report.zip'),
      `most://${cid}?filename=report.zip`
    )
    assert.equal(
      createCidRoutePathFromDownloadInput(
        `most://${cid}?filename=hello%20most.txt`
      ),
      `/cid/${cid}?filename=hello%20most.txt`
    )
    assert.equal(
      createCidRoutePathFromDownloadInput(
        `most://${cid}?filename=chat-file%2Falice%2Fprivate%2Freport.zip`
      ),
      `/cid/${cid}?filename=report.zip`
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
    assert.doesNotMatch(filesSource, /fileApi\.downloadFile\(/)
    assert.match(cidSource, /fileApi\.checkDownload\(mostLink\)/)
    assert.match(
      cidSource,
      /fileApi\.downloadFileInBackground\(\s*mostLink,\s*isCollectionResult \? selectedCollectionPaths : undefined\s*\)/
    )
    assert.match(chatSource, /fileApi\.downloadFile\(attachment\.link\)/)
  })

  it('keeps knowledge-base attachments as parseable most:// Markdown references', async () => {
    const {
      buildNoteAttachmentFileName,
      buildMostMarkdownAttachment,
      parseMostMarkdownReference,
    } = await importBundledSource(SOURCE_PATHS.mostMarkdown)
    const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
    const imageName = '旅行(原图)[1].jpg'
    const imageLink = `most://${cid}?filename=${encodeURIComponent(imageName)}`
    const imageMarkdown = buildMostMarkdownAttachment({
      link: imageLink,
      fileName: imageName,
      image: true,
    })

    assert.match(imageMarkdown, /^!\[旅行\(原图\)\\\[1\\\]\.jpg\]\(most:\/\//)
    assert.match(imageMarkdown, /%28/)
    assert.match(imageMarkdown, /%29/)
    assert.equal(
      parseMostMarkdownReference(
        imageMarkdown.slice(imageMarkdown.indexOf('](') + 2, -1)
      ).fileName,
      imageName
    )
    assert.equal(
      buildMostMarkdownAttachment({
        link: `most://${cid}`,
        fileName: 'GPS轨迹.gpx',
        image: false,
      }),
      `[GPS轨迹.gpx](most://${cid})`
    )
    assert.equal(parseMostMarkdownReference(`most://${cid}`).cid, cid)
    assert.equal(parseMostMarkdownReference('https://example.com/file'), null)
    assert.equal(parseMostMarkdownReference('most://invalid'), null)

    const noteFileName = buildNoteAttachmentFileName('photo.png', 'upload-one')
    const repeatedName = buildNoteAttachmentFileName('photo.png', 'upload-two')
    assert.equal(noteFileName, 'note-file/upload-one/photo.png')
    assert.equal(repeatedName, 'note-file/upload-two/photo.png')
    assert.notEqual(noteFileName, repeatedName)
    const noteLink = `most://${cid}?filename=${encodeURIComponent(noteFileName)}`
    assert.equal(
      buildMostMarkdownAttachment({
        link: noteLink,
        fileName: 'photo.png',
        image: false,
      }),
      `[photo.png](${noteLink})`
    )
    assert.equal(parseMostMarkdownReference(noteLink).fileName, noteFileName)
  })

  it('stores knowledge-base articles as plain Markdown without article encryption', () => {
    const noteSource = readSource(SOURCE_PATHS.note)
    const appStoreSource = readSource(SOURCE_PATHS.appStore)
    const appGlobalsSource = readSource(SOURCE_PATHS.appGlobals)
    const accountBackupSource = readSource(SOURCE_PATHS.accountBackup)
    const noteMigrationSource = readSource(SOURCE_PATHS.noteMigration)
    const noteVaultApiSource = readSource(SOURCE_PATHS.noteVaultApi)

    assert.doesNotMatch(noteSource, /mostEncode|mostDecode|isSecret/)
    assert.doesNotMatch(noteSource, /note\.privacy\.(?:public|secret)/)
    assert.doesNotMatch(appStoreSource, /isSecret/)
    assert.doesNotMatch(accountBackupSource, /mostDecode/)
    assert.match(appStoreSource, /decryptLegacyBrowserNotes/)
    assert.match(appGlobalsSource, /migrateLegacyNoteVault/)
    assert.match(accountBackupSource, /decryptLegacyAccountBackupNotes/)
    assert.match(noteMigrationSource, /tryMostDecode/)
    assert.match(noteVaultApiSource, /inspectLegacyEncryptedNote/)
    assert.match(
      accountBackupSource,
      /const content = String\(note\.content \|\| ''\)/
    )
  })

  it('keeps local knowledge-base Git manual and Markdown-scoped', () => {
    const noteSource = readSource(SOURCE_PATHS.note)
    const gitSource = readSource(SOURCE_PATHS.noteGit)
    const apiSource = readSource(SOURCE_PATHS.noteVaultApi)

    assert.match(noteSource, /<NoteGitModal/)
    assert.match(noteSource, /gitStatus\.changes\.length/)
    assert.match(gitSource, /commitNoteGitChanges\(commitMessage\.trim\(\)\)/)
    assert.match(gitSource, /restoreNoteGitFile/)
    assert.match(gitSource, /note\.git\.stagedWarning/)
    assert.doesNotMatch(gitSource, /push|pull|clone|remote/)
    assert.match(apiSource, /\/api\/note-vault\/git\/history/)
    assert.match(apiSource, /\/api\/note-vault\/git\/diff/)
  })

  it('reuses Markdown image URLs until the editor cache is disposed', async () => {
    const { createMostMarkdownImageUrlCache } = await importBundledSource(
      SOURCE_PATHS.mostMarkdown
    )
    const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

    const createdUrls = []
    const revokedUrls = []
    const imageUrlCache = createMostMarkdownImageUrlCache({
      createObjectURL() {
        const url = `blob:test-${createdUrls.length + 1}`
        createdUrls.push(url)
        return url
      },
      revokeObjectURL(url) {
        revokedUrls.push(url)
      },
    })
    let blobLoads = 0
    const loadBlob = async () => {
      blobLoads += 1
      return new Blob(['image'])
    }

    const [firstImageUrl, repeatedImageUrl] = await Promise.all([
      imageUrlCache.getOrCreate(cid, loadBlob),
      imageUrlCache.getOrCreate(cid, loadBlob),
    ])
    assert.equal(firstImageUrl, 'blob:test-1')
    assert.equal(repeatedImageUrl, firstImageUrl)
    assert.equal(await imageUrlCache.getOrCreate(cid, loadBlob), firstImageUrl)
    assert.equal(blobLoads, 1)
    assert.deepEqual(revokedUrls, [])

    imageUrlCache.dispose()
    assert.deepEqual(revokedUrls, [firstImageUrl])

    let finishPendingLoad
    const pendingCache = createMostMarkdownImageUrlCache({
      createObjectURL() {
        return 'blob:pending'
      },
      revokeObjectURL(url) {
        revokedUrls.push(url)
      },
    })
    const pendingImageUrl = pendingCache.getOrCreate(
      'pending-cid',
      () =>
        new Promise(resolve => {
          finishPendingLoad = resolve
        })
    )
    pendingCache.dispose()
    finishPendingLoad(new Blob(['pending-image']))
    assert.equal(await pendingImageUrl, '')
    assert.deepEqual(revokedUrls, [firstImageUrl, 'blob:pending'])
  })

  it('wires MostBox attachments into every knowledge-base editor', () => {
    const milkdownSource = readSource(SOURCE_PATHS.milkdownEditor)
    const mostEditorSource = readSource(SOURCE_PATHS.mostMarkdownEditor)
    const noteSource = readSource(SOURCE_PATHS.note)
    const noteCssSource = readSource(SOURCE_PATHS.noteCss)

    assert.match(milkdownSource, /editor\.action\(insert\(markdown\)\)/)
    assert.match(milkdownSource, /proxyDomURL:/)
    assert.match(milkdownSource, /parseMostMarkdownReference\(href\)/)
    assert.match(milkdownSource, /onInternalNoteLinkOpenRef/)
    assert.match(
      mostEditorSource,
      /buildNoteAttachmentFileName\(\s*file\.name,\s*crypto\.randomUUID\(\)\s*\)/
    )
    assert.match(
      mostEditorSource,
      /fileApi\.publishFile\(file, targetFileName\)/
    )
    assert.match(mostEditorSource, /return \{ fileName: file\.name, link \}/)
    assert.match(mostEditorSource, /openAttachmentPicker:/)
    assert.match(noteSource, /editorRef\.current\?\.openAttachmentPicker\(\)/)
    assert.equal(noteSource.match(/onAttachmentPublishingChange=/g)?.length, 2)
    assert.equal(
      noteSource.match(/className="note-editor-attachment-fab"/g)?.length,
      2
    )
    assert.equal(noteSource.match(/note-editor-attachment-button/g)?.length, 2)
    assert.match(mostEditorSource, /fileApi\.downloadFileInBackground/)
    assert.match(mostEditorSource, /getApiRequestHeaders\('GET', requestPath\)/)
    assert.match(mostEditorSource, /<FilePreviewOverlay/)
    assert.equal(noteSource.match(/<MostMarkdownEditor\s/g)?.length, 3)
    assert.match(noteSource, /resolveWikiNoteLink=\{resolvePreviewWikiLink\}/)
    assert.match(noteSource, /resolveWikiNoteLink=\{/)
    assert.match(noteCssSource, /container: note-editor \/ inline-size/)
    assert.match(noteCssSource, /@container note-editor \(max-width: 820px\)/)
    assert.match(
      noteCssSource,
      /\.note-editor-attachment-fab \{[\s\S]*?position: sticky/
    )
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
    assert.match(cidSource, /className=\{`cid-process-steps/)
    assert.match(cidSource, /cid\.transfer\.title/)
    assert.match(cidSource, /cid\.process\.step\.open\.title/)
    assert.match(cidSource, /cid\.process\.step\.seed\.desc/)
    assert.match(cidSource, /<ReceiverDownloadOption \/>/)
    assert.match(cidSource, /className="cid-receiver-start/)
    assert.match(
      cidSource,
      /className="btn btn-primary cid-connect-remote-btn"/
    )
    assert.match(cidSource, /onClick=\{openConnectModal\}/)
    assert.match(cidSource, /remote\.title\.connect/)
    assert.doesNotMatch(cidSource, /cid\.handoff\.action/)
    assert.match(cidSource, /const isDesktopClient = useIsDesktopClient\(\)/)
    assert.match(
      cidSource,
      /const requiresClient = !isDesktopClient && hasBackend !== true/
    )
    assert.match(
      cidSource,
      /className="cid-receiver-start[\s\S]*className="cid-workspace"/
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
    assert.match(cidSource, /case 'seed':[\s\S]*to="\/file\/"/)
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
      assert.equal(typeof messages[locale]['cid.client.title'], 'string')
      assert.equal(typeof messages[locale]['remote.title.connect'], 'string')
      assert.equal(
        typeof messages[locale]['cid.client.install.action'],
        'string'
      )
      assert.equal(
        typeof messages[locale]['cid.status.clientRequired'],
        'string'
      )
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

    assert.equal(messages['zh-CN']['cid.transfer.title'], '{fileName}')
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
      detectDownloadPlatformKey,
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
    assert.equal(
      detectDownloadPlatformKey({ userAgent: 'Mozilla/5.0 (iPhone)' }),
      'ios:universal'
    )
    assert.equal(
      detectDownloadPlatformKey({
        navigatorPlatform: 'MacIntel',
        maxTouchPoints: 5,
      }),
      'ios:universal'
    )
    assert.equal(
      detectDownloadPlatformKey({ userAgent: 'Android 16; Linux arm64' }),
      'android:universal'
    )
    assert.equal(
      detectDownloadPlatformKey({ userAgentDataPlatform: 'macOS arm64' }),
      'macos:arm64'
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

  it('keeps desktop, npm, and Docker deployment methods on the download page', () => {
    const downloadPageSource = readSource(
      'src/features/download/DownloadPage.tsx'
    )
    const downloadMessagesSource = readSource(
      'src/lib/i18n/messages/download.ts'
    )

    assert.match(downloadPageSource, /key: 'desktop'/)
    assert.match(downloadPageSource, /key: 'npm'/)
    assert.match(downloadPageSource, /key: 'docker'/)
    assert.match(downloadPageSource, /npx most-box@latest/)
    assert.match(downloadPageSource, /ghcr\.io\/most-people\/most-box:latest/)
    assert.match(downloadMessagesSource, /download\.deployment\.title/)
    assert.match(downloadMessagesSource, /download\.deployment\.docker\.desc/)
  })

  it('keeps chat identity snapshots flowing through messages', () => {
    const channelMessagesSource = readSource('src/hooks/useChannelMessages.ts')
    const userProfileSource = readSource('src/lib/userProfile.ts')

    assert.match(userProfileSource, /getUserMessageIdentity/)
    assert.match(userProfileSource, /getUserChannelProfile/)
    assert.match(channelMessagesSource, /useUserStore/)
    assert.match(
      channelMessagesSource,
      /getUserMessageIdentity\(userIdentity\)/
    )
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

  it('keeps MCP client credentials scoped and deletable in node admin', () => {
    const source = readSource(SOURCE_PATHS.admin)
    const adminCss = readSource('src/styles/admin.css')
    const adminMessages = readSource('src/lib/i18n/messages/admin.ts')

    assert.match(source, /\/api\/admin\/mcp\/clients/)
    assert.match(source, /createMcpClient/)
    assert.match(source, /deleteMcpClient/)
    assert.match(source, /\?purge=true/)
    assert.match(source, /<ConfirmModal/)
    assert.doesNotMatch(source, /admin\.action\.revokeMcpClient/)
    assert.match(source, /files:publish/)
    assert.match(source, /allowedRoots/)
    assert.match(source, /createdMcpCredential\.token/)
    assert.match(source, /admin\.mcp\.credentialOnce/)
    assert.match(
      source,
      /const loadMcpClients = async \(\) => \{[\s\S]*if \(!userIdentity\) \{[\s\S]*setMcpClients\(\[\]\)[\s\S]*return/
    )
    assert.match(
      source,
      /const createMcpClient = async \(\) => \{[\s\S]*if \(!userIdentity\) \{[\s\S]*openLoginModal\(\)[\s\S]*return/
    )
    assert.match(
      source,
      /\{!userIdentity && \([\s\S]*admin\.access\.login[\s\S]*admin\.action\.createMcpClient/
    )
    assert.match(source, /<LogIn size=\{16\} \/>/)
    assert.match(
      source,
      /onClick=\{createMcpClient\}[\s\S]*disabled=\{[\s\S]*!userIdentity \|\|/
    )
    assert.match(
      adminCss,
      /\.admin-mcp-actions \{[\s\S]*margin-top: var\(--space-4\)/
    )
    assert.match(adminMessages, /'创建 MCP 密钥'/)
    assert.match(adminMessages, /'Create MCP key'/)
    assert.match(adminMessages, /admin\.action\.deleteMcpClient/)
    assert.match(source, /format\('YYYY-MM-DD HH:mm'\)/)
    assert.match(source, /aria-label=\{t\('admin\.action\.deleteMcpClient'\)\}/)
    assert.match(source, /<Trash2 size=\{16\} \/>/)
    assert.doesNotMatch(source, /<Ban size=\{16\}/)
  })

  it('ships the public MCP and OpenAPI documentation center', () => {
    const docsSource = readSource(SOURCE_PATHS.docs)
    const referenceSource = readSource(SOURCE_PATHS.openApiReference)
    const requestSource = readSource(SOURCE_PATHS.openApiRequest)
    const coreMessages = readSource('src/lib/i18n/messages/core.ts')
    const docsMessages = readSource('src/lib/i18n/messages/docs.ts')

    assert.match(docsSource, /mostbox:\/\/node\/status/)
    assert.match(docsSource, /mostbox_publish_local_file/)
    assert.match(docsSource, /MOSTBOX_MCP_TOKEN/)
    assert.match(docsSource, /<CopyButton/)
    assert.match(docsSource, /<ClientOnly/)
    assert.match(docsSource, /to="\/docs\/mcp\/"/)
    assert.match(docsSource, /to="\/docs\/api\/"/)
    assert.equal(
      docsSource.match(/<MarketingLayout header=\{<MarketingHeader \/>\}>/g)
        ?.length,
      2
    )
    assert.doesNotMatch(docsSource, /SegmentedControl/)
    assert.doesNotMatch(docsSource, /\/docs\/\?tab=/)
    assert.match(referenceSource, /createOpenApiSpec/)
    assert.match(referenceSource, /@scalar\/api-reference-react\/style\.css/)
    assert.match(referenceSource, /persistAuth: false/)
    assert.match(referenceSource, /forceDarkModeState: colorMode/)
    assert.match(referenceSource, /telemetry: false/)
    assert.match(referenceSource, /proxyUrl: ''/)
    assert.match(referenceSource, /<ConfirmModal/)
    assert.match(readSource('src/styles/docs.css'), /\.darklight-reference/)
    assert.match(requestSource, /getRequestHeaders/)
    assert.match(requestSource, /explicitAuthorization/)
    assert.match(coreMessages, /'footer\.docs': '文档'/)
    assert.match(coreMessages, /'footer\.docs': '文件'/)
    assert.match(coreMessages, /'footer\.docs': 'Docs'/)
    assert.match(docsMessages, /export const zhCNDocsMessages/)
    assert.match(docsMessages, /export const zhTWDocsMessages/)
    assert.match(docsMessages, /export const enDocsMessages/)
  })

  it('keeps About focused on the current P2P file-sharing loop', () => {
    const aboutSource = readSource(SOURCE_PATHS.about)
    const aboutMessages = readSource('src/lib/i18n/messages/about.ts')

    assert.match(aboutSource, /about\.flow\.publish\.title/)
    assert.match(aboutSource, /about\.flow\.verify\.title/)
    assert.match(aboutSource, /about\.flow\.seed\.title/)
    assert.match(aboutSource, /about\.difference\.cid\.title/)
    assert.match(aboutSource, /about\.toolbox\.web3\.title/)
    assert.match(aboutSource, /about\.opensource\.title/)
    assert.match(aboutSource, /about-artemis\.webp/)
    assert.match(aboutSource, /to="\/hi\/"/)
    assert.doesNotMatch(aboutSource, /about\.architecture/)
    assert.doesNotMatch(aboutMessages, /Personal Knowledge OS/)
    assert.doesNotMatch(aboutMessages, /Knowledge Graph/)
    assert.doesNotMatch(aboutMessages, /Scoped MCP Interface/)
  })

  it('separates shipped foundations from future directions on the Hi page', () => {
    const hiSource = readSource(SOURCE_PATHS.hi)
    const hiMessages = readSource('src/lib/i18n/messages/hi.ts')
    const footerSource = readSource(SOURCE_PATHS.footer)

    assert.match(hiSource, /hi\.common\.future/)
    assert.match(hiSource, /hi\.status\.available/)
    assert.match(hiSource, /hi\.status\.future/)
    assert.match(hiSource, /hi\.ai\.note/)
    assert.match(hiMessages, /知识库读取、整理和写回仍是未来方向。/)
    assert.match(
      hiMessages,
      /Knowledge-base reading, organization, and writing remain future directions\./
    )
    assert.doesNotMatch(footerSource, /to: '\/future\/'/)
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

  it('uses lightweight GET probes without the Claude target', () => {
    const source = readSource(SOURCE_PATHS.ping)

    assert.match(source, /`https:\/\/\$\{host\}\/robots\.txt`/)
    assert.doesNotMatch(source, /Claude/)
    assert.doesNotMatch(source, /anthropic/)
    assert.match(source, /method: 'GET' as const/)
    assert.match(source, /mode: 'no-cors'/)
    assert.doesNotMatch(source, /method: 'HEAD'/)
  })
})
