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
| `components/icons/LogoIcon.tsx`   | 品牌 Logo 自定义图标组件                                         |
| `server.js`                       | HTTP 服务 + WebSocket + API 路由                                 |
| `src/index.js`                    | MostBoxEngine 核心类                                             |
| `src/core/cid.js`                 | CID 计算与链接解析                                               |
| `src/utils/errors.js`             | 自定义错误类                                                     |
| `src/utils/security.js`           | 安全验证工具函数                                                 |
| `src/config.js`                   | 全局配置常量                                                     |
| `next.config.js`                  | Next.js 配置                                                     |

## 核心架构原则

- **Hyperdrive 只存文件内容**：key 使用 CID，解耦存储与目录结构
- **目录结构由 `published-files.json` 维护**：文件元数据和显示路径（用户看到的文件夹结构）存储在该 JSON 中
- **移动/重命名零成本**：只需更新 `published-files.json`，不修改 Hyperdrive

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

# 代码格式化与检查
npm run format          # Prettier 格式化全部代码
npm run lint            # ESLint 检查
```

> **构建说明**：Next.js 配置为静态导出（`output: 'export'`），`npm start` 会先生成 `out/` 目录，再由 `server.js` 直接 serve 该目录。

## 环境变量与数据存储

| 变量              | 默认值    | 说明                      |
| ----------------- | --------- | ------------------------- |
| `MOSTBOX_PORT`    | `1976`    | 后端服务端口              |
| `MOSTBOX_HOST`    | `0.0.0.0` | 后端监听地址              |

- 配置文件：`~/.most-box/config.json`
- 默认数据目录：`~/most-data`

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
- Apple Liquid Glass 设计系统，具体变量定义在 `app/globals.css`
- CSS 变量管理主题色：`--bg-primary`, `--text-primary`, `--accent-blue` 等
- 主题切换：`document.documentElement.setAttribute('data-theme', 'dark'|'light')`

### 图标

- **统一使用 `lucide-react`**，禁止在组件中内联手写 `<svg>`
- 品牌 Logo 等自定义图标单独放在 `components/icons/` 目录下，以 `PascalCase.tsx` 命名
- 图标大小通过 `size` prop 控制，不手写 `width`/`height` 属性

### Liquid Glass 设计规范

> 具体数值（色值、模糊半径、阴影参数）以 `app/globals.css` 为准，此处仅说明原则与用途。

#### 玻璃材质层级

| 变量                | 用途                         |
| ------------------- | ---------------------------- |
| `--glass-bg-subtle` | 最轻玻璃（导航栏、悬浮元素） |
| `--glass-bg`        | 标准玻璃（卡片、侧边栏）     |
| `--glass-bg-heavy`  | 重玻璃（弹窗内容区）         |
| `--glass-bg-solid`  | 准实心玻璃（高可读性区域）   |

#### 弹窗遮罩

- 弹窗背景遮罩：`rgba(0, 0, 0, 0.55)` + `backdrop-filter: var(--blur-xl)`
- 确保弹窗与后方内容有足够对比度，避免内容重叠干扰

#### 玻璃边框

- 亮色：`rgba(255, 255, 255, 0.5)`（标准）/ `rgba(255, 255, 255, 0.7)`（强调）
- 暗色：`rgba(255, 255, 255, 0.1)`（标准）/ `rgba(255, 255, 255, 0.15)`（强调）

#### 毛糊层级

| 变量         | 用途                   |
| ------------ | ---------------------- |
| `--blur-sm`  | 轻微毛糊               |
| `--blur-md`  | 中等毛糊               |
| `--blur-lg`  | 强毛糊（响应式弹窗）   |
| `--blur-xl`  | 很强毛糊（弹窗遮罩）   |
| `--blur-2xl` | 最强毛糊（弹窗内容区） |

#### 圆角

- `--radius-sm: 10px` — 小元素（标签、徽章）
- `--radius-md: 14px` — 中等元素（输入框、按钮）
- `--radius-lg: 20px` — 大容器（弹窗、卡片）
- `--radius-xl: 24px` — 超大容器

#### 阴影

- `--glass-shadow` — 常规悬浮阴影
- `--glass-shadow-lg` — 大容器阴影
- `--glass-shadow-inset` — 内发光边框效果

### 响应式断点

- `≤768px`：平板 / 大屏手机，侧边栏变为抽屉式
- `≤480px`：小屏手机，进一步压缩布局

### 组件结构

- `AppHomeMode.tsx` 为文件管理器主组件，包含所有子组件逻辑
- 子组件通过 props 接收 `isDarkMode`, `onClose` 等参数
- UI 通用组件统一放在 `components/ui/` 目录

#### 弹窗容器规范

- **`ModalOverlay`** 是唯一的弹窗玻璃容器提供者，内部自动包裹 `<div className="modal-container">`
- 所有使用 `ModalOverlay` 的弹窗组件，根元素只需添加 `modal-container` class（如 `<div className="share-modal modal-container">`）
- **禁止**在各弹窗 CSS 中重复定义容器属性（width / padding / background / backdrop-filter / border / box-shadow / border-radius），只保留内容布局样式
- `ConfirmModal`、`InputModal` 等通用弹窗组件内部不再手写 `modal-container` 或 `modal-glass`，由 `ModalOverlay` 统一提供

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
| GET    | `/api/config/data-path`   | 获取/设置数据存储路径  |
| GET    | `/api/network`            | 获取本机网络地址列表   |
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

### 重要实现原则

1. **Channel Core Append 监听**：用 `lastCoreLength` 指针记录上次处理位置，避免重复触发旧消息。仅处理 `core.length > lastCoreLength` 的新条目。
2. **Channel Replication**：对端也拥有该频道时，通过 `store.namespace(\`channel-${name}\`).replicate(conn)` 建立复制流。
3. **WebSocket 订阅时机**：`peerId` 异步获取，需等待就绪后再发送 `channel:subscribe`。未就绪时应暂存频道名，就绪后补发订阅。
4. **Hyperswarm 4.x API**：`conn` 直接作为流使用，**不要**调用 `conn.openStream()`。

### 常见问题排查

- **消息收不到**：检查 `core.on('append')` 是否触发、`subscribers` 数量
- **P2P 连接失败**：检查是否误用了 `conn.openStream`（Hyperswarm 4.x 不支持）
- **订阅者 unknown**：`peerId` 未就绪就发送订阅
