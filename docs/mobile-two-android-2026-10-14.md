# 双 Android 真机与蜂窝后台验证

## 范围

移动端工程入口为 `app/`。本轮使用两台已授权的真机，覆盖安装保留原有数据，不退出 Redmi 的账号，不改变 CID、topic、完整副本或默认做种规则。

| 设备                         | 系统                 | 本轮网络                     |
| ---------------------------- | -------------------- | ---------------------------- |
| Redmi K30S Ultra / M2007J3SC | Android 12 / MIUI 14 | 蜂窝默认网络，Wi-Fi 原本关闭 |
| MIX 2S                       | Android 10 / API 29  | Wi-Fi，未验证其蜂窝网络      |

## 已完成的跨网络种子交接

Redmi 的 0.5.3 本机节点持有 4 MiB 测试文件，MIX 2S 的原有 0.5.2 通过 `most://` 链接下载，界面显示下载完成并持续做种。关闭 Redmi 应用后，全新空白桌面 verifier 从 MIX 2S 下载并独立重算 UnixFS CID，通过，耗时 8309 ms。随后恢复 Redmi 应用。

CID 为 `bafybeibug4o4vhdn2ax7ia75s6mub6sv3zqcwfthfemxxan5pdeuwlu3jm`。交接记录位于 `.codex-logs/two-android-2026-10-14/verify-b-handoff.json`，提供者公钥为 `2ceeadbe76b12b839698d308cd275c4e4e6415231bc1f0ae7768b9d0d61dfa83`。这是两个不同版本间的文件传播验证，不能作为同版本本机聊天或实时通话的验收。

## Android 10 启动问题

仅将 Expo 的最低版本从 API 31 改为 API 29 后，APK 可以覆盖安装，但 MIX 2S 启动 Bare Worklet 时发生 `SIGSYS / SYS_SECCOMP`。崩溃记录明确指出 arm64 系统调用 291 被禁止，即 `statx`；错误发生在 `libbare-kit.so`。动态 libc 符号存在并不代表系统允许该原始系统调用。

已使用 react-native-bare-kit 0.15.0 对应的 Bare Kit 2.3.0 源码，以 NDK 27.1.12297006、API 29 重新编译。Bare Kit 源码固定到 `264ebb068d23ca5c5168ed92ea1a0ce85b12259d`。libuv 的 Android API < 30 分支返回 ENOSYS 并沿用普通 stat 路径；API 29 的 JNI NativeHelper 使用 MostBox 现有实现。

运行库构建通过，构建入口已自动接入重编译和缓存校验。MIX 2S 连续三次冷启动成功，本机节点正常，旧文件和频道历史保留。发布全新的 4 MiB 文件后，空白桌面 verifier 下载并独立重算 CID，通过，耗时 9368 ms；应用重启后自动恢复做种，再次下载校验通过，耗时 9812 ms。证据为 `verify-android10-fixed.json`、`verify-android10-restart.json` 和 `b/cold-restart-*.log`（均位于本轮日志目录）。

新文件 CID 为 `bafybeie63ngk372jez62xeean4uk7pe7yngad2i3n24yxfyh2odu64kj2m`。同一个运行库也已覆盖安装到 Redmi；原账号保留。只验证了 arm64 真机，本轮未验证其他 ABI、全新网络环境中的源码构建、商店包或 EAS 云构建。

## 创建或加入频道弹窗

10 月 15 日凌晨修复 `ChatScreen` 的键盘避让：弹窗改用底部 padding，不再以首次测量高度持续修改 Android 弹窗高度；弹窗打开期间，底层聊天页暂停键盘布局调整。透明 Modal 在这两台手机上不能仅依赖原生 `adjustResize`，否则键盘会遮住输入框与按钮。

两台手机覆盖安装同一修复包，验证输入、连续布局采样、收起键盘、重新聚焦、取消、重开和加入频道。键盘保持打开时，Redmi 的标题上边界为 778 px、输入框为 1023 px；MIX 2S 分别为 546 px、833 px，重复采样位置一致，按钮未被遮挡。Redmi 使用微信输入法，硬件返回键直接关闭弹窗，改用输入法收起按钮验证；收起后标题回到 1646 px，重新聚焦回到 778 px。MIX 2S 使用返回键收起键盘，标题从 546 px 回到 1355 px，再聚焦恢复。

