# Most Box

跨平台 P2P 文件分享应用，支持 Windows、macOS、iOS 和 Android。

## 架构

本项目采用 **Monorepo** 结构：

```
most-box/
├── packages/
│   ├── core/              # 平台无关的 P2P 核心逻辑
│   │   └── (已发布为 @most-people/core on npm)
│   ├── desktop/           # Electron 桌面端 (Windows/macOS)
│   └── mobile/            # React Native 移动端 (iOS/Android)
├── package.json           # 根 package.json (workspaces 配置)
└── README.md
```

**依赖关系：**
- `core` 已发布到 npm (@most-people/core)
- `desktop` 和 `mobile` 通过 npm 依赖 @most-people/core
- 本地开发时通过 workspace 链接到 packages/core

### packages/core

核心 P2P 引擎，包含：
- Hyperswarm 网络发现
- Hyperdrive 文件存储
- IPFS UnixFS CID 计算
- 文件发布/下载逻辑
- 安全校验（路径遍历防护、文件大小限制、完整性校验）

**发布到 npm：**
```bash
cd packages/core
npm publish --access public
```

**特性：**
- 纯 Node.js 实现，无平台依赖
- 可在任何 Node.js 环境（Electron、React Native nodejs-mobile）中运行
- 已发布到 npm: [@most-people/core](https://www.npmjs.com/package/@most-people/core)

### packages/desktop

Electron 桌面应用，提供：
- Windows/macOS: 便携版 zip 压缩包
- 独立运行，无需安装

### packages/mobile

React Native 移动应用，提供：
- iOS App
- Android App
- 内嵌 Node.js 运行时（nodejs-mobile）

## 核心功能

1. **确定性 P2P 文件发布**：
   - 采用标准 IPFS UnixFS Chunking 算法对文件进行哈希计算，生成全球唯一的 **CID v1**。
   - 相同的文件无论谁发布，都会生成完全一致的 CID 链接（如：`most://bafybeig...`）。

2. **大文件流式传输**：
   - 支持 GB 级别超大文件的发布与下载，通过流式处理避免内存限制。

3. **完整性与安全校验**：
   - 下载完成后自动重新计算本地文件的 CID 并与链接比对，防止数据篡改。
   - 路径遍历防护、文件名清理、文件大小限制等安全措施。

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发

#### 核心模块

```bash
cd packages/core
npm test                # 运行测试
```

#### 桌面端

```bash
cd packages/desktop
npm run start           # 启动 Electron 开发模式
npm run package         # 打包为便携版文件夹
npm run zip             # 生成便携版 zip 压缩包
```

> 注意：@most-people/core 依赖通过 npm 安装，发布新版本时需先执行 `npm publish`

#### 移动端

移动端需要额外的原生开发环境配置。参见 `packages/mobile/README.md`。

```bash
# iOS (需要 macOS + Xcode)
cd packages/mobile
npm install
npx pod-install ios
npm run ios

# Android (需要 Android Studio)
cd packages/mobile
npm install
npm run android
```

## 技术栈

### 核心技术

- **Hyperswarm** - P2P 网络发现
- **Hyperdrive** - 分布式文件存储
- **Corestore** - Hypercore 存储管理
- **IPFS UnixFS Importer** - CID 计算

### 桌面端

- **Electron** - 桌面应用框架
- **Electron Forge** - 打包工具

### 移动端

- **React Native** - 跨平台移动应用框架
- **nodejs-mobile-react-native** - 嵌入式 Node.js 运行时

## 开发状态

| 平台 | 状态 | 备注 |
|------|------|------|
| packages/core | ✅ 完成 | 已发布 npm (@most-people/core) |
| packages/desktop | 🧪 测试中 | 便携版 zip 可用 |
| packages/mobile | 🚧 开发中 | - |

## 从 Pear 迁移

如果你从旧版本（基于 Pear Runtime）迁移到此版本：

1. **数据兼容性**：`most-box-storage` 目录格式保持兼容，可以直接使用。
2. **链接格式**：`most://<CID>` 格式保持不变。
3. **P2P 网络**：使用相同的 Hyperswarm 网络，新旧版本可以互通。

## 许可证

MIT