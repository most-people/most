# MostBox MVP 收尾验收清单

> 用于关闭任务板中的主应用体验、管理台/daemon、Alpha 长测和独立工具箱回归。Quick Start 见 `docs/quick-start.md`。

## 一、主应用分享和下载体验

| 检查项       | 通过标准                                                                | 入口                                 |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------ |
| 发布成功文案 | 分享弹窗明确“本机在线时可下载，下载者完成后会默认继续做种”              | `app/app/page.tsx`                   |
| 下载前检测   | 无链接、错误协议、非法 CID、缺少 filename 都有本地提示                  | `getDownloadLinkValidationMessage()` |
| 下载失败文案 | 超时、无 peer、同名冲突、权限错误、节点未初始化、服务端错误各有可读文案 | `getDownloadCheckErrorMessage()`     |
| 工具箱隔离   | `/note`、`/web3`、`/chat` 可独立打开，不是发布或下载文件的前置条件      | 首页工具箱、各独立页面               |
| 云盘误解清理 | 主应用不出现云端订单、赔付、付费保种市场叙事                            | `app`、`components`                  |

推荐检查：

```bash
rg -n -e '云端订单|赔付|付费保种|保种市场' app components
npm run lint
```

## 二、管理台与 daemon

| 检查项       | 通过标准                                                                                   | 入口                                   |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| 安全策略     | 固定监听 `127.0.0.1:1976`，远程管理通过 SSH 隧道或反向代理 | `server/index.js`                      |
| 状态解释     | holding 显示 queued、joining、active、paused、error 对应中文状态                           | `formatSeedStatus()`                   |
| 日志可读     | 管理台展示时间、level、event、message，支持清空日志                                        | `/api/node/logs`、`app/admin/page.tsx` |
| 设置落盘     | 数据目录、容量上限、单文件上限保存后，API 和管理台能读回                                   | `/api/node/config`                     |
| holding 可见 | 发布或下载成功后，`/api/node/holdings` 与管理台都能看到 CID、大小、状态                    | `/api/node/holdings`                   |

推荐检查：

```bash
node --test --test-name-pattern "returns node status|saves daemon config and exposes policy locally|returns node logs and OpenAPI spec|lists node holdings after publish|creates a manual holding record" server/tests/integration/api.test.js
```

## 三、Alpha 前长测

这部分必须在真实机器上执行，不能只靠本地单测关闭。

| 场景       | 记录内容                                          | 通过标准                                   |
| ---------- | ------------------------------------------------- | ------------------------------------------ |
| 100MB 文件 | 文件大小、CID、发布节点、下载节点、耗时、校验结果 | 发布、下载、校验、下载后做种全通过         |
| 1GB 文件   | 文件大小、CID、耗时、失败重试、日志摘要           | 下载和做种稳定；失败时错误可读             |
| 重启恢复   | 重启前 holding、重启后状态、join 耗时             | daemon 重启后自动 join 已持有 CID topic    |
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

## 四、独立工具箱与笔记回归

| 检查项       | 通过标准                                                               | 入口                                    |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------- |
| 笔记定位文案 | README/界面文案明确笔记云备份只覆盖笔记数据，不是 MostBox 文件云盘     | `README.md`、`app/note/page.tsx`        |
| 私密笔记     | 未登录时不可解密；正确 Web3 账号登录后可阅读、编辑、重新保存           | `/note`、`mostEncode()`、`mostDecode()` |
| 备份恢复     | 云端缺失、冲突、失败、本地导入导出都有反馈                             | `useNoteBackupSync()`                   |
| 资源管理     | 新建、重命名、移动、删除文件夹、搜索不丢数据                           | `noteUtils`、`app/note/page.tsx`        |
| CID 边界     | `calculateNoteCid()` 只用于笔记 raw CID，不进入 `most://` 文件分享协议 | `server/src/core/cid.js`、笔记测试      |

推荐检查：

```bash
node --test server/tests/unit/noteUtils.test.js server/tests/unit/noteBackup.test.js
```
