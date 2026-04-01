# Most.Box

## 项目概述
P2P 文件分享应用，基于 Hyperswarm/Hyperdrive 网络。用户上传文件后生成分享链接，接收方通过 P2P 网络下载。

## 技术栈
- **前端**: React 19, esbuild, Lucide React
- **后端**: Node.js 原生 http + WebSocket
- **P2P**: Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- **测试**: Node.js built-in test runner

## 关键文件

| 文件 | 说明 |
|------|------|
| `public/app.jsx` | 主 UI 组件（~1400 行） |
| `public/app.css` | 所有样式，含响应式媒体查询 |
| `public/bundle.js` | esbuild 打包输出（无需手动修改） |
| `public/bundle.css` | esbuild CSS 打包输出 |
| `server.js` | HTTP 服务 + WebSocket + API 路由 |
| `src/index.js` | MostBoxEngine 核心类 |
| `build.mjs` | esbuild 构建配置 |

## 开发命令

```bash
npm run build   # 构建（esbuild）
npm start      # 构建 + 启动服务
npm test       # 运行所有测试
```

## 代码规范

### 样式
- 全部使用 CSS class，不使用内联 `style={{}}`
- CSS 变量管理主题色：`--bg-primary`, `--text-primary`, `--accent-blue` 等
- 主题切换：`document.documentElement.setAttribute('data-theme', 'dark'|'light')`

### 响应式断点
- `≤768px`：平板 / 大屏手机，侧边栏变为抽屉式
- `≤480px`：小屏手机，进一步压缩布局

### 组件结构
- `app.jsx` 包含所有子组件：WelcomeGuide, SettingsModal, Toast, ModalOverlay, ConfirmModal, InputModal, MoveModal, FileCard, FolderCard
- 子组件通过 props 接收 `isDarkMode`, `onClose` 等参数

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/node-id` | 获取节点 ID |
| GET | `/api/files` | 列出已发布文件 |
| POST | `/api/publish` | 上传文件（multipart） |
| POST | `/api/download` | 下载分享的文件 |
| GET | `/api/trash` | 回收站列表 |
| POST | `/api/files/:cid/star` | 切换收藏状态 |
| POST | `/api/files/:cid/move` | 移动/重命名文件 |
| DELETE | `/api/files/:cid` | 删除文件（移入回收站） |
| DELETE | `/api/trash/:cid` | 永久删除 |
| POST | `/api/trash/:cid/restore` | 恢复文件 |
| GET | `/api/storage` | 存储统计 |
| WS | `/ws` | WebSocket 实时事件 |
