import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  getDownloadCheckErrorMessageFromPayload,
  getDownloadLinkValidationMessage,
} from '../../server/src/utils/downloadMessages.js'

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

describe('frontend smoke checks', () => {
  it('keeps the share modal aligned with the MVP seeding promise', () => {
    const source = readSource('app/app/page.tsx')

    assert.match(source, /most:\/\/\$\{shareItem\.cid\}\?filename=/)
    assert.match(source, /本机在线时可下载/)
    assert.match(source, /下载者完成后会默认继续做种/)
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

    assert.match(source, /NodeHolding/)
    assert.match(source, /formatSeedStatus/)
    assert.match(source, /做种中/)
    assert.match(source, /队列中/)
  })

  it('does not advertise unlimited file size in user-facing copy', () => {
    const sources = [
      readSource('README.md'),
      readSource('app/admin/page.tsx'),
      readSource('components/FeaturePortal.tsx'),
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
    const remoteNodePanel = readSource('components/RemoteNodeConnectPanel.tsx')

    assert.match(readme, /Node\.js >= 22\.12/)
    assert.match(readme, /npx most-box@latest/)
    assert.match(readme, /桌面客户端（推荐）/)
    assert.match(readme, /Web 入口只负责连接已有 MostBox 节点/)
    assert.match(readme, /Electron 42/)
    assert.match(readme, /TanStack Start static prerender/)
    assert.doesNotMatch(readme, /Node\.js >= 18/)
    assert.doesNotMatch(readme, /npx most-box\s*$/m)
    assert.match(downloadPage, /Web\s*端只连接已有 MostBox 节点/)
    assert.match(downloadPage, /Node\.js >= 22\.12/)
    assert.match(downloadPage, /npx most-box@latest/)
    assert.match(portal, /Web 端只连接已有节点，桌面端提供完整 P2P 能力/)
    assert.match(remoteNodePanel, /Web 端只连接已有 MostBox 节点/)
    assert.match(remoteNodePanel, /本机完整 P2P 能力请使用桌面客户端/)
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
    assert.match(source, /创建房间/)
    assert.match(source, /加入房间/)
    assert.match(source, /开始游戏/)
    assert.match(source, /再来一局/)
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
    assert.match(componentSource, /label: pinned \? '取消置顶' : '置顶'/)
    assert.match(componentSource, /label: '重命名'/)
    assert.match(componentSource, /label: '删除'/)
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
    assert.match(componentSource, /label: '图片'/)
    assert.match(componentSource, /label: '视频'/)
    assert.match(componentSource, /label: '文件'/)
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
})
