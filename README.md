# MostBox

[![npm version](https://img.shields.io/npm/v/most-box)](https://npmjs.com/package/most-box)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。

## 需求

- Node.js >= 18

## 安装

```bash
npm i -g most-box
```

## 快速开始

```bash
most-box
```

浏览器访问 `http://127.0.0.1:1976`

## 开发

```bash
git clone <your-repo-url>
cd most
npm install
npm run dev    # 开发模式（热重载）
```

## 测试

```bash
npm test          # 运行全部测试
npm run test:unit # 只运行单元测试
```

## 访问场景

| 场景 | 启动方式 | 访问地址 |
|------|----------|----------|
| 本地 | `most-box` | `http://127.0.0.1:1976` |
| 内网 | `set MOSTBOX_HOST=0.0.0.0 && most-box` | `http://<IP>:1976` |
| 外网 | Caddy 反向代理 | `https://your-domain.com` |

### 内网访问

```bash
set MOSTBOX_HOST=0.0.0.0
most-box
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

## 技术栈

- **Hyperswarm** — P2P 网络发现与连接
- **Hyperdrive** — 分布式文件存储
- **Corestore** — Hypercore 存储管理
- **IPFS UnixFS Importer** — CID 计算
- **Node.js HTTP** — 零依赖的 HTTP + WebSocket 服务
- **React** — Web UI

## 许可证

MIT