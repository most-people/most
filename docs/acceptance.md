# MostBox 验收指南

> 用最少步骤验证“运行自己的 P2P 节点 -> 分享 `most://` 链接 -> 文件发布/下载 -> CID 校验 -> 下载者继续做种”的当前 MVP 闭环，并覆盖聊天、知识库、daemon、管理台、Android Alpha 和独立工具箱回归。

## 一、快速启动

本地源码验收建议使用 Node.js >= 22.12。当前 TanStack Start static prerender 前端和 Electron 43 开发/打包都建议 Node.js >= 22.12。

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

| 入口         | 地址                                     | 用途                                                        |
| ------------ | ---------------------------------------- | ----------------------------------------------------------- |
| 本机节点首页 | `http://localhost:3000/`                 | 用户自己运行 P2P 节点，文件、聊天、知识库和 Web3 是独立入口 |
| 文件库       | `http://localhost:3000/file/`            | `/file/` 保留完整文件发布、下载和做种管理                   |
| 聊天         | `http://localhost:3000/chat/`            | 按频道 ID 打开聊天、收发消息和发送文件附件                  |
| 知识库       | `http://localhost:3000/note/`            | 编辑 Markdown 内容和本地笔记库                              |
| 管理台       | `http://localhost:3000/admin/`           | 查看节点、holding、日志并管理 MCP 客户端                    |
| API          | `http://localhost:1976/api/openapi.json` | daemon HTTP API                                             |
| MCP          | `http://127.0.0.1:1976/mcp`              | 仅本机回环的 Streamable HTTP MCP                            |

桌面端默认打开本机节点首页。发布包路径：正式桌面安装包和 Android Alpha APK 从 `/download` 或 GitHub Releases latest 下载；本地桌面构建使用 `npm run electron:build:win`、`npm run electron:build:mac` 或 `npm run electron:build:linux`，Android APK 构建在 `mobile/app/` 下运行 `npm run build`。

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

## 二、本机节点 MVP 验收

当前主线验收从 `/` 开始：用户先运行自己的 MostBox P2P 节点，再通过本地界面进入文件、聊天、知识库或 Web3。建议至少准备两个 MostBox 节点；需要验证“发布者退出后仍可传播”时准备第三个节点。

1. 用户 A 启动桌面端，或按源码方式启动后打开 `/`，确认首页表达“用户自己运行 P2P 节点”的定位，而不是聊天或网盘单一路径。
2. 用户 A 进入 `/file/` 发布测试文件，得到 `most://<cid>?filename=...` 链接。
3. 用户 B 在另一台机器或另一个 MostBox 节点凭同一个链接下载；下载完成后重算 UnixFS CID v1，CID 与链接一致才显示成功、允许预览，并默认加入做种列表。
4. 停止用户 A 的应用或 daemon，保持用户 B 在线做种。
5. 用户 C 凭同一个 `most://` 链接下载文件；只要 B 仍在线做种，C 应能完成下载并通过 CID 校验。
6. 进入 `/chat/` 加入聊天，确认自动生成 26 位小写 base32 ID；复制 `/chat/#<channelId>` 链接并在另一节点用任意大小写形式直接打开，确认文本、附件和语音仍通过同一 P2P Channel 同步。
7. 进入 `/note/` 新建或编辑 Markdown 内容，确认知识库是独立工具，不依赖聊天设置。
8. 打开 `/web3/`，确认 Web3 工具箱独立存在，不成为文件、聊天或知识库的前置条件。

| 检查项       | 通过标准                                                                                                             | 入口                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 节点定位     | 首页、桌面端和 README 首屏都说明 MostBox 是用户自己运行的 P2P 节点；文件、聊天、知识库和 Web3 是独立入口             | `/`、桌面端、`README.md`            |
| 文件闭环     | `/file/` 负责文件发布、文件库与下载链接入口，`/cid/<cid>` 统一负责检测和发起下载；活动进度可通过全局任务条跨页面查看 | `/file/`、`/cid/<cid>`、文件 API    |
| 下载后做种   | 接收方下载成功后自动写入 holding 并 join 对应 CID topic                                                              | `/api/node/holdings`、`/admin/`     |
| 发布者退出   | 原发布者退出后，至少一个下载者在线时，新下载者仍能完成下载                                                           | `npm run test:protocol`、手动三节点 |
| 聊天独立     | 用户能通过频道 ID 或 `/chat/#<channelId>` 加入同一聊天，双方能收发文本消息和文件附件                                 | `/chat/`、`/ws`                     |
| 知识库独立   | 知识库支持 Markdown 编辑、备份和恢复，不依赖聊天设置入口                                                             | `/note/`                            |
| 聊天设置边界 | 聊天设置不再提供知识库导出入口                                                                                       | `/chat/`                            |

