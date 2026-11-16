# MostBox DChat 验收指南

本文件验证当前版本的主线：**P2P 频道聊天为本、`most://` 文件传输为辅**。MostBox 不提供云端消息或文件存储；可用性来自在线节点。

## 当前入口

| 入口      | 用途                                         |
| --------- | -------------------------------------------- |
| `/chat/`  | 创建或加入频道、发送消息、查看历史、发送附件 |
| `/file/`  | 发布文件、接收 `most://` 链接、查看做种列表  |
| `/admin/` | 节点、做种、日志和远程连接状态               |
| `/web3/`  | 独立的本地账户、密钥和钱包工具               |

桌面端默认打开根路径 `/` 的功能入口页，可从中进入 `/chat/`；营销页 `/hi/` 说明 DChat 定位。旧 `/note/` 路由和 `/api/note-vault/*` 接口不存在。

## 最小聊天验收

1. 分别运行 `npm start` 和 `npm run server`，再打开 `http://localhost:2020/`。
2. 确认根路径进入聊天，三种语言都显示“去中心化聊天与文件传输”定位。
3. 创建频道，复制 `/chat/#<channelId>` 邀请链接；另一浏览器或另一节点加入。
4. 双向发送文本，确认消息顺序、发送者和时间正确。
5. 刷新页面、断开再连接，确认频道历史仍可读取。
6. 发送一条聊天附件，确认消息中出现 `most://` 链接，文件可打开下载确认流程。
7. 当前验收先覆盖全功能版；两个商店版后续按实际构建功能矩阵另验，不能以历史墨盒 profile 的 UI 开关认定隔离完成。

## 文件与接力验收

1. 节点 A 发布文件并复制 `most://<cid>?filename=...`。
2. 节点 B 粘贴链接，确认下载前有确认步骤，完成后 CID 校验通过并加入 holding。
3. 确认 B 的做种状态为 active，重启 B 后重新 join 对应 CID topic。
4. 退出 A，保持 B 在线，让节点 C 使用同一链接下载并通过 CID 校验。
5. 文件名只用于展示，已有判断、Hyperdrive 路径和完整性校验都以 CID 为准。

## 数据删除与备份迁移

- Web 首次启动删除旧 `mostbox` IndexedDB、`mostbox.chatNoteDraft.*` 和 Expo Web 知识库键。
- Electron 首次启动删除 `Documents/MostBox/Notes`，路径固定在 Documents/MostBox 内，不跟随越界路径。
- Android/iOS 首次启动删除应用文档目录中的 `mostbox-knowledge` 及导入临时目录。
- 清理失败只记录日志并在下次启动重试，不阻塞聊天或文件功能；其他身份、频道、文件和做种数据必须保留。
- 新备份不含 `notes`、`noteVault`；导入旧备份时丢弃这两个字段，其他账户数据仍可恢复。
- 账号错误、密码错误、ownerAddress 不匹配仍必须拒绝导入。

## 自动检查

根项目：

```bash
npm run typecheck
npm run typecheck:strict-router
npm run lint
npm run test:frontend
npm run test:desktop
npm run test:protocol
npm test
npm run test:cross-core   # 需先安装 app/ 依赖：桌面引擎与移动核心双向传输
npm run build
npm run check:static-output
npm run format:check
```

移动端：

```bash
cd app
npm run typecheck
npm test
npm run bundle:android
npm run bundle:ios
npm run build
```

## P0 可靠性回归

- 生产构建：`npm run build` 和 `npm run check:static-output` 通过后，打开 daemon 的 `/chat/`、`/file/`、`/docs/api/`；刷新后页面仍可交互，Scalar API 参考完成加载，控制台没有初始化错误。Electron 使用同一生产输出做窗口验收。
- CID 边界：根项目和移动端测试均覆盖 UnixFS 文件大小的 2GiB、4GiB、10GiB 整数编码；既有空文件、小文件和跨块黄金 CID 必须保持一致。
- 移动本地可用性：保留 holding 和 Hyperdrive entry，清除实际 blob；重启后状态为 error、`localAvailable: false`，不恢复种子 topic，不返回 `alreadyExists / completed`，也不能导出。重新发布同一内容后恢复完整副本和默认做种。零字节文件仍算有效完整内容。
- 缓存路径：导出时校验路径中的内容是否属于该 CID；路径内容被替换后，从 `/<cid>` 重建正确副本，不覆盖用户原路径。

UnixFS 的 `protons-runtime` 7.x / 8.x 整数编码补丁由根项目和移动子包的 `postinstall` 自动应用。使用 `--ignore-scripts` 安装后，必须分别运行 `npm run postinstall` 和 `npm --prefix app run postinstall`，再计算 CID 或生成 Bare bundle。升级该依赖时必须重新验收补丁和黄金样本。

