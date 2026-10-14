# MostBox 移动端等待反馈与剩余问题研究

## 本轮目标与交付

用户已验收八小时夜间成果，本轮要求为账号登录、节点连接增加 loading，并继续研究后台做种、蜂窝传播和实时通话。成功标准是操作开始后能看到持续等待反馈，重复点击不重复执行，失败后恢复操作；保持账号、身份派生算法、频道及 CID 协议不变。

内部 Android 包已覆盖安装到 Redmi K30S Ultra（Android 12 / MIUI 14）。版本仍为 0.5.3 / versionCode 503，不是正式发版或商店候选包。APK 为 `app/dist/mostbox-android-0.5.3-release.apk`，SHA256 为 `8d60d5d84fdee0558556fe14e0b4f37917f023108c98197a3f5f1a2e4a8b115b`，校验文件在同目录。

安装后保留当前账号 `111`、23 个做种文件、已开启的静音消息提醒和原频道。夜间验收包另存为 `.codex-logs/overnight-2026-10-14/mostbox-android-accepted33.apk`，原八小时结果见 [夜间验收记录](mobile-overnight-2026-10-14.md)。本轮证据统一位于 `.codex-logs/mobile-followup-2026-10-14/`。

## 等待反馈

- 原生与 Expo Web 连接面板使用独立的登录、退出、连接和切换本机操作状态；当前按钮显示转圈和相应文案，面板显示“请稍候，完成后会自动更新。”。
- 操作开始立即锁定重复调用、收起键盘，并先让等待状态绘制，再执行账号派生或连接。结束或失败后恢复按钮和关闭入口；失败保留地址及已有错误提示。
- 冷启动的静态加载图标改为原生 `ActivityIndicator`；等待状态提供无障碍 busy 与进度语义，中、繁、英文文案齐全。

本轮解决等待反馈，没有缩短账号派生本身的计算时间。现有同步 PBKDF2 和身份算法保持不变。检查过当前安装的 `@noble/hashes` 异步实现，其微任务让步不能保证原生 UI 绘制，因此没有仅凭函数名替换身份实现。

## 真机操作验证

通过临时本地代理将远程能力请求延迟 8 秒，并注入一次 HTTP 503。测试完成后已关闭代理并恢复原 ADB reverse；没有修改用户远程地址或邀请码。

| 场景       | 结果与证据                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| 慢连接     | 10:31:40.673 至 10:31:48.686 持续显示“正在连接”和转圈；两张截图的转圈区域有 93 个像素变化，确认动画实际运行 |
| 连续点击   | 连点同一连接历史入口，只产生一个延迟能力请求；关闭和其他动作在等待期间禁用                                  |
| 失败恢复   | 8 秒后返回 503，转圈消失，显示友好错误，输入地址保留，按钮及关闭入口恢复                                    |
| 重试       | 再次连接恢复成功，远程节点显示账号 `111`；随后切回本机，23 个 holdings 保留                                 |
| 最终包回归 | 11:01:00.914 至 11:01:07.181，新建空白桌面节点从手机取得 4 MiB 文件，6267 ms 完成并重算出相同 CID           |

对应截图为 `connect-loading-first.png`、`connect-loading-second.png`、`connect-failure-restored.png`、`retry-settled.png`、`final-local.png`；附有同名 UI XML。请求证据为 `connection-delay-audit.jsonl`，动画检查为 `spinner-animation.json`，最终包传播证据为 `verify-final-wifi-4m.json`。最终账号、文件数和提醒设置见 `followup-final-profile.png`。

没有退出当前账号重输密码：当前密码未知，保留用户已登录状态。登录等待分支通过类型检查和身份回归，尚未进行实际账号登录的真机复验；连接、错误、重试和本机切换已实测。Expo Web 完成静态导出，没有完成浏览器真实交互；iOS 只完成 bundle 和发布配置预检，没有 iPhone 真机验收。

## 蜂窝做种的新证据

夜间两次蜂窝向电脑传播 4 MiB 文件失败仍是有效历史结果。本轮关闭 Wi-Fi 后启动全新桌面 verifier，使用手机已有的相同 CID，完成了两次蜂窝传播：

| 网络与文件           | 时间（北京时间）          | 耗时     | 结果                |
| -------------------- | ------------------------- | -------- | ------------------- |
| Wi-Fi，128 KiB，对照 | 10:42:20.721–10:42:28.713 | 7992 ms  | 下载并重算 CID 通过 |
| 蜂窝，128 KiB        | 10:44:51.938–10:45:04.454 | 12516 ms | 下载并重算 CID 通过 |
| 蜂窝，4 MiB          | 10:47:01.459–10:47:49.600 | 48141 ms | 下载并重算 CID 通过 |

Wi-Fi 于 10:44:41.276 关闭，10:48:05.205 才恢复，晚于两个蜂窝下载完成时间。Android 网络状态确认默认网络是蜂窝；两次 verifier 使用空数据目录，记录到与 Wi-Fi 对照一致的提供者公钥。保留的远程 QA 节点不持有这两个 CID，前一 verifier 在后一场景开始前已退出。这不是读本地缓存、旧连接或 Wi-Fi 恢复后的完成。

