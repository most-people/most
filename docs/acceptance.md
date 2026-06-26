# MostBox 验收指南

> 用最少步骤验证“进入聊天 -> 创建/加入房间 -> P2P 收发消息 -> 聊天附件传文件 -> CID 校验 -> 下载者继续做种”的当前 MVP 闭环，并覆盖知识库、游戏、daemon、管理台、Android Alpha 和独立工具箱回归。

## 一、快速启动

本地源码验收建议使用 Node.js >= 22.12。当前 TanStack Start static prerender 前端和 Electron 42 开发/打包都建议 Node.js >= 22.12。

本地源码验收需要两个进程：

```bash
npm install
node server/index.js
```

另开一个终端：

```bash
npm run dev
```

打开：

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| 聊天主入口 | `http://localhost:3000/chat/` | 创建/加入聊天房间、收发消息、发送文件附件、进入知识库和游戏 |
| 文件库 | `http://localhost:3000/app/` | 管理已发布文件、下载任务、holding 和 `most://` 链接 |
| 知识库 | `http://localhost:3000/note/` | 保存聊天消息、编辑 Markdown 内容和本地笔记库 |
| 游戏 | `http://localhost:3000/game/gandengyan/`、`http://localhost:3000/game/zhajinhua/` | 独立游戏页面；暂不从聊天详情进入 |
| 管理台 | `http://localhost:3000/admin/` | 查看节点状态、holding、容量和日志 |
| API | `http://localhost:1976/api/openapi.json` | daemon HTTP API |

桌面端默认打开聊天主入口。发布包路径：正式安装包从 `/download` 或 GitHub Releases latest 下载；本地构建使用 `npm run electron:build:win`、`npm run electron:build:mac` 或 `npm run electron:build:linux`。

Web UI 会自动创建本地身份并给文件 API 请求签名。裸 curl 调用 `/api/publish`、`/api/files`、`/api/download/check`、`/api/download`、`/api/p2p/pull` 等文件管理接口时，需要带 `Authorization` 头；节点状态、holding、日志等本机管理接口可直接 curl。

生成测试签名头的 Bash 函数：

```bash
auth_header() {
  MSYS_NO_PATHCONV=1 node --input-type=module -e '
    import { createLoginIdentity } from "./server/src/utils/userIdentity.js"
    import { buildAuthHeaders } from "./server/src/utils/auth.js"
    const [, method, path] = process.argv
    const identity = createLoginIdentity("quickstart", "quickstart")
    const headers = await buildAuthHeaders(identity, method, path)
    console.log(headers.Authorization)
  ' "$1" "$2"
}
```

## 二、聊天优先 MVP 验收

当前主线验收从 `/chat/` 开始，文件能力作为聊天附件进入。建议至少准备两个 MostBox 节点；需要验证“发布者退出后仍可传播”时准备第三个节点。

1. 用户 A 启动桌面端，或按源码方式启动后打开 `/chat/`。
2. 用户 A 创建一个聊天/房间，把房间 ID 发给用户 B。
3. 用户 B 在另一台机器或另一个 MostBox 节点打开 `/chat/` 并加入同一聊天。
4. A/B 双方互发文本消息，确认消息通过 P2P Channel 同步，页面不要求先进入文件页。
5. 用户 A 在聊天里发送文件附件，附件内容生成 `most://<cid>?filename=...` 链接。
6. 用户 B 点击附件下载；下载完成后重算 UnixFS CID v1，CID 与链接一致才显示成功、允许预览，并默认加入做种列表。
7. 停止用户 A 的应用或 daemon，保持用户 B 在线做种。
8. 用户 C 凭同一个聊天附件或 `most://` 链接下载文件；只要 B 仍在线做种，C 应能完成下载并通过 CID 校验。
9. 用户 A 或 B 从聊天设置里选择“保存聊天记录到知识库”，进入 `/note/` 后生成当前聊天记录的可编辑 Markdown 草稿。
10. 打开独立游戏页面时，现有游戏仍使用 `game.<gameId>.<roomCode>` Channel 同步事件；聊天详情暂不提供游戏入口。