大文件专用回归需安装两个包的依赖，并预留至少 20GiB 临时磁盘空间：

```bash
npm ci
npm ci --prefix app
npm run test:large-files
```

该测试生成 2112MiB 文件，验证文件路径与不同读取块大小的 CID、桌面下载与发布者退出后的种子接力，以及移动生产核心在 Node 宿主机上的发布和重启。测试结束清理自身临时目录；它不属于常规 `npm test`，也不替代 Android/iOS 真机和公共网络验收。

## 移动文件体验回归

- Android 系统保存使用 `app/modules/most-file-export` 本地原生模块，需要重新构建 APK；Expo Go 或仅更新 JS 不包含该模块。
- 在 192MiB heap growth limit 的模拟器上，把已校验的 32MiB holding 保存到系统目录；读取输出并对比完整字节数与 SHA-256。再在 ARM64 真机上验证 256MiB 和 2GiB 以上文件，并记录内存峰值。
- 同名保存生成新文件，原文件保持可读，成功提示显示实际输出名称。取消选择目录不创建输出，也不提示保存成功。
- 复制或输出复读校验失败不能提示成功；新建的不完整输出应删除，无法删除时明确提示用户检查残留文件。另验空间不足、目录权限撤销和异常文档提供者。
- 聊天中的结构化附件和纯 `most://` 消息均可点击。未持有完整 CID 时先进入现有下载确认页；有大小 metadata 时显示大小；运行中显示进度，失败后提供重试，只有本机确认可读的同一 CID 才提供打开入口。
- 附件完成后保持原有 CID 校验、写入 `/<cid>` 和默认做种；再次执行发布者退出后的接力验收。

原生流复制的 JVM 回归可在生成 Android 项目后运行：

```powershell
cd app/android
./gradlew.bat :most-file-export:testReleaseUnitTest
```

该测试覆盖固定缓冲区复制、空文件、超过 2GiB 的计数、源长度变化、同长度损坏、截断输出和写入异常时关闭流；它不替代 SAF 文档提供者与实际界面验收。已有验证和未覆盖项见[验证状态](validation-status.md)。

## MVP 深度验收

本节是 AGENTS.md「当前 MVP 口径」中失败模型、不变量 F1–F5 / C1–C5、量化门槛和证据要求的执行方式。上面的「最小聊天验收」「文件与接力验收」只证明正常路径走通，不能替代本节。

### 执行原则

1. 门槛以 AGENTS.md「量化门槛」为准；如需调整，先改门槛并提交，再开始测试；不达标即失败，不事后改口径。
2. 只用原始数据下结论：每次运行输出 JSONL 事件（发送、确认、观察、announce、lookup、连接建立及路径、传输字节、CID 结果、错误），统计由脚本从事件计算。
3. 可重放：记录随机种子、提交号、包 SHA-256、设备/OS、NAT 类型；他人在干净环境用同一命令应得到同分布的结果。

### 文件接力

