# Android 三节点真机验收记录（2026-09-12）

本轮完成两台服务器更新，以及 NAS、Android 真机、公网服务器之间的文件做种交接和聊天互通。文件交接两轮均通过，包含原发布者退出后、Android 重启后继续提供完整内容。此记录仅覆盖下列实测项目，不代表完整商店清单全部通过。

## 环境和部署

| 节点                         | 版本与运行方式                                                 | 更新后的正式做种记录                       |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `192.168.31.52`（N150）      | 0.5.0 → 0.5.2；systemd `mostbox.service`；Node 24.20.0         | 15 条，全部 active / joined                |
| `x.most.red`                 | 较早的 0.5.2 → 当前 0.5.2；PM2 `index`；Node 24.20.0           | 33 条，全部 active / joined                |
| Redmi K30S Ultra / M2007J3SC | Android 12 / API 31 / arm64；`most.box` 0.5.2，versionCode 502 | 本机 Bare Worklet，Wi-Fi，测试期间保持前台 |

- 服务器代码基于当前 `origin/pre` 的 `ff85cc7d3b2c08dd4df59f4a749cf2a753aee265`，并包含本轮孤立 holding 删除修复；`origin/main` 为较早的 `1b8d9a9`。
- 两台服务器共用本机构建的 npm 包；正式 release 为 `/opt/mostbox/releases/0.5.2-fix-20260912/node_modules/most-box`，保留旧 release 和原数据目录。
- npm 包 SHA-256：`1030a7d197bb5fb9dafff2000d6069e41430408dc9c7810519bcbe66948a1766`。
- Android 安装包：`mobile/app/dist/mostbox-android-0.5.2-release.apk`，包含本轮频道规范化、远程 multipart 发布和 Hermes CID fallback 修复。
- APK SHA-256：`a47bdf7a780def5e9792fb9feb8d21f73c932a161488ebe5274a25cec63d6a98`。
- NAS 配置与 metadata 备份：`/opt/mostbox/backups/20260912-211351`。
- 公网服务器配置与 metadata 备份：`/opt/mostbox/backups/pre-0.5.2-ff85cc7-20260912211520`。

正式节点健康检查和原有 holdings 恢复通过。测试使用独立的 `/opt/mostbox/acceptance/20260912-*` 数据目录，未把测试文件写入两台正式 daemon 的用户文件列表。

## 文件交接

测试 harness 动态加载新 release 的生产 `MostBoxEngine`，使用真实 Hyperswarm / Hyperdrive。SSH 只传递控制请求、链接和结果；文件内容通过 P2P 下载。测试内容含随机 nonce，避免旧种子或缓存提供相同 CID。每轮 verifier 使用全新数据目录，并在原测试发布进程正常退出后才启动。

| 路径                                                                                                            | 大小      | verifier 下载和独立重算耗时 | 结果                                       |
| --------------------------------------------------------------------------------------------------------------- | --------- | --------------------------- | ------------------------------------------ |
| NAS 发布 → Android 下载并做种 → NAS 测试发布者退出 → 公网 verifier 从 Android 下载                              | 65,536 B  | 5,799 ms                    | CID 一致；verifier holding active / joined |
| 公网发布 → Android 下载并做种 → 公网测试发布者退出 → Android 强制停止并重启 → 全新 NAS verifier 从 Android 下载 | 131,072 B | 4,686 ms                    | CID 一致；verifier holding active / joined |
| Android 系统选择器发布聊天附件 → 公网节点按附件链接下载                                                         | 1,882 B   | 850 ms                      | 与原始测试文件、链接及重算 CID 一致        |

第一轮文件 `nas-android-handoff-20260912.txt`：

```text
bafkreibud7udtm24tilzyrjavlpdloujut4267anioejcnou6svizkmtuy
```

第二轮文件 `x-android-handoff-20260912.txt`：

```text
bafkreighb5iijgvam77jdfzuvfem46nlnl74hxqzt7tvg7qska36rpz2ru
```

聊天附件 `MNATTACH.txt`：

```text
bafkreidu5tmzbesity5jb5g3jdize3v6is6kmvxuwjb2qispdso6xh3fbm
```

两轮 Android 深链均先展示文件名、CID 和“确认下载”，点击确认后才传输。下载后文件列表显示对应大小和“做种中”；第一轮节点日志显示 `Downloaded and seeding bafkreibud7udtm2`。发布者侧分别记录向 peer 提供 65,536 / 131,072 字节。第二轮原发布者退出后重启 Android，两个新文件仍显示做种中；后续 verifier 成功下载进一步确认 topic 和内容恢复可用。

verifier 在 `pullByCid` 成功后重新打开本地 Hyperdrive 内容流并调用 `calculateCid`，严格断言重算值等于链接 CID，再检查 holding 为 active / joined。

