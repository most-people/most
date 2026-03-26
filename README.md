# MostBox

P2P 文件分享应用 for Windows.

## 架构

```
most-box/
├── packages/
│   └── desktop/           # Electron 桌面端 (包含核心引擎)
└── package.json
```

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

```bash
cd packages/desktop
npm run start           # 启动 Electron 开发模式
npm run package         # 打包为便携版文件夹
npm run zip             # 生成便携版 zip 压缩包
```

## 技术栈

- **Hyperswarm** - P2P 网络发现
- **Hyperdrive** - 分布式文件存储
- **Corestore** - Hypercore 存储管理
- **IPFS UnixFS Importer** - CID 计算
- **Electron** - 桌面应用框架

## 许可证

MIT
