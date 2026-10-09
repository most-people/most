# Android 真机大文件网络验收（2026-10-09）

设备为已授权真机 `14cdba73`，Redmi K30S Ultra / M2007J3SC。使用本地最新 ARM64 Release APK，保留用户数据，不使用模拟器。

## 256MiB 网络下载与手机种子接力

- 从已有确定性样本复制并修改前 32 字节，得到手机从未持有的新 CID：`bafybeigil7hdw6ohtorfparlp4xztipfb64ben6y3woymu36ocyro5yavm`，名称 `network-256MiB.bin`。
- 桌面独立发布者公开做种。手机通过界面输入 `most://`、确认下载，实际观察到下载阶段；随后任务完成 100%。未向手机推送文件，未强制连接复制。
- 桌面发布者退出，确认对应进程不存在；全新第三节点从手机发现内容并下载，重新计算 CID 与预期相同。最高 MVP 验收场景通过，记录见 `docs/qa/2026-10-09/android-physical/network-256-handoff.json`。
- 连续内存记录保存 78 个样本，PID 始终为 `11856`；采样包含下载及之后空闲时段。最大总 PSS 为 337703KiB，Native Heap Alloc 153670KiB，Dalvik Heap Alloc 9242KiB。原始证据为 `network-256-memory.json`。

## 2112MiB 网络下载与进程停止恢复

- 新样本大小 2214592512 字节，CID 为 `bafybeigwql7tkrckvqzinwzen5zbfiyxvaapjjdz2zkesmjyjvdn6g72de`，名称 `network-2112MiB.bin`。通过手机界面接收链接并网络下载，未向手机推送文件。
- 下载任务进度约 50% 时执行 `am force-stop most.box`，随后启动原应用。用户数据保留；失败页展示持久化任务及“任务因应用重启中断，请重试；下载缓存会复用”。任务百分比含发现和校验阶段，不等于精确下载字节百分比。
- 界面点击重新下载后观察到下载继续至 73%，随后显示“正在校验 CID”至 91%，最终已完成页显示“下载完成，正在做种”。本次验证了真实进程停止后的恢复和完整 CID 校验；没有捕获重试瞬间的缓存字节数，不能据此量化节省的网络流量。
- 十分钟内存采样共 260 个样本，PID 从 `11856` 切换到 `7227`。最大总 PSS 388036KiB，Native Heap Alloc 195697KiB，Dalvik Heap Alloc 9287KiB；证据为 `network-2112-memory.json`。
- 与 256MiB 单次采样相比，文件增大 8.25 倍，总 PSS 最大值从约 330MiB 增至约 379MiB。此场景未观察到内存随文件大小同比增长；采样间隔与进程重启可能漏掉瞬时峰值，不能作为所有机型的内存保证。
- 原桌面发布者退出且对应进程不存在后，全新第三节点仅通过 CID 发现手机并取得完整 2112MiB 内容，重算 CID 与预期完全一致。结果为 passed，耗时约 390 秒；证据为 `network-2112-handoff.json`。这也验证了手机在应用重启后仍可重新加入 topic 并对外提供完整副本。

仍需精确下载字节 10% / 50% / 90% 切网、系统回收、导出及权限故障验证；本次 force-stop 不等同于系统回收或后台传输验收。