### P2P 风险红线验收

完整边界见 [P2P 风险红线](p2p-risk-boundaries.md)。任何功能、文案或商店材料改动都不能把 MostBox 变成资源平台。

| 检查项   | 通过标准                                                    |
| -------- | ----------------------------------------------------------- |
| 工具定位 | 不出现公开资源目录、内容搜索、推荐、排行榜或官方种子库      |
| 用户确认 | 发布和下载都由用户主动触发；不自动下载陌生内容              |
| 内容示例 | 不用电影、音乐、游戏、破解软件等高版权风险素材做示例或宣传  |
| 可用性   | 只承诺当前在线种子可传播，不承诺永久保存或长期后台做种      |
| 隐私披露 | 隐私政策披露 P2P/DHT 所需的 IP、topic、连接时间等网络元数据 |

## 三、文件协议回归

`/file/` 是文件库和传输管理入口，也是本机节点首页的一等入口；底层文件协议仍是 MVP 的硬约束，不能因为首页改造而弱化。

必须保持的不变量：

- `most://<cid>?filename=...` 是 MostBox 原生分享链接；下载输入也可接受尾部为 `<cid>` 或 `<cid>?filename=...` 的网页入口和裸 CID。
- CID 使用 UnixFS CID v1，生成参数为 `cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`。
- CID 是唯一内容身份；文件名、聊天附件名、保存路径和 metadata 只做展示或路径建议。
- Hyperswarm topic 使用 `cid.multihash.digest`，不要额外 hash、截断或换 topic 规则。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`。
- 下载只接受 Hyperdrive 中精确的 `/<cid>` 文件。
- 下载完成后必须重算 UnixFS CID v1；只有 CID 与链接一致才保存并做种。
- 发布成功和下载成功后默认持续做种，除非用户暂停、删除文件或关闭应用。

直接文件发布路径仍需可用：

1. 打开 `/file/`。
2. 点击“发布文件”，选择一个测试文件。
3. 发布成功后确认仍停留在文件库；点击文件卡片上的分享按钮进入 `/cid/<cid>?filename=...`，页面提供网页分享链接、二维码和 `most://` 客户端打开入口。
4. 保持应用或 daemon 在线。
5. 打开 `/admin/`，确认 holding 列表里能看到对应 CID，状态为 active 或正在 joining。

直接文件下载 UI 仍需可用：

1. 打开 `/file/`，点击“下载到文件库”。
2. 弹窗只显示链接输入和“查看并下载”；粘贴无效链接时留在弹窗并显示格式错误。
3. 分别粘贴 `most://<cid>?filename=<name>`、网页入口和裸 CID，确认都进入对应 `/cid/<cid>` 页面。
4. CID 页面自动检测可用性；目录集合默认选中本机缺失的子文件，并允许调整后开始下载。
5. 开始下载后确认全局下载任务条出现；离开 CID 页面后 daemon 继续下载，任务条仍显示进度并可取消或返回 CID 详情。
6. 在任务仍运行时刷新页面，确认任务条通过 `GET /api/download/tasks` 重新附着活动任务，CID 页面不会重复检测或发起。
7. 确认成功、部分完成、失败和取消会立即从活动任务接口移除；当前会话显示对应提示，刷新后以 CID 检测、文件库和 holding 为最终状态。
8. 下载成功后文件进入文件库并默认继续做种；文件发布进度和聊天附件快捷下载保持原有流程。

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

直接文件下载路径仍需可用。`link` 可填 `most://<cid>?filename=<name>`、`https://most.box/cid/<cid>?filename=<name>`、`<cid>` 或 `<cid>?filename=<name>`：