| 检查项 | 通过标准 | 入口 |
| --- | --- | --- |
| 主入口 | 首页、桌面端和 README 首屏都把聊天作为第一路径 | `/`、桌面端、`README.md` |
| 加入房间 | 用户能通过房间 ID 加入同一聊天 | `/chat/` |
| 消息同步 | 双方能收发文本消息，断线重连后能重新订阅频道 | `/chat/`、`/ws` |
| 附件下载 | 附件展示可下载/下载中/可预览/失败状态，下载成功后 CID 校验通过 | `/chat/`、文件 API |
| 下载后做种 | 接收方下载成功后自动写入 holding 并 join 对应 CID topic | `/api/node/holdings`、`/admin/` |
| 发布者退出 | 原发布者退出后，至少一个下载者在线时，新下载者仍能完成下载 | `npm run test:protocol`、手动三节点 |
| 保存知识库 | 聊天设置能把当前聊天记录保存为知识库草稿，不新增聊天专用后端接口 | `/chat/`、`/note/` |
| 独立游戏 | 游戏事件仍走公共 Channel 系统；聊天详情暂不提供游戏入口 | `/game/gandengyan/`、`/game/zhajinhua/` |

## 三、文件协议回归

`/app/` 现在是文件库和传输管理入口，不是普通用户的第一路径；但底层文件协议仍是 MVP 的硬约束，不能因为聊天主入口改造而弱化。

必须保持的不变量：

- `most://<cid>?filename=...` 是 MostBox 原生分享链接。
- CID 使用 UnixFS CID v1，生成参数为 `cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`。
- CID 是唯一内容身份；文件名、聊天附件名、保存路径和 metadata 只做展示或路径建议。
- Hyperswarm topic 使用 `cid.multihash.digest`，不要额外 hash、截断或换 topic 规则。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`。
- 下载只接受 Hyperdrive 中精确的 `/<cid>` 文件。
- 下载完成后必须重算 UnixFS CID v1；只有 CID 与链接一致才保存并做种。
- 发布成功和下载成功后默认持续做种，除非用户暂停、删除文件或关闭应用。

直接文件发布路径仍需可用：

1. 打开 `/app/`。
2. 点击“发布文件”，选择一个测试文件。
3. 发布成功后复制 `most://<cid>?filename=...` 分享链接。
4. 保持应用或 daemon 在线。
5. 打开 `/admin/`，确认 holding 列表里能看到对应 CID，状态为 active 或正在 joining。

API 验证：

```bash
printf 'hello mostbox\n' > /tmp/mostbox-sample.txt
AUTH="$(auth_header POST /api/publish)"
curl -H "Authorization: $AUTH" \
  -F "file=@/tmp/mostbox-sample.txt" \
  http://localhost:1976/api/publish
curl http://localhost:1976/api/node/holdings
```

成功时，发布接口返回 `success: true`、`cid` 和 `link`，holding 接口能看到同一个 CID。

直接文件下载路径仍需可用：

```bash
AUTH="$(auth_header POST /api/download/check)"
curl -X POST http://localhost:1976/api/download/check \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH" \
  -d '{"link":"most://<cid>?filename=<name>"}'

AUTH="$(auth_header POST /api/p2p/pull)"
curl -X POST http://localhost:1976/api/p2p/pull \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH" \
  -d '{"link":"most://<cid>?filename=<name>","timeout":60000}'
```

## 四、daemon 与管理台验收

源码方式启动 daemon：

```bash
node server/index.js
```

常用检查：

```bash
curl http://localhost:1976/api/node/status
curl http://localhost:1976/api/node/config
curl http://localhost:1976/api/node/holdings
curl http://localhost:1976/api/node/logs
curl http://localhost:1976/api/node/diagnostics
```

配置数据目录和容量后，重启 daemon，再查看 `/api/node/holdings` 或 `/admin/`。已持有 CID 应自动恢复 join topic。

| 检查项 | 通过标准 | 入口 |
| --- | --- | --- |
| 安全策略 | 固定监听 `127.0.0.1:1976`，远程管理通过 SSH 隧道或反向代理 | `server/index.js` |
| 状态解释 | holding 显示 queued、joining、active、paused、error 对应中文状态 | `formatSeedStatus()` |
| 日志可读 | 管理台展示时间、level、event、message，支持清空日志 | `/api/node/logs`、`src/features/admin/AdminPage.tsx` |
| 设置落盘 | 数据目录、容量上限、单文件上限保存后，API 和管理台能读回 | `/api/node/config` |
| holding 可见 | 发布或下载成功后，`/api/node/holdings` 与管理台都能看到 CID、大小、状态 | `/api/node/holdings` |
| CID 派生 | 手动 holding 的 topic 与 driveName 都必须由 CID digest 派生，传入不匹配值不能污染记录 | `server/src/index.js` |
| API 文档 | OpenAPI 同时包含节点管理、holding、P2P pull、发布、下载检测、下载和按 CID 读取文件路径 | `/api/openapi.json` |

