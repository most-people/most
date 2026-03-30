# MostBox

P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。

## 安装

```bash
npm i -g most-box
```

## 运行

```bash
most-box
```

浏览器访问 `http://127.0.0.1:1976`

## 开发

```bash
git clone https://github.com/your-username/most.git
cd most
npm install
npm run dev
```

## 三种访问场景

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

## 技术栈

- **Hyperswarm** — P2P 网络发现与连接
- **Hyperdrive** — 分布式文件存储
- **Corestore** — Hypercore 存储管理
- **IPFS UnixFS Importer** — CID 计算
- **Node.js HTTP** — 零依赖的 HTTP + WebSocket 服务

## 许可证

MIT
