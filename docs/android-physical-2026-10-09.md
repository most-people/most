# Android ARM64 真机回归：2026-10-09

本轮按用户要求仅使用安卓真机，不启动模拟器。目标是验证新 APK 的聊天附件接收、系统打开、下载者做种接力，以及 256MiB / 2112MiB 的发布和原生系统保存。安装使用覆盖更新，保留原有应用数据。

## 环境与候选包

- Redmi K30S Ultra（ADB 型号 M2007J3SC），Android 12，ARM64。
- MostBox 0.5.3，versionCode 503；本地 release APK，不是商店发版。
- `npm run build` 成功，APK 为 `mobile/app/dist/mostbox-android-0.5.3-release.apk`。
- APK SHA-256：`6f7302a24b030c3c3cf6f0f372b71b89421971a1d755a091c8c7fbc4884c7d00`。
- heap growth limit 256MiB，最大 heap 512MiB。节点显示在线；既有频道和文件记录仍在。
- 手机与桌面使用当前网络及公共 Hyperswarm 发现；没有注入复制连接或中继。未执行 Wi-Fi / 蜂窝切换，不能据此覆盖其他 NAT 环境。

## 实测结果

| 场景             | 结果                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| 新频道消息发现   | 独立 QA 频道同时收到结构化图片附件和纯 `most://` 消息，两者均显示可接收卡片                                |
| 附件接收         | 结构化卡片进入确认页，显示文件名、33.0KiB 和 CID；确认后完成下载及 CID 校验，两张同 CID 卡片均变为打开入口 |
| 系统打开         | 下载完成后调用 Android 打开方式，选择相册仅一次；测试渐变 PNG 实际显示正常                                 |
| 发布者退出后传播 | 桌面发布者停止，干净第三节点仍下载成功并重算相同 CID；耗时 6234ms                                          |
| 256MiB 发布      | 从系统文件选择器发布，完成后自动做种，topic 已加入                                                         |
| 256MiB 系统保存  | 创建 `fixture-256MiB (1).bin`，268,435,456 字节；SHA-256 与源文件相同，保留原文件                          |
| 2112MiB 发布     | 成功且默认做种，CID 与桌面及移动核心黄金样本一致                                                           |
| 2112MiB 系统保存 | 创建 `large-2112MiB (1).bin`，2,214,592,512 字节；成功提示显示实际名称，SHA-256 与源文件相同               |

附件 CID：`bafkreiasxrhirfw4dmnjbknsz3p2tjkpwaiipxt6nq4qae4phffwjz4yfm`。2112MiB CID：`bafybeih2aevrefukrvek3by26dzp2vflcwbyl4pluxewbrowb3xgkitpu4`。

测试目录仅包含合成样本：`Download/mostbox-qa20261009`。源文件与保存副本均保留，便于复核。256MiB SHA-256 为 `cfd3e4a1d97eb239411afb13aa317f34b71c5ac7a2f7cc250c6cd9d6517cf367`；2112MiB 为 `e8b3f6eac38b4c516c09ef47b639f4f0edb479ca9dcf3c9227b8f1dd08bc87b1`。

2112MiB 保存前后两次内存采样来自同一进程，Dalvik allocated 为 9825 / 9991KiB，Native allocated 为 101446 / 101779KiB；应用未崩溃，保存按钮恢复。采样没有覆盖连续峰值，不能宣称已验证峰值与文件大小无关。发布期间日志出现系统内存压力通知，最终发布成功；后续需连续采样及检查大文件准备阶段的体验。

证据：[做种接力结果](qa/2026-10-09/android-physical/handoff.json)、[大文件 CID](qa/2026-10-09/android-physical/2112MiB-cid.jpg)、[保存成功](qa/2026-10-09/android-physical/2112MiB-save-success.jpg)、[输出长度](qa/2026-10-09/android-physical/export-files.txt)、[输出哈希](qa/2026-10-09/android-physical/export-sha256.txt)、[源文件哈希](qa/2026-10-09/android-physical/source-sha256.json)、[内存采样](qa/2026-10-09/android-physical/memory-2112MiB-save.txt)。

## 后续验收与改造顺序

1. 用不同 CID 的大文件验证真机网络下载，连续记录发布、下载、导出内存；本轮大文件走本地发布和系统保存，小附件走网络下载，不混用结论。
2. 补附件取消确认、失败重试及纯链接独立接收。小附件下载很快，本轮未截取中间进度。
3. 大文件发布准备阶段补明确的工作状态和阶段提示；本轮观察到文件选择后有等待，完成前未看到字节进度，不能只靠禁用按钮说明状态。
4. 验证文档提供者写入/复读故障、权限撤销与失败清理；不通过填满用户手机来模拟磁盘满。
5. 按现有可靠性计划继续任务恢复、切网、进程重启和后台生命周期。iOS 真机仍需独立验证。

本轮没有修改生产代码；沿用上一批已通过的移动 156 项、原生 7 项和协议 13 项检查，新增 ARM64 构建与上述真实设备验收。阶段 2 的恢复和异常场景仍未全部达标。
