# MostBox DChat 验收指南

本文件验证当前版本的主线：**P2P 频道聊天为本、`most://` 文件传输为辅**。MostBox 不提供云端消息或文件存储；可用性来自在线节点。

## 当前入口

| 入口      | 用途                                         |
| --------- | -------------------------------------------- |
| `/chat/`  | 创建或加入频道、发送消息、查看历史、发送附件 |
| `/file/`  | 发布文件、接收 `most://` 链接、查看做种列表  |
| `/admin/` | 节点、做种、日志和远程连接状态               |
| `/web3/`  | 独立的本地账户、密钥和钱包工具               |

根路径 `/` 默认进入 `/chat/`；营销页 `/hi/` 说明 DChat 定位。旧 `/note/` 路由和 `/api/note-vault/*` 接口不存在。

## 最小聊天验收

1. 启动节点：`npm run server`，再打开 `http://localhost:3000/`。
2. 确认根路径进入聊天，三种语言都显示“去中心化聊天与文件传输”定位。
3. 创建频道，复制 `/chat/#<channelId>` 邀请链接；另一浏览器或另一节点加入。
4. 双向发送文本，确认消息顺序、发送者和时间正确。
5. 刷新页面、断开再连接，确认频道历史仍可读取。
6. 发送一条聊天附件，确认消息中出现 `most://` 链接，文件可打开下载确认流程。
7. 使用不支持聊天的墨盒配置时，默认入口仍为文件页，页面不为空。

## 文件与接力验收

1. 节点 A 发布文件并复制 `most://<cid>?filename=...`。
2. 节点 B 粘贴链接，确认下载前有确认步骤，完成后 CID 校验通过并加入 holding。
3. 确认 B 的做种状态为 active，重启 B 后重新 join 对应 CID topic。
4. 退出 A，保持 B 在线，让节点 C 使用同一链接下载并通过 CID 校验。
5. 文件名只用于展示，已有判断、Hyperdrive 路径和完整性校验都以 CID 为准。

## 数据删除与备份迁移

- Web 首次启动删除旧 `mostbox` IndexedDB、`mostbox.chatNoteDraft.*` 和 Expo Web 知识库键。
- Electron 首次启动删除 `Documents/MostBox/Notes`，路径固定在 Documents/MostBox 内，不跟随越界路径。
- Android/iOS 首次启动删除应用文档目录中的 `mostbox-knowledge` 及导入临时目录。
- 清理失败只记录日志并在下次启动重试，不阻塞聊天或文件功能；其他身份、频道、文件和做种数据必须保留。
- 新备份不含 `notes`、`noteVault`；导入旧备份时丢弃这两个字段，其他账户数据仍可恢复。
- 账号错误、密码错误、ownerAddress 不匹配仍必须拒绝导入。

## 自动检查

根项目：

```bash
npm run typecheck
npm run typecheck:strict-router
npm run lint
npm run test:frontend
npm run test:desktop
npm run test:protocol
npm test
npm run build
npm run check:static-output
npm run format:check
```

移动端：

```bash
cd mobile/app
npm run typecheck
npm test
npm run bundle:android
npm run bundle:ios
npm run build
```

## Android 真机记录

在已连接 Android 真机上验证：

- 设备 `14cdba73` 安装 `mostbox-android-0.5.3-release.apk`（versionCode 503，SHA256 `a758c39412c1c5cf538549dd1e2137246679a39823883a824c0769073735e225`）。
- 启动后默认进入聊天，底部顺序为聊天、文件、传输；节点页和 Web3 入口仍可打开。
- 重启应用后重新打开 `#abcdef`，历史消息仍在；发送文本 `123456` 成功。
- 通过系统文件选择器发送 `codex-gap-current.xml`，消息出现 `most://` 链接；文件页显示 CID 文件处于“做种中”，详情页显示 topic 已加入并发现 peer。
- 旧目录清理的失败重试、空目录、相邻文件保留和符号链接边界由自动测试覆盖；三节点文件接力与聊天传播由根项目协议测试覆盖。

iOS 本轮完成共享 TypeScript 检查和 bundle；未进行 iOS 真机与原生安装验收。
