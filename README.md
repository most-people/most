# MostBox

P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。

## 架构

```
most-box/
├── packages/
│   └── core/              # 守护进程 (HTTP API + P2P 引擎)
│       ├── server.js      # 入口：HTTP + WebSocket + 静态文件服务
│       ├── src/           # MostBoxEngine 核心引擎
│       └── public/        # 前端 UI
└── package.json
```

运行方式：`守护进程 (Core) + 浏览器客户端`。启动 Core 后自动打开浏览器访问 `http://127.0.0.1:1976`。

## 核心功能

1. **确定性 P2P 文件发布**
   - 采用标准 IPFS UnixFS Chunking 算法计算 CID v1
   - 相同文件生成一致的 CID 链接（如：`most://bafybeig...`）

2. **大文件流式传输**
   - 支持 GB 级别超大文件的发布与下载

3. **完整性校验**
   - 下载完成后自动验证 CID，防止数据篡改
   - 路径遍历防护、文件名清理、文件大小限制

## 快速开始

### 下载安装

1. 安装 [Node.js](https://nodejs.org/)（>= 18）
2. 从 [Releases](../../releases) 下载最新版本
3. 解压后双击 `start.bat` 启动
4. 浏览器自动打开 `http://127.0.0.1:1976`

### 从源码运行

```bash
npm install
npm start
```

### 开发模式

```bash
npm run dev
```

## 打包分发

### 桌面应用（Windows / macOS）

```bash
# 安装依赖
npm install

# 构建 Windows 安装包
npm run desktop:build:win

# 构建 macOS 安装包（仅在 macOS 上运行）
npm run desktop:build:mac
```

构建产物位于 `packages/desktop/dist/`：
- `MostBox-1.0.0-win.exe` — Windows NSIS 安装包
- `MostBox-1.0.0-mac.dmg` — macOS DMG 安装包

### 自动更新

桌面应用支持自动更新。发布新版本只需：

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 会自动构建并发布到 Releases。用户启动应用后会自动检测并下载更新。

### 传统打包（Node.js 运行时）

```bash
npm run build
```

生成 `packages/core/most-box.zip`，用户需安装 Node.js 环境。

## 技术栈

- **Hyperswarm** — P2P 网络发现与连接
- **Hyperdrive** — 分布式文件存储
- **Corestore** — Hypercore 存储管理
- **IPFS UnixFS Importer** — CID 计算
- **Node.js HTTP** — 零依赖的 HTTP + WebSocket 服务

## 许可证

MIT
