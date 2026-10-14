# Android 后台保持实施与真机验证

## 目标与约束

在当前 `app/` 代码上接入真实 Android 前台服务，帮助本机节点息屏传输。用户主动开启，持续通知可停止；停止保持不关闭前台做种。沿用现有 Bare Worklet 和数据目录，不创建第二个节点，不改变 CID、topic、Hyperdrive 或自动做种规则。

本轮只实现 Android 后台保持。蜂窝失败根因和实时音频收发仍待解决。

## 实现

- 新增本地 Expo 模块 `most-background`，声明私有 `dataSync` 服务与对应权限，原生工程自动链接该模块。
- 节点页提供开启和停止入口，Android 13 及以上先请求通知权限；仅在本机节点 ready 时允许开启。Web、iOS 和未启用 backgroundSeeding 的产品不展示入口。
- 服务启动后建立静音持续通知、停止动作及部分 CPU 唤醒锁，复用当前 React 客户端持有的 Bare Worklet。模块等服务实际进入运行状态后才报告启动成功。
- 应用策略读取原生服务的真实状态，不再把后台能力固定为 false。通知停止、UI 停止、节点关闭及切到远程节点会移除保持；移除应用任务也停止服务。
- 使用 `START_NOT_STICKY`，不在开机或进程被清理后自动重启。每次保持会话最多 6 小时，超时、销毁会释放通知和唤醒锁；Android 系统 `onTimeout` 也停止服务。

Android 14 起需要声明前台服务类型和类型权限；文件传输采用 `dataSync`。面向 Android 15 及以上时，该类型后台运行还受每 24 小时合计 6 小时限制，可能比本机会话期限更早停止。此功能不承诺系统永不清理或永久在线。[服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types)，[超时规则](https://developer.android.com/develop/background-work/services/fgs/timeout)

## 已验证

- 移动端 218 项通过（前端 131，后端与脚本 87），移动及根类型、严格路由检查通过。
- Lint 排除未跟踪的迁移遗留 `mobile/` 目录后通过。直接扫描该目录会把旧生成 bundle 作为源码检查；没有清理或修改这些用户遗留文件。
- Android ARM64 构建与覆盖安装通过；首次构建发现模块 Gradle 缺少 versionName，补齐后构建通过。
- 真实服务记录显示 `isForeground=true`、通知 ID 1976，带一个停止动作；从通知停止后服务记录为空。再次开启成功。
- 手机账号 `111`、23 个本机 holdings 保留；息屏两分钟时空白桌面 verifier 下载 4 MiB 文件并重算 CID，通过，耗时 7587 ms。
- 35 分钟测试后从界面停止保持，服务记录为空，部分唤醒锁已释放；前台节点继续向另一个空白 verifier 传播同一文件并通过 CID 校验，耗时 6173 ms。测试脚本和 verifier 均已退出，亮屏设置恢复原值 `7`，手机返回聊天首页。
- Expo Web 静态导出、iOS Bare bundle 和发布配置预检通过；没有 iOS 真机后台验收。

内部包 `app/dist/mostbox-android-0.5.3-release.apk`，0.5.3 / 503，67.83 MiB，SHA256 `051bc78471018531ca1b027e408e826e4ac805731433cf07e3a98f9299f1767e`。不作为商店发版。

## 连续息屏验收

连续息屏 35 分钟通过。北京时间 16:24:45 开始，16:59:46 启动新的空白桌面 verifier，16:59:52 下载 4 MiB 文件并通过 CID 校验，耗时 6096 ms；提供者公钥与两分钟测试一致，手机 PID `18484` 全程未变，36 次采样的服务均为前台状态。下载完成后才唤醒手机并恢复亮屏设置。

测试使用 Redmi K30S Ultra、Android 12 / MIUI 14、Wi-Fi 和充电条件，没有修改 MIUI 电池策略。本轮超过历史约 25 分钟清理时间，但不代表一小时、无充电或其他手机的场景通过。35 分钟下载结果见 `.codex-logs/mobile-followup-2026-10-14/verify-screen-35m.json`。

本地证据：`.codex-logs/background-screen-result.json` 记录 PID、前台服务和下载结果，`.codex-logs/background-power.jsonl` 独立记录 `mWakefulness=Asleep` 与交互状态。主脚本的 `screenOff` 使用不适合这台 MIUI 的旧字段正则，应以独立电源记录为准。

详细日志为 `.codex-logs/background-tests.log`、`background-types.log`、`background-root-types.log`、`background-router.log`、`background-lint-02.log`、`background-build-02.log`、`background-install.log`、`background-web.log`、`background-ios.log`。服务启动和停止证据为 `background-services-running.txt`、`background-services-stopped.txt`；两分钟下载证据为 `.codex-logs/mobile-followup-2026-10-14/verify-screen-2m.json`。

## 未覆盖与后续

Android 15/16 真机的系统超时回调、拒绝通知权限、移除应用任务、系统主动清理、无充电环境和更长时间的息屏仍需验收。前台服务依赖现有进程和 Worklet，没有在进程死亡后独立恢复节点的能力。

核对当前 Hyperswarm 4.17 源码发现，它已监听 DHT 的 `network-change` 并刷新发现；HyperDHT 也刷新 listening server。没有足够失败证据支持额外增加应用层重连。本轮不改变蜂窝网络，不用 Wi-Fi 息屏通过代替蜂窝稳定性结论。
