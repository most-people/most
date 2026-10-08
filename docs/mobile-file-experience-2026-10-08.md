# 移动文件体验第二批实施记录

日期：2026-10-08。依据 [可靠性改造计划阶段 2](reliability-upgrade.md)。本批处理原生系统导出与聊天附件入口；传输持久化、后台恢复、Expo 依赖对齐和中继仍属后续独立批次。

**结论：代码、自动检查、Android 模拟器 APK 构建，以及 32MiB 系统保存、同名副本和取消保存实测已通过。** 聊天附件完整点击验收、真实文档提供者故障和大文件真机验收仍待补，尚未达到阶段 2 出口。继续验收期间用户再次按 Escape 停止 Computer Use，随后停止模拟器界面操作；没有把未完成的附件测试记为通过。

## 实现与边界

### Android 系统导出

旧路径用 JS 读取整文件 base64，再交给 SAF 写入，32MiB 文件曾触发 192MiB heap 下的 OOM。新路径保留已有 `prepareHoldingFile`：由核心按 CID 校验或重建本地副本，再将 URI、文件名和大小传给本地 Expo 模块 `MostFileExport`。

原生模块在 IO dispatcher 上用 64KiB 固定缓冲区把应用私有目录中的源文件复制到 ContentResolver 输出流，字节计数使用 `Long`。写入关闭后重新打开输出，对比字节数和 SHA-256，全部通过才返回成功。该哈希仅验证导出副本；原生文件身份仍由既有 UnixFS CID 校验决定。

目录取消发生在创建输出之前。同名文件使用递增后缀创建新文档，提示显示提供者返回的实际名称。复制、关闭、复读或校验异常时尝试删除新建输出；删除失败返回专用错误，界面提示可能存在不完整残留，不能提示成功。该清理行为仍需在实际 SAF 提供者上验收。

模块只接收应用私有 files/cache 目录内的本地文件 URI；文件内容不跨 JS bridge。当前打开和分享路径已使用文件 URI，未引入另一套文件读取实现。远程节点准备本地副本时仍沿用原有有界分块下载；本批不修改远程传输协议。

这是 Android 本地 Expo 模块，重新构建的 APK 才包含它；Expo Go 和仅更新 JS 不能提供该原生能力。iOS 继续使用现有系统分享保存流程，本批没有新增 iOS 原生模块。

### 聊天附件

结构化附件和纯 `most://` 消息统一显示可操作附件卡片。点击未持有的附件进入原有 receive 确认流程，并沿用文件类型策略和 `core.downloadLink`，不新增下载器。文件名与可选大小用于展示；有效 CID 决定本地已有和任务匹配。

卡片根据当前 holding/transfer 显示接收、进度、重试或打开。只有同一 CID 的 holding 明确 `localAvailable: true` 时提供打开；缺失 blob、其他 CID、发布任务或仅有 completed 记录不能代替可读内容。下载完成后的校验、保存和自动做种仍由原有核心处理。

## 已完成检查

| 检查                                         | 结果与范围                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 移动 `npm test`                              | 156 项通过：89 项 TypeScript、67 项 backend/构建支撑测试；新增附件识别与 CID/任务状态回归      |
| 原生 `:most-file-export:testReleaseUnitTest` | 7 项通过；固定缓冲区、空文件、2GiB + 17 字节计数、源长度变化、同长度损坏、截断、写入异常关闭流 |
| 根项目 `npm run test:protocol`               | 13 项通过；CID、已有协议与三节点传播回归                                                       |
| 类型与 lint                                  | 移动 typecheck、根 typecheck、strict-router 和 lint 通过                                       |
| Android `npm run build:emulator`             | 成功；新模块自动链接并编入 release 模拟器 APK，57.42MiB                                        |
| Android 安装/启动                            | 安装更新成功；观察到聊天首页及节点在线；AVD `mp_peer_api36`，heap growth limit 为 192MiB       |
| iOS `npm run bundle:ios`                     | Bare bundle 成功；没有 iOS 真机或原生构建验收                                                  |

原生超过 2GiB 的用例使用生成流和计数输出流，不写实际磁盘，不是 Android 大文件导出实测。流异常测试覆盖复制层的关闭和完整性拒绝；DocumentsContract 删除、目录权限和提供者行为仍属于系统验收。