```bash
BODY='{"link":"most://<cid>?filename=<name>"}'
AUTH="$(auth_header POST /api/download/check)"
curl -X POST http://localhost:1976/api/download/check \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH" \
  -d "$BODY"

BODY='{"link":"most://<cid>?filename=<name>","background":true}'
AUTH="$(auth_header POST /api/download)"
curl -X POST http://localhost:1976/api/download \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH" \
  -d "$BODY"

AUTH="$(auth_header GET /api/download/tasks)"
curl http://localhost:1976/api/download/tasks \
  -H "Authorization: $AUTH"

BODY='{"link":"most://<cid>?filename=<name>","timeout":60000}'
AUTH="$(auth_header POST /api/p2p/pull)"
curl -X POST http://localhost:1976/api/p2p/pull \
  -H "Content-Type: application/json" \
  -H "Authorization: $AUTH" \
  -d "$BODY"
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

| 检查项       | 通过标准                                                                                  | 入口                                                 |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 安全策略     | 固定监听 `127.0.0.1:1976`，远程管理通过 SSH 隧道或反向代理                                | `server/index.js`                                    |
| 局域网管理   | 首个签名身份可认领节点；认领后仅该身份可从局域网访问管理 API，本机回环访问仍可恢复        | `/api/admin/access`、`/admin/`                       |
| API 防滥用   | 重复认证失败、无效邀请码或高成本写入超过额度时返回 `429`、`RATE_LIMITED` 和 `Retry-After` | `server/src/http/rateLimit.js`                       |
| 状态解释     | holding 显示 queued、joining、active、paused、error 对应中文状态                          | `formatSeedStatus()`                                 |
| 日志可读     | 管理台展示时间、level、event、message，支持清空日志                                       | `/api/node/logs`、`src/features/admin/AdminPage.tsx` |
| 设置落盘     | 配置 patch 在跨进程锁内原子落盘；并发更新保留其他字段，锁超时或 JSON 损坏时不覆盖原文件   | `/api/node/config`、`server/src/node/config.js`      |
| holding 可见 | 发布或下载成功后，`/api/node/holdings` 与管理台都能看到 CID、大小、状态                   | `/api/node/holdings`                                 |
| CID 派生     | 手动 holding 的 topic 与 driveName 都必须由 CID digest 派生，传入不匹配值不能污染记录     | `server/src/index.js`                                |
| API 文档     | OpenAPI 同时包含节点管理、holding、P2P pull、发布、下载检测、下载和按 CID 读取文件路径    | `/api/openapi.json`                                  |

推荐检查：

```bash
node --test --test-name-pattern "returns node status|saves daemon config and exposes policy locally|returns node logs and OpenAPI spec|lists node holdings after publish|creates a manual holding record|normalizes manual holding driveName from the CID" server/tests/integration/api.test.js
```

### MCP 验收

1. 登录节点管理员身份，在 `/admin/` 创建只含 `node:read` 的客户端；确认 token 只显示一次，
   列表中不出现明文 token。
2. 用 token 连接 `http://127.0.0.1:1976/mcp`，确认只能发现
   `mostbox_node_status` 和 `mostbox_list_holdings`。
3. 创建带 `files:publish` 的客户端并填写临时允许目录；目录内普通文件可以发布，目录外文件、
   目录本身和符号链接逃逸必须拒绝。
4. 通过 `mostbox_publish_local_file` 发布后，结果包含相同 CID 的 `most://` 链接，holding
   显示已持有并自动做种。
5. 用另一客户端调用 `mostbox_start_download`，轮询 `mostbox_list_downloads`；成功后文件进入
   当前用户文件库并成为 holding。
6. 吊销 token 后，已有和新建连接都不能继续调用；从非回环地址直接请求 `/mcp` 返回拒绝。

自动回归：

```bash
node --test server/tests/unit/mcpAccess.test.js server/tests/unit/mcpClientStore.test.js
node --test server/tests/integration/mcp.test.js
npm run test:protocol
```

## 五、前端体验回归

聊天能力频道回归：

1. 点击「加入聊天」，确认只出现一个聊天输入框；它接受裸聊天 ID 和完整 `/chat/#` 分享链接。
2. 确认弹窗自动生成 26 位、字符集为 `[a-z2-7]` 的 128 位随机 ID；点击输入框旁的随机按钮会重新生成，也允许输入 3-30 位自定义 ID。
3. 输入同一 ID 的不同大小写形式，确认都会规范为小写并进入同一聊天、同一 topic；随机 ID 会创建聊天，已有 ID 会加入对应聊天。
4. 在聊天设置复制分享链接，确认格式为当前 origin 加 `/chat/#<channelId>`，不出现 `?channel=`。
5. 刷新该链接或在新窗口直接打开，登录和节点就绪后应自动加入。
6. 两个节点加入同一 ID 后验证文本、附件和语音；加入不同 ID 的节点不应收到消息或进入同一 topic。
7. 明确安全边界：仅声明派生 topic 或发送错误、旧连接的证明时，不返回频道 metadata、writer core key 或 presence；完成绑定当前连接的原始频道 ID 持有证明后才同步。
8. 消息记录和语音信令不做应用层加密；知道频道 ID 的人、已加入 peer、daemon 和数据目录访问者均可读取明文，ID 泄露后需新建频道。

