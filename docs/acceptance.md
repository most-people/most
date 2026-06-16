# MostBox 验收指南

> 用最少步骤验证“发布文件 -> 复制 `most://` 链接 -> 下载者下载并校验 -> 下载者继续做种”的 MVP 闭环，并覆盖 daemon、管理台、Alpha 长测和独立工具箱回归。

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

| 入口   | 地址                                     | 用途                              |
| ------ | ---------------------------------------- | --------------------------------- |
| 主应用 | `http://localhost:3000/app/`             | 发布文件、复制链接、下载文件      |
| 管理台 | `http://localhost:3000/admin/`           | 查看节点状态、holding、容量和日志 |
| API    | `http://localhost:1976/api/openapi.json` | daemon HTTP API                   |

发布包路径：正式安装包从 `/download` 或 GitHub Releases latest 下载；本地构建使用 `npm run electron:build:win`、`npm run electron:build:mac` 或 `npm run electron:build:linux`。

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

## 二、发布者路径

1. 启动桌面端，或按上面的源码方式启动后打开 `/app/`。
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

## 三、下载者路径

1. 在另一台机器或另一个 MostBox 节点启动桌面端/daemon。
2. 打开 `/app/`，点击“下载文件”。
3. 粘贴发布者给出的 `most://` 链接。
4. 先检测链接可用性，再开始下载。
5. 下载完成后确认界面显示成功；该节点会自动写入 holding 并继续做种。

API 验证：

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

成功时，下载会重算 UnixFS CID v1；只有 CID 与链接一致才保存文件并加入做种列表。

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

| 检查项       | 通过标准                                                                                   | 入口                                   |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| 安全策略     | 固定监听 `127.0.0.1:1976`，远程管理通过 SSH 隧道或反向代理                                  | `server/index.js`                      |
| 状态解释     | holding 显示 queued、joining、active、paused、error 对应中文状态                            | `formatSeedStatus()`                   |
| 日志可读     | 管理台展示时间、level、event、message，支持清空日志                                         | `/api/node/logs`、`src/features/admin/AdminPage.tsx` |
| 设置落盘     | 数据目录、容量上限、单文件上限保存后，API 和管理台能读回                                    | `/api/node/config`                     |
| holding 可见 | 发布或下载成功后，`/api/node/holdings` 与管理台都能看到 CID、大小、状态                     | `/api/node/holdings`                   |
| CID 派生     | 手动 holding 的 topic 与 driveName 都必须由 CID digest 派生，传入不匹配值不能污染记录       | `server/src/index.js`                  |
| API 文档     | OpenAPI 同时包含节点管理、holding、P2P pull、发布、下载检测、下载和按 CID 读取文件路径      | `/api/openapi.json`                    |

推荐检查：

```bash
node --test --test-name-pattern "returns node status|saves daemon config and exposes policy locally|returns node logs and OpenAPI spec|lists node holdings after publish|creates a manual holding record|normalizes manual holding driveName from the CID" server/tests/integration/api.test.js
```

## 五、主应用体验回归

| 检查项       | 通过标准                                                                | 入口                                 |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------ |
| 发布成功文案 | 分享弹窗明确“本机在线时可下载，下载者完成后会默认继续做种”              | `src/features/files/AppPage.tsx`     |
| 下载前检测   | 无链接、错误协议、非法 CID、缺少 filename 都有本地提示                  | `getDownloadLinkValidationMessage()` |
| 下载失败文案 | 超时、无 peer、同名冲突、权限错误、节点未初始化、服务端错误各有可读文案 | `getDownloadCheckErrorMessage()`     |
| 工具箱隔离   | `/note`、`/web3`、`/chat` 可独立打开，不是发布或下载文件的前置条件      | 首页工具箱、各独立页面               |
| 云盘误解清理 | 主应用不出现云端订单、赔付、付费保种市场叙事                            | `src/features`、`src/components`     |

推荐检查：

```bash
rg -n -e '云端订单|赔付|付费保种|保种市场' src/features src/components
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

## 七、MVP 通过标准

| 场景        | 通过标准                                       |
| ----------- | ---------------------------------------------- |
| 发布者      | 能得到 `most://` 链接，管理台看到对应 holding  |
| 下载者      | 能凭链接下载，CID 校验通过，下载后自动做种     |
| daemon 重启 | 已持有 CID 自动恢复 join topic                 |
| 发布者退出  | 至少一个下载者在线做种时，新下载者仍可完成下载 |

如果下载失败，优先检查：链接是否完整、发布者或下载者种子是否在线、端口和防火墙是否允许 P2P 连接、管理台日志中是否出现 `PEER_NOT_FOUND` 或 `INTEGRITY_ERROR`。

## 八、Alpha 前长测

这部分必须在真实机器上执行，不能只靠本地单测关闭。

| 场景       | 记录内容                                          | 通过标准                                |
| ---------- | ------------------------------------------------- | --------------------------------------- |
| 100MB 文件 | 文件大小、CID、发布节点、下载节点、耗时、校验结果 | 发布、下载、校验、下载后做种全通过      |
| 1GB 文件   | 文件大小、CID、耗时、失败重试、日志摘要           | 下载和做种稳定；失败时错误可读          |
| 重启恢复   | 重启前 holding、重启后状态、join 耗时             | daemon 重启后自动 join 已持有 CID topic |
| 发布者退出 | 发布者退出时间、剩余种子、后续下载者结果          | 至少一个下载者在线时，新下载者仍可完成下载 |

记录模板：

```text
日期:
平台:
网络:
文件大小:
CID:
发布节点:
下载节点:
耗时:
结果:
失败错误:
管理台日志摘要:
```

## 九、独立工具箱与笔记回归

| 检查项       | 通过标准                                                               | 入口                                    |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------- |
| 笔记定位文案 | README/界面文案明确笔记云备份只覆盖笔记数据，不是 MostBox 文件云盘     | `README.md`、`src/features/note/NotePage.tsx` |
| 私密笔记     | 未登录时不可解密；正确 Web3 账号登录后可阅读、编辑、重新保存           | `/note`、`mostEncode()`、`mostDecode()` |
| 备份恢复     | 云端缺失、冲突、失败、本地导入导出都有反馈                             | `useNoteBackupSync()`                   |
| 资源管理     | 新建、重命名、移动、删除文件夹、搜索不丢数据                           | `noteUtils`、`src/features/note/NotePage.tsx` |
| CID 边界     | `calculateNoteCid()` 只用于笔记 raw CID，不进入 `most://` 文件分享协议 | `server/src/core/cid.js`、笔记测试      |

推荐检查：

```bash
node --test server/tests/unit/noteUtils.test.js server/tests/unit/noteBackup.test.js
```
