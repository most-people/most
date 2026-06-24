# 桌面端本地 Markdown 笔记库计划

## 背景与目标

当前 `/note` 是独立工具箱，Web 端笔记主要保存在浏览器 IndexedDB 中，编辑器通过 Milkdown 读写 Markdown 内容。用户希望桌面端能像 Obsidian 一样直接编辑本地 Markdown 文件，让本地目录成为笔记的真实数据源。

本计划只覆盖本地 `.md` 文件读写能力，不实现 AI 编辑。AI 后续可以基于同一套 Markdown 文件 API 接入，但不属于本轮范围。

目标：

- 桌面端 `/note` 允许用户选择一个本地目录作为 Markdown 笔记库。
- 目录内递归 `.md` 文件就是桌面端笔记源数据。
- Web 端保持现有 IndexedDB 笔记逻辑不变。
- 桌面端云端恢复、云端备份、本地导入和本地导出围绕本地 Markdown 笔记库工作。
- 旧 IndexedDB 笔记不迁移、不删除，避免破坏现有 Web 端数据。

## 桌面端 / Web 端行为边界

桌面端：

- 通过 Electron 系统目录选择器选择笔记库目录。
- 选择后记住目录，下次启动自动打开。
- `/note` 展示该目录内的 `.md` 文件和文件夹。
- 创建、编辑、重命名、移动、删除笔记时直接操作本地 `.md` 文件。
- 备份时从本地笔记库读取 Markdown 文件快照。
- 恢复时把备份中的 Markdown 文件写入当前笔记库。

Web 端：

- 继续使用现有 IndexedDB 笔记。
- 继续使用现有 Web3 登录、加密和备份入口。
- 不显示本地目录选择能力。
- 不要求浏览器直接访问本地文件系统。

旧 IndexedDB 笔记：

- 不迁移、不删除。
- Web 端仍可读取和编辑。
- 桌面端进入本地 Markdown 笔记库模式后，不把旧笔记混入本地文件列表。

## 本地 Vault API 设计

新增 Electron 能力：

```ts
window.electronAPI.selectNoteVaultDirectory(): Promise<string | null>
```

约束：

- 只打开系统目录选择器。
- 只返回用户明确选择的目录。
- 不暴露任意文件读写能力给渲染进程。

新增本地 daemon API，仅在桌面端本机 daemon 中可用：

```text
GET    /api/note-vault/status
POST   /api/note-vault/config
GET    /api/note-vault/files
GET    /api/note-vault/file?path=...
POST   /api/note-vault/file
PUT    /api/note-vault/file
PATCH  /api/note-vault/file
DELETE /api/note-vault/file?path=...
```

建议职责：

- `status` 返回是否已配置 vault、vault 路径、文件数量和可写状态。
- `config` 保存用户选择的 vault 目录。
- `files` 递归列出 `.md` 文件和目录摘要。
- `file` 读取、创建、覆盖、重命名、移动或删除单个 Markdown 文件。

新增 `server/src/utils/noteVault.js`，集中实现：

- vault 路径归一化。
- 相对路径归一化。
- 禁止 `..` 路径穿越。
- 限制只读写 `.md` 文件。
- 禁止跟随 symlink 到 vault 外部。
- 递归扫描 Markdown 文件。
- 原子写入文件。
- 创建父目录。
- 重命名、移动和删除文件。
- 生成备份快照。
- 从备份快照恢复。

## 前端 `/note` 改造

桌面端检测条件：

```ts
window.electronAPI?.isElectron === true && hasBackend === true
```

满足条件时进入 vault 模式：

- 空状态显示“打开笔记库”操作。
- 点击后调用 Electron 目录选择器，再调用 `/api/note-vault/config` 保存目录。
- 文件列表来自 `/api/note-vault/files`。
- 打开文件时通过 `/api/note-vault/file?path=...` 读取 Markdown。
- 编辑保存时通过 `/api/note-vault/file` 写回 Markdown。
- 路由使用 `file` search 参数定位当前笔记文件。

不满足条件时保持现有 IndexedDB 模式：