## 三端聊天

测试频道 `mncheck912`；Android 使用本机节点，两台服务器使用各自隔离的生产 engine。

- 两台服务器加入后均读到 Android 先前发送的 `ANDROIDCHECK`。
- NAS 发送 `NAS-LIVE-20260912`，公网节点发送 `X-LIVE-20260912`；Android 停留在频道页时实时显示两条消息，无需切换频道或手动刷新。
- Android 回复 `ANDROIDREPLY`，两台服务器均收到；四条测试文本在各服务器历史中各出现一次。
- Android 经系统文件选择器选取 `MNATTACH.txt`，自动发布并发送标准 `most://` 附件；两台服务器均收到相同附件 metadata，公网节点成功下载并独立校验。
- Android 重启后仍保留频道及本地消息。本轮在上一轮 `ABCDEF` → `#abcdef` 真机验证基础上，补足了规范化频道的跨节点持续收发证据。

## 远程节点和传输清单

- Android 通过 `http://192.168.31.52:1976` 连接 NAS，远程测试身份登录成功；节点页显示远程地址、账号地址和连接历史，并可切回本机。
- 初始 APK 的远程系统选择器发布失败，错误为 `Unsupported FormDataPart implementation`；修复后原生路径改用 `expo-file-system` multipart 上传。
- 初始远程 holding 保存失败，错误为 `Failed to calculate mobile CID: Property 'crypto' doesn't exist`；修复后在 Hermes 缺失 WebCrypto 时使用 `@noble/hashes` 的 SHA-256/SHA-512 fallback。
- 初始删除失败的原因是服务端删除逻辑只处理用户库记录，未处理孤立 holding；现已补齐 `DELETE /api/files/{cid}` OpenAPI 契约及孤立 holding 清理，并保留仍被其他记录引用的内容。

上述修复已通过移动端测试、服务端 API/OpenAPI 回归测试，并重新构建 APK。真机已安装该 APK，打开现有远程 holding 的“保存”后成功进入系统文件选择器，证明 Hermes CID fallback 已生效；远程频道语音信令的加入、静音和离开控制路径也已 smoke 验证。语音面板明确只交换信令，不采集麦克风音频。

## 证据和收尾

本机归档目录：`mobile/app/dist/multi-node-20260912/`（构建输出，不纳入 Git）。

| 证据                                                             | 内容                                               |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| `x-verifier-result.json`、`nas-verifier-result.json`             | 两轮独立重算 CID、耗时、holding 与 topic 状态      |
| `nas-publisher-state.json`、`x-publisher-state.json`             | 原发布者提供字节数、CID 与做种状态                 |
| `nas-publisher-stop.json`、`x-publisher-stop.json`               | 原测试发布者停止请求；对应 SSH 进程随后均以 0 退出 |
| `android-restarted-publishers-off.png` / `.xml`                  | 原发布者退出后 Android 重启，文件保持做种          |
| `chat-live-three-nodes.png` / `.xml`                             | Android 收到两台服务器实时消息                     |
| `nas-chat-attachment.json`、`x-chat-attachment.json`             | 三端文本和附件历史                                 |
| `chat-attachment-visible.png` / `.xml`、`x-attachment-pull.json` | Android 附件展示和公网独立校验结果                 |
| `nas-production-final.json`、`x-production-final.json`           | 正式服务最终健康状态与原有 holdings 数量           |

本轮临时测试进程均已正常退出，正式服务继续运行于新 release。测试数据目录和 Android 测试文件保留，便于复核。未观察到 Android crash buffer 中有崩溃记录。

前序验证：根项目测试 700 通过、1 跳过；移动端测试 164 通过；移动端 typecheck、根项目 lint 和 APK 构建通过。本轮修复后根项目测试 701 通过、1 跳过，移动端测试 101 个 TypeScript 与 64 个后端测试全部通过，并重新完成 Web 生产构建和 APK 打包部署。

## 未覆盖项和观察

- 本轮已覆盖 Android 连接 NAS、独立身份登录、远程 holding 查看、下载、取消和重试；未覆盖公网节点邀请码登录和跨节点 UI 切换的完整组合。
- 手机使用 Wi-Fi；未测试蜂窝网络、长时间熄屏/后台、超大文件与断点网络恢复。
- 真实音频、知识库完整导入导出、SAF 保存/删除和首次隐私同意流程不在本轮三节点结果中；语音信令 UI 仅在远程节点连接下提供。
- 初始验收发现聊天频道标签区域被拉高，约占据 `[431,1101]` 的纵向范围，压缩消息区；现已给横向频道 FlatList 加固定高度约束。
