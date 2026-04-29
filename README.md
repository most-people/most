# MostBox：你的数字魔盒

[![npm version](https://img.shields.io/npm/v/most-box)](https://npmjs.com/package/most-box)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。

## 为什么用 MostBox？

| 特性                | MostBox | 微信/QQ | 网盘 |
| ------------------- | ------- | ------- | ---- |
| 🔒 无需注册         | ✅      | ❌      | ❌   |
| 🚀 P2P直连，不限速  | ✅      | ❌      | 限流 |
| 💾 去中心化存储     | ✅      | ❌      | ❌   |
| 🌐 开源免费，自托管 | ✅      | ❌      |      |
| 📦 无限文件大小     | ✅      | ❌      | 限流 |

## 演示

在线体验：[Most.Box](https://Most.Box)

## 🚀 立即使用

### 方式一：npm 包（推荐）

打开终端，运行：

```bash
npx most-box@latest
```

> 使用 `@latest` 确保每次运行最新版本。

浏览器自动访问 **http://localhost:1976**

### 方式二：桌面客户端

前往 [Most.Box](https://Most.Box/download) 下载桌面客户端，支持 Windows、macOS 和 Linux。

## 需求

- Node.js >= 18 ([下载地址](https://nodejs.org))

## 开发

```bash
git clone <your-repo-url>
cd most
npm i
npm start
```

## 测试

```bash
npm test          # 运行全部测试
npm run test:unit # 只运行单元测试
```

## 访问场景

| 场景 | 命令                                       | 访问地址                  |
| ---- | ------------------------------------------ | ------------------------- |
| 本地 | `npx most-box`                             | `http://localhost:1976`   |
| 内网 | `set MOSTBOX_HOST=0.0.0.0 && npx most-box` | `http://<IP>:1976`        |
| 外网 | Caddy 反向代理                             | `https://your-domain.com` |

### 内网访问

```bash
set MOSTBOX_HOST=0.0.0.0
npx most-box
```

### 外网访问（Caddy）

```caddy
mostbox.example.com {
  reverse_proxy localhost:1976
}
```

## 核心功能

1. **确定性 P2P 文件发布**
   - 采用标准 IPFS UnixFS Chunking 算法计算 CID v1
   - 相同文件生成一致的 CID 链接

2. **大文件流式传输**
   - 支持 GB 级别超大文件的发布与下载

3. **完整性校验**
   - 下载完成后自动验证 CID，防止数据篡改

4. **自定义 most:// 链接**
   - 分享文件生成 `most://<cid>` 格式链接
   - 接收方通过链接直接下载，无需其他配置

5. **P2P 频道聊天**
   - 创建或加入频道，与朋友实时聊天
   - 消息通过 P2P 网络复制，服务器只是中转
   - 无需中心化服务器，去中心化聊天

6. **网络连通性测试**
   - 内置 Ping 工具检测 P2P 网络状态

## 常见问题

### 文件存储在哪里？

文件以 **P2P 方式** 存储在分享者和接收者的设备上。当文件被分享时，内容会被分片存储在 P2P 网络中。**没有中心化服务器**，真正实现去中心化。

### 如何分享文件给其他人？

1. 打开 MostBox Web 界面
2. 上传文件或文件夹
3. 点击「复制链接」获取 `most://<cid>` 链接
4. 将链接发送给接收者

### most:// 链接是什么？

`most://` 是 MostBox 自定义的协议链接，格式为 `most://<cid>`。接收方安装 MostBox 后，点击链接即可自动下载文件。

### 支持大文件吗？

支持。目前已测试通过 **GB 级别**的大文件传输，采用流式处理，内存占用低。

### 频道聊天是什么？

频道聊天是 MostBox 的 P2P 即时通讯功能：

- 创建一个频道（如 `alice` 或 `team-project`）
- 将频道名称分享给朋友
- 朋友加入后即可实时聊天
- 消息通过 P2P 网络加密传输，服务器只负责建立连接

### 如何使用频道聊天？

1. 点击左侧「频道」进入聊天页面
2. 点击「创建频道」创建新频道
3. 将频道名称分享给朋友
4. 朋友打开同一页面，输入频道名称加入
5. 开始聊天！

### 如何在其他设备上下载文件？

确保设备已安装 Node.js >= 18，然后运行：

```bash
npx most-box
```

浏览器访问 `http://localhost:1976`，输入链接即可下载。

或者前往 [Most.Box](https://Most.Box/download) 下载桌面客户端。

## 路线图

### v1.0（当前版本）

- ✅ P2P 文件上传与下载
- ✅ 确定性 CID 生成
- ✅ 大文件流式传输
- ✅ most:// 链接分享
- ✅ Web UI 界面
- ✅ P2P 频道聊天
- ✅ 去中心化彩票
- ✅ 网络连通性测试
- ✅ Electron 桌面客户端

### 长期规划

- [ ] 下载体验优化 - 检测是否可下载
- [ ] P2P 多人视频/语音通话
  - 基于 WebRTC 的端到端加密通话
  - 频道内一键发起通话
  - 屏幕共享与文字聊天
- [ ] 浏览器扩展
- [ ] 移动端支持（iOS/Android）

## 技术栈

- **前端**: React 19, Next.js 16, TypeScript, Zustand, Lucide React
- **后端**: Hono + @hono/node-server + WebSocket
- **P2P**: Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- **Web3**: ethers.js, Hardhat, Solidity, EIP-712
- **桌面**: Electron 41, electron-builder
- **测试**: Node.js built-in test runner

## CI/CD

发布新版本时，推送 tag 即可自动构建：

```bash
git tag v0.0.7
git push origin v0.0.7
```

触发后自动执行：
1. **npm 包发布** — 发布 `most-box` 到 npm registry
2. **Windows 打包** — 构建 `.exe` 安装包（x64 + arm64）
3. **macOS 打包** — 构建 `.dmg` 安装包（x64 + arm64）
4. **GitHub Release** — 创建 Release 并上传所有安装包

### 配置 Secrets

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret | 说明 |
|--------|------|
| `NPM_TOKEN` | npm 发布令牌（`npm token create` 生成） |

## 社区

- **GitHub Discussions**：[提出需求 & 技术讨论](../../discussions)
- **问题反馈**：[Github issues](../../issues)

## 许可证

MIT