推荐检查：

```bash
node --test --test-name-pattern "returns node status|saves daemon config and exposes policy locally|returns node logs and OpenAPI spec|lists node holdings after publish|creates a manual holding record|normalizes manual holding driveName from the CID" server/tests/integration/api.test.js
```

## 五、前端体验回归

| 检查项 | 通过标准 | 入口 |
| --- | --- | --- |
| 聊天优先 | 首页默认展示聊天，桌面端默认进入 `/chat/`，文件库排在聊天之后 | `src/components/FeaturePortal.tsx`、`electron/main.js` |
| 技术词降噪 | 普通用户首屏说“用户之间直接连接”，不堆 Hyperswarm、Hyperdrive、CID 术语 | `README.md`、首页文案 |
| 附件状态 | 聊天附件区分可下载、下载中、可预览、失败，并有重试入口 | `src/components/ChatAttachmentCard.tsx` |
| 文件库定位 | `/app/` 文案是文件库/传输管理，仍说明“下载者完成后会默认继续做种” | `src/features/files/AppPage.tsx` |
| 下载前检测 | 无链接、错误协议、非法 CID、缺少 filename 都有本地提示 | `getDownloadLinkValidationMessage()` |
| 下载失败文案 | 超时、无 peer、同名冲突、权限错误、节点未初始化、服务端错误各有可读文案 | `getDownloadCheckErrorMessage()` |
| 工具箱隔离 | `/note`、`/web3`、`/game/*` 可独立打开，不是文件分享的前置条件 | 首页工具箱、各独立页面 |
| 云盘误解清理 | 主应用不出现云端订单、赔付、付费保种市场叙事 | `src/features`、`src/components` |

推荐检查：

```bash
rg -n -e '云端订单|赔付|付费保种|保种市场' src/features src/components
npm run test:frontend
npm run typecheck
npm run typecheck:strict-router
npm run lint
```

## 六、MVP 自动验收命令

完整协议回归：

```bash
npm run test:protocol
```

只跑“A 发布、B/C 下载做种、A 退出、D 仍可从下载者种子下载”的本地接力测试：

```bash
node --test --test-name-pattern "pulls through local seed nodes after the uploader stops" server/tests/integration/engine.test.js
```

这个测试会启动多个本地 `MostBoxEngine`，让 uploader 发布文件，seed-b 和 seed-c 拉取后成为种子，再停止 uploader，最后验证 downloader 仍能从下载者种子拉取并通过 CID 校验。

聊天、知识库和游戏入口的轻量回归：

```bash
npm run test:frontend
node --test server/tests/unit/noteVault.test.js server/tests/unit/accountBackup.test.js
node --test server/tests/unit/gameRoom.test.js server/tests/unit/gandengyan.test.js server/tests/unit/zhajinhua.test.js
```

构建前完整检查：

```bash
npm run typecheck
npm run typecheck:strict-router
npm run lint
npm run build
```

## 七、MVP 通过标准

| 场景 | 通过标准 |
| --- | --- |
| 聊天入口 | 用户打开后第一路径是 `/chat/`，能创建或加入聊天房间 |
| P2P 消息 | 两个节点能通过同一 Channel 收发消息 |
| 聊天附件 | 文件能作为聊天附件发送，接收方能下载、校验、预览 |
| 下载后做种 | 接收方下载成功后自动成为新种子，holding 可见 |
| daemon 重启 | 已持有 CID 自动恢复 join topic |
| 发布者退出 | 至少一个下载者在线做种时，新下载者仍可完成下载 |
| 知识库 | 当前聊天记录能从聊天设置保存到 `/note/`，知识库能力不依赖文件分享入口 |
| 游戏 | 独立游戏页面继续使用 `game.*` Channel；聊天详情暂不提供游戏入口 |
| Web3 | Web3 工具箱独立存在，不成为聊天、文件、记录或游戏前置条件 |

如果下载失败，优先检查：聊天双方是否加入同一房间、附件链接是否完整、发布者或下载者种子是否在线、端口和防火墙是否允许 P2P 连接、管理台日志中是否出现 `PEER_NOT_FOUND` 或 `INTEGRITY_ERROR`。

## 八、Alpha 前长测

这部分必须在真实机器上执行，不能只靠本地单测关闭。

