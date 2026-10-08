# 首批 P0 实施与验收（2026-10-08）

本轮只实施 [可靠性改造计划](reliability-upgrade.md) 的生产启动、CID 稳定性和移动本地可用性三个 P0。修改在工作区，未提交、发布或部署。保留 most://、UnixFS CID v1、importer 17.0.1 和原有参数、CID topic、Hyperdrive /CID、完整副本与默认做种。

## 实际改动

### F1：生产页面白屏

Scalar 分包形成循环引用，依赖函数在相关变量初始化前执行。Vite/Rolldown 输出启用 `strictExecutionOrder`，保持源模块初始化顺序；保留原 Scalar 分包与 500,000 字节的静态输出门槛。

由 Electron 内置 daemon 提供本次 production 输出，浏览器验证 `/` 默认转到 `/chat/`，以及 `/chat/`、`/file/`、`/admin/`、`/docs/api/` 正常渲染。聊天页刷新后能打开加入弹窗，Scalar API 参考完成加载；检查的页面没有控制台 error。Electron 实际窗口正常显示生产聊天页。启动使用隔离的测试 home/userData/Documents。

证据：[浏览器生产聊天页](qa/2026-10-08/browser-production-chat.png)、[Electron 生产聊天页](qa/2026-10-08/electron-production-chat.png)。

### F2：2GiB 以上 CID 不稳定

锁定依赖 `protons-runtime@7.0.0` 的 `LongBits` 把 uint64 的高低两段保存为有符号整数；文件大小达到 2GiB 后，varint 写入长度错误，输出包含未写入的 buffer 字节。同一文件的叶块和中间节点相同，根节点却不同。补丁前的边界回归已复现错误。

`scripts/patch-unixfs-runtime.mjs` 将两个整数段改为无符号值。根项目与移动子包通过 postinstall 应用，并沿 importer → UnixFS → runtime 定位实际依赖；重复执行安全，遇到不支持的主版本或源代码结构会明确失败。安装回归覆盖另一个不相关版本被提升到顶层的依赖布局，确认修正正确副本。npm 包文件清单包含补丁脚本。两个 lockfile 仅同步安装脚本标记，未升级依赖。Android/iOS Bare bundle 均包含修正后的编码。

根项目与移动子包增加 2GiB−1、2GiB、2112MiB、4GiB−1、4GiB、10GiB 的确切编码断言，原有 CID 黄金样本仍通过。新增独立命令 `npm run test:large-files`，不加入常规后端测试。

2112MiB 黄金文件的生成规范：每个 1MiB 块先填充 `index % 251`，再在前 4 字节写入该块序号的 UInt32LE；依次写 2112 块。大小 2,214,592,512 字节，SHA-256 为 `e8b3f6eac38b4c516c09ef47b639f4f0edb479ca9dcf3c9227b8f1dd08bc87b1`，CID 为：

```text
bafybeih2aevrefukrvek3by26dzp2vflcwbyl4pluxewbrowb3xgkitpu4
```

大文件专项两次通过，分别约 135 秒与 161 秒：文件路径、1MiB 和 70,003 字节读取块得到同一 CID；桌面发布、下载后自动做种、发布者退出后的第三节点下载与重算校验通过；移动生产核心在 Node 宿主机上发布同一文件、重启并识别完整本地内容通过。

证据：[大文件专项日志](qa/2026-10-08/large-files.log)、[编码边界与安装回归日志](qa/2026-10-08/unixfs-regressions.log)。

受旧缺陷影响的异常 CID 不能通过修改链接含义或放宽校验继续使用，需要从原始内容重新发布、取得正确链接。本轮没有自动迁移已有内容身份。

### F3：移动端误报本地已有与做种

本地已有必须同时具有精确 `/<cid>` entry 和 `drive.has()` 确认的完整 blob。发布遇到只有 metadata 的文件时重写完整内容；下载后确认本机具有完整副本。启动恢复做种前先检查完整内容，缺失时返回 error 和 `localAvailable: false`，不恢复该 CID topic；失败下载也不会保留虚假的 active 状态。

导出同样检查 CID 内容。缓存路径被其他内容覆盖时，重算 CID 检出差异，再从正确 Hyperdrive 内容重建导出文件，保留用户原路径中的文件。

新增回归使用真实 Corestore/Hyperdrive：清除 blob、保留 entry 和 holding，重启后需要处理；导出失败、下载不误报成功；重新发布修复后恢复本地已有和做种。另覆盖零字节文件与缓存路径内容被替换。

## 验证结果

| 检查                                       | 结果                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| 后端全量 `npm test`                        | 665 通过，0 失败；随后新增的安装回归单独通过         |
| 前端测试                                   | 92 通过                                              |
| Electron 测试                              | 15 通过                                              |
| 移动子包测试                               | 86 + 67 = 153 通过                                   |
| 协议重点回归                               | 13 通过，包含新增的编码边界与安装回归                |
| 2112MiB 大文件专项                         | 1 通过                                               |
| 根项目 TypeScript / strict-router / ESLint | 通过                                                 |
| 移动 TypeScript                            | 通过                                                 |
| 生产 build / static-output                 | 通过                                                 |
| Android / iOS Bare bundle                  | 通过，包含 unsigned uint64 补丁                      |
| Android x86_64 release APK 构建            | 通过，约 91 秒                                       |
| Android API 36 模拟器启动与原 holding 恢复 | 通过，节点在线，1MiB 和 32MiB 既有完整副本显示做种中 |

Android 模拟器安装本次构建的 `mostbox-android-0.5.3-emulator-x86_64.apk`。证据：[Android 文件页](qa/2026-10-08/android-files.png)。完整命令、生产运行时检查和大文件所需空间见 [验收文档](acceptance.md#p0-可靠性回归)。

## 验证边界与后续

- 2112MiB 接力使用受控的本地 `replicateWith`，验证内容复制、CID 校验和做种交接，不代表公共网络打洞成功率。此前 Android 真实网络反向下载失败的问题仍需后续诊断与中继改造。
- 大文件移动测试运行的是生产核心的 Node 分支；Android 此次验证了新 APK 启动与完整 holding 恢复，尚未在 Bare/真机传输 2GiB 以上文件，也未在原生设备注入 blob 缺失。
- iOS 完成共享测试与 Bare bundle，Windows 环境未进行 iOS 原生构建或真机验收。
- Android SAF 全文件 base64 导出的内存问题、聊天附件入口、任务恢复、后台和中继均属于后续批次。本轮不能据此宣布移动大文件全流程或全平台 MVP 验收通过。
