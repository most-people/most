# Most.Box

## 项目概述

P2P 文件分享应用，基于 Hyperswarm/Hyperdrive 网络。用户上传文件后生成分享链接，接收方通过 P2P 网络下载。

## 技术栈

- **前端**: React 19, Next.js 16, TypeScript, Lucide React
- **后端**: Node.js 原生 http + WebSocket
- **P2P**: Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- **测试**: Node.js built-in test runner

## 关键文件

| 文件                              | 说明                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| `app/page.tsx`                    | 营销首页                                                         |
| `app/app/page.tsx`                | 文件管理器主界面                                                 |
| `app/chat/page.tsx`               | 聊天页组件                                                       |
| `app/layout.tsx`                  | 根布局                                                           |
| `app/globals.css`                 | 全局样式 + Liquid Glass 设计系统                                 |
| `styles/app.css`                  | 文件管理器样式                                                   |
| `styles/chat.css`                 | 聊天样式                                                         |
| `styles/marketing.css`            | 营销首页样式                                                     |
| `components/`                     | React 组件目录                                                   |
| `components/AppHomeMode.tsx`      | 文件管理器主组件                                                 |
| `components/MarketingLanding.tsx` | 营销首页组件                                                     |
| `components/Nav.tsx`              | 导航栏                                                           |
| `components/ui/`                  | 通用 UI 组件（ModalOverlay, Toast, InputModal, ConfirmModal 等） |
| `server.js`                       | HTTP 服务 + WebSocket + API 路由                                 |
| `src/index.js`                    | MostBoxEngine 核心类                                             |
| `src/core/cid.js`                 | CID 计算与链接解析                                               |
| `src/utils/errors.js`             | 自定义错误类                                                     |
| `src/utils/security.js`           | 安全验证工具函数                                                 |
| `src/config.js`                   | 全局配置常量                                                     |
| `next.config.js`                  | Next.js 配置                                                     |

## 开发命令

```bash
# 开发模式（需两个终端）
终端 1: npm run dev      # Next.js 开发服务器 (端口 3000)
终端 2: node server.js  # 后端 API 服务器 (端口 1976)

# 生产构建
npm start               # 构建 + 启动服务（Next.js 静态导出到 out/）

# 测试
npm test                # 运行所有测试
npm run test:unit        # 仅运行单元测试

# 运行单个测试文件
node --test tests/unit/errors.test.js
node --test tests/integration/engine.test.js

# 运行匹配名称的测试（Node 20+）
node --test --test-name-pattern="creates error" tests/unit/errors.test.js
```

## 代码规范

### 模块系统

- 使用 ESM（`import`/`export`），`package.json` 中 `"type": "module"`
- 导入顺序：外部依赖 → Node.js 内置模块 → 本地相对路径导入
- 本地导入使用 `.js` 扩展名

### 命名约定

- 类名/组件名：`PascalCase`（如 `MostBoxEngine`, `AppError`, `ModalOverlay`）
- 函数/变量：`camelCase`（如 `publishFile`, `getNodeId`）
- 常量：`UPPER_SNAKE_CASE`（如 `MAX_FILE_SIZE`, `SWARM_BOOTSTRAP`）
- 私有类字段：`#` 前缀（如 `#store`, `#swarm`, `#drives`）
- 文件名：`camelCase.tsx` / `camelCase.js`（如 `cid.js`, `errors.js`）

### 格式化

- 2 空格缩进
- 不使用分号（除必要情况外）
- 单引号字符串
- 箭头函数优先，除非需要 `this` 绑定
- 异步函数使用 `async/await`，不使用 `.then()` 链

### 错误处理

- 自定义错误类继承 `AppError`，定义在 `src/utils/errors.js`
- 错误类型：`ValidationError`, `FileSizeError`, `PathSecurityError`, `PeerNotFoundError`, `IntegrityError`, `PermissionError`, `EngineNotInitializedError`
- 使用 `try/catch` 处理异步操作，`console.error` 记录非关键错误
- P2P 网络错误（SSL/ECONNRESET）静默处理，不抛出

### 样式

- 全部使用 CSS class，不使用内联 `style={{}}`
- Apple Liquid Glass 设计系统，详见下方「Liquid Glass 设计规范」
- CSS 变量管理主题色：`--bg-primary`, `--text-primary`, `--accent-blue` 等
- 主题切换：`document.documentElement.setAttribute('data-theme', 'dark'|'light')`

### Liquid Glass 设计规范

#### 玻璃材质层级

| 变量                | 亮色模式                 | 暗色模式              | 用途                             |
| ------------------- | ------------------------ | --------------------- | -------------------------------- |
| `--glass-bg-subtle` | `rgba(255,255,255,0.25)` | `rgba(28,28,30,0.25)` | 最轻玻璃（导航栏、悬浮元素）     |
| `--glass-bg`        | `rgba(255,255,255,0.45)` | `rgba(28,28,30,0.45)` | 标准玻璃（卡片、侧边栏）         |
| `--glass-bg-heavy`  | `rgba(255,255,255,0.85)` | `rgba(28,28,30,0.85)` | 重玻璃（弹窗内容区）             |
| `--glass-bg-solid`  | `rgba(255,255,255,0.8)`  | `rgba(28,28,30,0.8)`  | 准实心玻璃（需要高可读性的区域） |

#### 弹窗遮罩

- 弹窗背景遮罩：`rgba(0, 0, 0, 0.55)` + `backdrop-filter: var(--blur-xl)`
- 确保弹窗与后方内容有足够对比度，避免内容重叠干扰

#### 玻璃边框

- 亮色：`rgba(255, 255, 255, 0.5)`（标准）/ `rgba(255, 255, 255, 0.7)`（强调）
- 暗色：`rgba(255, 255, 255, 0.1)`（标准）/ `rgba(255, 255, 255, 0.15)`（强调）