APK：`mobile/app/dist/mostbox-android-0.5.3-emulator-x86_64.apk`。SHA-256：`cfdc85876a32444ac57b5902c905e9b10a13549382e9d46eb27560ef11475c70`。版本仍为 0.5.3；这是本地测试包，没有发版。

归档证据：[检查摘要](qa/2026-10-08/mobile-p1/checks.json)、[原生 JUnit 结果](qa/2026-10-08/mobile-p1/native-stream-tests.xml)、[移动测试输出](qa/2026-10-08/mobile-p1/mobile-tests.txt)、[协议测试输出](qa/2026-10-08/mobile-p1/protocol-tests.txt)。

## Android 系统保存实测

使用上述 APK、API 36 x86_64 模拟器与已有完整 holding `fixture-32MiB.bin`。该 AVD 的 `dalvik.vm.heapgrowthlimit` 为 `192m`，`dalvik.vm.heapsize` 为 `576m`；应用未声明 largeHeap。目录为模拟器中仅含测试数据的 `Download/mostbox-qa20261007`。

| 操作               | 实际结果                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| 保存 32MiB holding | 输出 `fixture-32MiB (1).bin`，33,554,432 字节；SHA-256 与宿主机源文件相同；界面显示“保存成功”和实际名称 |
| 再次保存           | 新增 `fixture-32MiB (2).bin`，相同长度和哈希；第一份副本与其他已有文件保持不变                          |
| 取消目录选择       | 用系统返回手势退出选择器；前后目录列表完全相同，没有第三份输出或成功提示，详情页保存按钮恢复可用        |

两份完整输出 SHA-256：`2a3f86b8872582b9308592d9bfacb20a3e2379053eb2b114c855771843132d12`。原先旧版 OOM 留下的 0 字节 `fixture-32MiB.bin` 被保留，没有覆盖或将其视为本轮成功输出。

保存后 `dumpsys meminfo` 的 Dalvik heap allocated 采样为 8,194KiB，没有出现 OOM，进程仍可继续操作；这是单次事后采样，不是峰值内存测量，也不能替代更大文件验收。

证据：[成功提示](qa/2026-10-08/mobile-p1/android-32MiB-save-success.png)、[取消后详情页](qa/2026-10-08/mobile-p1/android-save-cancelled.png)、[系统文件长度](qa/2026-10-08/mobile-p1/android-export-files.txt)、[系统输出哈希](qa/2026-10-08/mobile-p1/android-export-sha256.txt)、[取消前后目录列表](qa/2026-10-08/mobile-p1/android-save-cancel-check.json)、[保存后内存采样](qa/2026-10-08/mobile-p1/memory-after-32MiB.txt)。

本轮已准备 83,968 字节的独立聊天测试附件和结构化/纯链接消息，但在完成附件点击之前界面操作被停止；没有发生本轮附件下载或发布者退出后的 Android 接力验收。临时桌面测试节点已停止。

## 待补系统验收

2026-10-09 已追加 [ARM64 真机回归](android-physical-2026-10-09.md)：附件接收、相册打开、发布者退出后手机种子接力及 256MiB / 2112MiB 发布和系统保存通过。以下清单中的剩余部分仍需独立验收；本轮未测试大文件网络下载或连续内存峰值。

1. 实际 SAF 提供者注入空间不足、写入失败、复读失败和权限撤销；检查失败状态及不完整输出清理，清理失败时明确提示。
2. Android 聊天：点结构化附件及纯链接，取消确认后没有任务；确认后观察进度、失败重试和完成打开。再用干净第三节点执行发布者退出后的 CID 接力验收。
3. ARM64 真机保存 256MiB 和 2GiB 以上文件并记录内存峰值；共享 UI 还需 iOS 真机验收。

本批没有重跑首批 2112MiB 专项或根项目全部 665 项测试：改动集中于移动附件 UI 和 Android 导出，采用移动全部测试、原生测试、协议回归及类型/lint 检查。此前 P0 结果见 [首批 P0 验收](p0-implementation-2026-10-08.md)。
