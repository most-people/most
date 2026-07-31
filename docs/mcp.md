# MostBox MCP 方案与实施计划

## 目标

MostBox MCP 是现有 daemon 的受控 AI 适配层，让 Codex、Claude Desktop、VS Code
等 MCP 客户端可以查看节点状态，并完成文件发布、`most://` 下载、CID 校验和下载后做种。
MCP 不引入新的内容身份、P2P 协议或存储格式。

首版成功标准：

- 客户端可以读取节点状态、当前用户文件、holding 和活动下载任务。
- 客户端可以检查 `most://` 链接、发布授权目录内的本机文件、开始或取消下载。
- 发布和下载继续使用 UnixFS CID v1；下载只有在 CID 重算一致后才保存并做种。
- 每个 MCP 客户端绑定一个 MostBox 用户、明确的 scope 和允许发布的目录，可随时撤销。
- MCP 连接退出不停止 daemon、下载任务或做种。
- 发布者退出后，下载者种子仍可通过 MCP 向第三个节点传播同一 CID。

## 边界和不变量

- 原生分享链接保持 `most://<cid>?filename=...`。
- Hyperswarm topic 继续使用 `cid.multihash.digest`，Hyperdrive key 继续使用 `/<cid>`。
- 文件名、路径和 MCP metadata 只用于展示或定位，不能替代 CID 完整性判断。
- MCP 不启动第二个 `MostBoxEngine`，所有调用最终进入已运行 daemon 的现有 API 和引擎。
- 首版不暴露删除文件、移动文件、目录分享、节点配置、日志清理、关机、账户导入、
  聊天、知识库或 Web3 工具。
- 不向模型上下文返回任意大文件内容；资源只返回有上限、可分页的结构化元数据。
- Android Alpha 不承载 MCP Server。

## 架构

```text
Codex / Claude Desktop / VS Code
        |
        +-- stdio: most-box mcp
        +-- Streamable HTTP: http://127.0.0.1:1976/mcp
                    |
          MCP client + owner + scopes
                    |
             MostBox daemon API
                    |
       MostBoxEngine / Hyperdrive / Hyperswarm
```

`stdio` 入口是连接现有 daemon 的薄适配器。Streamable HTTP 只接受回环请求；远程节点通过
SSH 隧道映射到本机后使用，不能因为 daemon 监听 `0.0.0.0` 而向局域网或公网开放 `/mcp`。

## 能力合同

### Resources

| URI                     | 内容                      | Scope        |
| ----------------------- | ------------------------- | ------------ |
| `mostbox://node/status` | 节点、网络、容量摘要      | `node:read`  |
| `mostbox://files`       | 当前用户文件元数据        | `files:read` |
| `mostbox://holdings`    | 本机完整副本和 topic 状态 | `node:read`  |
| `mostbox://downloads`   | 当前用户活动下载任务      | `files:read` |

### Tools

| 名称                         | 行为                              | Scope              |
| ---------------------------- | --------------------------------- | ------------------ |
| `mostbox_node_status`        | 读取节点状态                      | `node:read`        |
| `mostbox_list_files`         | 分页读取当前用户文件              | `files:read`       |
| `mostbox_list_holdings`      | 分页读取本机 holding              | `node:read`        |
| `mostbox_check_download`     | 检查链接格式、本地副本和在线种子  | `files:read`       |
| `mostbox_get_share_link`     | 按当前用户文件的 CID 返回分享链接 | `files:read`       |
| `mostbox_list_downloads`     | 读取活动下载任务                  | `files:read`       |
| `mostbox_publish_local_file` | 发布 daemon 主机上的授权文件      | `files:publish`    |
| `mostbox_start_download`     | 下载、校验并自动做种              | `files:download`   |
| `mostbox_cancel_download`    | 取消当前用户的活动任务            | `downloads:cancel` |

写工具通过 MCP annotations 标出副作用，但客户端确认不能替代服务端权限校验。
长下载首版使用现有 `taskId` 和状态轮询；只有目标客户端稳定支持 Tasks 扩展后才接入该扩展。

## 身份与安全

- MCP 客户端记录保存在独立的 `mcp-clients.json`，不混入公开节点配置。
- 记录包含客户端名称、token 哈希、所属 `ownerAddress`、scopes、允许发布目录、创建时间、
  过期时间和最近使用时间；明文 token 只在创建时返回一次。
- 创建、列出和撤销 MCP 客户端必须使用现有签名身份，并且仅允许节点管理员操作。
- token 使用恒定时间比较；日志记录客户端创建、吊销、MCP 发布成功和协议错误，不记录 token 或文件内容。
- 发布文件先对路径执行 `realpath`，要求是允许目录内的普通文件，并拒绝符号链接逃逸。
- 下载继续经过现有 `parseMostLink()`、CID 校验、容量和文件大小策略。
- HTTP `/mcp` 校验远端 socket、Host、Origin 和 Bearer token；不接受远程邀请码替代 MCP 凭证。
- 若未来需要公网 MCP，单独实现 OAuth 2.1、PKCE、RFC 9728 和最小权限 scope。

## 实施步骤

1. **协议骨架（已完成）**：引入官方 MCP TypeScript SDK 2.x 和 Zod 4，完成 MCP 发现、工具列表、
   `stdio` 与回环 Streamable HTTP 冒烟测试。
2. **凭证与授权（已完成）**：实现原子持久化的客户端 store、scope 策略、创建/列出/撤销 API 和限流。
3. **只读能力（已完成）**：接入节点状态、用户文件、holding、下载任务、链接检查和分享链接。
4. **文件闭环（已完成）**：接入受限路径发布、异步下载和取消；错误保持稳定的结构化 code。
5. **管理界面和打包（已完成）**：管理台增加 MCP 连接管理，CLI 增加 `most-box mcp`，补充三类客户端配置。
6. **验证和发布（自动验收已完成）**：单元、HTTP/MCP 集成、CID 协议、三节点接力、
   前端、静态产物和生产构建均已通过；发布前再按本页步骤完成人工管理台验收。

## 使用入口

1. 启动 daemon 并打开 `/admin/`。
2. 在“MCP 客户端”中选择最小 scope；只有启用 `files:publish` 时才需要填写允许目录。
3. 创建凭证并立即保存一次性 token。
4. 按 README 的 Codex、Claude Desktop 或 VS Code 配置连接。
5. 不再使用时在管理台吊销客户端；已建立的 HTTP 或 stdio 连接随后不能继续调用 daemon。

CLI stdio 入口：

```bash
MOSTBOX_URL=http://127.0.0.1:1976 \
MOSTBOX_MCP_TOKEN='<token>' \
npx -y most-box@latest mcp
```

## 验收矩阵

- 未授权、scope 不足、token 撤销/过期、非回环 HTTP 请求全部失败关闭。
- 不同用户的文件列表和任务互不可见；MCP 不能调用未列入合同的 HTTP 管理能力。
- 越出允许目录、符号链接逃逸、目录和特殊文件不能发布。
- A 通过 MCP 发布得到 CID 和 `most://` 链接；B 通过 MCP 下载并成为 holding；停止 A 后，
  C 仍能从 B 下载、重算出相同 CID 并继续做种。
- `npm test`、`npm run test:protocol`、`npm run typecheck`、
  `npm run typecheck:strict-router`、`npm run lint` 和 `npm run format:check` 通过。

## 后续范围

首版稳定后再根据真实调用记录评估文本文件预览、MCP Tasks、公网 OAuth 以及聊天或知识库能力。
这些能力不进入本轮实现，也不能把 Web3 变成文件分享前置条件。
