# MostBox

P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。

## 架构

```
most/
├── packages/
│   └── core/              # 前后端一体
│       ├── server.js      # 后端：HTTP API + WebSocket + P2P 引擎
│       ├── src/           # MostBoxEngine 核心引擎
│       ├── public/        # 前端 UI (React)
│       └── build.mjs      # 前端构建脚本
└── dist/
    └── MostBox.exe        # Windows 可执行文件
```

访问 `http://localhost:1976` 使用浏览器操作。

## 核心功能

1. **确定性 P2P 文件发布**
   - 采用标准 IPFS UnixFS Chunking 算法计算 CID v1
   - 相同文件生成一致的 CID 链接

2. **大文件流式传输**
   - 支持 GB 级别超大文件的发布与下载

3. **完整性校验**
   - 下载完成后自动验证 CID，防止数据篡改

## 安装使用

### 方式一：独立可执行文件（推荐）

1. 下载 `MostBox.exe`
2. 双击运行
3. 浏览器自动打开 `http://localhost:1976`

### 方式二：Node.js 环境

```bash
npm install
npm start
```

浏览器访问 `http://localhost:1976`

### 开发模式

```bash
npm run dev
```

## 打包

```bash
npm run package
```

生成 `dist/MostBox.exe`

## 三种访问场景

| 场景 | 启动方式 | 访问地址 |
|------|----------|----------|
| 本地 | 双击 MostBox.exe | `http://localhost:1976` |
| 内网 | `set MOSTBOX_HOST=0.0.0.0 && MostBox.exe` | `http://<IP>:1976` |
| 外网 | Caddy 反向代理 | `https://your-domain.com` |

### 内网访问

```bash
set MOSTBOX_HOST=0.0.0.0
MostBox.exe
```

### 外网访问（Caddy）

```caddy
mostbox.example.com {
  reverse_proxy localhost:1976
}
```

## 技术栈

- **Hyperswarm** — P2P 网络发现与连接
- **Hyperdrive** — 分布式文件存储
- **Corestore** — Hypercore 存储管理
- **IPFS UnixFS Importer** — CID 计算
- **Node.js HTTP** — 零依赖的 HTTP + WebSocket 服务

## 许可证

MIT