证据为 `a/popup-padding-stable-*.png`、`a/popup-ime-hidden.json`、`a/popup-ime-refocused.json`、`a/popup-final-*.json` 和 `b/popup-qa.json`。`a/popup-qa.log` 中最初的失败是脚本假定返回键只收起键盘，实际关闭了弹窗；随后按真实输入法操作完成验证。iOS 本轮没有真机验证。

## 同版本双机聊天与种子交接

两台手机通过弹窗加入测试频道 `10150017`，使用各自本机节点，Redmi 为蜂窝、MIX 2S 为 Wi-Fi。发送 `11110150017` 与 `22210150017`，双方界面都收到两条消息。关闭 MIX 2S 后，Redmi 发送 `33310150017`；MIX 2S 重启后收到这条消息，进入频道仍显示此前两条历史。证据为 `a/dual-received.json`、`b/dual-received.json`、`b/dual-restarted.json`、`b/dual-history.json`。

Redmi 凭新文件链接下载成功，持有记录从 23 增至 24，文件详情显示完整 CID、Topic 已加入和做种中。随后关闭发布者 MIX 2S，全新空白桌面 verifier 只连接到一个提供者，从 Redmi 下载并独立重算 CID，通过，耗时 54600 ms。证据为 `a/dual-file-details.json` 与 `verify-latest-a-handoff.json`。随后退出 verifier，恢复 MIX 2S。本次仍花费约 50 秒发现文件，不能视为蜂窝稳定性或连接速度已解决。

本轮最终 APK 为 `app/dist/mostbox-android-0.5.3-release.apk`，SHA256 为 `d548d6ca3bf5cf1841ac6e74536ab8519129990a7150ed01a5ac228ed068861e`。两台手机均安装此包。

## 蜂窝后台测试

Redmi 手动开启后台保持，充电，Wi-Fi 保持原值 0，默认网络 160 为已验证的蜂窝网络。测试开始于北京时间 22:06:49，每分钟采样进程、真实前台服务、电源状态和网络。第 2 分钟的空白 verifier 下载并通过 CID 校验，耗时 12398 ms；第 30 分钟复测同一场景，通过，耗时 29742 ms。

第 60 分钟复测通过，耗时 20952 ms，23:07:11 完成。61 次采样的 PID 均为 `9507`，前台服务均在运行，默认网络和 Wi-Fi 设置未变；三次下载的提供者公钥一致。亮屏设置已恢复原值 `7`，verifier 已退出。证据为 `.codex-logs/two-android-2026-10-14/background-60m.json` 和 `verify-cellular-sleep-{2,30,60}m.json`。

手机从第 5 分钟起被唤醒，后续采样为 Awake。这轮通过的是一小时蜂窝后台运行与三次文件传播，不能计为连续一小时息屏。连续息屏证据仍以此前的 35 分钟 Wi-Fi 测试为准。

这轮一小时记录使用的是重编译运行库之前的 0.5.3 包，不能直接作为最新运行库的一小时验收。

## 仓库路径

根目录 `mobile/` 是未跟踪的迁移残留，主要为旧依赖和构建产物，没有移动端 package.json。已移出根目录至 `.codex-logs/legacy-mobile-residue-20261014`。用户要求直接删除，但自动安全审查拒绝了递归删除和逐项校验路径后的删除，均只返回 `blocked by policy`；残留尚未删除。

根目录完整 lint 已通过。README 的 Cloudflare Pages 构建目录要求改为 `app`；未修改或核验线上 Pages 后台配置。

## 检查与未覆盖

移动端 218 项测试、移动端类型检查、13 项协议测试通过。证据分别为 `.codex-logs/two-android-2026-10-14/tests-after-runtime-build.log`、`typecheck.log`、`protocol.log`、`lint-after-cleanup.log`。

弹窗修复后重新通过移动端类型检查、相关 ESLint、APK 构建及双机交互验证。实时音频收发尚未实现；现有语音信令不等同于可用的语音通话。本轮没有验证 Android 15/16 超时、无充电、MIUI 强制清理后的独立恢复或完整蜂窝稳定性。
