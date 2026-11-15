# CID drive 协议 v2：每个种子独立签名

状态：已实现（2026-11-16，桌面 `4588061`、`24faed3`，移动 `22e8b04`）。新旧版本不能互传。问题与实验证据见[验证状态](validation-status.md)「2026-11-15 坏对端探测（F2）」。

## 第一性原理

1. Hypercore 的签名只证明“持有私钥的人写了这一页”，它的一致性前提是**单一写入者**。
2. 现在每个 CID drive 的私钥由公开的 `GLOBAL_SHARED_SEED` 派生，所有节点都是写入者。只要一个节点写入不同内容，就产生两条都合法的分叉；Hypercore 无法裁决，只能报冲突，而本机已收下的分叉无法撤销。
3. 内容是否正确由 CID 决定，不由 Hypercore 决定。Hypercore 只需要提供“某个 peer 发来的数据确实来自这个 peer”。
4. 因此每个种子只能签自己的数据；下载者需要知道某个 peer 用哪把密钥，这件事只有该 peer 知道，所以至少需要一次询问和一次回答。

由此得出的最小改动：**独立密钥 + 一问一答**。其他部分保持不变。

## 不变的部分

`most://` 链接、CID 身份、topic（`cid.multihash.digest`）、drive 内路径 `/<cid>`、下载后重算 CID、成功后默认做种、`published-files.json` / `node-holdings.json` 的职责、Corestore 主密钥（频道依赖它，不改）。

## 设计

### 1. 自己的 drive

- drive 名为 `cid-drive-<HMAC-SHA256(nodeSecret, "most-cid-drive-v2:" + topicHex)>`，仍在现有 Corestore 中按 namespace 打开。
- 名字里含有只有本机知道的 `nodeSecret`，别人算不出名字，也就算不出私钥。名字确定性派生，不新增需要同步的记录。
- `nodeSecret`：桌面复用已持久化的节点种子；移动端新增一个随机 32 字节文件，首次启动创建。丢失等同于丢失数据目录。

### 2. 一问一答

- 在文件 swarm 的每条连接上打开 Protomux 通道 `most-cid-drive/2`，必须挂在 noise 流的 mux 上（与 `store.replicate(conn)` 共用）。
- `want(topic: 32B)`：下载者对每个进行中的下载、在每条连接上发送一次（连接建立时与下载开始时）。
- `have(topic: 32B, driveKey: 32B)`：对方仅在本机有已校验内容（发布记录或 holding，且 `/<cid>` 可读）时回答；否则不回答。
- 不提供列表或其他信息：请求者必须已知 topic，保持“CID 即权限”。

### 3. 下载

- 先试本机自己的 drive：它只在校验后写入，holding 记录丢失时可据此恢复。直接复用已打开的 drive 对象（对已打开的可写 core 再开 key 会话不会 ready），同样重算 CID。
- 再对收到的每把 driveKey（去重，按到达顺序逐个尝试）：用 `store.session()` 只读打开对方 drive（Hyperdrive 关闭时会关闭传入的 Corestore，所以必须用会话），按现有大小上限读取 `/<cid>`，重算 CID。
- 通过：写入自己的 drive，记录 holding，join topic（现有逻辑）。
- 失败：本次下载内跳过该 driveKey，关闭会话，继续等下一把，直到超时。坏 peer 的块留在它自己的 core 中，不与其他 drive 冲突。
- 移动端续传：失败时若使用了上次留下的 `.part`，无法判断是缓存还是来源有错，因此删除缓存后从 0 重试同一来源。
- 已有的“本地已有”判断改为只看自己的 drive。

### 4. 做种

只提供自己的 drive；`store.replicate(conn)` 在对方打开该 key 后自动复制，无需额外逻辑。

### 5. 一次性迁移

恢复 holding 时（发布记录总有对应 holding）：若自己的 drive 没有 `/<cid>`，从旧 `drive-<topicHex>` 读取、重算 CID（集合逐块校验）、写入自己的 drive，成功后 `clear()` 旧块；失败按现有“本地内容缺失”处理（状态 error，不做种）。记录中的 `driveName` 不再被信任，一律按本机密钥现算。旧 namespace 之后不再打开或复制。迁移代码在后续版本删除。

## 刻意不做

- 不兼容旧客户端：新旧版本之间无法互传，按统一升级发布；不保留双协议分支。
- 不做多源并行下载、持久化信誉、边下载边校验。
- 不修 Hypercore `purge()`，也不清理坏 peer 的块：它们在独立 core 中，不再引发冲突。

## 验收

| 用例                         | 判定                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| 坏 peer 先到、诚实种子后到   | 必定成功且字节正确，坏 key 被拉黑                                   |
| 同时连接坏 peer 与诚实种子   | 50 次全部成功（原 6 次中 1 次冲突失败）                             |
| 只有坏 peer                  | CID 校验失败，不记 holding、不报告本地已有                          |
| 三节点接力（发布者退出）     | `npm run test:protocol` 通过                                        |
| 旧数据目录迁移               | 升级后原 holding 继续做种，新节点可下载并校验；损坏的旧块标记 error |
| 桌面 ↔ 移动核心（Node 宿主） | 双向下载并校验                                                      |
| 回归                         | `npm test`、`npm --prefix app test`、lint、格式检查                 |

真实网络与真机验收按 AGENTS.md 量化门槛另行执行。结果见[验证状态](validation-status.md)「2026-11-16 CID drive 协议 v2」。
