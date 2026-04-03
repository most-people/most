# MostBox 文件管理

[![npm version](https://img.shields.io/npm/v/most-box)](https://npmjs.com/package/most-box)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> P2P 文件分享应用。基于 Hyperswarm/Hyperdrive 的去中心化文件分发。

## 为什么用 MostBox？

| 特性                | MostBox | 微信/QQ | 网盘 |
| ------------------- | ------- | ------- | ---- |
| 🔒 无需注册         | ✅      | ❌      | ❌   |
| 🚀 P2P直连，不限速  | ✅      | ❌      | 限流 |
| 💾 去中心化存储     | ✅      | ❌      | ❌   |
| 🌐 开源免费，自托管 | ✅      | ❌      | ❌   |
| 📦 无限文件大小     | ✅      | ❌      | 限流 |

## 演示

在线体验：[Most.Box](https://Most.Box)

## 🚀 立即使用

打开终端，运行：

```bash
npx most-box
```

浏览器自动访问 **http://127.0.0.1:1976**

## 需求

- Node.js >= 18 ([下载地址](https://nodejs.org))

## 开发

```bash
git clone <your-repo-url>
cd most
npm i
npm start
```

## 测试

```bash
npm test          # 运行全部测试
npm run test:unit # 只运行单元测试
```

## 访问场景

| 场景 | 命令                                       | 访问地址                  |
| ---- | ------------------------------------------ | ------------------------- |
| 本地 | `npx most-box`                             | `http://127.0.0.1:1976`   |
| 内网 | `set MOSTBOX_HOST=0.0.0.0 && npx most-box` | `http://<IP>:1976`        |
| 外网 | Caddy 反向代理                             | `https://your-domain.com` |

### 内网访问

```bash
set MOSTBOX_HOST=0.0.0.0
npx most-box
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

## 常见问题

### 文件存储在哪里？

文件以 **P2P 方式** 存储在分享者和接收者的设备上。当文件被分享时，内容会被分片存储在 P2P 网络中。**没有中心化服务器**，真正实现去中心化。

### 如何分享文件给其他人？

1. 打开 MostBox Web 界面
2. 上传文件或文件夹
3. 点击「复制链接」获取 `most://<cid>` 链接
4. 将链接发送给接收者

### most:// 链接是什么？

`most://` 是 MostBox 自定义的协议链接，格式为 `most://<cid>`。接收方安装 MostBox 后，点击链接即可自动下载文件。

### 支持大文件吗？

支持。目前已测试通过 **GB 级别**的大文件传输，采用流式处理，内存占用低。

### 如何在其他设备上下载文件？

确保设备已安装 Node.js >= 18，然后运行：

```bash
npx most-box
```

浏览器访问 `http://127.0.0.1:1976`，输入链接即可下载。

## 路线图

### v1.0（当前版本）

- ✅ P2P 文件上传与下载
- ✅ 确定性 CID 生成
- ✅ 大文件流式传输
- ✅ most:// 链接分享
- ✅ Web UI 界面

### 长期规划

- [ ] 浏览器扩展
- [ ] 移动端支持（iOS/Android）
- [ ] 桌面客户端

## 技术栈

- **Hyperswarm** — P2P 网络发现与连接
- **Hyperdrive** — 分布式文件存储
- **Corestore** — Hypercore 存储管理
- **IPFS UnixFS Importer** — CID 计算
- **Node.js HTTP** — 零依赖的 HTTP + WebSocket 服务
- **React** — Web UI

## 社区

- **微信**：微信号 `most-box`（自动通过好友申请）
- **GitHub Discussions**：[提出需求 & 技术讨论](../../discussions)
- **问题反馈**：[Github issues](../../issues)

## 许可证

MIT
