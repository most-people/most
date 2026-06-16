# MostBox：你的数字魔盒

[![npm version](https://img.shields.io/npm/v/most-box)](https://npmjs.com/package/most-box)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。
>
> CID 是 MostBox 的文件身份：发布、做种、发现、下载和校验都围绕 CID 进行。文件名和目录只用于展示与本地保存路径，不作为内容是否存在或是否可信的依据。

## 为什么用 MostBox？

| 特性                | MostBox | 微信/QQ | 网盘 |
| ------------------- | ------- | ------- | ---- |
| 🔒 无需云端账号     | ✅      | ❌      | ❌   |
| 🚀 P2P直连，不限速  | ✅      | ❌      | 限流 |
| 💾 去中心化存储     | ✅      | ❌      | ❌   |
| 🌐 开源免费，自托管 | ✅      | ❌      |      |
| 📦 大文件分享       | ✅      | ❌      | 限流 |

## 演示

在线 Web 入口：[Most.Box](https://Most.Box)

> Web 入口只负责连接已有 MostBox 节点；要在本机发布、下载、校验和持续做种，优先使用桌面客户端，或在本机运行 `npx most-box@latest` 启动完整节点。

## 🚀 立即使用

### 方式一：桌面客户端（推荐）

前往 [Most.Box 下载页](https://Most.Box/download) 下载客户端，支持 Windows、macOS 和 Linux。桌面端内置本地 MostBox 节点，提供完整 P2P 文件分享、下载校验和持续做种能力，无需单独安装 Node.js。

### 方式二：npm 包

适合开发、自托管或临时启动本机节点。请先安装 Node.js >= 22.12，然后运行：

```bash
npx most-box@latest
```

> 使用 `@latest` 确保每次运行最新版本。

浏览器自动访问 **http://localhost:1976**

## 需求

- 使用桌面客户端：无需单独安装 Node.js。
- 使用 `npx most-box@latest` 或本地源码开发：建议 Node.js >= 22.12。当前 TanStack Start static prerender 前端和 Electron 42 开发/打包都建议 Node.js >= 22.12。
- MostBox Web 界面只连接已有节点；在线入口或单独打开的浏览器页面不会替你启动 P2P 节点。
- MostBox 会创建本地身份用于本机数据隔离和 API 签名；这不是云端注册账号。

## 开发

```bash
git clone <your-repo-url>
cd most
npm i
npm run dev
node server/index.js
```

开发模式需要两个进程：`npm run dev` 启动 TanStack Start 前端，默认访问 `http://localhost:3000`；`node server/index.js` 启动本地 daemon，默认监听 `http://localhost:1976`。

## 项目结构

前端源码集中在 `src/`：

- `src/routes/`：TanStack Router file-based routes。`index.tsx` 保留路由关键配置，`index.lazy.tsx` 加载页面组件。
- `src/features/`：页面和业务实现，例如文件分享、聊天、笔记、管理台、游戏和 Web3 工具箱。
- `src/components/`：跨功能共享 UI。
- `src/hooks/`、`src/lib/`、`src/stores/`、`src/styles/`：共享 hooks、工具、状态和样式。
- `src/lib/i18n/messages/*.ts`：按域拆分的中英文文案 catalog，由 `src/lib/i18n/messages.ts` 聚合。
- `server/`：daemon、HTTP API、P2P 引擎和协议测试。

## 测试

```bash
npm test          # 运行全部测试
npm run test:unit # 只运行单元测试
```

## 访问场景

| 场景       | 方式                                  | 访问地址                    |
| ---------- | ------------------------------------- | --------------------------- |
| 本地       | 桌面客户端或 `npx most-box@latest`    | `http://localhost:1976`     |
| 局域网/NAS | 监听 `0.0.0.0`，仅信任家庭局域网      | `http://NAS-IP:1976`        |
| 远程管理   | SSH 隧道 + `/admin/`                  | `http://localhost:1976`     |
| 外网       | Caddy 反向代理                        | `https://your-domain`       |

### 飞牛 OS / NAS 局域网部署

飞牛 OS 自带 Docker，可以把 NAS 变成一台 24 小时在线的 MostBox 做种机。普通用户建议直接用飞牛的 Docker 图形界面，不需要 SSH。

你只需要准备两样东西：

- 飞牛 OS 已安装并启用 Docker。
- 知道 NAS 的局域网地址，例如 `192.168.31.107`。如果你是通过 `http://192.168.31.107:5666/` 打开飞牛 OS，那么 NAS 地址就是 `192.168.31.107`。

部署步骤：

1. 打开飞牛 OS 桌面的 **Docker**。
2. 找到 **Compose**、**项目** 或 **创建项目** 入口。
3. 项目名填写 `mostbox`。
4. Compose 内容整段复制下面这一块，不需要改里面的命令。
5. 保存并启动项目。

```yaml
services:
  mostbox:
    image: node:22-bookworm-slim
    container_name: mostbox
    network_mode: host
    restart: unless-stopped
    volumes:
      - /vol1/docker/mostbox:/data
    working_dir: /data
    command: >
      sh -lc "if [ ! -e /usr/lib/x86_64-linux-gnu/libatomic.so.1 ]; then
      apt-get update &&
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libatomic1 ca-certificates &&
      rm -rf /var/lib/apt/lists/*;
      fi;
      mkdir -p /data/home /data/npm-cache &&
      chown -R 1000:1000 /data/home /data/npm-cache &&
      su node -s /bin/sh -c 'HOME=/data/home npm_config_cache=/data/npm-cache npm_config_audit=false npm_config_fund=false npx -y most-box@latest --host 0.0.0.0'"
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

常见问题：

- 页面打不开：先确认 Docker 项目状态是“运行中”，再确认访问的是 NAS 的局域网 IP 加 `:1976`。
- 日志里一直下载失败：可能是 NAS 访问 npm 或 Debian 软件源太慢，可以给 Docker 项目临时加代理。
- 数据目录：文件和节点数据保存在 NAS 的 `/vol1/docker/mostbox`，通常位于飞牛的第一个存储空间。
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

## 路线图

### v0.2.3（当前版本）

- ✅ P2P 文件上传与下载
- ✅ 确定性 CID 生成
- ✅ 大文件流式传输
- ✅ most:// 链接分享
- ✅ Web UI 界面
- ✅ P2P 频道聊天
- ✅ 网络连通性测试
- ✅ Electron 桌面客户端
- ✅ 下载体验优化 - 检测是否可下载

### 长期规划


- [ ] P2P 多人视频/语音通话
  - 基于 WebRTC 的端到端加密通话
  - 频道内一键发起通话
  - 屏幕共享与文字聊天
- [ ] 浏览器扩展
- [ ] 移动端支持（iOS/Android）

## 技术栈

- **前端**: React 19, Vite, TanStack Start static prerender, TanStack Router, TypeScript, Zustand, Lucide React
- **后端**: Hono + @hono/node-server + WebSocket
- **P2P**: Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- **桌面**: Electron 42, electron-builder
- **测试**: Node.js built-in test runner

## CI/CD

发布新版本时，推送 tag 即可自动构建：

```bash
git tag v0.2.3
git push origin v0.2.3
```

触发后自动执行：

1. **npm 包发布** — 发布 `most-box` 到 npm registry
2. **Windows 打包** — 分别构建 `.exe` 安装包（x64 / arm64）并上传 Release
3. **macOS 打包** — 构建 `.dmg` 安装包（x64 + arm64）并上传 Release
4. **Linux 打包** — 构建 `.AppImage` 安装包（x64 + arm64）并上传 Release
5. **下载镜像** — 将 Release 资产同步到 Cloudflare R2，并生成 `releases/latest.json`

GitHub Release 是可信备用源；下载页优先读取 R2 的 `releases/latest.json` 并使用 R2 下载链接。

### 配置 Secrets

R2 发布资产使用独立公开桶，默认 bucket 为 `most-box-releases`，默认公开域名为
`https://download.most.box`。不要复用 `api.most.box` 项目的 `most-box-backup` 备份桶。

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