- 继续使用 `cid` search 参数。
- 继续使用现有 `saveNote`、`deleteNote`、`renameNote` 和 IndexedDB 持久化流程。
- 继续保留 Web 端私密笔记解密和加密能力。

Milkdown 继续作为 Markdown 编辑器：

- `getMarkdown()` 作为保存内容来源。
- `setMarkdown()` 用于打开文件后加载内容。
- 不新增 AI、选区改写或自动代理编辑。

## 备份与恢复规则

账号备份 payload 保持当前 `schemaVersion: 1`，新增可选字段：

```ts
noteVault?: {
  files: Array<{
    path: string
    content: string
    size: number
    mtimeMs: number
  }>
}
```

规则：

- `notes` 字段继续服务 Web 端 IndexedDB 笔记。
- `noteVault` 字段服务桌面端 Markdown 笔记库。
- 云端备份和本地备份继续使用现有 Web3 钱包加密。
- 桌面端备份时，从当前 vault 读取 `.md` 快照并写入 `noteVault.files`。
- 桌面端恢复时，把 `noteVault.files` 写入当前 vault。
- 自动云端恢复只在 vault 为空或没有冲突时自动写入。
- 如果本地 vault 已有不同内容，沿用现有确认流程，不静默覆盖。
- 恢复不删除用户本地额外文件，只创建或覆盖备份中包含的 `.md` 文件。

## 安全约束

- 本地 vault 文件以明文 `.md` 保存，符合 Obsidian 风格预期。
- 云端备份和本地备份文件继续加密。
- 本地文件 API 必须登录鉴权。
- 本地文件 API 只允许本机桌面端使用，不作为远程任意写文件接口。
- 只允许访问用户已选择 vault 目录内的 Markdown 文件。
- 不备份附件、图片、二进制文件、隐藏目录、`.git`、`node_modules` 或 symlink 目标。
- 不把用户可见文件名当作可信身份；本地 vault 模式的文件身份是 vault 内相对路径。
- 不改变 MostBox 文件分享主流程、`most://` 协议、CID 规则或做种行为。

## 测试计划

单元测试：

```bash
node --test server/tests/unit/noteVault.test.js
```

覆盖：

- 路径归一化。
- 禁止路径穿越。
- 只允许 `.md`。
- 递归扫描。
- 读写文件。
- 原子保存。
- 重命名和移动。
- 删除文件。
- 备份快照。
- 恢复快照。

API 集成测试：

```bash
node --test server/tests/integration/api.test.js
```

覆盖：

- vault API 需要登录。
- 非桌面或非本机请求不能使用本地文件写入能力。
- 配置 vault 目录。
- 列出 Markdown 文件。
- 读取、创建、保存、移动、删除 Markdown 文件。

账号备份测试：

```bash
node --test server/tests/unit/accountBackup.test.js
```

覆盖：

- 旧 payload 仍可加密、解密和恢复。
- 带 `noteVault` 的 payload 可加密、解密和校验。
- 桌面端导出包含 Markdown 文件快照。
- 桌面端导入可写回当前 vault。

前端检查：

```bash
npm run test:frontend
npm run typecheck
npm run typecheck:strict-router
npm run lint
```

覆盖：

- Web 端 `/note` 仍使用 IndexedDB。
- 桌面端 `/note` 使用 vault API。
- 旧 `cid` 路由不影响 Web 笔记。
- 桌面端 `file` 路由可定位本地 Markdown 文件。
- 备份按钮在桌面端包含 vault 快照。

手动验收：

- 桌面端选择一个包含 `.md` 的目录，文件列表正确显示。
- 新建笔记后，磁盘上出现真实 `.md` 文件。
- 编辑保存后，用外部编辑器打开能看到同样内容。
- 重命名、移动、删除后，磁盘文件状态一致。
- 重启应用后，仍能打开上次选择的 vault。
- 云端备份后清空本地 vault，再恢复，Markdown 文件自动写回。
- Web 端打开 `/note`，行为仍与当前 IndexedDB 笔记一致。

## 当前状态

这是计划文档，不代表功能已经实现或验收通过。当前事实来源仍是代码、`README.md` 和 `docs/acceptance.md`。
