# MostBox：普通人能运行的 P2P 节点

[![npm version](https://img.shields.io/npm/v/most-box)](https://npmjs.com/package/most-box)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> MostBox 是一个用户自己运行的 P2P 节点，通过简单的本地界面提供文件分享、通信和个人工具；它不要求用户加入某个平台，而是让设备直接参与网络。
>
> 真正有价值的不是“又一个聊天软件”或“又一个网盘”，而是把 P2P 能力压缩成普通人能完成的流程：安装 -> 打开 -> 分享 `most://` 链接。
>
> 文件分享使用 `most://` 链接、CID 校验和下载后做种；聊天、知识库、游戏和 Web3 保持独立工具属性，不互相充当前置条件。
>
> CID 是 MostBox 的文件身份：发布、做种、发现、下载和校验都围绕 CID 进行。文件名和目录只用于展示与本地保存路径，不作为内容是否存在或是否可信的依据。

## 为什么用 MostBox？

| 入口   | 用户理解                                          | 协议边界                                         |
| ------ | ------------------------------------------------- | ------------------------------------------------ |
| 文件   | 发布文件、复制 `most://` 链接、下载校验并持续做种 | `most://` + CID 校验 + 下载后做种                |
| 聊天   | 创建聊天或房间，分享房间 ID 给朋友                | Channel + WebSocket + Corestore/Hypercore        |
| 知识库 | 记录想法、整理 Markdown 内容和本地资料            | `/note/` 保留现有本地笔记库能力                  |
| 游戏   | 独立游戏页面和房间                                | `game.*` channel 事件，不新增独立后端协议        |
| Web3   | 密钥、钱包和地址工具                              | 独立工具箱，不是聊天、文件、知识库或游戏前置条件 |

## 演示

在线 Web 入口：[MostBox](https://Most.Box)

> Web 入口只负责连接已有 MostBox 节点；要在本机发布、下载、校验和持续做种，优先使用桌面客户端，或在本机运行 `npx most-box@latest` 启动完整节点。

## 🚀 立即使用

### 方式一：桌面客户端（推荐）与 Android Alpha

前往 [MostBox 下载页](https://Most.Box/download) 下载客户端，支持 Windows、macOS、Linux 和 Android Alpha。桌面端内置本地 MostBox 节点，提供完整 P2P 文件分享、下载校验和持续做种能力，无需单独安装 Node.js；Android Alpha APK 目前聚焦前台 P2P 能力：收发消息、用 `most://` 附件传文件、下载校验并继续做种。

### Android Alpha

移动端优先按 Android 前台完整种子 Alpha 推进，参考 Keet/Pear 的“P2P 核心端 + 平台 UI 壳”分层：手机端先验证自己能加入聊天、收发消息、用 `most://` 附件传文件、下载校验并在前台继续做种，再扩展后台能力、iOS 和商店分发。当前内测验收范围见 [docs/mobile-android-alpha.md](docs/mobile-android-alpha.md)。

Android 工程入口以 `mobile/android/` 子包为准，仓库根目录不提供 `android:start`、`android:test` 或 `android:build` 包装脚本。本地开发、测试和打包命令统一在子包目录执行：

```bash
cd mobile/android
npm install
npm start      # 启动 Expo Dev Client 并打开 Android 真机/模拟器
npm test       # 运行移动端 CID、most://、Channel 和 Bare Worklet IPC 测试
npm run build  # 生成内部 Alpha APK 和 SHA256 校验文件
```

### 方式二：npm 包

适合开发、自托管或临时启动本机节点。请先安装 Node.js >= 22.12，然后运行：

```bash
npx most-box@latest
```

> 使用 `@latest` 确保每次运行最新版本。

启动后在浏览器打开 **http://localhost:1976**

## 需求

- 使用桌面客户端：无需单独安装 Node.js。
- 使用 `npx most-box@latest` 或本地源码开发：建议 Node.js >= 22.12。当前 TanStack Start static prerender 前端和 Electron 42 开发/打包都建议 Node.js >= 22.12。
- MostBox Web 界面只连接已有节点；在线入口或单独打开的浏览器页面不会替你启动 P2P 节点。
- MostBox 会创建本地身份用于本机数据隔离和 API 签名；这不是云端注册账号。

## 开发

```bash
git clone https://github.com/most-people/most.git
cd most
npm i
npm run dev
node server/index.js
```

开发模式需要两个进程：`npm run dev` 启动 TanStack Start 前端，默认访问 `http://localhost:3000`；`node server/index.js` 启动本地 daemon，默认监听 `http://localhost:1976`。

## 项目结构

前端源码集中在 `src/`：

- `src/routes/`：TanStack Router file-based routes。`index.tsx` 保留路由关键配置，`index.lazy.tsx` 加载页面组件。
- `src/features/`：页面和业务实现，例如文件分享、聊天、知识库、管理台、游戏和 Web3 工具箱。
- `src/components/`：跨功能共享 UI。
- `src/hooks/`、`src/lib/`、`src/stores/`、`src/styles/`：共享 hooks、工具、状态和样式。
- `src/lib/i18n/messages/*.ts`：按域拆分的中英文文案 catalog，由 `src/lib/i18n/messages.ts` 聚合。
- `server/`：daemon、HTTP API、P2P 引擎和协议测试。
- `mobile/android/`：Android Alpha 应用和 Bare Worklet P2P 核心。

## 测试与格式化

```bash
npm run format        # 格式化全仓文件
npm run lint          # 运行 ESLint
npm run test:frontend # 运行前端轻量回归
npm test              # 运行全部后端测试
npm run test:unit     # 只运行后端单元测试
npm run test:protocol # 运行 CID / 发布 / 下载 / P2P 接力协议回归

cd mobile/android
npm test              # 运行 Android 子包协议、Channel 和 IPC 测试
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
    image: ghcr.io/most-people/most-box:0.4.0
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

看到 MostBox 页面后，就可以在 NAS 上发布文件。发布后复制生成的 `most://<cid>?filename=...` 链接发给别人；下载者运行自己的 MostBox，粘贴链接下载。你的 NAS 会继续在线做种，关闭浏览器页面也不影响容器做种。

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
   - 创建或加入频道，与朋友实时聊天
   - 消息通过 P2P 网络复制，服务器只是中转
   - 无需中心化服务器，去中心化聊天

6. **网络连通性测试**
   - 内置 Ping 工具检测 P2P 网络状态

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

### 知识库云备份和文件分享是什么关系？

知识库、笔记和账号备份属于独立工具箱能力；云备份只覆盖对应工具箱数据，不会把 MostBox 发布的文件上传成云盘，也不参与 `most://` 文件下载、CID 校验或做种传播闭环。

### 支持大文件吗？

支持。目前默认单文件上限为 **10GB**，可在本地节点策略中调整；传输采用流式处理，内存占用低。

### 频道聊天是什么？

频道聊天是 MostBox 的 P2P 即时通讯功能：

- 创建一个频道（如 `alice` 或 `team-project`）
- 将频道名称分享给朋友
- 朋友加入后即可实时聊天
- 消息通过 P2P 通道复制，服务器或节点只负责连接与同步

### 如何使用频道聊天？

1. 点击左侧「频道」进入聊天页面
2. 点击「创建频道」创建新频道
3. 将频道名称分享给朋友
4. 朋友打开同一页面，输入频道名称加入
5. 开始聊天！

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
- **桌面**: Electron 42, electron-builder
- **移动端**: Expo 56, React Native 0.85, react-native-bare-kit / Bare Worklet
- **测试**: Node.js built-in test runner

## CI/CD

发布前先完成发版提交，再推送 tag 触发自动构建。版本号必须同步到根目录 `package.json` / `package-lock.json`、`mobile/android/package.json` / `mobile/android/package-lock.json`、`mobile/android/app.json` 和文档里的 Docker 示例 tag；Android APK 文件名虽然由发布 tag 驱动，但 Android 子包版本和 Expo 可见版本也要每次一起更新。

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
5. **Android 打包** — 构建 Android Alpha `.apk` 和 SHA256 校验文件并上传 Release
6. **下载镜像** — 将 Release 资产同步到 Cloudflare R2，并生成 `releases/latest.json`

GitHub Release 是可信备用源；下载页优先读取 R2 的 `releases/latest.json` 并使用 R2 下载链接。

### 配置 Secrets

R2 发布资产使用独立公开桶，默认 bucket 为 `most-box-releases`，默认公开域名为
`https://download.most.box`。不要复用 `api.most.box` 项目的 `most-box-backup` 备份桶。
Release workflow 不设置 Infrequent Access，R2 对象保持默认 Standard 存储层，并在上传后用
`head-object` 校验存储层与缓存头。版本化安装包使用
`public, max-age=31536000, immutable`；`releases/latest.json` 使用
`public, max-age=60, stale-while-revalidate=300`。
新发版只在 manifest 和 R2 中发布当前系统可手动打开的 installer（Windows `.exe`、
macOS `.dmg`、Linux `.AppImage`、Android `.apk`），不再发布 updater / blockmap 资产。
需要临时复查线上对象时，可手动运行 GitHub Actions 的 `Verify R2 Release` workflow；
它复用仓库 R2 secrets 做只读 `head-object` 检查，不需要在本机输入 R2 密钥。

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret                 | 说明                                    |
| ---------------------- | --------------------------------------- |
| `NPM_TOKEN`            | npm 发布令牌（`npm token create` 生成） |
| `R2_ACCOUNT_ID`        | Cloudflare 账户 ID                      |
| `R2_ACCESS_KEY_ID`     | R2 S3 API Access Key ID                 |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API Secret Access Key             |
| `R2_BUCKET`            | 可选；默认 `most-box-releases`          |
| `R2_PUBLIC_BASE_URL`   | 可选；默认 `https://download.most.box`  |

下载页默认读取 `https://download.most.box/releases/latest.json`。部署环境可额外配置
`VITE_R2_PUBLIC_BASE_URL` 覆盖公开域名，或直接配置
`VITE_RELEASE_MANIFEST_URL` 指向指定的 `latest.json`。

## 社区

- **GitHub Discussions**：[提出需求 & 技术讨论](../../discussions)
- **问题反馈**：[Github issues](../../issues)

## 许可证

MIT
