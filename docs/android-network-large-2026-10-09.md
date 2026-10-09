# Android 真机大文件网络验收（2026-10-09）

设备为已授权真机 `14cdba73`，Redmi K30S Ultra / M2007J3SC。使用本地最新 ARM64 Release APK，保留用户数据，不使用模拟器。

## 256MiB 网络下载与手机种子接力

- 从已有确定性样本复制并修改前 32 字节，得到手机从未持有的新 CID：`bafybeigil7hdw6ohtorfparlp4xztipfb64ben6y3woymu36ocyro5yavm`，名称 `network-256MiB.bin`。
- 桌面独立发布者公开做种。手机通过界面输入 `most://`、确认下载，实际观察到下载阶段；随后任务完成 100%。未向手机推送文件，未强制连接复制。
- 桌面发布者退出，确认对应进程不存在；全新第三节点从手机发现内容并下载，重新计算 CID 与预期相同。最高 MVP 验收场景通过，记录见 `docs/qa/2026-10-09/android-physical/network-256-handoff.json`。
- 连续内存记录保存 78 个样本，PID 始终为 `11856`；采样包含下载及之后空闲时段。最大总 PSS 为 337703KiB，Native Heap Alloc 153670KiB，Dalvik Heap Alloc 9242KiB。原始证据为 `network-256-memory.json`。

这是单次 256MiB 验收，不能仅由此推断内存不随文件大小线性增长。仍需 2112MiB 网络下载与对比，以及 10% / 50% / 90% 切网和进程回收恢复。
