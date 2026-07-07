# Equal Toolbox Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition MostBox from a chat-first product entry to an equal-weight P2P toolbox across the home page, current docs, chat settings, and focused smoke tests.

**Architecture:** Keep the change in existing frontend/documentation boundaries. `FeaturePortal` becomes a static peer-entry overview instead of a selected-feature marketing panel; Chat removes only the settings-drawer Knowledge Base save path; protocol and backend code remain untouched.

**Tech Stack:** React 19, TanStack Router, TypeScript, Zustand, Lucide React, CSS classes in `src/styles/portal.css`, Node.js built-in test runner.

## Global Constraints

- Default response and user-facing explanation are Chinese, but code and i18n catalogs must keep existing zh-CN, zh-TW, and en coverage.
- Use ESM imports with `.js` extensions for local JavaScript imports where applicable.
- Use 2 spaces, single quotes, and no semicolons.
- Frontend UI text must go through stable `MessageKey` i18n keys, not hard-coded Chinese strings in components.
- Frontend styles must use CSS classes, not component inline `style={{}}`.
- Use lucide-react icons for UI icons.
- Do not change `most://`, CID generation, CID topic derivation, Hyperdrive path rules, or seeding behavior.
- Do not add cloud storage, payment, order, bounty, or permanent availability promises.
- Do not add a new chat-to-note replacement flow.

---

## File Structure

- Modify `src/components/FeaturePortal.tsx`: remove selected-feature state and dynamic detail panel; render peer toolbox modules with global node actions.
- Modify `src/styles/portal.css`: replace large card/detail styling with minimal hero, feature matrix, and status band styles.
- Modify `src/lib/i18n/messages/portal.ts`: rewrite portal positioning and feature descriptions across zh-CN, zh-TW, and en.
- Modify `src/features/chat/ChatPage.tsx`: remove chat settings Knowledge Base save UI and helper functions/imports that only support it.
- Modify `src/lib/i18n/messages/chat.ts`: remove or stop advertising chat-to-note settings copy.
- Modify `electron/main.js`: default the desktop window to `/` instead of `/chat/` unless a deep link is pending.
- Modify `README.md`: rewrite current product positioning and Android wording away from chat-first.
- Modify `docs/acceptance.md`: replace chat-first acceptance with equal toolbox acceptance while keeping file protocol regression explicit.
- Modify `src/lib/i18n/messages/about.ts`: update current about-page product positioning away from chat-first.
- Modify `src/tests/frontend-smoke.test.js`: update old strategy assertions to the new equal-toolbox behavior and absence of chat settings note export.

## Task 1: Update Smoke Tests For New Strategy

**Files:**
- Modify: `src/tests/frontend-smoke.test.js`

**Interfaces:**
- Consumes: existing `readSource()`, `readI18nSources()`, and `SOURCE_PATHS`.
- Produces: failing assertions that define the new strategy before implementation.

- [ ] **Step 1: Replace the chat-first acceptance test**

Find the test named:

```js
it('documents the chat-first MVP acceptance path without weakening protocol regression', () => {
```

Rename it and change the strategy assertions to:

```js
it('documents the equal toolbox acceptance path without weakening protocol regression', () => {
  const acceptance = readSource('docs/acceptance.md')
  const agents = readSource(SOURCE_PATHS.agents)

  assert.match(acceptance, /平权工具箱/)
  assert.match(acceptance, /文件、聊天、知识库、游戏和 Web3 是同等入口/)
  assert.match(acceptance, /`http:\/\/localhost:3000\/`/)
  assert.match(acceptance, /`\/app\/` 保留完整文件发布、下载和做种管理/)
  assert.match(acceptance, /聊天设置不再保存聊天记录到知识库/)
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
  assert.doesNotMatch(acceptance, /当前主线验收从 `\/chat\/` 开始/)
  assert.doesNotMatch(acceptance, /保存聊天记录到知识库/)
})
```

- [ ] **Step 2: Replace the chat note draft settings test**

Find the test named:

```js
it('saves current chat history into note drafts from chat settings', () => {
```

Rename it and change the relevant assertions to:

```js
it('keeps chat settings independent from the knowledge base', () => {
  const chatSource = readSource(SOURCE_PATHS.features.chat)
  const chatUiSource = readSource('src/components/ChatUi.tsx')
  const chatCssSource = readSource('src/styles/chat.css')
  const noteRouteSource = readSource('src/routes/note/index.tsx')
  const noteSource = readSource('src/features/note/NotePage.tsx')
  const i18nMessages = readI18nSources()

  assert.doesNotMatch(chatSource, /createChatNoteDraft/)
  assert.doesNotMatch(chatSource, /getChatNoteDraftHref/)
  assert.doesNotMatch(chatSource, /handleSaveChannelToNote/)
  assert.doesNotMatch(chatSource, /getChatHistoryNoteDraftContent/)
  assert.doesNotMatch(chatSource, /isSaveableChannelMessage/)
  assert.doesNotMatch(chatSource, /chat\.noteDraft\./)
  assert.doesNotMatch(chatSource, /chat\.channel\.createdAt[\s\S]*chat\.noteDraft/)
  assert.doesNotMatch(chatSource, /NotebookPen/)
  assert.doesNotMatch(chatSource, /handleSaveMessageToNote/)
  assert.doesNotMatch(chatSource, /chat\.message\.saveToNote/)
  assert.doesNotMatch(chatUiSource, /actions\?: ActionMenuItem\[\]/)
  assert.doesNotMatch(chatUiSource, /chat-message-actions-trigger/)
  assert.doesNotMatch(chatCssSource, /chat-message-actions/)
  assert.match(noteRouteSource, /chatDraft/)
  assert.match(noteSource, /readChatNoteDraft/)
  assert.doesNotMatch(i18nMessages, /'chat\.noteDraft\./)
  assert.doesNotMatch(i18nMessages, /保存聊天记录到知识库/)
})
```

- [ ] **Step 3: Add home page equal-toolbox assertions**

In the existing i18n/home smoke coverage, add assertions that the portal source no longer uses selected-feature state:

```js
assert.match(portalSource, /portal\.feature\.files\.title|portal\.feature\.app\.title/)
assert.match(portalSource, /to=\{f\.path\}/)
assert.doesNotMatch(portalSource, /useState<string>\('chat'\)/)
assert.doesNotMatch(portalSource, /portal-marketing/)
assert.doesNotMatch(portalSource, /activeFeature/)
assert.doesNotMatch(messageCatalogs, /chat-first|Start with chat|从聊天开始|聊天优先/)
```

- [ ] **Step 4: Update desktop default assertion**

Add or update the frontend smoke test to assert:

```js
const electronMainSource = readSource('electron/main.js')
assert.match(electronMainSource, /pendingDeepLinkUrl \|\| getLocalAppUrl\('\/'\)/)
assert.doesNotMatch(electronMainSource, /pendingDeepLinkUrl \|\| getLocalAppUrl\('\/chat\/'\)/)
```

- [ ] **Step 5: Run the focused frontend test and confirm failure**

Run:

```bash
npm run test:frontend
```

Expected: fails on the new assertions because the app still contains chat-first docs, chat note draft settings, and the old portal.

## Task 2: Refactor Home Page To Equal Toolbox

**Files:**
- Modify: `src/components/FeaturePortal.tsx`
- Modify: `src/styles/portal.css`
- Modify: `src/lib/i18n/messages/portal.ts`

**Interfaces:**
- Consumes: `useAppStore(s => s.hasBackend)`, `useAppStore(s => s.openConnectModal)`, `useIsDesktopClient()`, `useI18n()`.
- Produces: a static `FeaturePortal` rendering peer feature entries and global actions.

- [ ] **Step 1: Replace `FeatureDef` shape**

Use this smaller interface in `FeaturePortal.tsx`:

```ts
interface FeatureDef {
  id: string
  titleKey: MessageKey
  subtitleKey: MessageKey
  descKey: MessageKey
  icon: React.ReactNode
  path: InternalRoutePath
  requiresBackend: boolean
}
```

- [ ] **Step 2: Remove selected-feature state**

Delete:

```ts
const [selected, setSelected] = useState<string>('chat')
const activeFeature = ...
const activeFeatureTitle = ...
const activeFeatureSteps = ...
```

Also remove `useState`, `Check`, `ExternalLink`, and any icons used only by the removed detail panel.

- [ ] **Step 3: Render peer feature modules**

Keep five features in equal order:

```ts
const featureOrder = ['app', 'chat', 'note', 'gandengyan', 'web3']
```

Render each entry as a `Link` instead of a button with selected state:

```tsx
<div className="portal-feature-grid">
  {orderedFeatures.map(f => {
    const needsBackend = f.requiresBackend
    const backendStatus = needsBackend
      ? hasBackend === true
        ? 'connected'
        : hasBackend === false
          ? 'disconnected'
          : 'checking'
      : 'ready'
    const title = t(f.titleKey)

    return (
      <Link key={f.id} to={f.path} className={`portal-feature-card ${f.id}`}>
        <div className="portal-feature-card-head">
          <span className="portal-feature-card-icon">{f.icon}</span>
          <ArrowUpRight size={16} />
        </div>
        <h2>{title}</h2>
        <p>{t(f.descKey)}</p>
        <div className={`ui-badge portal-card-status ${backendStatus}`}>
          <span className={`status-dot ${backendStatus}`} />
          {needsBackend
            ? backendStatus === 'connected'
              ? t('common.status.connected')
              : backendStatus === 'disconnected'
                ? t('common.status.needsConnection')
                : t('common.status.checking')
            : t('common.status.ready')}
        </div>
      </Link>
    )
  })}
</div>
```

- [ ] **Step 4: Add global hero actions**

Use these actions below the hero copy:

```tsx
<div className="portal-hero-actions">
  {!isDesktopClient && (
    <Link to="/download/" className="btn btn-primary">
      <Download size={16} />
      {t('nav.downloadClient')}
    </Link>
  )}
  <button onClick={openConnectModal} className="btn btn-secondary">
    <Server size={16} />
    {t('portal.webConnectNode')}
  </button>
  <Link to="/admin/" className="btn btn-secondary">
    <HardDrive size={16} />
    {t('portal.nodeAdmin')}
  </Link>
</div>
```

- [ ] **Step 5: Replace portal styles**

Remove unused `.portal-card`, `.portal-marketing`, `.portal-step`, and selected-state styles. Add classes for:

```css
.portal-page
.portal-hero
.portal-hero-title
.portal-hero-subtitle
.portal-hero-actions
.portal-feature-section
.portal-feature-grid
.portal-feature-card
.portal-feature-card-head
.portal-feature-card-icon
.portal-status-band
```

Use 8px border radius for cards, stable grid tracks, and one-column mobile layout.

- [ ] **Step 6: Rewrite portal i18n**

Update `portal.meta.description`, `portal.hero.subtitle`, feature subtitles, and descriptions in zh-CN, zh-TW, and en so they no longer say chat-first or start with chat. For zh-CN, use:

```ts
'portal.hero.subtitle':
  '用户之间直接连接的 P2P 工具箱。文件分享、私域聊天、知识库、游戏房间和 Web3 工具各自独立，也共享同一个本地身份和节点基础。',
'portal.feature.app.subtitle': 'P2P 文件分享与做种',
'portal.feature.app.desc':
  '发布文件生成 most:// 链接，下载后按 CID 校验并默认继续做种。',
'portal.feature.chat.subtitle': '私域房间消息',
'portal.feature.chat.desc':
  '创建或加入房间，消息通过 P2P Channel 在在线节点之间同步。',
'portal.feature.note.subtitle': 'Markdown 本地知识库',
'portal.feature.note.desc':
  '整理本地资料、私密笔记和 Markdown 文档，不依赖聊天入口。',
```

Mirror the same meaning in zh-TW and en.

- [ ] **Step 7: Run frontend test**

Run:

```bash
npm run test:frontend
```

Expected: home/i18n assertions pass; remaining failures may still be docs or chat settings until later tasks are implemented.

## Task 3: Remove Chat Settings Knowledge Base Save

**Files:**
- Modify: `src/features/chat/ChatPage.tsx`
- Modify: `src/lib/i18n/messages/chat.ts`

**Interfaces:**
- Consumes: existing channel detail drawer state and active channel data.
- Produces: chat settings without Knowledge Base export support.

- [ ] **Step 1: Remove imports**

Delete from `ChatPage.tsx`:

```ts
import {
  createChatNoteDraft,
  getChatNoteDraftHref,
} from '~/lib/chatNoteDraft'
```

If no longer used after helper removal, also remove `Edit2` only if the remark section no longer uses it. Keep `Edit2` if remark editing still uses it.

- [ ] **Step 2: Remove chat note helper functions**

Delete these functions:

```ts
function getNoteDraftTimeLabel(timestamp?: number) { ... }
function escapeMarkdownLinkLabel(label: string) { ... }
function formatMarkdownLink(label: string, href: string) { ... }
function formatMarkdownQuote(content: string) { ... }
function isSaveableChannelMessage(msg: ChannelMessage) { ... }
function getChatHistoryNoteDraftContent(messages: ChannelMessage[]) { ... }
function handleSaveChannelToNote() { ... }
```

Keep `CHAT_FILE_ROOT` only if attachment save/preview code still references it.

- [ ] **Step 3: Remove drawer section**

Delete this block from the channel detail drawer:

```tsx
{!isInviteUser && (
  <div className="channel-detail-section">
    <div className="channel-detail-label">
      <span>{t('chat.noteDraft.settingsTitle')}</span>
    </div>
    <p className="channel-detail-hint">
      {t('chat.noteDraft.saveAllDesc')}
    </p>
    <button
      className="btn btn-secondary btn-block"
      onClick={handleSaveChannelToNote}
    >
      {t('chat.noteDraft.saveAll')}
    </button>
  </div>
)}
```

- [ ] **Step 4: Remove chat i18n keys**

Delete `chat.noteDraft.*` keys from zh-CN, zh-TW, and en in `src/lib/i18n/messages/chat.ts`.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: passes with no missing imports or unused local functions.

## Task 4: Update Current Documentation And Desktop Default

**Files:**
- Modify: `README.md`
- Modify: `docs/acceptance.md`
- Modify: `src/lib/i18n/messages/about.ts`
- Modify: `electron/main.js`

**Interfaces:**
- Consumes: current product strategy from `docs/superpowers/specs/2026-07-07-equal-toolbox-home-design.md`.
- Produces: current docs and desktop startup aligned with equal toolbox positioning.

- [ ] **Step 1: Update Electron default URL**

Change:

```js
const initialUrl = pendingDeepLinkUrl || getLocalAppUrl('/chat/')
```

to:

```js
const initialUrl = pendingDeepLinkUrl || getLocalAppUrl('/')
```

- [ ] **Step 2: Rewrite README opening**

Change the title and opening copy to equal toolbox language:

```md
# MostBox：用户之间直接连接的 P2P 工具箱

> 文件分享、私域聊天、知识库、游戏房间和 Web3 工具是同等入口。
> 文件分享仍使用 `most://` 链接、CID 校验和下载后做种；聊天、知识库、游戏和 Web3 保持独立能力。
```

Remove current copy that says "聊天优先" or "从聊天开始".

- [ ] **Step 3: Rewrite acceptance current-entry section**

In `docs/acceptance.md`, replace the chat-first section with:

```md
## 二、平权工具箱入口验收

当前首页把文件、聊天、知识库、游戏和 Web3 作为同等入口。`/app/` 保留完整文件发布、下载和做种管理；`/chat/` 保留房间消息和附件；`/note/` 是独立知识库；游戏和 Web3 仍是独立工具箱。
```

Add a table row:

```md
| 聊天设置 | 聊天设置不再保存聊天记录到知识库 | `/chat/` |
```

Keep file protocol regression sections unchanged except for references that say files are only chat attachments.

- [ ] **Step 4: Run frontend smoke tests**
- [ ] **Step 4: Update About page current positioning copy**

In `src/lib/i18n/messages/about.ts`, replace current product-positioning copy that says MOST PEOPLE starts from chat or is chat-first with equal toolbox copy. Use this meaning across zh-CN, zh-TW, and en:

```ts
'about.hero.lede':
  'MOST PEOPLE is a fully open source P2P toolbox for file sharing, private chat, a Knowledge Base, multi-person voice, game rooms, and a reusable account system.',
```

If the exact key name differs, update the existing about message key that currently contains `MOST PEOPLE starts from chat`.

- [ ] **Step 5: Run frontend smoke tests**

Run:

```bash
npm run test:frontend
```

Expected: strategy/documentation assertions pass with no chat-first failures.

## Task 5: Final Verification And Cleanup

**Files:**
- Review all modified files.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified implementation ready for final response.

- [ ] **Step 1: Search for stale current-positioning copy**

Run:

```bash
rg -n "chat-first|聊天优先|从聊天开始|Start with chat|starts from chat|保存聊天记录到知识库" README.md docs/acceptance.md src/components src/features src/lib/i18n/messages electron/main.js src/tests/frontend-smoke.test.js
```

Expected: no matches in current app/docs/tests except historical Android Alpha records if intentionally left outside the searched paths.

- [ ] **Step 2: Run frontend and type checks**

Run:

```bash
npm run test:frontend
npm run typecheck
npm run typecheck:strict-router
npm run lint
```

Expected: all pass.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git diff --stat
git diff -- src/components/FeaturePortal.tsx src/styles/portal.css src/features/chat/ChatPage.tsx
```

Expected: changes are scoped to equal toolbox home, chat settings removal, docs, tests, and Electron default route.

- [ ] **Step 4: Optional browser verification**

If the dev server is already running at `http://localhost:3000/`, reload the browser and verify:

- Home page headline is `MOST PEOPLE`.
- Files, Chat, Knowledge Base, Games, and Web3 appear as peer entries.
- No large selected-feature detail panel appears below the feature entries.
- Chat settings drawer does not show a Knowledge Base save section.

Do not start a new long-running server if the user did not need manual UI verification and automated checks already pass.
