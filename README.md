# Most Box

Most Box 是一个基于 [Pear](https://pears.com) 运行时的点对点 (P2P) 文件共享应用。它结合了 Hypercore 协议栈的实时 P2P 传输能力和 IPFS 标准的内容寻址机制，实现安全、无服务器的文件发布与下载。

## 核心特性

1. **确定性 P2P 文件发布**：
   - 采用标准 IPFS UnixFS Chunking 算法对文件进行哈希计算，生成全球唯一的 **CID v1** (Content Identifier)。
   - 相同的文件无论谁发布，都会生成完全一致的 CID 链接（如：`most://bafybeig...`）。
   - 为每个发布的文件创建独立的 Hyperdrive，确保不同文件的 P2P 通道相互隔离。
2. **大文件流式传输**：
   - 支持 GB 级别超大文件的发布与下载，通过底层文件系统流（Stream）直接读写，绕过浏览器内存限制。
   - 提供拖拽识别与手动输入绝对路径的回退机制，解决现代浏览器对本地文件路径的权限限制。
3. **P2P 文件下载与安全校验**：
   - 接收端通过输入 `most://<CID>` 链接即可从 P2P 网络中寻找资源并下载。
   - 下载完成后，系统会自动重新计算本地文件的 UnixFS CID 并与链接进行比对，防止传输过程中的数据篡改。

## 技术栈

- **Pear**: P2P 应用运行时环境 (基于 Bare 和 Electron)。
- **Hyperswarm / Hyperdrive / Corestore**: Hypercore 协议栈，用于 P2P 节点发现、分布式文件存储和数据同步。
- **IPFS Stack**: `ipfs-unixfs-importer` 和 `multiformats`，用于生成与标准 IPFS 兼容的 UnixFS CID。

## 运行方法

确保已安装 Pear 运行时环境。

1. 安装依赖：

```bash
npm install
```

2. 启动应用（开发模式）：

```bash
npm start
```

## 注意事项

- **在线要求**：由于是纯 P2P 架构，**发布者必须保持在线**，下载者才能获取文件。如果发布者关闭应用，数据将无法访问（除非有其他节点已经完整同步了数据）。
- **数据存储**：应用会在本地 `./most-box-storage` 目录存储密钥和 P2P 缓存数据。如果遇到存储冲突（如旧版本数据不兼容），应用会自动清理旧数据并提示重启。

## 目录结构

- `index.js`: **主进程**。负责 P2P 网络连接、IPFS CID 计算、大文件流式读写、以及数据校验。
- `app.js`: **渲染进程**。负责 UI 交互、拖拽文件处理、剪贴板操作，通过 IPC 与主进程通信。
- `index.html`: 应用前端界面。
- `polyfills.js`: 针对 Pear/Bare 运行时缺失的 Node.js/Browser API（如 `crypto`, `TextDecoder`, `Event`）提供的全局兼容垫片。
- `shims/`: 包含手动重定向的模块垫片（如将 `crypto` 映射到 `bare-crypto`）。
