# 更新日志

## v0.5.0 - 2026-07-20

### 重要升级公告

v0.5.0 切换到私有 Corestore 和不可变 Hyperdrive snapshot 协议。这是一次有意的破坏性升级：v0.5.0 运行时不直接打开 v0.4.2 的内部 P2P 存储，也不能与 v0.4.2 节点交换文件描述符或频道控制消息。

`most://<cid>?filename=...`、UnixFS CID v1、`cid.multihash.digest` topic 和 `/<cid>` 内容身份保持不变。桌面端和 daemon 提供显式迁移脚本，可把 v0.4.2 中仍然完整的文件 snapshot、集合清单、holding、用户文件记录、账号 metadata 和频道历史导入 v0.5.0；它不是协议兼容层，迁移完成后仍只能与 v0.5.0 节点互通。

升级前必须停止所有正在使用源目录或目标目录的 MostBox 进程。先执行只读全量验证：

源码仓库中也可以运行：

```bash
npm run migrate:v0.5
```

不带 `--apply` 时，脚本逐项读取旧 Corestore、重算可恢复文件的 CID、解析集合 DAG，并统计频道历史；它不会创建、移动或覆盖目录。确认报告后显式执行：


源码仓库中的等价执行命令：

```bash
npm run migrate:v0.5 -- --apply
```

正式迁移先在目标目录旁创建独立 staging：每个完整文件都会重新校验 CID 并写入新的不可变 snapshot；集合保留原始 DAG-PB 清单，已存在的子文件独立导入；每个频道的旧 writer 历史按时间合并进一个新的本地 writer。随后脚本重新打开整个 v0.5.0 staging，验证所有 snapshot、集合和频道 writer；只有全部验证通过才执行原子切换。

旧源目录永不删除或覆盖。目标目录原先存在时会归档为 `most-data.before-v0.5-import-<timestamp>`；失败时目标目录保持不变，未完成的 staging 路径会打印到终端。旧集合清单可能引用本机从未完整下载的子文件，这类项不会伪造或阻断其他数据恢复，而会记录在新目录的 `v0.5-import-report.json` 中。

目标目录已有 `v0.5-import-report.json` 时脚本拒绝重复迁移，避免误把正在使用的 v0.5.0 数据再次替换为旧快照。确需重做时应先显式归档当前目标，再选择新的目标路径。

确认迁移后的文件、集合和频道均正常后，只需运行：

```bash
npm run cleanup:v0.5
```

命令会自动读取 MostBox 当前配置的数据目录，显示可以回收的旧目录、文件数和容量，然后询问 `y/N`。直接回车或输入 `n` 不做修改，输入 `y` 才永久清理；非交互环境始终只预览。

清理命令只接受当前 schema 1 目录中迁移报告记录的旧源目录和 `before-v0.5-import-*` 归档，拒绝删除当前数据目录、根目录、用户主目录、嵌套目录和符号链接。确认后会先把候选目录原子改名为隔离路径，再递归删除，并把结果写回迁移报告。删除不可撤销，执行前应停止 MostBox 并确认当前 v0.5.0 数据已经验收和另行备份。

未指定 `--source-path` 时，脚本优先选择目标目录旁最新的 `most-data.pre-v0.5.0-*`，否则把目标目录本身视为旧库。为避免选错备份，恢复既有数据时仍建议显式传入两个路径。

Android Alpha 无法使用桌面 Node.js 脚本访问应用沙箱。升级 Android 时应先保留需要的用户可见文件，然后在系统设置中清除 MostBox 应用数据，再启动 v0.5.0。

### 存储与协议

- 文件和频道分别使用 `stores/files/` 与 `stores/channels/` 私有 Corestore，且不复用节点身份 seed。
- 文件传输使用请求式 `mostbox/file/1` Protomux 协议；频道控制使用 `mostbox/channel/1`。
- 发布产生不可变 `drive key + version` snapshot；下载校验成功后保留并继续复制同一 snapshot。
- holding 使用 schema 1、staging 恢复和延迟物理回收，不再提供手工创建 holding 的 API。
- 错误内容、错误 snapshot version 和恶意候选不会阻塞合法候选回退。

### 平台与发布

- 桌面端在检测到旧存储时拒绝直接启动且不自动删除数据；需要保留旧数据时使用上述显式迁移脚本。
- Android Bare 核心同步相同的 holding、snapshot、恢复、删除和接力语义。
- 根包、Android 子包、Expo 可见版本和 Docker 示例统一为 0.5.0。