#### 毛糊层级

| 变量         | 值           | 用途                   |
| ------------ | ------------ | ---------------------- |
| `--blur-sm`  | `blur(8px)`  | 轻微毛糊               |
| `--blur-md`  | `blur(16px)` | 中等毛糊               |
| `--blur-lg`  | `blur(24px)` | 强毛糊（响应式弹窗）   |
| `--blur-xl`  | `blur(32px)` | 很强毛糊（弹窗遮罩）   |
| `--blur-2xl` | `blur(40px)` | 最强毛糊（弹窗内容区） |

#### 圆角

- `--radius-sm: 10px` — 小元素（标签、徽章）
- `--radius-md: 14px` — 中等元素（输入框、按钮）
- `--radius-lg: 20px` — 大容器（弹窗、卡片）
- `--radius-xl: 24px` — 超大容器

#### 阴影

- `--glass-shadow`: `0 8px 32px rgba(0, 0, 0, 0.08)`（亮色）/ `0.3`（暗色）
- `--glass-shadow-lg`: `0 16px 48px rgba(0, 0, 0, 0.12)`（亮色）/ `0.4`（暗色）
- `--glass-shadow-inset`: `inset 0 1px 0 rgba(255, 255, 255, 0.6)`（亮色）/ `0.06`（暗色）

### 响应式断点

- `≤768px`：平板 / 大屏手机，侧边栏变为抽屉式
- `≤480px`：小屏手机，进一步压缩布局

### 组件结构

- `AppHomeMode.tsx` 为文件管理器主组件，包含所有子组件逻辑
- 子组件通过 props 接收 `isDarkMode`, `onClose` 等参数
- UI 通用组件统一放在 `components/ui/` 目录

## API 端点

| 方法   | 路径                      | 说明                   |
| ------ | ------------------------- | ---------------------- |
| GET    | `/api/node-id`            | 获取节点 ID            |
| GET    | `/api/files`              | 列出已发布文件         |
| POST   | `/api/publish`            | 上传文件（multipart）  |
| POST   | `/api/download`           | 下载分享的文件         |
| GET    | `/api/trash`              | 回收站列表             |
| POST   | `/api/files/:cid/star`    | 切换收藏状态           |
| POST   | `/api/files/:cid/move`    | 移动/重命名文件        |
| DELETE | `/api/files/:cid`         | 删除文件（移入回收站） |
| DELETE | `/api/trash/:cid`         | 永久删除               |
| POST   | `/api/trash/:cid/restore` | 恢复文件               |
| GET    | `/api/storage`            | 存储统计               |
| WS     | `/ws`                     | WebSocket 实时事件     |

## 测试规范

- 使用 `node:test` 和 `node:assert`
- 测试文件命名：`*.test.js`
- 目录结构：`tests/unit/` 和 `tests/integration/`
- 使用 `describe`/`it` 组织测试用例
- 集成测试避免使用真实网络，使用 mock 或本地环境

## 频道聊天架构

### 架构概述

每个用户运行独立的 MostBox 服务器实例，通过 P2P (Hyperswarm) 网络复制数据。WebSocket 用于实时事件通知。

```
用户 A (server) ←──P2P复制──→ 用户 B (server)
     ↑                                ↑
  WebSocket ←─── 事件推送 ───→ WebSocket
```

### 关键组件

| 组件            | 职责                                 |
| --------------- | ------------------------------------ |
| `MostBoxEngine` | 核心引擎，管理频道、消息、P2P 连接   |
| `Corestore`     | 存储管理，每个频道有独立的 namespace |
| `Hypercore`     | 单条 append-only 日志，存储消息      |
| `Hyperswarm`    | P2P 网络发现与连接                   |
| `WebSocket`     | 服务器→客户端实时事件推送            |

### 消息流程

1. 客户端 POST 消息 → `core.append()` 写入本地
2. P2P 复制到远程节点 → `core.on('append')` 收到
3. `emit('channel:message')` → WebSocket 推送给订阅者

### 重要实现细节

#### 1. Channel Core Append 监听

```javascript
let lastCoreLength = core.length
core.on('append', async () => {
  if (core.length > lastCoreLength) {
    for (let i = lastCoreLength; i < core.length; i++) {
      const entry = await core.get(i)
      if (entry?.type === 'message') {
        this.emit('channel:message', { channel: name, message: entry })
      }
    }
    lastCoreLength = core.length
  }
})
```

#### 2. Channel Replication

```javascript
if (theirChannels.has(name)) {
  const ns = this.#store.namespace(`channel-${name}`)
  ns.replicate(conn)
}
```

#### 3. WebSocket 订阅时机

`peerId` 异步获取，需等待就绪：

```javascript
const pendingSubscriptionRef = useRef(null)

function subscribeToChannel(channelName) {
  if (!myPeerId) {
    pendingSubscriptionRef.current = channelName
    return
  }
  wsSend('channel:subscribe', { channel: channelName })
}

useEffect(() => {
  if (myPeerId && pendingSubscriptionRef.current) {
    subscribeToChannel(pendingSubscriptionRef.current)
    pendingSubscriptionRef.current = null
  }
}, [myPeerId])
```

#### 4. Hyperswarm 4.x API

`conn` 直接使用，无需 `openStream()`：

```javascript
const stream = conn // 正确
// const stream = conn.openStream()  // 错误
```

### 常见问题

- **消息收不到**：检查 `core.on('append')` 是否触发、`subscribers` 数量
- **P2P 连接失败**：检查 `conn.openStream` 错误（Hyperswarm 4.x 问题）
- **订阅者 unknown**：`peerId` 未就绪就发送订阅