证据：`verify-wifi-control.json`、`verify-cellular.json`、`verify-cellular-4m.json`、`cellular-network.txt`、`cellular-guard.json`。4 MiB CID 为 `bafybeibug4o4vhdn2ax7ia75s6mub6sv3zqcwfthfemxxan5pdeuwlu3jm`，128 KiB CID 为 `bafkreic773rxrik6nde6dwolqgtclaezsniqzhzuwhmqzobm7jcialkfvq`。

结论更新为“蜂窝传播本轮可完成，但耗时长，历史失败尚未解释”。本轮通过时尚未安装新诊断代码，P2P 行为未修改，不能把成功归因于 loading 或诊断改动。运营商共享地址和 DHT 查询记录只是诊断线索；DHT 可能返回缓存提供者，不能用记录数量证明在线 peer 数或新公告成功，也不能据此确定 NAT 是根因。

补充了一个可验证的诊断缺口：当前 Hyperswarm 的 discovery `flushed()` 在内部失败时可能返回 `false`，原代码只等待 Promise 完成，未区分失败。现在返回 `false` 或 rejection 时，记录含 CID 的公告未完成警告；已移除或已停止的 discovery 不报告。两个回归测试先验证旧实现缺少警告，再验证新实现记录警告、发布仍完成且本地副本可读。没有改变 topic、CID、自动做种、重试或连接协议。

下一次蜂窝稳定性验收应重复冷启动、Wi-Fi/蜂窝切换及发布者退出后的空节点下载，分别记录公告结果、实际连接和最终 CID，覆盖成功与超时样本后再决定修复。

## MIUI 息屏与后台生命周期

夜间系统日志确认，息屏约 25 分钟后 MIUI 的 AutoLockOffClean 清理应用进程，一小时做种失败，重新打开后恢复。当前 Android 原生项目没有维持节点的前台 service；Bare Worklet 生命周期由应用客户端持有。增加 JavaScript 定时器不能让被系统终止的进程继续做种。

后续实现需要用户主动开启的持续传输入口、系统持续通知及停止动作，并让原生 service 管理节点生命周期、超时退出和返回前台恢复。Android 14 起前台服务需要声明对应类型和权限；文件上传下载属于 `dataSync` 范畴。[Android 前台服务类型文档](https://developer.android.com/develop/background-work/services/fgs/service-types)

不能直接承诺前台 service 永久在线：面向 Android 15 及以上的应用，`dataSync` 后台服务有每 24 小时合计 6 小时限制，需要处理 `onTimeout` 并及时停止；也不能从 `BOOT_COMPLETED` 启动该类型服务。聊天信令和文件传输应按实际用途判断类型，不能用其他类型绕过限制。[Android 15 行为变更](https://developer.android.com/about/versions/15/behavior-changes-15)

本轮完成生命周期调查，没有新增 service、系统白名单设置或耗电策略。实施后的最低验收应包括 MIUI 真机连续息屏至少 60 分钟、停止动作及重启恢复，以及 Android 15/16 的超时清理。远程 daemon 继续传输是现有选项，但不能作为本机后台已修复的结论。

## 实时通话

当前移动 `voiceProtocol.ts` 已有 offer、answer、candidate 信令；聊天页只在远程模式创建语音 WebSocket session 并更新界面状态，未绑定原生媒体轨道或实时音频传输。本机 P2P 模式也缺少对应信令桥接。语音消息的文件录制、上传和播放不构成实时通话。

Web 端 `src/hooks/useVoiceRoom.ts` 已实现 `RTCPeerConnection`、麦克风轨道、ICE 与远端音频，可以复用其信令和协商模型。移动端首先需验证 [react-native-webrtc 官方项目](https://github.com/react-native-webrtc/react-native-webrtc) 与 Expo 57 / React Native 0.86、新架构的实际构建兼容性，再接入采集、音频焦点、扬声器/听筒路由、加入退出和资源释放。本机模式还需把同样的信令接入 P2P 频道，避免把远程 daemon 作为通话前置条件。

本轮未安装新媒体依赖或实现实时通话。下一阶段通过标准是两台真机双向实时音频、静音恢复、拒绝麦克风权限、挂断清理和网络切换；需要同时验证媒体连接能力，不能只凭参与者状态同步宣布通话完成。

## 检查结果

| 检查                           | 结果                                | 日志                                          |
| ------------------------------ | ----------------------------------- | --------------------------------------------- |
| 移动端 `npm test`              | 218 项通过：前端 131、后端及脚本 87 | `test-01.log`                                 |
| 根项目 `npm run test:protocol` | 13 项通过                           | `protocol-01.log`                             |
| i18n 与身份专项                | 5 项通过，身份黄金样本不变          | `messages-identity-01.log`                    |
| 移动类型检查                   | 通过                                | `typecheck-01.log`                            |
| 根类型检查及严格路由检查       | 通过                                | `root-typecheck-01.log`、`root-strict-01.log` |
| Lint                           | 通过                                | `lint-02.log`                                 |
| Expo Web 静态导出              | 通过                                | `web-export-01.log`                           |
| iOS bundle 与配置预检          | 通过                                | `ios-preflight-01.log`                        |
| Android 最终构建与覆盖安装     | 通过                                | `build-02.log`、`install-02.log`              |

本轮没有发布到商店、推送代码或修改用户系统后台策略。最终手机返回本机聊天首页，测试代理与临时 verifier 已停止；原 QA 节点保留供继续验收。