| 检查项       | 通过标准                                                                                            | 入口                                                    |
| ------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 节点首页     | 首页默认说明设备直接参与 P2P 网络，并展示文件、聊天、知识库和 Web3 四个独立入口；桌面端默认进入 `/` | `src/components/FeaturePortal.tsx`、`electron/main.js`  |
| 技术词降噪   | 普通用户首屏说“自己运行节点”和“设备直接参与网络”，不堆 Hyperswarm、Hyperdrive、CID 术语             | `README.md`、首页文案                                   |
| 能力频道     | 单一“加入聊天”入口；可输入 ID/链接或生成 128 位随机 ID；ID 不区分大小写；不宣称端到端加密           | `src/features/chat/ChatPage.tsx`、`src/lib/chatRoom.js` |
| 附件状态     | 聊天附件区分可下载、下载中、可预览、失败，并有重试入口                                              | `src/components/ChatAttachmentCard.tsx`                 |
| 文件库定位   | `/file/` 文案是文件库/传输管理，仍说明“下载者完成后会默认继续做种”                                  | `src/features/files/AppPage.tsx`                        |
| 下载前检测   | 无链接、错误协议、非法 CID、缺少 filename 都有本地提示                                              | `getDownloadLinkValidationMessage()`                    |
| 下载失败文案 | 超时、无 peer、同名冲突、权限错误、节点未初始化、服务端错误各有可读文案                             | `getDownloadCheckErrorMessage()`                        |
| 工具箱隔离   | `/note`、`/web3` 可独立打开，不是文件分享的前置条件                                                 | 首页工具箱、各独立页面                                  |
| 云盘误解清理 | 主应用不出现云端订单、赔付、付费保种市场叙事                                                        | `src/features`、`src/components`                        |

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

聊天和知识库入口的轻量回归：

```bash
npm run test:frontend
node --test server/tests/unit/noteVault.test.js server/tests/unit/accountBackup.test.js
```

构建前完整检查：

```bash
npm run typecheck
npm run typecheck:strict-router
npm run lint
npm run build
```

## 七、MVP 通过标准

| 场景         | 通过标准                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- |
| 本机节点首页 | 用户打开后第一路径是 `/`，能理解 MostBox 是自己运行的 P2P 节点，并能选择文件、聊天、知识库或 Web3 |
| P2P 消息     | 两个节点能凭同一频道 ID 收发消息，不同 ID 不互通；分享链接为 `/chat/#<channelId>`                 |
| 聊天附件     | 文件能作为聊天附件发送，接收方能下载、校验、预览                                                  |
| 下载后做种   | 接收方下载成功后自动成为新种子，holding 可见                                                      |
| daemon 重启  | 已持有 CID 自动恢复 join topic                                                                    |
| 发布者退出   | 至少一个下载者在线做种时，新下载者仍可完成下载                                                    |
| 知识库       | 能编辑和备份 Markdown，并以 `most://` CID 引用文件模块中的附件                                    |
| Web3         | Web3 工具箱独立存在，不成为聊天、文件或记录的前置条件                                             |

如果下载失败，优先检查：聊天双方是否加入同一房间、附件链接是否完整、发布者或下载者种子是否在线、端口和防火墙是否允许 P2P 连接、管理台日志中是否出现 `PEER_NOT_FOUND` 或 `INTEGRITY_ERROR`。

## 八、Alpha 前长测

这部分必须在真实机器上执行，不能只靠本地单测关闭。

| 场景       | 记录内容                                          | 通过标准                                   |
| ---------- | ------------------------------------------------- | ------------------------------------------ |
| 聊天收发   | 房间 ID、参与节点、消息时间、断线重连情况         | 双方能稳定收发，重连后继续同步             |
| 100MB 附件 | 文件大小、CID、发布节点、下载节点、耗时、校验结果 | 聊天发送、下载、校验、下载后做种全通过     |
| 1GB 附件   | 文件大小、CID、耗时、失败重试、日志摘要           | 下载和做种稳定；失败时错误可读             |
| 重启恢复   | 重启前 holding、重启后状态、join 耗时             | daemon 重启后自动 join 已持有 CID topic    |
| 发布者退出 | 发布者退出时间、剩余种子、后续下载者结果          | 至少一个下载者在线时，新下载者仍可完成下载 |
| 知识库编辑 | 笔记标题、内容、备份路径                          | 新建和编辑 Markdown 内容可用               |

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

