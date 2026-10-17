# 2026-10-17：频道心跳导致节点连接超时

本记录保留故障原因、修复和验证结论。再次发生异常时，可将本文件与新故障的日志一起提供，作为排查背景。

## 故障表现

客户端无法连接远程 MostBox 节点，表现为连接超时。此前也发生过相同现象，重启后暂时恢复，运行一段时间后再次出现。

故障时，服务器本机访问 `http://127.0.0.1:1976/api/node-id`，5 秒内未收到任何响应，但 1976 端口仍由 Node.js 监听。Node.js 主线程持续占满一个 CPU 核，机器其余 CPU 和内存仍充足，文件描述符使用量也远低于上限。

该节点已加载约 850 个频道。服务器同时存在 ubuntu 和 root 用户的独立 PM2 实例；实际监听 1976 的服务属于 ubuntu 用户，排查与重启均需对应这个实例。

## 根因

故障现场 CPU 采样定位到频道在线状态心跳的权限检查链路：

```text
heartbeatChannelPresence
  → #broadcastChannelPresence
  → #sendChannelPresence
  → #isChannelAllowedForStream
  → #getAuthorizedChannelIds
  → #getChannelTopicMap
```

每次心跳广播都会逐条检查聊天连接的频道权限。旧实现每检查一条连接，就重新构建全部频道的 topic 映射，再生成该连接的授权频道集合。

映射重建包含重复的频道查找、SHA-256 和 topic 规范化；频道查找还在循环中逐次扫描整个频道列表。频道、连接和心跳数量增加后，大量同步计算与临时对象分配占用主线程，HTTP 和 WebSocket 请求无法及时处理，最终表现为客户端连接超时。

重启没有消除这段重复计算，因此单靠重启仍可能复发。

## 修复

修复提交：[0917326a661a1862ca55c94ab8889b899b5bef29](https://github.com/most-people/most/commit/0917326a661a1862ca55c94ab8889b899b5bef29)，已推送到 `main`。

核心修改位于 `server/src/index.js`：

- 缓存全局频道 topic 映射，重建时用 `channelKey` 索引替代循环内的全表查找。
- 每条连接缓存从已验证 proof 派生的授权频道集合，稳定状态下直接查询集合。
- 频道加载、新建、导入、退出和移除，以及 discovery 加入、删除和临时发现到期时，使映射缓存失效。
- 连接收到新的有效 proof 时，使该连接的授权缓存失效；连接关闭与引擎停止时释放对应缓存。

缓存沿用已有的 proof 验证和频道隔离规则。仅声明 topic 不会获得授权；其他连接或旧 challenge 的 proof 不能复用。HTTP、WebSocket 协议与持久化数据格式保持兼容。

## 验证与恢复结果

本地使用 850 个频道、8 个 peer，通过内存复制连接连续发送 100 次心跳：

| 指标              |       修复前 |      修复后 |
| ----------------- | -----------: | ----------: |
| 100 次心跳耗时    | 约 4687 毫秒 | 约 6.5 毫秒 |
| 重复 SHA-256 调用 |   1361600 次 |        0 次 |

这些数值来自本地基准，线上恢复另行确认：用户随后回传本机 API `200 OK`，并确认客户端能够正常连接。本次处理结束时，尚无后续 48 小时稳定性观测结论。

验证还包括：

- 全量测试 708 项通过，1 项因 Windows 符号链接权限跳过；协议测试 11 项、频道单元测试 32 项通过。
- 新增回归覆盖重复心跳、新频道授权、退出与重加、账号导入与清除、断线与重启、跨连接 proof 重放和临时 discovery 到期。
- 分别停用有效 proof、临时 discovery 加入、临时 discovery 移除、用户频道移除这四处失效逻辑，对应回归测试均能检出错误。
- 可复现基准脚本：`scripts/benchmark-channel-presence.mjs`；授权回归测试：`server/tests/integration/channelAuthorization.test.js`。

原日志中还存在大量“频道不存在”“未加入该频道”的失效心跳错误，本次修复范围为 CPU 重复计算。再次排查时，需要结合当时的 CPU、API 响应和采样判断原因。

## 下次排查需要的信息

提供本文件、故障开始时间及服务器时区、客户端表现、是否已经重启，以及故障时最新的 PM2 错误日志和运行日志。如条件允许，先保存故障现场，再重启服务。

以运行服务的 ubuntu 用户执行 `pm2 describe mostbox`，查看 `error log path` 和 `out log path`；应用名称不同则使用实际名称。PM2 默认日志目录通常为 `~/.pm2/logs/`，以实际输出为准。

下面的只读命令可整行复制执行，采集时间、代码版本、PM2 状态、CPU、监听进程、内存和本机 API 响应。项目位置或端口发生变化时，先调整对应参数。

```bash
bash -c 'date -Is; git -C /data/repo/most rev-parse HEAD; pm2 list; ps -eo pid,ppid,stat,pcpu,pmem,rss,etime,comm --sort=-pcpu | head -n 15; ss -lntp "sport = :1976"; free -m; curl -m 5 -sS -o /dev/null -w "HTTP=%{http_code} time=%{time_total}s\n" http://127.0.0.1:1976/api/node-id'
```

如果再次出现主线程高 CPU、本机 API 超时，应进一步保存故障进程的 CPU profile，定位当次实际执行的函数。进程 PID 以新现场监听端口的结果为准；普通错误日志可能无法直接反映主线程阻塞。