| 不变量                           | 执行方式                                                                                                                                                                                                          | 现有覆盖                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 校验后才做种并在重启后 rejoin | 正常与各类坏对端下载后，检查是否写入 `/<cid>`、holding 与 topic join；重启后再检查                                                                                                                                | `engine.test.js` 已覆盖 holding 持久化与重启 rejoin、topic 与 CID digest 不符时拒绝                                                                                                                                                                                                                                                                                                                                        |
| F2 坏对端代价有界                | 恶意 peer 桩分别发错字节、截断、极慢、谎报大小；断言不保存、不做种、临时文件已清理，单次尝试消耗不超过声明大小；重试与同时连接诚实/坏 peer 时绝不报告成功却给出错误字节，并统计失败率                             | 下载前按声明大小与 `maxFileSizeBytes` 拒绝、完成后 CID 不一致抛 `IntegrityError` 已在 `server/src/index.js` 实现；集合 DAG-PB 块不符 CID 的拒绝已有测试；`engine.test.js` 覆盖坏 peer 被跳过后从诚实种子取得正确字节、同时连接坏/诚实种子（常规 5 次，2026-11-16 另跑 50 次全部成功）与 v1 数据迁移；截断、极慢、谎报大小的桩与代价测量**待建**                                                                            |
| F3 崩溃一致性                    | 在每个持久化写入点（holding、`published-files.json`、Hyperdrive 写入、下载缓存）前后 kill -9 或注入 `fs` 失败；重启后比对 metadata 与 `/<cid>` 实际可读性                                                         | 已有元数据代际损坏 fail-closed 与缺失 blob 不误报已有的回归。`npm run test:crash`：桌面发布与下载各自在每个持久化点（进度事件、Hyperdrive 条目写入前后、每次元数据 rename 前）kill 子进程，共 26 个崩溃点；重启后由全新空节点从该节点下载来核对所有“做种/本地可用”声明，并检查每条库记录都有 holding、无下载临时目录残留，再重复操作确认可恢复。移动核心的崩溃注入**待建**                                                 |
| F4 外部 CID 预言机               | 同一样本集（0B、1B、块边界 ±1、单层子节点上限 ±1、2/4/10GiB 编码边界）分别由根项目、`app/` 和 kubo（`ipfs add --cid-version=1 --raw-leaves --only-hash`）或 Helia 计算并三方比对                                  | `KUBO_BIN=<ipfs> npm run test:cid-oracle` 用桌面引擎、移动核心（`app/backend/mobile-core.mjs`）与 kubo 三方比对 13 个样本（至 10GiB，`--quick` 跳过 1GiB 以上）；2026-11-16 kubo 0.43.1 全部一致。`layer+1` 黄金样本进入常规测试。Helia 与两端共用 JS importer，不算独立预言机，不做                                                                                                                                       |
| F5 发布者退出后的接力            | 本地用 `hyperdht/testnet` 确定性 DHT，并在 netns/Docker 中模拟 NAT 与中继，`tc netem` 或 Toxiproxy 注入丢包、延迟、断流；在线种子数 1、2、5，按随机种子上下线，每种网络条件 ≥300 次；真机/真实网络每种条件 ≥30 次 | `npm run stats:relay-churn` 输出 JSONL 事件并按门槛汇总（`--summarize <log>` 从原始日志重算）：默认在本机 `hyperdht/testnet` 上跑种子数 1、2、5 的流失；Linux root 下 `scripts/netns-campaign.sh <out>` 用 `scripts/netns-topology.sh` 建 netns 同网/锥形 NAT/对称 NAT 拓扑、`tc netem` 注入丢包抖动，`--relay` 时在 bootstrap 命名空间起 `scripts/blind-relay.js`。真机：`node scripts/real-device-relay.js --where local | ssh://<host>` 经 adb 让手机下载后作为唯一种子，再由全新节点下载。`lateSeed.test.js`与`test:cross-core` 覆盖首次 topic 查询未命中后重查。连接路径按拓扑推断，未逐连接记录 |

每轮报告成功率、发现时间与完成时间的 P50/P95、失败原因分类，以及每条连接的路径（直连、打洞、中继）。

### 聊天

- 每个节点记录发送、确认、观察三类事件；离线检查器在合并后的历史上验证 C1 已确认不丢、C2 不重复、C3 同一发送者有序、C4 分区恢复后在线成员收敛到同一集合。
- 故障注入：随机断连、网络分区与恢复、进程重启，≥100 轮，C1–C4 零违例；记录分区恢复到收敛的时间，P95 ≤30s。
- C5：所有其他成员离线时，记录重连后本机实际可读的历史范围，写入本文件作为产品边界。
- 现有覆盖：三节点文本双向中继、重启后重开频道 core 与继续写入；历史检查器与分区注入**待建**。

### 测试有效性与输入健壮性

- 变异测试（如 Stryker）针对 `server/src/core/cid.js`、下载校验与 holding 恢复路径；故意改坏校验时测试必须变红。三条路径合计得分 ≥85%，CID 比较判断的变异体 100% 被杀死。**待建**。
- 属性测试/模糊测试（如 `fast-check`）覆盖 `most://` 解析、频道帧编解码与历史合并。**待建**。

### 隐私边界实测

用第三个节点只凭 CID 在 DHT 上 lookup 对应 topic，记录能枚举到的做种者地址，确认与隐私政策披露一致。`node scripts/dht-enumerate.js '<most://链接>'` 先 lookup topic 列出公告记录，再像普通下载者一样逐个连接，记录连接的对端地址（经中继时为中继地址）。结果见[验证状态](validation-status.md)。

### 平台原始证据

- Android：logcat、`dumpsys meminfo`、`dumpsys batterystats`、Perfetto trace、ANR/tombstone，与 JSONL 事件一并存档。
- 网络：必要时抓 UDX/UDP 包确认连接路径；用 STUN 记录测试网络的 NAT 类型。
- 设备矩阵可补充 Firebase Test Lab 或 Play 预发布报告，但不替代上面的接力与聊天统计。

## 平台与证据

Android 当前流程见[Android 验收](mobile-android-alpha.md)，iPhone 流程见[iOS 验收](mobile-ios-feasibility.md)。历史结果已合并到[验证状态](validation-status.md)；新候选包按设备、网络、签名和实际包哈希重新记录，不沿用旧包的通过结论。