Android Alpha 默认进入文件工具，并提供独立的本地知识库入口；文件协议不变量保持不变，真机仍以前台完整种子能力为基础验收。

| 检查项          | 通过标准                                                                                                              | 入口                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 节点入口        | 默认进入文件，底部依次显示“文件 / 知识库 / 传输”；点击顶部节点状态进入节点页                                          | Android App                    |
| 多语言          | 顶部语言按钮可切换简体中文、繁體中文和 English；标题、操作、状态及弹窗立即更新，重启后保留选择                        | Android App                    |
| P2P core        | Android 前台能启动真实 P2P core，并显示 ready 状态                                                                    | Android App                    |
| 附件/文件互通   | Android 与桌面节点能完成发布、下载、CID 校验和前台做种互通                                                            | Android App、桌面端            |
| holding 管理    | Android holding 删除只移除内部做种副本，不删除用户另存副本                                                            | Android App                    |
| 知识库数据边界  | Markdown 只保存在 App 文档目录，不依赖账号、云同步、Git、桌面/Web 知识库或 daemon                                     | Android App                    |
| 备份与还原      | 单篇使用 UTF-8 `.txt` 导出和导入，内容为 Markdown；节点页提供整库快照备份与还原，完整校验、确认后替换，失败保留原数据 | Android App、系统分享面板      |
| 知识库 CID 附件 | 笔记只保存 `most://` 引用；附件经确认、CID 校验和 holding 做种后才能交给其他应用打开                                  | Android App、桌面端            |
| 真机记录        | 内测记录写明设备、系统、网络、CID、知识库操作、耗时和日志摘要                                                         | `docs/mobile-android-alpha.md` |

推荐检查：

```bash
cd mobile/app
npm test
npm run typecheck
npm run bundle:android
npm run bundle:ios
npm run build
```

知识库的动态字体、明暗主题、键盘避让、未保存确认和附件传输仍需真机人工验收；单测不能替代 Android 网络、文件选择器、前台限制和系统分享行为。iOS 本轮只要求共享代码类型检查和 bundle 成功。

## 十、独立工具箱与知识库回归

| 检查项               | 通过标准                                                                                                                              | 入口                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 知识库定位文案       | README/界面文案明确知识库和账号本地备份不是 MostBox 文件云盘                                                                          | `README.md`、`src/features/note/NotePage.tsx`   |
| Markdown 明文存储    | 新建、读取和保存文章均直接使用普通 Markdown，不提供逐篇加密或公开/私密切换                                                            | `/note`、`NoteItem`                             |
| Git 本地版本管理     | 桌面知识库可初始化仓库、查看 Markdown diff、手动提交、浏览历史并按文件恢复，不依赖系统 Git                                            | `/note`、`/api/note-vault/git/*`                |
| 备份恢复             | 账号备份整体保持加密；本地导出、导入、账号不匹配和失败都有反馈                                                                        | `useAccountBackup()`                            |
| 单篇笔记迁移         | Android 和桌面端均可将单篇笔记导出为 UTF-8 `.txt` 并重新导入，文件内容保持原始 Markdown                                               | `KnowledgeBaseScreen.tsx`、`NotePage.tsx`       |
| 资源管理             | 新建、重命名、移动、删除文件夹、搜索不丢数据                                                                                          | `noteUtils`、`src/features/note/NotePage.tsx`   |
| 桌面 Markdown 笔记库 | Electron + 本地 daemon 自动使用 `Documents/MostBox/Notes/<登录地址>`；不同地址的 Markdown 和 Git 仓库相互隔离；Web 端仍使用 IndexedDB | `/note`、`/api/note-vault/*`                    |
| CID 边界             | `calculateNoteCid()` 只用于笔记 raw CID，不进入 `most://` 文件分享协议                                                                | `server/src/core/cid.js`、笔记测试              |
| Markdown CID 引用    | 图片和文件引用只保存标准 Markdown `most://<cid>?filename=...`；不保存本地路径或复制附件                                               | `/note`、`/api/publish`、`/api/download`        |
| 移动端本地知识库     | App 文档目录保存 UTF-8 `.md`；空目录不持久化；跨端单篇迁移使用 `.txt` Markdown，整库迁移使用版本化 JSON 快照                          | `mobile/app/src/features/knowledge/`            |
| 移动端快照导入       | 快照格式、版本、路径和重复项先完整校验；用户确认后完全替换，失败时回滚并保留导入前知识库                                              | `knowledgeRepository.ts`                        |
| 移动端附件确认       | 预览不自动加载 `most://` 图片；点击附件后才确认下载，CID 校验成功并加入 holding 后提供打开操作，失败不修改 Markdown                   | `KnowledgeBaseScreen.tsx`、`mobile/app/App.tsx` |
| Web3 独立            | 钱包、PEM、地址和签名工具不参与聊天、附件或知识库主流程                                                                               | `/web3/`                                        |