| 场景 | 记录内容 | 通过标准 |
| --- | --- | --- |
| 聊天收发 | 房间 ID、参与节点、消息时间、断线重连情况 | 双方能稳定收发，重连后继续同步 |
| 100MB 附件 | 文件大小、CID、发布节点、下载节点、耗时、校验结果 | 聊天发送、下载、校验、下载后做种全通过 |
| 1GB 附件 | 文件大小、CID、耗时、失败重试、日志摘要 | 下载和做种稳定；失败时错误可读 |
| 重启恢复 | 重启前 holding、重启后状态、join 耗时 | daemon 重启后自动 join 已持有 CID topic |
| 发布者退出 | 发布者退出时间、剩余种子、后续下载者结果 | 至少一个下载者在线时，新下载者仍可完成下载 |
| 知识库保存 | 原消息、生成标题、保存路径或 CID | 聊天消息能进入知识库编辑态 |
| 独立游戏 | 房间 ID、游戏 ID、参与节点、事件同步结果 | 两端游戏状态能通过 Channel 同步 |

记录模板：

```text
日期:
平台:
网络:
房间 ID:
文件大小:
CID:
发布节点:
下载节点:
耗时:
结果:
失败错误:
管理台日志摘要:
```

## 九、Android Alpha 回归

Android 第一阶段也应围绕聊天启动，但文件协议不变量保持不变。当前 Android Alpha 仍以真机前台完整种子能力为基础验收。

| 检查项 | 通过标准 | 入口 |
| --- | --- | --- |
| 启动口径 | 移动端文档说明优先补齐聊天、附件收发和基础做种状态 | `mobile/android/README.md` |
| P2P core | Android 前台能启动真实 P2P core，并显示 ready 状态 | Android App |
| 附件/文件互通 | Android 与桌面节点能完成发布、下载、CID 校验和前台做种互通 | Android App、桌面端 |
| holding 管理 | Android holding 删除只移除内部做种副本，不删除用户另存副本 | Android App |
| 真机记录 | 内测记录写明设备、系统、网络、CID、耗时和日志摘要 | `docs/mobile-android-alpha.md` |

推荐检查：

```bash
cd mobile/android
npm test
```

真机聊天和附件传输仍需人工验收；单测不能替代 Android 网络、文件选择器、前台限制和系统分享行为。

## 十、独立工具箱与知识库回归

| 检查项 | 通过标准 | 入口 |
| --- | --- | --- |
| 知识库定位文案 | README/界面文案明确知识库云备份只覆盖知识库数据，不是 MostBox 文件云盘 | `README.md`、`src/features/note/NotePage.tsx` |
| 私密笔记 | 未登录时不可解密；正确 Web3 账号登录后可阅读、编辑、重新保存 | `/note`、`mostEncode()`、`mostDecode()` |
| 备份恢复 | 云端缺失、冲突、失败、本地导入导出都有反馈 | `useNoteBackupSync()` |
| 资源管理 | 新建、重命名、移动、删除文件夹、搜索不丢数据 | `noteUtils`、`src/features/note/NotePage.tsx` |
| 桌面 Markdown 笔记库 | Electron + 本地 daemon 下可选择目录、列出 `.md`、打开并保存当前文件；Web 端仍使用 IndexedDB | `/note`、`/api/note-vault/*` |
| CID 边界 | `calculateNoteCid()` 只用于笔记 raw CID，不进入 `most://` 文件分享协议 | `server/src/core/cid.js`、笔记测试 |
| Web3 独立 | 钱包、PEM、地址和签名工具不参与聊天、附件、知识库或游戏主流程 | `/web3/` |

推荐检查：

```bash
node --test server/tests/unit/noteUtils.test.js server/tests/unit/accountBackup.test.js server/tests/unit/noteVault.test.js server/tests/unit/noteVaultRoutes.test.js
```

桌面 Markdown 笔记库最小闭环手动验收：

1. 启动 Electron 包或 `npm run electron:dev`，登录 Web3 账号后打开 `/note`。
2. 点击“打开笔记库”，选择一个本地目录；目录内递归 `.md` 文件应出现在左侧列表。
3. 打开任一 `.md` 文件，进入编辑模式修改内容并保存；用外部编辑器打开同一文件，应能看到保存后的 Markdown。
4. 在普通 Web 浏览器打开 `/note`，不应出现本地目录选择入口，原 IndexedDB 笔记行为保持不变。
