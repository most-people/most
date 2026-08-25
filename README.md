# MostBox：下载完成即接力做种的 P2P 文件分享

[![CI](https://github.com/most-people/most/actions/workflows/ci.yml/badge.svg)](https://github.com/most-people/most/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/most-people/most)](https://github.com/most-people/most/releases/latest)
[![npm version](https://img.shields.io/npm/v/most-box)](https://npmjs.com/package/most-box)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[下载客户端](https://most.box/download) · [在线入口](https://most.box) · [验收指南](docs/acceptance.md) · [P2P 风险红线](docs/p2p-risk-boundaries.md) · [ST 邀请集成](docs/st-chat-join-integration.md) · [参与贡献](CONTRIBUTING.md) · [问题讨论](https://github.com/most-people/most/discussions)

MostBox 不要求先把文件上传到中心化网盘。发布者发送一个 `most://` 链接，接收者从在线节点下载完整文件并重算 CID；校验通过后，接收者默认继续做种。

因此，原发布者退出后，只要仍有至少一个下载者在线，新的接收者就可以继续下载同一份内容。

```text
发布文件 -> most:// 链接 -> 下载并校验 CID -> 下载者继续做种 -> 接力传播
```

> CID 是 MostBox 唯一的内容身份。文件名和目录只用于展示与本地保存，不替代 CID 判断内容是否存在或可信。
>
> MostBox 不承诺永久保存或离线可用；可用性来自当前在线种子。知道 `most://` 链接的人即可尝试下载对应内容。
>
> 开发和上架边界见 [P2P 风险红线](docs/p2p-risk-boundaries.md)：MostBox 不做公开资源目录、内容搜索、推荐、官方种子库或侵权用途宣传。

## 验证核心闭环

1. 在两台设备上安装 [MostBox 客户端](https://most.box/download)，或运行 `npx most-box@latest`
2. 设备 A 发布一个文件并复制生成的 `most://` 链接
3. 设备 B 粘贴链接下载，确认 CID 校验通过并进入做种列表
4. 关闭设备 A；保持 B 在线，再用设备 C 下载同一链接

完整的本地回归步骤和通过标准见 [验收指南](docs/acceptance.md)。

## 核心能力与工具边界

| 入口   | 用户理解                                              | 协议边界                                        |
| ------ | ----------------------------------------------------- | ----------------------------------------------- |
| 文件   | 发布文件、复制 `most://` 链接、下载校验并持续做种     | `most://` + CID 校验 + 下载后做种               |
| 聊天   | 按频道 ID 打开聊天，以 `/chat/#<channelId>` 分享      | 频道 ID 即权限；Channel + WebSocket + Hypercore |
| 知识库 | 记录想法、整理 Markdown、保留 Git 历史并引用 P2P 文件 | Markdown + 本地 Git + `most://` CID 引用        |
| Web3   | 密钥、钱包和地址工具                                  | 独立工具箱，不是聊天、文件或知识库的前置条件    |

## 在线入口

在线 Web 入口：[MostBox](https://most.box)

> Web 入口只负责连接已有 MostBox 节点；要在本机发布、下载、校验和持续做种，优先使用桌面客户端，或在本机运行 `npx most-box@latest` 启动完整节点。

## 立即使用

### 方式一：桌面客户端（推荐）与 Android App

前往 [MostBox 下载页](https://Most.Box/download) 下载客户端，支持 Windows、macOS、Linux 和 Android。桌面端内置本地 MostBox 节点，提供完整 P2P 文件分享、下载校验和持续做种能力，无需单独安装 Node.js；Android 商店版聚焦用户主动的文件发布、`most://` 链接接收、CID 校验和前台做种。

### Android

iOS / Android 使用“P2P 核心端 + 平台 UI 壳”分层，并以文件传输工具身份准备应用商店分发。商店版不包含聊天、账号、广告、付费、Web3、公开内容目录或长期后台做种；下载必须由用户在确认页明确触发。Android 验收范围见 [docs/mobile-android-alpha.md](docs/mobile-android-alpha.md)，Google Play 提交清单见 [docs/google-play-submission.md](docs/google-play-submission.md)；iOS 真机验收范围见 [docs/mobile-ios-feasibility.md](docs/mobile-ios-feasibility.md)，App Store 提交清单见 [docs/app-store-submission.md](docs/app-store-submission.md)。

移动端工程入口以 `mobile/app/` 子包为准，Android 与 iOS 共享 React Native UI 和 Bare Worklet P2P 核心。仓库根目录不提供 `android:start`、`android:test` 或 `android:build` 包装脚本，本地开发、测试和打包命令统一在子包目录执行：

```bash
cd mobile/app
npm install
npm start      # 启动 Expo Dev Client 并打开 Android 真机/模拟器
npm test       # 运行移动端 CID、most://、P2P Ping 和 Bare Worklet IPC 测试
npm run typecheck
npm run build  # 生成内部 Alpha APK 和 SHA256 校验文件
npm run build:release # 使用永久 App Signing Key 生成 GitHub Release APK
npm run build:store # 使用永久 App Signing Key 生成应用商店 APK
npm run build:play # 使用独立 upload key 生成 Google Play AAB
```

Expo 57 移动端子包建议使用 Node.js >= 22.13。

### 方式二：npm 包

适合开发、自托管或临时启动本机节点。请先安装 Node.js >= 22.12，然后运行：

```bash
npx most-box@latest
```

> 使用 `@latest` 确保每次运行最新版本。

启动后在浏览器打开 **http://localhost:1976**

## 需求

- 使用桌面客户端：无需单独安装 Node.js。
- 使用 `npx most-box@latest` 或本地源码开发：建议 Node.js >= 22.12。当前 TanStack Start static prerender 前端和 Electron 43 开发/打包都建议 Node.js >= 22.12。
- MostBox Web 界面只连接已有节点；在线入口或单独打开的浏览器页面不会替你启动 P2P 节点。
- MostBox 会创建本地身份用于本机数据隔离和 API 签名；这不是云端注册账号。

## 开发

```bash
git clone https://github.com/most-people/most.git
cd most
npm i
npm start
npm run server
```

开发模式需要两个进程：`npm start` 启动 TanStack Start 前端，默认访问 `http://localhost:3000`；`npm run server` 启动本地 daemon，默认监听 `http://localhost:1976`。

## MCP（AI 客户端）

公开使用指南见 [MCP 文档](https://most.box/docs/mcp/)，交互式接口参考见
[OpenAPI 文档](https://most.box/docs/api/)。

先启动 MostBox daemon，在 `/admin/` 的“MCP 客户端”中创建凭证。每个凭证绑定当前
MostBox 身份、独立 scope、过期时间和允许发布的目录；token 只显示一次。Streamable HTTP
端点固定为 `http://127.0.0.1:1976/mcp`，只接受本机回环请求。

Codex 使用 Streamable HTTP：

```bash
export MOSTBOX_MCP_TOKEN='<管理台创建的 token>'
codex mcp add mostbox \
  --url http://127.0.0.1:1976/mcp \
  --bearer-token-env-var MOSTBOX_MCP_TOKEN
codex mcp list
```

Claude Desktop 使用 stdio，在 `claude_desktop_config.json` 的 `mcpServers` 中加入：

```json
{
  "mcpServers": {
    "mostbox": {
      "command": "npx",
      "args": ["-y", "most-box@latest", "mcp"],
      "env": {
        "MOSTBOX_URL": "http://127.0.0.1:1976",
        "MOSTBOX_MCP_TOKEN": "<管理台创建的 token>"
      }
    }
  }
}
```

VS Code 在用户配置或工作区 `.vscode/mcp.json` 中使用密码输入，避免把 token 提交到仓库：

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "mostbox-token",
      "description": "MostBox MCP token",
      "password": true
    }
  ],
  "servers": {
    "mostbox": {
      "type": "http",
      "url": "http://127.0.0.1:1976/mcp",
      "headers": {
        "Authorization": "Bearer ${input:mostbox-token}"
      }
    }
  }
}
```

源码运行 stdio 时，可将 `command` 改为 Node.js，`args` 设为 MostBox 仓库绝对路径下的
`server/cli.js` 和 `mcp`。完整 scope、工具合同、安全边界与验收矩阵见
[MCP 方案](docs/mcp.md)。客户端格式参考 [Codex MCP 配置](https://developers.openai.com/codex/mcp/)、
[VS Code MCP 配置](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) 和
[Anthropic MCP 文档](https://docs.anthropic.com/en/docs/mcp)。

## 项目结构

前端源码集中在 `src/`：

- `src/routes/`：TanStack Router file-based routes。`index.tsx` 保留路由关键配置，`index.lazy.tsx` 加载页面组件。
- `src/features/`：页面和业务实现，例如文件分享、聊天、知识库、管理台和 Web3 工具箱。
- `src/components/`：跨功能共享 UI。
- `src/hooks/`、`src/lib/`、`src/stores/`、`src/styles/`：共享 hooks、工具、状态和样式。
- `src/lib/i18n/messages/*.ts`：按域拆分的中英文文案 catalog，由 `src/lib/i18n/messages.ts` 聚合。
- `server/`：daemon、HTTP API、P2P 引擎和协议测试。
- `mobile/app/`：Android/iOS 移动端应用和共享 Bare Worklet P2P 核心。

## 测试与格式化

```bash
npm run format        # 格式化全仓文件
npm run lint          # 运行 ESLint
npm run test:frontend # 运行前端轻量回归
npm test              # 运行全部后端测试
npm run test:unit     # 只运行后端单元测试
npm run test:protocol # 运行 CID / 发布 / 下载 / P2P 接力协议回归

cd mobile/app
npm test              # 运行 Android 子包协议、P2P Ping 和 IPC 测试
```

## 访问场景

| 场景       | 方式                               | 访问地址                |
| ---------- | ---------------------------------- | ----------------------- |
| 本地       | 桌面客户端或 `npx most-box@latest` | `http://localhost:1976` |
| 局域网/NAS | 监听 `0.0.0.0`，仅信任家庭局域网   | `http://NAS-IP:1976`    |
| 远程管理   | SSH 隧道 + `/admin/`               | `http://localhost:1976` |
| 外网       | Caddy 反向代理                     | `https://your-domain`   |

### 飞牛 OS / NAS 局域网部署

飞牛 OS 自带 Docker，可以把 NAS 变成一台 24 小时在线的 MostBox 做种机。推荐使用官方 Docker 镜像，容器启动时不会再临时安装 npm 包或 Debian 依赖。

你只需要准备两样东西：

- 飞牛 OS 已安装并启用 Docker。
- 知道 NAS 的局域网地址，例如 `192.168.31.107`。如果你是通过 `http://192.168.31.107:5666/` 打开飞牛 OS，那么 NAS 地址就是 `192.168.31.107`。

部署步骤：

1. 打开飞牛 OS 桌面的 **Docker**。
2. 找到 **Compose**、**项目** 或 **创建项目** 入口。
3. 项目名填写 `mostbox`。
4. Compose 内容整段复制下面这一块。
5. 保存并启动项目。

```yaml
services:
  mostbox:
    image: ghcr.io/most-people/most-box:0.5.0
    container_name: mostbox
    network_mode: host
    restart: unless-stopped
    environment:
      HOME: /data
    volumes:
      - /vol1/docker/mostbox/home:/data
```

启动后，在同一局域网的电脑或手机浏览器打开：

```text
http://你的NAS地址:1976
```

例如你的飞牛地址是 `192.168.31.107`，就打开：

```text
http://192.168.31.107:1976
```

看到 MostBox 页面后，就可以在 NAS 上发布文件。发布后点击文件卡片上的分享按钮，在 CID 页面复制 `most://<cid>?filename=...` 链接发给别人；下载者运行自己的 MostBox，粘贴链接下载。你的 NAS 会继续在线做种，关闭浏览器页面也不影响容器做种。

首次从局域网打开 `/admin/` 时，需要先用本地身份登录并认领节点管理权限。认领信息保存在节点数据目录中；之后只有同一身份可以从局域网查看或修改管理配置。本机回环地址仍可用于恢复管理权限。

升级到新版本时，把 Compose 里的镜像 tag 改成新版本，然后重新拉取并启动：

```bash
docker compose pull
docker compose up -d
```

如果你之前用过旧的临时 `node + npx` 方案，且不需要保留旧数据，可以先停止项目并删除 `/vol1/docker/mostbox`，再按上面的 Compose 重新创建。

验证节点状态：

```bash
curl --noproxy "*" http://你的NAS地址:1976/api/node/status
```

常见问题：

- 页面打不开：先确认 Docker 项目状态是“运行中”，再确认访问的是 NAS 的局域网 IP 加 `:1976`。
- 镜像拉取失败：确认 NAS 能访问 `ghcr.io`，必要时只给 Docker 拉镜像配置代理；容器启动后不依赖 npm 或 apt。
- 数据目录：文件和节点数据保存在 NAS 的 `/vol1/docker/mostbox/home`，通常位于飞牛的第一个存储空间。
- 安全提醒：`--host 0.0.0.0` 是给家庭局域网使用的。不要在路由器里把 `1976` 端口直接暴露到公网；需要公网 Web 入口时，请使用 HTTPS 反向代理，并在管理台配置远程访问邀请码。

### 远程管理节点

MostBox 默认只监听 `127.0.0.1`，无需开放端口即可安全运行。

要管理部署在远程服务器上的节点，使用 SSH 隧道将服务器的 1976 端口转发到本地：

```bash
ssh -L 1976:127.0.0.1:1976 user@your-server
```

然后在本地浏览器打开 `http://localhost:1976/admin/` 即可管理远程节点。

### 外网访问（Caddy）

```caddy
mostbox.example.com {
  reverse_proxy localhost:1976
}
```

开放到公网时，在 `/admin/` 中配置邀请码，远程请求必须携带有效邀请码。

## 核心功能

1. **CID 优先的 P2P 文件发布**
   - 采用标准 IPFS UnixFS Chunking 算法计算 CID v1
   - 相同文件生成一致的 CID 链接
   - CID 决定做种 topic、Hyperdrive 存储 key 和下载校验结果；文件名变化不改变内容身份

2. **大文件流式传输**
   - 支持 GB 级别超大文件的发布与下载

3. **完整性校验**
   - 下载完成后自动验证 CID，防止数据篡改

4. **自定义 most:// 链接**
   - 分享文件生成 `most://<cid>` 格式链接
   - 接收方通过链接直接下载，无需其他配置

5. **P2P 频道聊天**
   - 默认创建 128 位、26 位小写 base32 随机频道 ID，也可使用 3-30 位自定义 ID；输入不区分大小写并统一转为小写
   - 通过 `/chat/#<channelId>` 分享，知道频道 ID 的人即可读取历史、发送消息和加入语音
   - peer 必须先完成绑定当前连接的频道 ID 挑战证明；仅知道派生 topic 不能获取频道 metadata 或 writer core key
   - 消息、附件和语音信令通过 P2P Channel 明文复制，不提供应用层端到端加密

6. **网络连通性测试**
   - 内置 Ping 工具检测 P2P 网络状态

7. **受控 MCP 接入**
   - Codex、Claude Desktop 和 VS Code 可读取节点与文件元数据，并按 scope 发布或下载
   - 本地文件发布受目录白名单约束，下载仍执行 CID 校验并在成功后默认做种

## 常见问题

### 文件存储在哪里？

文件以 **P2P 方式** 保存在分享者和接收者的设备上。每个做种节点都持有完整文件副本；MostBox 不会把文件集中上传到云端服务器。

### 如何分享文件给其他人？

1. 打开 MostBox 桌面客户端，或运行 `npx most-box@latest` 后打开本机 Web 界面
2. 使用本地身份登录
3. 上传文件或文件夹
4. 点击「复制链接」获取 `most://<cid>` 链接
5. 将链接发送给接收者

### most:// 链接是什么？

`most://` 是 MostBox 自定义的协议链接，完整格式为 `most://<cid>?filename=...`。CID 决定要下载和校验的内容；`filename` 只是建议展示名或本地保存路径。

### 为什么 Web 界面需要登录？

这里的登录是本地身份，不是云端账号注册。MostBox 用它隔离同一节点上的不同用户文件列表，并为本地 HTTP API 请求生成短期签名；知道 `most://` 链接的人仍然可以尝试下载对应 CID 内容。

### 本地账号备份和文件分享是什么关系？

知识库、笔记和账号备份仍属于独立工具箱能力；账号备份只导出到用户选择的本地文件，不会上传到 MostBox 官方服务器，也不会把 MostBox 发布的文件变成云盘内容。Markdown 可以用标准图片或链接语法保存 `most://<cid>?filename=...` 引用，例如 `![照片](most://<cid>?filename=photo.jpg)` 或 `[附件](most://<cid>?filename=file.pdf)`。附件仍由文件模块发布、下载、CID 校验和持续做种，不会复制进知识库目录。

### 支持大文件吗？

支持。目前默认单文件上限为 **10GB**，可在本地节点策略中调整；传输采用流式处理，内存占用低。

### 频道聊天是什么？

频道聊天是 MostBox 的 P2P 即时通讯功能：

- 可以生成 16 字节、26 位小写 base32 频道 ID
- 也可以输入 3-30 位字母、数字、下划线或连字符组成的自定义 ID；ID 不区分大小写并统一转为小写
- 分享链接固定为 `/chat/#<channelId>`，打开链接会自动加入频道
- 房间备注只保存在本地用于展示，不参与频道发现
- 消息通过 P2P Channel 明文复制，附件仍按 `most://` CID 下载和校验

频道 ID 是 bearer capability：peer 需要通过绑定当前连接双方公钥和随机挑战的持有证明，才能接收频道 metadata 和 writer core key；单独拿到派生 topic 不会被授权。知道原始 ID 仍拥有读取历史、发送消息和加入语音的能力。随机 ID 难以猜测，但自定义短 ID 的强度由创建者负责；ID 泄露后只能创建新频道。MostBox 不防拥有 daemon、数据目录访问权或已经加入频道的 peer 读取消息。

### 如何使用频道聊天？

1. 打开 `/chat/`，点击「加入聊天」
2. 弹窗会自动生成新的高熵 ID；也可输入已有聊天 ID/分享链接，或点击随机按钮重新生成
3. 点击「加入」；已有 ID 会加入对应聊天，新随机 ID 会创建聊天
4. 在聊天设置中复制 `/chat/#<channelId>` 分享链接
5. 开始发送文本、附件或加入语音

### 如何在其他设备上下载文件？

优先安装桌面客户端；桌面端内置完整 P2P 节点，无需 Node.js。

如果要用 npm 入口，请确保设备已安装 Node.js >= 22.12 后运行：

```bash
npx most-box@latest
```

浏览器访问 `http://localhost:1976`，输入链接即可下载。

在线 Web 入口只能连接已有节点；它本身不提供本机发布、下载校验或持续做种能力。

## 技术栈

- **前端**: React 19, Vite, TanStack Start static prerender, TanStack Router, TypeScript, Zustand, Lucide React
- **后端**: Hono + @hono/node-server + WebSocket
- **P2P**: Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- **桌面**: Electron 43, electron-builder
- **移动端**: Expo 57, React Native 0.86, react-native-bare-kit / Bare Worklet
- **测试**: Node.js built-in test runner

## CI/CD

发布前先完成发版提交，再推送 tag 触发自动构建。每次发版必须更新 `CHANGELOG.md`，并将版本号同步到根目录 `package.json` / `package-lock.json`、`mobile/app/package.json` / `mobile/app/package-lock.json`、`mobile/app/app.json` 和文档里的 Docker 示例 tag；`mobile/app/app.json` 的 Android `versionCode` 与 iOS `buildNumber` 也必须同步，例如 `0.4.8` 对应 `408`。Android APK 文件名虽然由发布 tag 驱动，但移动端子包版本和 Expo 可见版本也要每次一起更新。`npm run check:versions -- --tag vx.x.x` 会检查这些版本和移动端构建号；本地 iOS 原生工程存在时也会校验其版本，并由 `mobile/app` 下的 `npm run bundle:ios` 自动同步。

Expo Web 生产入口由 Cloudflare Pages 直接连接 `most-people/most` 仓库：production branch 为 `pre`，Root directory 为 `mobile/app`，Build command 为 `npm run build:web`，Build output directory 为 `web-dist`。推送到 `pre` 后由 Pages 自动构建并发布到 `https://app.most.box`，不使用 GitHub Actions 或 Cloudflare API Token。

### Code signing policy

MostBox 的 Windows 发布签名按 [代码签名政策](CODE_SIGNING_POLICY.md) 管理。项目正在申请 SignPath Foundation 开源代码签名；只有带有有效 Authenticode 签名的产物才会标记为已签名。Free code signing provided by SignPath.io, certificate by SignPath Foundation.

发布新版本：

```bash
# 更新版本文件并提交后
git tag -a vx.x.x -m "MostBox vx.x.x"
git push origin main vx.x.x
```

触发后自动执行：

1. **npm 包发布** — 发布 `most-box` 到 npm registry
2. **Windows 打包** — 分别构建 `.exe` 安装包（x64 / arm64）并上传 Release
3. **macOS 打包** — 构建 `.dmg` 安装包（x64 + arm64）并上传 Release
4. **Linux 打包** — 构建 `.AppImage` 安装包（x64 + arm64）并上传 Release
5. **Android 打包** — 使用固定的永久 App Signing Key 构建 Android `.apk` 和 SHA256 校验文件并上传 Release
6. **下载镜像** — 将 Release 资产同步到 Cloudflare R2，生成 `releases/latest.json`，并在新版本校验成功后删除旧版本安装包

GitHub Release 是可信备用源；下载页优先读取 R2 的 `releases/latest.json` 并使用 R2 下载链接。

### 配置 Secrets

R2 发布资产使用独立公开桶，默认 bucket 为 `most-box-releases`，默认公开域名为
`https://download.most.box`。该桶只存放公开的版本安装包和 manifest。
Release workflow 不设置 Infrequent Access，R2 对象保持默认 Standard 存储层，并在上传后用
`head-object` 校验存储层与缓存头。版本化安装包使用
`public, max-age=31536000, immutable`；`releases/latest.json` 使用
`public, max-age=60, stale-while-revalidate=300`。
R2 只保留最新版本：新版本安装包和 manifest 上传并校验成功后，Release workflow 会删除
`releases/` 下除当前版本目录和 `latest.json` 以外的对象。GitHub Release 仍保留历史版本，
可作为回退下载源。
桶级 CORS 是持久基础设施配置，只在规则变更时使用具备 `PutBucketCors` 权限的管理密钥运行
`npm run r2:cors`。Release workflow 不需要桶级管理权限，而是在上传完成后严格验证公开域名对
`https://most.box` 和 `https://most-people.com` 的 GET 与 OPTIONS 响应；也可以随时运行
`npm run r2:verify-cors` 复查当前配置。
新发版只在 manifest 和 R2 中发布当前系统可手动打开的 installer（Windows `.exe`、
macOS `.dmg`、Linux `.AppImage`、Android `.apk`），不再发布 updater / blockmap 资产。
需要临时复查线上对象时，可手动运行 GitHub Actions 的 `Verify R2 Release` workflow；
它复用仓库 R2 secrets 做只读 `head-object` 检查，不需要在本机输入 R2 密钥。

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret                              | 说明                                        |
| ----------------------------------- | ------------------------------------------- |
| `NPM_TOKEN`                         | npm 发布令牌（`npm token create` 生成）     |
| `MOSTBOX_ANDROID_KEYSTORE_BASE64`   | 永久 Android App Signing Key 的 Base64 内容 |
| `MOSTBOX_ANDROID_KEYSTORE_PASSWORD` | Android keystore 密码                       |
| `MOSTBOX_ANDROID_KEY_ALIAS`         | Android App Signing Key alias               |
| `MOSTBOX_ANDROID_KEY_PASSWORD`      | Android App Signing Key 密码                |
| `R2_ACCOUNT_ID`                     | Cloudflare 账户 ID                          |
| `R2_ACCESS_KEY_ID`                  | R2 S3 API Access Key ID                     |
| `R2_SECRET_ACCESS_KEY`              | R2 S3 API Secret Access Key                 |
| `R2_BUCKET`                         | 可选；默认 `most-box-releases`              |
| `R2_PUBLIC_BASE_URL`                | 可选；默认 `https://download.most.box`      |

下载页默认读取 `https://download.most.box/releases/latest.json`。部署环境可额外配置
`VITE_R2_PUBLIC_BASE_URL` 覆盖公开域名，或直接配置
`VITE_RELEASE_MANIFEST_URL` 指向指定的 `latest.json`。

## 社区

- **使用帮助与讨论**：[GitHub Discussions](https://github.com/most-people/most/discussions)
- **确认过的 Bug**：[GitHub Issues](https://github.com/most-people/most/issues)
- **参与开发**：[贡献指南](CONTRIBUTING.md)
- **支持范围**：[支持说明](SUPPORT.md)
- **安全问题**：[私密报告漏洞](https://github.com/most-people/most/security/advisories/new)
- **社区规范**：[贡献者公约](docs/CODE_OF_CONDUCT.md)

## 许可证

MIT