推荐检查：

```bash
node --test server/tests/unit/noteUtils.test.js server/tests/unit/accountBackup.test.js server/tests/unit/noteVault.test.js server/tests/unit/noteVaultRoutes.test.js server/tests/unit/noteGitRoutes.test.js
```

桌面 Markdown 笔记库最小闭环手动验收：

1. 启动 Electron 包或 `npm run electron:dev`，登录账号 A 后打开 `/note`；界面不应出现本地目录选择入口。
2. 新建并编辑一篇 Markdown；文件应写入 `Documents/MostBox/Notes/<账号 A 地址>`，外部编辑器可以直接读取保存后的内容。
3. 切换到账号 B；账号 A 的文件不应出现。在账号 B 下创建同名文件并初始化 Git，仓库应位于账号 B 的地址目录。
4. 切回账号 A；原文件与 Git 历史保持不变，不包含账号 B 的内容或提交。
5. 在普通 Web 浏览器打开 `/note`，原 IndexedDB 笔记行为保持不变。

Git 本地版本管理验收：

1. 在桌面知识库点击 Git，填写仅用于当前仓库的作者名称和邮箱并初始化；已有 Markdown 应显示为未提交变更。
2. 选择变更查看逐行 diff，填写提交说明并提交；提交完成后变更数归零，历史中出现对应 commit、作者和文件。
3. 外部修改、新建、移动或删除 `.md` 文件后重新打开 Git，状态应分别显示修改、新增或删除；目录内非 Markdown 文件不进入 MostBox 提交。
4. 在历史中选择文件并确认恢复；文件内容应回到所选 commit 的版本，`HEAD` 不移动，恢复结果作为新的未提交变更等待用户再次提交。
5. 仓库已有 staged 内容时，MostBox 必须拒绝提交并提示用户先用外部 Git 工具处理；`.git` 为文件或符号链接时必须拒绝操作。

Markdown 与 CID 附件联动验收：

1. 在笔记编辑模式点击附件按钮上传图片和普通文件；保存后检查 Markdown，内容应分别为 `![名称](most://<cid>?filename=...)` 和 `[名称](most://<cid>?filename=...)`，不得出现本地路径。
2. 在另一节点打开包含这些引用的笔记；图片应自动通过 P2P 下载、CID 校验后显示，普通文件在点击时下载并打开现有预览/另存为界面。
3. 下载完成后检查 holding 和 topic 状态，确认下载节点已经持续做种。
4. 关闭原发布节点，保留第二节点在线；第三节点打开同一引用，仍应完成下载、CID 校验和预览。
5. 对无种子、非法 CID 或完整性校验失败场景，确认 Markdown 原文保持不变且界面给出失败反馈；等待下载时可取消，无种子约 30 秒结束等待。

移动端本地知识库最小闭环手动验收：

1. 在 Android 新建、编辑并显式保存多级目录中的 Markdown；重启 App 后目录、内容和搜索结果保持一致，空目录不单独出现。
2. 修改笔记后切换标签、返回或打开其他笔记，必须先出现未保存确认；分别验证继续编辑和放弃修改。
3. 导入单篇 UTF-8 `.txt`，分别验证同名时取消、覆盖和生成副本；导出后由系统分享面板接收 `.txt`，文件内容保持原始 Markdown。
4. 备份整库 JSON，新增临时笔记后导入该备份，确认当前知识库被完全替换；再导入含非法路径、重复项和错误版本的备份，确认原数据不变。
5. 在编辑器发布图片和普通附件，Markdown 分别插入图片和链接语法；预览中点击附件必须先确认，不能由渲染器自动下载。
6. 下载附件并通过 CID 校验后确认 holding 正在做种且可交给其他应用打开；原发布者退出后，由移动端 holding 向第三节点继续传播同一 CID。
